// Steady — send-feedback (Supabase Edge Function).
// Settings → Feedback posts here. The Resend key lives only in the RESEND_API_KEY secret.
// Never accept a key from the client.
//
// The publishable key in the app is not a JWT, so deploy with JWT checks off:
//   supabase functions deploy send-feedback --project-ref rjytcvajeysfnfmtgakm --no-verify-jwt
// Secret (prompts for the value, do not put it in the repo):
//   supabase secrets set RESEND_API_KEY --project-ref rjytcvajeysfnfmtgakm
//
// From beth@resend.dev Resend only delivers to the account owner's own inbox until a
// domain is verified. If that refusal happens, this function returns an error and the
// app opens a mailto instead.
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";

// Public publishable key already shipped in the app. This is not a secret.
const PUBLISHABLE = "sb_publishable_YY7K6b6P_E1HoQxAu_PTsg_MYU0lTeA";
const FROM = "Steady <beth@resend.dev>";
const TO = "Canvai.ai@outlook.com";
const ABOUTS = new Set(["Something broken", "An idea", "Something else", ""]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: cors });

// Per-isolate. Enough to blunt a burst; a fresh isolate starts clean.
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

function clip(v: unknown, max: number) {
  return String(v ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });

  const apikey = req.headers.get("apikey") || "";
  const anon = env("SUPABASE_ANON_KEY");
  const keyOk = apikey.length > 0 && (apikey === PUBLISHABLE || (anon.length > 0 && apikey === anon));

  let userId = "";
  let userEmail = "";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  // A user access token is a JWT. The publishable key is not — don't send that to getUser.
  if (bearer && bearer !== apikey && bearer.split(".").length === 3 && env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY")) {
    try {
      const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
      const { data } = await db.auth.getUser(bearer);
      userId = data.user?.id || "";
      userEmail = data.user?.email || "";
    } catch {
      /* unsigned is fine when the publishable key matches */
    }
  }
  if (!keyOk && !userId) return json(401, { error: "unauthorised" });

  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 64);
  const who = userId || ip;
  if (limited("ip:" + who, 5, 60 * 60 * 1000) || limited("global", 30, 60 * 60 * 1000)) {
    return json(429, { error: "rate" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_json" });
  }
  const message = clip(body.message, 1200);
  if (!message) return json(400, { error: "empty" });
  const aboutRaw = clip(body.about, 40);
  const about = ABOUTS.has(aboutRaw) ? aboutRaw : "";
  const build = clip(body.build, 40);
  const signedIn = body.signedIn === "yes" || body.signedIn === true ? "yes" : "no";
  const name = clip(body.name, 80);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);

  const key = env("RESEND_API_KEY");
  if (!key) return json(503, { error: "not_configured" });

  const text = [
    about ? `About: ${about}` : "",
    "",
    message,
    "",
    "—",
    build ? `Build: ${build}` : "",
    `Signed in: ${userId ? "yes" : signedIn}`,
    name ? `Name: ${name}` : "",
    userId ? `User: ${userId}` : "",
    emailOk ? `Account: ${userEmail}` : "",
  ].filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== "")).join("\n").trim() + "\n";

  const payload: Record<string, unknown> = {
    from: FROM,
    to: [TO],
    subject: about ? `Steady feedback — ${about}` : "Steady feedback",
    text,
  };
  if (emailOk) payload.reply_to = userEmail;

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return json(502, { error: "resend_unreachable" });
  }
  if (!res.ok) {
    // Don't forward Resend's body — it isn't needed, and we never want the key nearby.
    return json(502, { error: res.status === 403 ? "from_address" : "resend" });
  }
  return json(200, { ok: true });
});
