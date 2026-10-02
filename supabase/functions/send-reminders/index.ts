// Steady — send-reminders (Supabase Edge Function).
// Called every 5 minutes by pg_cron. Sends the morning nudge, and the evening one only if something
// is still open today, to every device that turned reminders on. Each slot is sent at most once a day,
// and only within 3 hours of its time (so a late deploy doesn't send "good morning" at night).
//
// Secrets (Edge Functions → Secrets): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:…), CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:support@example.com", env("VAPID_PUBLIC"), env("VAPID_PRIVATE"));

const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const due = (at: string | null, last: string | null, day: string, nowMin: number) =>
  !!at && last !== day && nowMin >= toMin(at) && nowMin < toMin(at) + 180;

Deno.serve(async (req) => {
  if (env("CRON_SECRET") && req.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
    return new Response("unauthorised", { status: 401 });
  }
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: subs, error } = await db.from("push_subs").select("*");
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0, dropped = 0;
  for (const s of subs ?? []) {
    const local = new Date(Date.now() + (s.tz_offset || 0) * 60000);   // shift to the user's wall clock
    const day = local.toISOString().slice(0, 10);
    const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();

    let slot: "morning" | "evening" | null = null, body = "";
    if (due(s.morning, s.last_morning, day, nowMin)) {
      slot = "morning";
      body = "Your day's waiting. Tick something off early and the rest feels easier.";
    } else if (due(s.evening, s.last_evening, day, nowMin)) {
      const { data: st } = await db.from("daily_stats").select("done,expected")
        .eq("user_id", s.user_id).eq("date", day).maybeSingle();
      const left = st ? (st.expected ?? 0) - (st.done ?? 0) : null;
      if (left !== null && left <= 0) {                                   // all done — mark it, say nothing
        await db.from("push_subs").update({ last_evening: day }).eq("endpoint", s.endpoint);
        continue;
      }
      slot = "evening";
      body = left === null ? "You haven't opened Steady today — there's still time."
                           : `${left} task${left === 1 ? "" : "s"} left today. Still time.`;
    }
    if (!slot) continue;

    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: slot === "morning" ? "Steady" : "Still time", body, tag: "steady-" + slot, url: "./" }),
        { TTL: 3600 },
      );
      sent++;
      await db.from("push_subs").update(slot === "morning" ? { last_morning: day } : { last_evening: day }).eq("endpoint", s.endpoint);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {                                  // phone unsubscribed or app removed
        await db.from("push_subs").delete().eq("endpoint", s.endpoint);
        dropped++;
      }
    }
  }
  return new Response(JSON.stringify({ sent, dropped }), { headers: { "Content-Type": "application/json" } });
});
