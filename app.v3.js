// @ts-nocheck
/* ============ Steady — local-first consistency tracker ============ */
const KEY = 'steady.v2';
const BUILD = (()=>{ try{ const b=new URL(import.meta.url).searchParams.get('b');
  return (b?'b'+b+' · ':'')+'2026-09-19'; }catch(e){ return '2026-09-19'; } })();   // shown in Settings → Help, so you can tell which build a phone is running
/* ---- Friends sync config ----
   Project URL (no /rest/v1 suffix) and publishable key. This key is meant to be
   public — row-level security in supabase.sql is what actually protects the data.
   Leave blank and the Friends tab runs in demo mode with a local fake friend.
   Only aggregates ever leave the device: cleared/done/expected counts, streak,
   consistency and level. Task names, notes, miss reasons and your "why" never sync. */
/* Paste your VAPID public key here to turn on server-sent reminders (see push.sql). */
const PUSH = { vapidPublic: '' };
const SYNC = {
  url:    'https://rjytcvajeysfnfmtgakm.supabase.co',
  anonKey:'sb_publishable_YY7K6b6P_E1HoQxAu_PTsg_MYU0lTeA'
};
const MAX_REWARDS = 6, SPARES = 1, TASK_BASE = 10, CLEAR_PER_TASK = 5, CHEST_DAYS = 6;
/* Days of slip before weak-habit pay rises — one miss must not bump the badge. */
const STRENGTH_PAY_LAG = 3;
const MAX_TASKS = 10, MIN_REWARD_PRICE = 10;
const CHAL_PEOPLE_MAX = 24;      // slots, not headcount, are the real limit now
const CREW_MAX = 8;              // past this a chat stops being a conversation
const CHAL_PARTY_MAX = 6;
const CREW_BONUS_PER_HEAD = 0.10, CREW_BONUS_CAP = 2.0;
const CHAL_PARTY = {legendary:CHAL_PARTY_MAX, rare:CHAL_PARTY_MAX, common:CHAL_PARTY_MAX};
/* Rare challenge chests: chance of +1 shop allowance for the week. Legendary always gets 2. */
const RARE_EXTRA_CHANCE = 0.4;
/* Rewards are priced in coins you set. Week/fortnight chips suggest your real earn rate. */
const OT_PER = 5, OT_TASK_CAP = 10, OT_DAY_CAP = 20; // 1 coin per 5 min over target, capped per task and per day
/* Turning up earns most of the value; the rest scales with the time you actually did.
   A short session is still DONE — streak, day clear and habit strength never see it. */
const TIME_FLOOR = 0.6;
/* Full-clear streak: a bonus every 7 consecutive cleared days, doubling but capped. */
const CLEAR_WEEK_BONUS = 20, CLEAR_WEEK_CAP = 320;
/* After this many misses in a row on one task, offer some advice. */
const STUCK_MISSES = 5, ADVICE_COOLDOWN = 14;
const TIER_DAYS = {week:7, fortnight:14};
const TIER_LABEL = {week:'Week', fortnight:'Fortnight'};
const round10 = n => Math.round(n/10)*10;
const dayRate = () => Math.max(1, activeTasks().length) * (TASK_BASE*1.3 + CLEAR_PER_TASK); // a cleared day at healthy strength
const tierCost = t => round10(dayRate()*(TIER_DAYS[t]||TIER_DAYS.week));
const chestCoins = () => round10(dayRate());
/* A clear day: each task pays base coins plus the clear bonus. Strength and overtime are extra, not assumed. */
function clearDayPay(){
  const n=activeTasks().length;
  return n * (TASK_BASE + CLEAR_PER_TASK);
}
function typicalDayEarn(){ return Math.max(TASK_BASE + CLEAR_PER_TASK, clearDayPay()); }
function coinsNeeded(cost){
  return Math.max(0, (Number(cost)||0) - (S.points.coins||0));
}
function daysToEarn(cost){
  const need=coinsNeeded(cost);
  const rate=clearDayPay();
  if(need<=0) return 0;
  if(rate<1) return Infinity;
  return Math.ceil(need/rate);
}
function earnEta(cost){
  const n=activeTasks().length;
  const rate=clearDayPay();
  if(!n) return 'Add a task first — a clear day is what this is based on.';
  const pay=n===1?`1 task pays ${rate} a day`:`${n} tasks pay ${rate} a day`;
  const need=coinsNeeded(cost);
  if(need<=0) return 'You already have enough · '+pay;
  const days=Math.ceil(need/rate);
  const d=days===1?'1 day':days+' days';
  return `${d} · ${pay} when you clear`;
}
function rewardPrice(r){
  const n=Math.round(Number(r && r.price));
  if(n>0) return Math.max(MIN_REWARD_PRICE, n);
  return Math.max(MIN_REWARD_PRICE, tierCost((r && r.tier) || 'week'));
}
/* ---------- Reward budgeting ----------
   You say how often you want a thing; the app works out the price from what you
   actually earn. Then the Shop shows whether your wishes fit inside a month. */
const FREQS = [
  {id:'weekly',    label:'Weekly',      per:4.33},
  {id:'fortnight', label:'Fortnightly', per:2.17},
  {id:'monthly',   label:'Monthly',     per:1},
  {id:'custom',    label:'Custom',      per:null},   // you say how many times a month
];
const freqOf = id => FREQS.find(f=>f.id===id) || FREQS[2];
const MAX_PER_MONTH = 30;
/* Times a month, whichever way it was set. */
function perMonthOf(r){
  if(rewardFreq(r)==='custom') return clamp(Number(r.perMonth)||1, 0.25, MAX_PER_MONTH);
  return freqOf(rewardFreq(r)).per;
}
function freqLabel(r){
  if(rewardFreq(r)==='custom'){ const n=perMonthOf(r); return `${Math.round(n*10)/10}× a month`; }
  return freqOf(rewardFreq(r)).label;
}
function perFor(freqId, perMonth){
  return freqId==='custom' ? clamp(Number(perMonth)||1, 0.25, MAX_PER_MONTH) : freqOf(freqId).per;
}
const BUDGET_SHARE = 0.8;                 // leave slack for challenges and chests
/* Real coins a month: measured if there's history, estimated from the task list if not. */
function monthlyIncome(){
  const k=today(); let total=0,n=0;
  for(let i=1;i<=28;i++){ const d=addDays(k,-i); const st=dayStats(d); if(st.expected){ total+=st.points; n++; } }
  if(n>=5) return {coins:Math.max(1,Math.round(total/n*30.4)), real:true};
  return {coins:Math.max(1,round10(clearDayPay()*30.4*0.75)), real:false};
}
function rewardFreq(r){ return r.freq || 'monthly'; }
function monthlyCostOf(r){ return rewardPrice(r)*perMonthOf(r); }
/* What each reward should cost if the active set is to fit the budget. */
function suggestFromFreq(freqId, others, perMonth){
  const inc=monthlyIncome().coins*BUDGET_SHARE;
  const list=(others||S.rewards.filter(x=>x.active));
  const share=inc/(list.length+1);                // this one plus the rest
  return Math.max(MIN_REWARD_PRICE, round10(share/perFor(freqId, perMonth)));
}
/* ---------- Allowances ----------
   The frequency you chose is a real limit, not just a pricing assumption.
   Weekly means once a week. "8x a month" means eight, then it waits. */
function allowanceOf(r){
  const f=rewardFreq(r);
  if(f==='custom') return Math.max(1, Math.round(perMonthOf(r)));
  return 1;                                    // weekly / fortnightly / monthly = one per window
}
function windowStart(r){
  const f=rewardFreq(r), k=today();
  if(f==='weekly') return weekOf(k);
  if(f==='fortnight') return addDays(k,-13);   // rolling: one per 14 days
  return k.slice(0,8)+'01';                    // calendar month
}
function boughtInWindow(r){
  const from=windowStart(r);
  return (S.locker||[]).filter(l=>l.rewardId===r.id && l.boughtAt>=from).length;
}
function nextAvailable(r){
  const f=rewardFreq(r), k=today();
  if(f==='weekly') return addDays(weekOf(k),7);
  if(f==='fortnight'){
    const last=(S.locker||[]).filter(l=>l.rewardId===r.id).map(l=>l.boughtAt).sort().pop();
    return last?addDays(last,14):k;
  }
  const d=parse(k); let y=d.getFullYear(), m=d.getMonth()+2;
  if(m>12){ m=1; y++; }
  return `${y}-${pad(m)}-01`;
}
/* Challenge-chest shop extras: +1 buy for a chosen reward, keyed to the week they were won.
   Unused extras expire when the week rolls — they do not carry. */
function pruneRewardExtras(){
  S.rewardExtras=Array.isArray(S.rewardExtras)?S.rewardExtras:[];
  const wk=weekOf(today());
  const next=S.rewardExtras.filter(e=>e&&e.weekStart===wk);
  const changed=next.length!==S.rewardExtras.length;
  S.rewardExtras=next;
  return changed;
}
function extrasForReward(r){
  pruneRewardExtras();
  return S.rewardExtras.filter(e=>e.rewardId===r.id).length;
}
function pendingExtras(){
  pruneRewardExtras();
  return S.rewardExtras.filter(e=>!e.rewardId);
}
function grantChestExtras(n, tier){
  if(!(n>0)) return [];
  pruneRewardExtras();
  const wk=weekOf(today()), added=[];
  for(let i=0;i<n;i++){
    const ex={id:uid(), rewardId:null, weekStart:wk, source:'chal', tier:tier||null, at:today()};
    S.rewardExtras.push(ex); added.push(ex);
  }
  return added;
}
function assignExtra(extraId, rewardId){
  pruneRewardExtras();
  const ex=S.rewardExtras.find(e=>e.id===extraId); if(!ex||ex.rewardId) return false;
  if(!(S.rewards||[]).some(r=>r.id===rewardId&&r.active)) return false;
  ex.rewardId=rewardId; save(); return true;
}
/* One spare beyond what you planned, then it stops — unless a challenge chest granted extras. */
function allowanceState(r){
  const used=boughtInWindow(r), limit=allowanceOf(r), extras=extrasForReward(r), hard=limit+SPARES+extras;
  const f=rewardFreq(r);
  const period = f==='weekly'?'this week' : f==='fortnight'?'this fortnight' : 'this month';
  const sparesLeft=Math.max(0, hard-Math.max(used,limit));
  return {used, limit, hard, extras, left:Math.max(0,limit-used), sparesLeft,
    period, over:used>=limit && used<hard, maxed:used>=hard,
    amber:used>=limit && used<hard-1, red:used===hard-1,
    intoExtra:used>=limit+SPARES && used<hard,
    next:nextAvailable(r), monthUsed:boughtThisMonth(r)};
}
/* Plain count for the month, whatever the window is — for the counter on each reward. */
function boughtThisMonth(r){
  const from=today().slice(0,8)+'01';
  return (S.locker||[]).filter(l=>l.rewardId===r.id && l.boughtAt>=from).length;
}
function monthlyPlanned(r){ return Math.max(1, Math.round(perMonthOf(r))); }

function budgetState(){
  const inc=monthlyIncome();
  const active=S.rewards.filter(x=>x.active);
  const spend=active.reduce((a,r)=>a+monthlyCostOf(r),0);
  const pct=inc.coins?Math.round(100*spend/inc.coins):0;
  const redemptions=active.reduce((a,r)=>a+perMonthOf(r),0);
  return {income:inc.coins, real:inc.real, spend:Math.round(spend), pct,
    redemptions:Math.round(redemptions*10)/10, active,
    level: pct>100?'over' : pct>90?'tight' : 'ok'};
}
/* Prices that would make the current wishes fit, keeping every frequency as chosen. */
function rebalancePlan(){
  const b=budgetState(); if(!b.active.length) return [];
  const inc=b.income*BUDGET_SHARE;
  const share=inc/b.active.length;
  return b.active.map(r=>{
    const from=rewardPrice(r);
    const to=Math.max(MIN_REWARD_PRICE, round10(share/perMonthOf(r)));
    const progress=Math.min(1,(S.points.coins||0)/from);
    return {r,from,to,freq:rewardFreq(r),label:freqLabel(r),per:perMonthOf(r),raises:to>from,halfway:progress>=0.5};
  }).filter(x=>x.to!==x.from);
}
function applyRebalance(plan){ plan.forEach(x=>{ x.r.price=x.to; }); save(); }

function suggestedPrices(){
  const rate=clearDayPay() || (TASK_BASE + CLEAR_PER_TASK);
  return {
    week: Math.max(MIN_REWARD_PRICE, round10(rate*7)),
    fortnight: Math.max(MIN_REWARD_PRICE, round10(rate*14)),
  };
}
const TITLES = [['Drifter',1],['Steady',5],['Committed',12],['Relentless',20]]; // by level
const xpToNext = L => Math.round(60*Math.pow(L,1.2));
const loginBonus = s => s<2?0:s<7?5:s<30?10:15;
const DEFAULT_REASONS = ['Forgot','No time','Not feeling it','Something came up'];
const THEMES = {
  teal:{label:'Teal',
    dark: {bg:'#061411',surface:'#0e241f',surface2:'#16352e',line:'#2a564c',fg:'#e7faf4',fg2:'#7dcebf',fg3:'#3d7a70',accent:'#2ee6c8'},
    light:{bg:'#e6f4ef',surface:'#ffffff',surface2:'#d2ebe3',line:'#b0d4c8',fg:'#0c2924',fg2:'#2f6b60',fg3:'#6a9a90',accent:'#0f766e'}},
  dusk:{label:'Dusk',
    dark: {bg:'#120c1c',surface:'#1e162c',surface2:'#2c2140',line:'#46355e',fg:'#f5eeff',fg2:'#c6b0e4',fg3:'#7a6498',accent:'#c4a6ff'},
    light:{bg:'#f3eef9',surface:'#ffffff',surface2:'#e7dcf3',line:'#d0bce4',fg:'#2a1640',fg2:'#5c3d78',fg3:'#9478ac',accent:'#7c3aed'}},
  rose:{label:'Rose',
    dark: {bg:'#1a0810',surface:'#2c101c',surface2:'#3e1828',line:'#5e2840',fg:'#ffeff4',fg2:'#f0a8bc',fg3:'#a05870',accent:'#ff6b8a'},
    light:{bg:'#fceef2',surface:'#ffffff',surface2:'#f6dce4',line:'#ecc0cc',fg:'#3c101c',fg2:'#8c3850',fg3:'#b87888',accent:'#e11d48'}},
  ocean:{label:'Ocean',
    dark: {bg:'#061018',surface:'#0e1e2e',surface2:'#162c40',line:'#244860',fg:'#e8f4fc',fg2:'#80c0e0',fg3:'#4a7898',accent:'#3ec8f0'},
    light:{bg:'#e8f2fa',surface:'#ffffff',surface2:'#d4e6f4',line:'#b0cce0',fg:'#0c2038',fg2:'#2c5880',fg3:'#6a90b0',accent:'#0284c7'}},
  moss:{label:'Moss',
    dark: {bg:'#0a140c',surface:'#142218',surface2:'#1e3022',line:'#324c38',fg:'#eaf6e8',fg2:'#9cd49a',fg3:'#588060',accent:'#5ee89a'},
    light:{bg:'#eef6ea',surface:'#ffffff',surface2:'#dcecdc',line:'#b8d4b4',fg:'#142414',fg2:'#3c6438',fg3:'#789c74',accent:'#15803d'}},
  sand:{label:'Sand',
    dark: {bg:'#14100a',surface:'#241e14',surface2:'#342c1c',line:'#504828',fg:'#faf4e6',fg2:'#e0c078',fg3:'#8c7848',accent:'#f5c542'},
    light:{bg:'#faf4e8',surface:'#ffffff',surface2:'#f0e6d0',line:'#e0d0b0',fg:'#2c2414',fg2:'#6c5830',fg3:'#a09068',accent:'#b45309'}},
  ink:{label:'Ink',
    dark: {bg:'#0c0c0e',surface:'#18181c',surface2:'#242428',line:'#3a3a40',fg:'#f4f4f5',fg2:'#b0b0b8',fg3:'#6a6a72',accent:'#e8e8ec'},
    light:{bg:'#f2f2f4',surface:'#ffffff',surface2:'#e6e6ea',line:'#d0d0d6',fg:'#141418',fg2:'#4a4a52',fg3:'#8a8a92',accent:'#18181b'}},
};
const THEME_ALIAS = {pink:'rose', grey:'ink', black:'ink', blue:'ocean', green:'moss'};
const INKS = [
  {id:'cream', hex:'#f4efe4'}, {id:'snow', hex:'#ffffff'}, {id:'mint', hex:'#c8f0dc'},
  {id:'blush', hex:'#f8cfd8'}, {id:'sky', hex:'#cde4f8'}, {id:'gold', hex:'#f0d78c'}, {id:'lilac', hex:'#e4d4f8'},
  {id:'charcoal', hex:'#1c1c1e'}, {id:'espresso', hex:'#2a1c14'}, {id:'navy', hex:'#122033'},
  {id:'wine', hex:'#3a1622'}, {id:'forest', hex:'#142018'},
];
const MOTIF_GLYPH = {
  none:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4.5" y="4.5" width="15" height="15" rx="4"/><path d="M8 8l8 8"/></svg>',
  flowers:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6.2" r="3.1"/><circle cx="17.4" cy="9.5" r="3.1"/><circle cx="15.4" cy="15.6" r="3.1"/><circle cx="8.6" cy="15.6" r="3.1"/><circle cx="6.6" cy="9.5" r="3.1"/><circle cx="12" cy="12" r="2.3"/></svg>',
  hearts:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  stars:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.4l2.7 6.6 7.1.6-5.4 4.6 1.7 7-6.1-3.6-6.1 3.6 1.7-7L2.2 9.6l7.1-.6z"/></svg>',
  leaves:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 20c9-1 14-8 15-17-9 1-16 8-15 17z"/><path d="M6.2 18.2c3.4-3.2 7.4-6.4 12.6-8.6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  sparkles:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 2l1.5 6.2L19 10l-6.5 1.8L11 18l-1.5-6.2L3 10l6.5-1.8z"/><path d="M18 13.5l.8 2.6 2.7.7-2.7.7-.8 2.6-.8-2.6-2.7-.7 2.7-.7z"/></svg>',
};
const MOTIFS = [
  {id:'none', label:'None'},
  {id:'flowers', label:'Flowers'},
  {id:'hearts', label:'Hearts'},
  {id:'stars', label:'Stars'},
  {id:'leaves', label:'Leaves'},
  {id:'sparkles', label:'Sparkles'},
];
const MOTIF_TILE = 200;
function motifWallpaper(id, colour, alpha){
  const c=colour, a=alpha;
  const daisy=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="0" cy="-12" r="7.2"/><circle cx="11.4" cy="-3.7" r="7.2"/><circle cx="7" cy="10.2" r="7.2"/>
    <circle cx="-7" cy="10.2" r="7.2"/><circle cx="-11.4" cy="-3.7" r="7.2"/><circle cx="0" cy="0" r="4.6"/></g>`;
  const heart=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></g>`;
  const star=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M12 2.2l2.9 6.9 7.4.6-5.6 4.8 1.8 7.2L12 17.4 5.5 21.7 7.3 14.5 1.7 9.7l7.4-.6z"/></g>`;
  const leaf=(x,y,s,r)=>`<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M2 22C4 10 12 4 22 2 20 12 14 20 2 22z"/></g>`;
  const spark=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M10 0l1.8 7.4L19 10l-7.2 2.6L10 20 8.2 12.6 1 10l7.2-2.6z"/></g>`;
  const inner={
    flowers:`<g fill="${c}" fill-opacity="${a}">${daisy(48,44,.95)}${daisy(150,138,.7)}</g>`,
    hearts:`<g fill="${c}" fill-opacity="${a}">${heart(22,18,1.7)}${heart(118,108,1.15)}${heart(138,22,.7)}</g>`,
    stars:`<g fill="${c}" fill-opacity="${a}">${star(20,16,1.15)}${star(118,108,.85)}${star(148,28,.5)}</g>`,
    leaves:`<g fill="${c}" fill-opacity="${a}">${leaf(40,36,.9,-18)}${leaf(142,118,.7,28)}</g>`,
    sparkles:`<g fill="${c}" fill-opacity="${a}">${spark(28,22,1.1)}${spark(124,112,.75)}${spark(150,36,.42)}</g>`,
  }[id];
  if(!inner) return '';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${MOTIF_TILE}" height="${MOTIF_TILE}">${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function applyMotif(st, acc){
  const el=document.getElementById('motif'); if(!el) return;
  const img=motifWallpaper(st.motif, acc, isDarkMode(st)?0.38:0.22);
  el.style.backgroundImage=img||'none';
  el.classList.toggle('on', !!img);
}
/* Follows the phone's own light/dark setting — one less switch to find. */
function isDarkMode(){
  return !matchMedia('(prefers-color-scheme: light)').matches;
}
function themePalette(st=S.settings){
  const t=THEMES[st.theme]||THEMES.teal;
  return t[isDarkMode(st)?'dark':'light'];
}

const uid = () => Math.random().toString(36).slice(2,10);
const pad = n => String(n).padStart(2,'0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => dkey(new Date());
const parse = k => { const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (k,n) => { const d=parse(k); d.setDate(d.getDate()+n); return dkey(d); };
const daysBetween = (a,b) => Math.round((parse(b)-parse(a))/86400000);
const fmt = (k,o={weekday:'short',day:'numeric',month:'short'}) => parse(k).toLocaleDateString(undefined,o);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function fresh(){
  return {
    tasks:[], rewards:[], locker:[], rewardExtras:[], customReasons:[],
    days:{}, streak:{login:0,best:0}, points:{coins:0,xp:0}, freezes:0, chests:{},
    clearPaidBlock:0, advice:{}, recaps:[], me:null, auth:'out', session:null, friends:{}, pairs:{}, challenges:[], demo:false, outbox:[], inbox:[], todos:[], notes:[], whys:[], vaultAt:null, chalCooldownUntil:null, chalLocks:{},
    crews:[], msgs:{}, muted:[],
    settings:{theme:'teal',mode:'dark',ink:null,motif:'none',font:'system',textSize:100,motion:true,haptics:true,glow:true,
      remind:{on:false,morning:'08:00',evening:'20:00',eveningOn:true,affOn:false,aff:'12:00',fired:{}}},
    flags:{onboarded:false,why:'',lastOpen:null,quoteDate:null,tours:{}},
    pendingMisses:[], undo:null,
  };
}
let S = load();
function load(){
  try{
    if(typeof localStorage==='undefined') return fresh();
    const raw=localStorage.getItem(KEY); if(!raw) return fresh();
    const s=fresh(); const p=JSON.parse(raw);
    const m={...s,...p,settings:{...s.settings,...(p.settings||{})},flags:{...s.flags,...(p.flags||{})}};
    if(!m.points || m.points.coins===undefined){ m.points={coins:m.points?.balance||0,xp:m.points?.lifetime||0}; }
    (m.rewards||[]).forEach(r=>{
      if(!TIER_DAYS[r.tier] && r.tier!=='custom') r.tier = r.tier==='big' ? 'fortnight' : 'week';
      if(typeof r.price!=='number' || !(r.price>0)){
        const nTasks=Math.max(1,(m.tasks||[]).filter(t=>!t.archived).length);
        const anyT=(m.tasks||[]).some(t=>!t.archived && t.target);
        const dr=nTasks*(TASK_BASE*1.3+CLEAR_PER_TASK)+(anyT?OT_DAY_CAP/2:0);
        r.price=round10(dr*(TIER_DAYS[r.tier]||7));
      }
    });
    (m.tasks||[]).forEach(t=>{ t.tier='core'; });
    if(THEME_ALIAS[m.settings.theme]) m.settings.theme=THEME_ALIAS[m.settings.theme];
    if(!THEMES[m.settings.theme]) m.settings.theme='teal';
    if(!MOTIFS.some(x=>x.id===m.settings.motif)) m.settings.motif='none';
    if(!m.whys.length && m.flags.why) m.whys=[{id:uid(),text:m.flags.why}];
    m.quotes=(m.quotes||[]).filter(q=>q.custom);
    migratePairChallenges(m);
    return m;
  }catch(e){ return fresh(); }
}
function save(){ try{ if(typeof localStorage==='undefined') return; localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

/* ---------- List ----------
   Deliberately outside the economy: no points, no strength, no miss gate.
   Its job is to give you something to reach for, not another thing to fail. */
function todosToday(){ return S.todos.filter(t=>!t.done && t.day && t.day<=today()).sort((a,b)=>a.createdAt-b.createdAt); }
function todosOn(k){ return S.todos.filter(t=>!t.done && t.day===k).sort((a,b)=>a.createdAt-b.createdAt); }
function todosAhead(){ return S.todos.filter(t=>!t.done && t.day && t.day>today()).sort((a,b)=>a.day<b.day?-1:a.day>b.day?1:0); }
function todosDone(){ return S.todos.filter(t=>t.done && t.doneDay===today()); }
function backlog(){ return S.todos.filter(t=>!t.done && !t.day).sort((a,b)=>b.createdAt-a.createdAt); }
function addTodo(text,day,at){ S.todos.push({id:uid(),text,day:day||null,at:at||null,done:false,createdAt:Date.now()}); save(); }
function setTodoTime(id,at){ const t=S.todos.find(x=>x.id===id); if(t){ t.at=at||null; save(); } }
function setTodoDay(id,day){ const t=S.todos.find(x=>x.id===id); if(t){ t.day=day||null; save(); } }
function whenLabel(k){ if(!k) return 'Someday'; const d=(parse(k)-parse(today()))/86400000;
  if(d<0) return 'Overdue'; if(d===0) return 'Today'; if(d===1) return 'Tomorrow';
  if(d<7) return parse(k).toLocaleDateString(undefined,{weekday:'long'});
  return fmt(k,{day:'numeric',month:'short'}); }

/* ---------- Notes ----------
   Deliberately plain: a title, a date, and a box to write in. Nothing to learn. */
function migrateNote(n){
  if(n.body===undefined){
    const parts=[];
    (n.blocks||[]).forEach(bl=>{
      if(bl.type==='text' && bl.text) parts.push(bl.text);
      else if(bl.type==='chart'){                       // keep old chart data as plain text
        const head=[bl.title||'Chart', bl.unit?`(${bl.unit})`:''].filter(Boolean).join(' ');
        const rows=(bl.points||[]).sort((x,y)=>x.d<y.d?-1:1)
          .map(pt=>`${fmt(pt.d,{day:'numeric',month:'short'})}: ${pt.v}${bl.unit?' '+bl.unit:''}`);
        if(rows.length||bl.title) parts.push([head,...rows].join('\n'));
      }
    });
    n.body=parts.join('\n\n');
    delete n.blocks;
  }
  if(n.title===undefined) n.title='';
  if(!n.createdAt) n.createdAt=n.updatedAt||Date.now();
  return n;
}
function noteTitle(n){
  migrateNote(n);
  if(n.title.trim()) return n.title.trim();
  const first=(n.body||'').split('\n').map(l=>l.trim()).find(Boolean);
  return first || 'Untitled';
}
function notePreview(n){
  migrateNote(n);
  const lines=(n.body||'').split('\n').map(l=>l.trim()).filter(Boolean);
  const from = n.title.trim() ? lines : lines.slice(1);
  return from.join(' · ') || 'Empty';
}
/* First display line for Plan lists — rest opens in a dropdown. */
function firstLine(text, max=60){
  const t=String(text||'').replace(/\r/g,'').trim();
  const line=(t.split('\n').find(l=>l.trim())||'').trim();
  if(!line) return '…';
  return line.length<=max?line:line.slice(0,max-1)+'…';
}
function textHasMore(text, max=60){
  const t=String(text||'').replace(/\r/g,'').trim();
  if(!t) return false;
  if(t.includes('\n')) return t.split('\n').filter(l=>l.trim()).length>1 || (t.split('\n')[0]||'').length>max;
  return t.length>max;
}
/* What the dropdown shows under the first line — no repeat of the headline. */
function restAfterFirstLine(text, max=60){
  const raw=String(text||'').replace(/\r/g,'');
  const t=raw.trim();
  if(!t) return '';
  const nl=t.indexOf('\n');
  if(nl>=0){
    const first=(t.slice(0,nl)).trim();
    const rest=t.slice(nl+1).replace(/^\n+/,'').trimEnd();
    if(first.length>max) return first.slice(max-1)+ (rest?('\n'+rest):'');
    return rest;
  }
  if(t.length<=max) return '';
  return t.slice(max-1);
}
function addNote(){
  const now=Date.now();
  const n={id:uid(),title:'',body:'',createdAt:now,updatedAt:now};
  S.notes.unshift(n); save(); return n;
}
function touchNote(n){ n.updatedAt=Date.now(); save(); }
function dropNote(id){ S.notes=S.notes.filter(n=>n.id!==id); save(); }
function noteEmpty(n){ migrateNote(n); return !n.title.trim() && !n.body.trim(); }
/* Most recently opened or edited first. */
function notesSorted(){ S.notes.forEach(migrateNote); return [...S.notes].sort((a,b)=>b.updatedAt-a.updatedAt); }
/* Keyword search: every space-separated word must appear somewhere in the text (not an exact title match). */
function keywordMatch(hay, q){
  const words=String(q||'').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if(!words.length) return true;
  const h=String(hay||'').toLowerCase();
  return words.every(w=>h.includes(w));
}
function migrateWhy(w){
  if(!w || typeof w!=='object') return w;
  if(!w.touchedAt) w.touchedAt=w.createdAt||Date.now();
  if(!w.createdAt) w.createdAt=w.touchedAt;
  return w;
}
function touchWhy(w){ migrateWhy(w); w.touchedAt=Date.now(); save(); }
function whysSorted(){ (S.whys||[]).forEach(migrateWhy); return [...(S.whys||[])].sort((a,b)=>(b.touchedAt||0)-(a.touchedAt||0)); }
function notesFiltered(){ const q=planState.noteQ||''; return notesSorted().filter(n=>keywordMatch(noteTitle(n)+' '+ (n.body||''), q)); }
function whysFiltered(){ const q=planState.affQ||''; return whysSorted().filter(w=>keywordMatch(w.text, q)); }

function toggleTodo(id){ const t=S.todos.find(x=>x.id===id); if(!t) return;
  t.done=!t.done; t.doneDay=t.done?today():null; if(t.done&&!t.day) t.day=today(); save(); }
function pullTodo(id){ const t=S.todos.find(x=>x.id===id); if(t){ t.day=today(); save(); } }
function dropTodo(id){ S.todos=S.todos.filter(x=>x.id!==id); save(); }
function pushTodo(id){ const t=S.todos.find(x=>x.id===id); if(t){ t.day=null; save(); } } // back to the backlog

/* Connection check — reports exactly where it breaks instead of one vague message. */
async function connectionReport(){
  const L=[];
  L.push(['Build', BUILD]);
  const proto=location.protocol;
  L.push(['Page', proto.startsWith('http') ? `served over ${proto.replace(':','')}` : `opened as a ${proto.replace(':','')} file — sync cannot work here`]);
  if(!SYNC.url||!SYNC.anonKey){ L.push(['Server','not configured in the code']); return L; }
  L.push(['Server', apiBase()]);
  if(!proto.startsWith('http')){ L.push(['Result','Open the app from its web address, not a downloaded file.']); return L; }
  try{
    const res=await fetch(apiBase()+'/auth/v1/health',{headers:{apikey:SYNC.anonKey}});
    L.push(['Reaching server', res.ok?`yes (HTTP ${res.status})`:`replied HTTP ${res.status}`]);
  }catch(e){ L.push(['Reaching server','blocked before it left the phone']);
    L.push(['Likely cause','Brave Shields, a VPN/ad-blocker, or no connection. Try lowering Shields for this site.']); return L; }
  try{
    const res=await fetch(apiBase()+'/rest/v1/profiles?select=id&limit=1',{headers:{apikey:SYNC.anonKey}});
    const t=await res.text();
    L.push(['Database', res.status===200?'tables are there':res.status===401?'key rejected — check the publishable key':
      /relation|does not exist|PGRST/i.test(t)?'tables missing — run supabase.sql':`HTTP ${res.status}`]);
  }catch(e){ L.push(['Database','request blocked']); }
  L.push(['Signed in', Sync.signedIn()?`yes, as ${S.me?.email||S.me?.name||'?'}`:'no']);
  return L;
}

/* ---------- Milestone recaps ----------
   Snapshotted when earned, so revisiting one later shows what it said at the time. */
const MILESTONES=[[7,'Your first week'],[30,'Your first month'],[100,'One hundred days'],[365,'Your first year']];
/* A short recap every Monday for the week just gone, on top of the big milestones. */
function lastWeekMonday(){ return addDays(weekOf(today()),-7); }
function weekRecapDue(){
  const mon=lastWeekMonday();
  if(daysSinceStart()<8) return null;
  if((S.recaps||[]).some(r=>r.week===mon)) return null;
  for(let i=0;i<7;i++) if(dayStats(addDays(mon,i)).expected) return mon;
  return null;
}
function buildWeekRecap(mon){
  let e=0,d=0,coins=0,cleared=0,mins=0,shown=0; const reasons={},dows={};
  for(let i=0;i<7;i++){ const k=addDays(mon,i); const st=dayStats(k); if(!st.expected) continue;
    e+=st.expected; d+=st.done; coins+=st.points; if(st.perfect) cleared++; if(S.days[k]) shown++;
    for(const t of Object.values(S.days[k]?.tasks||{})){
      if(t.minutes) mins+=t.minutes;
      if(t.status==='missed'){
        if(t.reason) reasons[t.reason]=(reasons[t.reason]||0)+1;
        const dn=parse(k).toLocaleDateString(undefined,{weekday:'long'}); dows[dn]=(dows[dn]||0)+1;
      }
    }
  }
  const sorted=Object.entries(reasons).sort((a,b)=>b[1]-a[1]);
  const worst=Object.entries(dows).sort((a,b)=>b[1]-a[1])[0]||null;
  const prevMon=addDays(mon,-7); let pe=0,pd=0;
  for(let i=0;i<7;i++){ const st=dayStats(addDays(prevMon,i)); pe+=st.expected; pd+=st.done; }
  return {week:mon, weekly:true, n:'w'+mon, name:'Last week', from:mon, at:addDays(mon,6),
    rate:e?Math.round(100*d/e):0, prevRate:pe?Math.round(100*pd/pe):null,
    done:d, expected:e, cleared, coins, minutes:mins, shown,
    level:level().L, title:title().name, bestStreak:S.streak.best,
    chests:Object.values(S.chests).filter(x=>x==='won').length,
    reasonList:sorted.slice(0,4), worstDay:worst,
    missTotal:sorted.reduce((a,x)=>a+x[1],0)};
}
function firstDay(){ const ks=Object.keys(S.days).filter(k=>S.days[k].finalized||k===today()).sort(); return ks[0]||today(); }
function daysSinceStart(){ return Math.floor((parse(today())-parse(firstDay()))/86400000)+1; }
function dueRecap(){ for(const [n,name] of MILESTONES){ if(daysSinceStart()>=n && !S.recaps.some(r=>r.n===n)) return {n,name}; } return null; }
function buildRecap(n,name){
  const start=firstDay(), k=today();
  let e=0,d=0,coins=0,cleared=0,shown=0,mins=0;
  const dows={},reasons={};
  for(let x=start;x<=k;x=addDays(x,1)){
    const s=dayStats(x); if(!s.expected) continue;
    e+=s.expected; d+=s.done; coins+=s.points; if(s.perfect)cleared++;
    if(S.days[x]) shown++;
    for(const [id,t] of Object.entries(S.days[x]?.tasks||{})){
      if(t.minutes) mins+=t.minutes;
      if(t.status==='missed'){ const dn=parse(x).toLocaleDateString(undefined,{weekday:'long'});
        dows[dn]=(dows[dn]||0)+1; if(t.reason) reasons[t.reason]=(reasons[t.reason]||0)+1; }
    }
  }
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0];
  const ts=activeTasks().map(t=>({name:t.name,s:strengthOf(t)})).sort((a,b)=>b.s-a.s);
  return {n,name,at:k,from:start,
    rate:e?Math.round(100*d/e):0, done:d, expected:e, cleared, shown, coins,
    level:level().L, title:title().name, bestStreak:S.streak.best,
    minutes:mins, chests:Object.values(S.chests).filter(x=>x==='won').length,
    strongest:ts[0]||null, weakest:ts.length>1?ts[ts.length-1]:null,
    topReason:top(reasons)||null, worstDay:top(dows)||null,
    reasonList:Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,4),
    missTotal:Object.values(reasons).reduce((a,b)=>a+b,0)};
}
function earnRecap(){
  const due=dueRecap();
  if(due){ const r=buildRecap(due.n,due.name); S.recaps.push(r); save(); return r; }
  const mon=weekRecapDue();
  if(mon){ const r=buildWeekRecap(mon); S.recaps.push(r); save(); return r; }
  return null;
}

const prefersCalm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionOK = () => !prefersCalm();

/* ---------- Reminders ----------
   Two kinds. While the app is open it schedules them itself, which needs nothing
   but permission. For reminders that arrive when the app is closed, a server has
   to push them — see push.sql and the edge function in the README. */
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent||'');
const pushCapable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function notifyState(){
  if(!('Notification' in window)) return 'unsupported';
  if(isIOS() && !isStandalone()) return 'ios-needs-install';   // Safari only allows this once it's on the home screen
  return Notification.permission;                              // 'default' | 'granted' | 'denied'
}
function remindCfg(){ const s=S.settings;
  s.remind=s.remind||{on:false,morning:'08:00',evening:'20:00',eveningOn:true,affOn:false,aff:'12:00',fired:{}};
  if(s.remind.aff===undefined){ s.remind.aff='12:00'; s.remind.affOn=false; }
  return s.remind; }
async function askNotify(){
  if(!('Notification' in window)) return 'unsupported';
  let p=Notification.permission;
  if(p==='default') p=await Notification.requestPermission();
  if(p==='granted'){ remindCfg().on=true; save(); subscribePush().catch(()=>{}); }
  return p;
}
function urlB64ToUint8(b64){
  const pad='='.repeat((4-b64.length%4)%4);
  const raw=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
async function subscribePush(){
  if(!pushCapable()||!PUSH.vapidPublic) return null;
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToUint8(PUSH.vapidPublic)});
  const j=sub.toJSON(); const c=remindCfg();
  if(Sync.live()&&Sync.signedIn()){
    try{ await api('/rest/v1/push_subs?on_conflict=endpoint',{method:'POST',
      body:{user_id:S.me.id,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth,
            tz_offset:-new Date().getTimezoneOffset(),morning:c.morning,evening:c.eveningOn?c.evening:null},
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  }
  return sub;
}
async function showLocal(title,body,tag){
  try{
    if(Notification.permission!=='granted') return false;
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification(title,{body,tag,icon:'./icon.svg',badge:'./icon.svg',
      data:{url:location.pathname},vibrate:S.settings.haptics?[60,40,60]:undefined});
    return true;
  }catch(e){ return false; }
}
function reminderBody(){
  const k=today(), st=dayStats(k), left=st.expected-st.done;
  if(!st.expected) return 'No tasks set yet — add a couple to get going.';
  if(left<=0) return 'Everything is ticked. Nice one.';
  const nx=nextClearReward();
  return `${left} task${left===1?'':'s'} left today${nx.streak?` · ${nx.days} more full ${nx.days===1?'day':'days'} for +${nx.amount}`:''}`;
}
/* Fires while the app is open. Once per slot per day. */
function reminderTick(){
  const c=remindCfg(); if(!c.on||Notification.permission!=='granted') return;
  const now=new Date(); const hm=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
  c.fired=c.fired||{}; const k=today();
  /* Plan items with a time on them */
  if(c.todos!==false){
    for(const t of S.todos){
      if(t.done||!t.at||t.day!==k) continue;
      const key='t'+t.id;
      if(c.fired[key]===k || hm<t.at) continue;
      c.fired[key]=k; save();
      showLocal('On your list', t.text, 'steady-todo-'+t.id);
      return;
    }
  }
  const due=(slot,at)=>at && hm>=at && c.fired[slot]!==k;
  if(due('morning',c.morning)){ c.fired.morning=k; save();
    showLocal('Steady', reminderBody(), 'steady-morning'); return; }
  /* Just your own words, nothing else. */
  if(c.affOn && due('aff',c.aff)){
    const a=randomAffirmation();
    c.fired.aff=k; save();
    if(a){ showLocal('Remember', a.text, 'steady-aff'); return; }
  }
  if(c.eveningOn && due('evening',c.evening)){
    const st=dayStats(k); if(st.expected && st.done<st.expected){ c.fired.evening=k; save();
      showLocal('Still time', reminderBody(), 'steady-evening'); }
    else { c.fired.evening=k; save(); }
  }
}

/* ---------- Avatars ----------
   A flat image, not a 3D model. Render a square PNG out of Blender, drop it in,
   and it gets squashed to 128px JPEG — about 5KB, small enough to sit in your
   profile row so friends see it too. */
const AV_SIZE = 128, AV_MAX_BYTES = 20000;
function avatarOf(who){ return who?.avatar || null; }
function avatarHtml(who,cls){
  const src=avatarOf(who);
  if(src) return `<span class="avatar ${cls||''} img"><img src="${src}" alt=""></span>`;
  if(who && who.char) return `<span class="avatar ${cls||''} img">${charSVG(who.char)}</span>`;
  if(who && S.me && who.id===S.me.id) return `<span class="avatar ${cls||''} img">${charSVG(myChar())}</span>`;
  return `<span class="avatar ${cls||''}">${esc((who?.name||'?')[0]).toUpperCase()}</span>`;
}
/* Centre-crop to a square, scale down, re-encode. */
function fileToAvatar(file){
  return new Promise((res,rej)=>{
    if(!file) return rej(new Error('No file'));
    if(!/^image\//.test(file.type)) return rej(new Error('That is not an image.'));
    const fr=new FileReader();
    fr.onerror=()=>rej(new Error('Could not read that file.'));
    fr.onload=()=>{
      const img=new Image();
      img.onerror=()=>rej(new Error('Could not open that image.'));
      img.onload=()=>{
        const c=document.createElement('canvas'); c.width=c.height=AV_SIZE;
        const x=c.getContext('2d');
        const side=Math.min(img.width,img.height);
        x.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,AV_SIZE,AV_SIZE);
        let q=0.75, out=c.toDataURL('image/jpeg',q);
        while(out.length>AV_MAX_BYTES && q>0.35){ q-=0.1; out=c.toDataURL('image/jpeg',q); }
        if(out.length>AV_MAX_BYTES) return rej(new Error('Still too big — try a simpler render.'));
        res(out);
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function setMyAvatar(dataUrl){
  me().avatar=dataUrl||null; save();
  if(Sync.live()&&Sync.signedIn()){
    try{ await api(`/rest/v1/profiles?id=eq.${S.me.id}`,{method:'PATCH',
      body:{avatar:dataUrl||null},headers:{Prefer:'return=minimal'}});
      S.syncError=null; save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  }
}


/* ---------- Characters ----------
   Eight characters, each with its own face. Skin tone and hair colour are pickers
   rather than baked in, so anybody can make anybody — including a ginger-haired
   girl with a mid tone. Cosmetics are not split by gender: any item, any character. */
const TONES = [
  {id:'t1',hex:'#f6dcc8',shade:'#e3bfa4'},
  {id:'t2',hex:'#ecc4a4',shade:'#d4a480'},
  {id:'t3',hex:'#d39b6d',shade:'#b77d52'},
  {id:'t4',hex:'#a9673c',shade:'#8d5130'},
  {id:'t5',hex:'#7b4525',shade:'#63351b'},
  {id:'t6',hex:'#4e2a17',shade:'#3b1f10'},
];
const HAIR_COLOURS = [
  {id:'c-black', hex:'#241f1d'},
  {id:'c-brown', hex:'#4a2f1d'},
  {id:'c-mid',   hex:'#8a5a34'},
  {id:'c-blond', hex:'#d9a95c'},
  {id:'c-ginger',hex:'#c1521f'},
  {id:'c-red',   hex:'#8e2a1c'},
  {id:'c-grey',  hex:'#9a9a9a'},
  {id:'c-dyed',  hex:'#6d5ae0'},
];
/* Faces: a few numbers each, so they read as different people without eight sets of art. */
const BASES = [
  {id:'b1',name:'Character 1',jaw:30,chin:35,eye:'round', brow:'flat',  mouth:'line',  lash:false},
  {id:'b2',name:'Character 2',jaw:28,chin:33,eye:'narrow',brow:'angle', mouth:'smile', lash:false},
  {id:'b3',name:'Character 3',jaw:31,chin:37,eye:'round', brow:'thick', mouth:'smirk', lash:false},
  {id:'b4',name:'Character 4',jaw:27,chin:32,eye:'wide',  brow:'arch',  mouth:'open',  lash:false},
  {id:'b5',name:'Character 5',jaw:27,chin:34,eye:'round', brow:'arch',  mouth:'smile', lash:true},
  {id:'b6',name:'Character 6',jaw:26,chin:32,eye:'wide',  brow:'thin',  mouth:'line',  lash:true},
  {id:'b7',name:'Character 7',jaw:28,chin:36,eye:'narrow',brow:'arch',  mouth:'smirk', lash:true},
  {id:'b8',name:'Character 8',jaw:29,chin:33,eye:'round', brow:'flat',  mouth:'open',  lash:true},
];
/* Cosmetics. cost 0 = yours from the start. */
const LOOK_ITEMS = [
  // hair — every style works on every character
  {id:'h-crop',    slot:'hair', name:'Short crop',   cost:0},
  {id:'h-side',    slot:'hair', name:'Side part',    cost:0},
  {id:'h-long',    slot:'hair', name:'Long',         cost:0},
  {id:'h-bob',     slot:'hair', name:'Bob',          cost:0},
  {id:'h-buzz',    slot:'hair', name:'Buzzed',       cost:50},
  {id:'h-quiff',   slot:'hair', name:'Quiff',        cost:80},
  {id:'h-undercut',slot:'hair', name:'Undercut',     cost:90},
  {id:'h-fringe',  slot:'hair', name:'Fringe',       cost:80},
  {id:'h-wavy',    slot:'hair', name:'Wavy',         cost:100},
  {id:'h-pony',    slot:'hair', name:'Ponytail',     cost:90},
  {id:'h-bun',     slot:'hair', name:'Top bun',      cost:90},
  {id:'h-braids',  slot:'hair', name:'Braids',       cost:110},
  {id:'h-space',   slot:'hair', name:'Space buns',   cost:110},
  {id:'h-curls',   slot:'hair', name:'Curls',        cost:110},
  {id:'h-afro',    slot:'hair', name:'Afro',         cost:110},
  // outfits
  {id:'o-tee',    slot:'outfit', name:'T-shirt',      cost:0,   col:'#3f8f83'},
  {id:'o-hoodie', slot:'outfit', name:'Hoodie',       cost:0,   col:'#4a5568'},
  {id:'o-shirt',  slot:'outfit', name:'Collared shirt',cost:90, col:'#dfe6ef'},
  {id:'o-stripe', slot:'outfit', name:'Striped top',  cost:110, col:'#e4e9f0'},
  {id:'o-dress',  slot:'outfit', name:'Dress',        cost:140, col:'#c2466f'},
  {id:'o-jacket', slot:'outfit', name:'Denim jacket', cost:160, col:'#3f6796'},
  {id:'o-hivis',  slot:'outfit', name:'Hi-vis',       cost:120, col:'#e4d43a'},
  {id:'o-jumper', slot:'outfit', name:'Knit jumper',  cost:130, col:'#8a6b4f'},
  // eyewear
  {id:'g-round',  slot:'glasses', name:'Round specs', cost:70},
  {id:'g-square', slot:'glasses', name:'Square specs',cost:70},
  {id:'g-shades', slot:'glasses', name:'Sunglasses',  cost:120},
  {id:'g-cats',   slot:'glasses', name:'Cat-eye',     cost:130},
  // headwear
  {id:'a-cap',    slot:'hat', name:'Cap',             cost:100},
  {id:'a-beanie', slot:'hat', name:'Beanie',          cost:100},
  {id:'a-bow',    slot:'hat', name:'Hair bow',        cost:90},
  {id:'a-band',   slot:'hat', name:'Headband',        cost:80},
  // backdrops
  {id:'bg-plain', slot:'backdrop', name:'Plain',      cost:0,  col:null},
  {id:'bg-sun',   slot:'backdrop', name:'Sunrise',    cost:60, col:'#f0a05a'},
  {id:'bg-mint',  slot:'backdrop', name:'Mint',       cost:60, col:'#6fd6bd'},
  {id:'bg-night', slot:'backdrop', name:'Night',      cost:80, col:'#2c3358'},
  {id:'bg-rose',  slot:'backdrop', name:'Rose',       cost:80, col:'#dd7ea4'},
];
const SLOTS = [['hair','Hair'],['outfit','Outfit'],['glasses','Eyewear'],['hat','Headwear'],['backdrop','Backdrop']];
const lookItem = id => LOOK_ITEMS.find(i=>i.id===id);
function looks(){
  S.looks = S.looks || {owned:LOOK_ITEMS.filter(i=>!i.cost).map(i=>i.id), av:null};
  if(!S.looks.owned) S.looks.owned=LOOK_ITEMS.filter(i=>!i.cost).map(i=>i.id);
  LOOK_ITEMS.filter(i=>!i.cost).forEach(i=>{ if(!S.looks.owned.includes(i.id)) S.looks.owned.push(i.id); });
  return S.looks;
}
function myChar(){
  const L=looks();
  if(!L.av) L.av={base:'b1',tone:'t2',hairCol:'c-brown',hair:'h-crop',outfit:'o-tee',glasses:null,hat:null,backdrop:'bg-plain'};
  return L.av;
}
const ownsLook = id => !id || looks().owned.includes(id);
function buyLook(id){
  const it=lookItem(id); if(!it||ownsLook(id)) return false;
  if(S.points.coins < it.cost) return false;
  S.points.coins-=it.cost; looks().owned.push(id); save(); return true;
}

/* ---------- Drawing one ---------- */
function hairPath(id,c){
  const dark=`<path d="" fill="none"/>`;
  switch(id){
    /* --- close crops --- */
    case 'h-buzz':
      return `<path d="M24 44c0-16 11-25 26-25s26 9 26 25c-2-4-4-6-6-7-3-8-10-12-20-12s-17 4-20 12c-2 1-4 3-6 7z" fill="${c}" opacity=".95"/>`;
    case 'h-crop':
      return `<path d="M23 45c-1-17 10-27 27-27s28 10 27 27c-2-6-5-10-8-12-4-6-11-9-19-9s-15 3-19 9c-3 2-6 6-8 12z" fill="${c}"/>
              <path d="M34 26c8-5 24-5 32 0-6-2-26-2-32 0z" fill="#000" opacity=".12"/>`;
    case 'h-side':
      return `<path d="M23 46c-2-18 10-29 27-29s28 11 27 29c-2-8-5-13-9-16-6 8-24 10-33 3-3 3-5 7-12 13z" fill="${c}"/>`;
    case 'h-quiff':
      return `<path d="M24 46c-2-19 9-29 26-29 12 0 21 6 25 15-5-2-9 0-12 4-4-9-27-10-39 10z" fill="${c}"/>
              <path d="M40 20c8-8 22-6 28 2-8-4-20-5-28-2z" fill="${c}"/>`;
    case 'h-undercut':
      return `<path d="M26 34c4-11 13-17 24-17s20 6 24 17c-6-6-14-9-24-9s-18 3-24 9z" fill="${c}"/>
              <path d="M24 46c1-6 3-10 5-13 10-6 32-6 42 0 2 3 4 7 5 13-3-9-11-13-26-13s-23 4-26 13z" fill="${c}" opacity=".45"/>`;
    /* --- volume --- */
    case 'h-curls':
      return `${[[32,28],[42,20],[50,17],[58,20],[68,28],[26,38],[74,38],[36,16],[64,16]]
        .map(([x,y])=>`<circle cx="${x}" cy="${y}" r="11" fill="${c}"/>`).join('')}
        <path d="M23 46c-2-19 10-30 27-30s29 11 27 30c-3-13-11-19-27-19s-24 6-27 19z" fill="${c}"/>`;
    case 'h-afro':
      return `<ellipse cx="50" cy="26" rx="33" ry="25" fill="${c}"/>
              <path d="M22 44c2-12 12-19 28-19s26 7 28 19c-4-9-13-14-28-14s-24 5-28 14z" fill="${c}"/>`;
    /* --- longer --- */
    case 'h-long':
      return `<path d="M21 48c-3-21 11-32 29-32s32 11 29 32v30c-5 3-9-2-9-12 0-17-4-24-20-24s-20 7-20 24c0 10-4 15-9 12z" fill="${c}"/>
              <path d="M32 26c10-7 26-7 36 0-8-4-28-4-36 0z" fill="#000" opacity=".12"/>`;
    case 'h-wavy':
      return `<path d="M21 48c-3-21 11-32 29-32s32 11 29 32c-1 12 2 18-2 26-4-3-5-9-4-16-1-16-5-22-23-22s-22 6-23 22c1 7 0 13-4 16-4-8-1-14-2-26z" fill="${c}"/>`;
    case 'h-bob':
      return `<path d="M21 48c-3-20 11-31 29-31s32 11 29 31v6c-1 6-6 8-8 3-1-14-5-20-21-20s-20 6-21 20c-2 5-7 3-8-3z" fill="${c}"/>
              <path d="M30 30c6-8 34-8 40 0-8-5-32-5-40 0z" fill="#000" opacity=".14"/>`;
    case 'h-fringe':
      return `<path d="M21 47c-2-20 11-31 29-31s31 11 29 31v22c-4 3-8-1-8-10 0-16-4-22-21-22s-21 6-21 22c0 9-4 13-8 10z" fill="${c}"/>
              <path d="M28 33c5-9 39-9 44 0 1 4 1 7 0 9-6-6-38-6-44 0-1-2-1-5 0-9z" fill="${c}"/>`;
    /* --- tied back --- */
    case 'h-pony':
      return `<path d="M23 45c-2-19 10-29 27-29s29 10 27 29c-3-13-11-18-27-18s-24 5-27 18z" fill="${c}"/>
              <path d="M74 34c10 3 15 12 13 23-2 10-8 15-13 13 6-10 6-24 0-36z" fill="${c}"/>
              <ellipse cx="73" cy="34" rx="5" ry="4" fill="#000" opacity=".18"/>`;
    case 'h-bun':
      return `<path d="M23 45c-2-19 10-29 27-29s29 10 27 29c-3-13-11-18-27-18s-24 5-27 18z" fill="${c}"/>
              <circle cx="50" cy="10" r="10" fill="${c}"/>
              <ellipse cx="50" cy="19" rx="8" ry="3" fill="#000" opacity=".18"/>`;
    case 'h-braids':
      return `<path d="M23 45c-2-19 10-29 27-29s29 10 27 29c-3-13-11-18-27-18s-24 5-27 18z" fill="${c}"/>
              ${[24,76].map(x=>`<g>${[0,1,2,3].map(i=>`<ellipse cx="${x}" cy="${46+i*9}" rx="6" ry="5.5" fill="${c}"/>`).join('')}</g>`).join('')}`;
    case 'h-space':
      return `<path d="M23 45c-2-19 10-29 27-29s29 10 27 29c-3-13-11-18-27-18s-24 5-27 18z" fill="${c}"/>
              <circle cx="22" cy="34" r="9" fill="${c}"/><circle cx="78" cy="34" r="9" fill="${c}"/>`;
    default: return '';
  }
}
function outfitPath(id){
  const it=lookItem(id)||lookItem('o-tee'); const col=it.col||'#3f8f83';
  const body=`<path d="M18 100c0-16 14-24 32-24s32 8 32 24z" fill="${col}"/>`;
  switch(id){
    case 'o-hoodie': return body+`<path d="M36 78c4 6 24 6 28 0 3 3 4 7 4 10-12 5-24 5-36 0 0-3 1-7 4-10z" fill="#000" opacity=".16"/>`;
    case 'o-shirt':  return body+`<path d="M44 77l6 9 6-9 4 2-10 14-10-14z" fill="#fff" opacity=".85"/>`;
    case 'o-stripe': return body+[0,1,2,3].map(i=>`<rect x="18" y="${82+i*5}" width="64" height="2.6" fill="#2d4f9e" opacity=".75"/>`).join('');
    case 'o-dress':  return `<path d="M16 100c0-18 16-24 34-24s34 6 34 24z" fill="${col}"/><path d="M40 78h20l2 8H38z" fill="#fff" opacity=".25"/>`;
    case 'o-jacket': return body+`<path d="M44 77v23h-4V78zM56 77v23h4V78z" fill="#000" opacity=".22"/><path d="M40 79l10 7 10-7" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="2"/>`;
    case 'o-hivis':  return body+`<rect x="18" y="88" width="64" height="5" fill="#eee" opacity=".9"/><rect x="18" y="96" width="64" height="4" fill="#eee" opacity=".65"/>`;
    case 'o-jumper': return body+`<path d="M18 100c6-4 14-6 32-6s26 2 32 6z" fill="#000" opacity=".12"/>`;
    default: return body;
  }
}
function glassesPath(id){
  if(!id) return '';
  const st='stroke="#1d2b28" stroke-width="2.4" fill="none"';
  switch(id){
    case 'g-round':  return `<circle cx="40" cy="50" r="8" ${st}/><circle cx="60" cy="50" r="8" ${st}/><path d="M48 50h4" ${st}/>`;
    case 'g-square': return `<rect x="31" y="43" width="17" height="13" rx="2.5" ${st}/><rect x="52" y="43" width="17" height="13" rx="2.5" ${st}/><path d="M48 49h4" ${st}/>`;
    case 'g-shades': return `<path d="M30 43h18v9a9 9 0 0 1-18 0z" fill="#1d2b28"/><path d="M52 43h18v9a9 9 0 0 1-18 0z" fill="#1d2b28"/><path d="M48 46h4" ${st}/>`;
    case 'g-cats':   return `<path d="M30 44c6-4 16-3 18 3 0 6-5 9-10 9s-9-4-8-12z" fill="none" stroke="#1d2b28" stroke-width="2.4"/>
                             <path d="M70 44c-6-4-16-3-18 3 0 6 5 9 10 9s9-4 8-12z" fill="none" stroke="#1d2b28" stroke-width="2.4"/><path d="M48 48h4" ${st}/>`;
    default: return '';
  }
}
function hatPath(id,hairCol){
  if(!id) return '';
  switch(id){
    case 'a-cap':    return `<path d="M25 34a25 25 0 0 1 50 0c-4-12-14-18-25-18s-21 6-25 18z" fill="#2f6ea0"/><path d="M72 33h16c1 4-2 6-6 6H72z" fill="#27577d"/>`;
    case 'a-beanie': return `<path d="M25 36a25 25 0 0 1 50 0c0-14-11-21-25-21S25 22 25 36z" fill="#b8543f"/><rect x="24" y="33" width="52" height="7" rx="3" fill="#9c422f"/>`;
    case 'a-bow':    return `<path d="M64 22c6-5 14-4 14 3s-8 8-14 3z" fill="#dd5f8f"/><path d="M78 22c6-5 14-4 14 3s-8 8-14 3z" fill="#dd5f8f" transform="translate(-28)"/><circle cx="64" cy="25" r="3" fill="#c74d7b"/>`;
    case 'a-band':   return `<path d="M26 36c2-6 10-8 24-8s22 2 24 8c-2-3-10-5-24-5s-22 2-24 5z" fill="#e0b84a"/>`;
    default: return '';
  }
}
function charSVG(av,size){
  const a=av||myChar();
  const base=BASES.find(b=>b.id===a.base)||BASES[0];
  const tone=TONES.find(t=>t.id===a.tone)||TONES[1];
  const hc=(HAIR_COLOURS.find(c=>c.id===a.hairCol)||HAIR_COLOURS[1]).hex;
  const bg=(lookItem(a.backdrop)||{}).col;
  const eye=(cx)=>{
    if(base.eye==='narrow') return `<path d="M${cx-4} 50q4 3 8 0" stroke="#1d2b28" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    if(base.eye==='wide')   return `<circle cx="${cx}" cy="50" r="3.4" fill="#1d2b28"/><circle cx="${cx+1}" cy="49" r="1.1" fill="#fff"/>`;
    return `<circle cx="${cx}" cy="50" r="2.6" fill="#1d2b28"/>`;
  };
  const brow=(cx)=>{
    const d={flat:`M${cx-5} 42h10`,angle:`M${cx-5} 43l10-3`,thick:`M${cx-5} 42h10`,arch:`M${cx-5} 43q5-4 10 0`,thin:`M${cx-4} 42h8`}[base.brow];
    const w={thick:3.4,thin:1.6}[base.brow]||2.4;
    return `<path d="${d}" stroke="${hc}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  };
  const mouth={
    line:`<path d="M45 62h10" stroke="#8d4a44" stroke-width="2.4" stroke-linecap="round"/>`,
    smile:`<path d="M44 60q6 6 12 0" stroke="#8d4a44" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    smirk:`<path d="M44 61q7 4 12-1" stroke="#8d4a44" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    open:`<ellipse cx="50" cy="62" rx="5" ry="3.4" fill="#8d4a44"/>`,
  }[base.mouth];
  const lashes=base.lash?`<path d="M35 46q3-2 6 0M59 46q3-2 6 0" stroke="#1d2b28" stroke-width="1.6" fill="none" stroke-linecap="round"/>`:'';
  return `<svg viewBox="0 0 100 100" class="charsvg" ${size?`width="${size}" height="${size}"`:''}>
    <defs><clipPath id="cc${a.base}${size||''}"><circle cx="50" cy="50" r="50"/></clipPath></defs>
    <g clip-path="url(#cc${a.base}${size||''})">
      <rect width="100" height="100" fill="${bg||'var(--surface2)'}"/>
      ${outfitPath(a.outfit)}
      <rect x="44" y="66" width="12" height="12" fill="${tone.shade}"/>
      <path d="M50 20c${base.jaw*0.6} 0 ${base.jaw} 8 ${base.jaw} 20 0 ${base.chin*0.5} -${base.jaw*0.5} ${base.chin} -${base.jaw} ${base.chin} -${base.jaw*0.5} 0 -${base.jaw} -${base.chin*0.5} -${base.jaw} -${base.chin} 0-12 ${base.jaw*0.4}-20 ${base.jaw}-20z" fill="${tone.hex}"/>
      <ellipse cx="${50-base.jaw-1}" cy="52" rx="3.2" ry="4.6" fill="${tone.hex}"/>
      <ellipse cx="${50+base.jaw+1}" cy="52" rx="3.2" ry="4.6" fill="${tone.hex}"/>
      ${brow(40)}${brow(60)}${eye(40)}${eye(60)}${lashes}${mouth}
      ${hairPath(a.hair,hc)}
      ${glassesPath(a.glasses)}
      ${hatPath(a.hat,hc)}
    </g></svg>`;
}

/* ---------- Quick chat ----------
   Fixed phrases only, Rocket-League style. Nobody can type anything, so there is
   nothing to moderate, nothing to leak, and no way to be nasty in it. Phrases are
   chosen to be hard to use as a dig — no sarcasm-bait, no thumbs-down. */
const PHRASES = [
  {g:'Rallying',  items:[
    {id:'p1',  t:"Let's clear it today."},
    {id:'p2',  t:"I'm in."},
    {id:'p3',  t:"Come on then."},
    {id:'p4',  t:"Who's up for a challenge?"},
  ]},
  {g:'Progress',  items:[
    {id:'p5',  t:"Done for today."},
    {id:'p6',  t:"All cleared."},
    {id:'p7',  t:"Halfway there."},
    {id:'p8',  t:"Just my last one to go."},
  ]},
  {g:'Honest',    items:[
    {id:'p9',  t:"I slipped today."},
    {id:'p10', t:"Rough day, sorry."},
    {id:'p11', t:"Ran out of time."},
    {id:'p12', t:"Wasn't feeling it."},
    {id:'p13', t:"I'll make it up tomorrow."},
  ]},
  {g:'Support',   items:[
    {id:'p14', t:"You've got this."},
    {id:'p15', t:"Don't sweat it — tomorrow."},
    {id:'p16', t:"Proud of you."},
    {id:'p17', t:"Good going."},
    {id:'p18', t:"Same here, honestly."},
  ]},
  {g:'Checking in',items:[
    {id:'p19', t:"You still in?"},
    {id:'p20', t:"How's it going?"},
    {id:'p21', t:"Need a nudge?"},
    {id:'p22', t:"Thanks for the push."},
  ]},
  {g:'Between us', items:[
    {id:'p23', t:"I love you."},
    {id:'p24', t:"I'm sorry."},
    {id:'p25', t:"I'm good, thank you."},
    {id:'p26', t:"Having a rough day."},
    {id:'p27', t:"You're the best."},
    {id:'p28', t:"Don't give up."},
    {id:'p29', t:"Well done."},
    {id:'p30', t:"It's ok, let's try again."},
    {id:'p31', t:"Look at our streak."},
    {id:'p32', t:"You suck."},
  ]},
];
const EMOTES = ['💪','🔥','👏','🙌','❤️','🙏','😅','😴','☕','🎯'];
const PHRASE_MAP = Object.fromEntries(PHRASES.flatMap(g=>g.items.map(i=>[i.id,i.t])));
const MSG_LIMIT_PER_MIN = 8;                      // stops phrase spamming

/* ---------- Crews (group chats) ---------- */
function crewList(){ return S.crews||(S.crews=[]); }
function crewOf(id){ return crewList().find(c=>c.id===id); }
function crewMembers(c){ return (c.memberIds||[]).map(id=>S.friends[id]).filter(Boolean); }
function crewSize(c){ return crewMembers(c).length+1; }              // +1 for you
function crewName(c){
  if(c.name) return c.name;
  const n=crewMembers(c).map(f=>f.name);
  return n.length?(n.length<=2?n.join(' & '):n.slice(0,2).join(', ')+' +'+(n.length-2)):'Empty crew';
}
function makeCrew(memberIds,name){
  const c={id:uid(),name:name||'',memberIds:[...new Set(memberIds)].slice(0,CREW_MAX-1),createdAt:Date.now()};
  crewList().push(c); S.msgs[c.id]=[]; save(); return c;
}
function msgsOf(id){ return (S.msgs[id]||(S.msgs[id]=[])); }
function rateOk(id){
  const now=Date.now();
  return msgsOf(id).filter(m=>m.from==='me'&&now-m.at<60000).length < MSG_LIMIT_PER_MIN;
}
function sendMsg(crewId,kind,code){
  if(!rateOk(crewId)) return false;
  msgsOf(crewId).push({id:uid(),from:'me',kind,code,at:Date.now()});
  S.msgs[crewId]=msgsOf(crewId).slice(-200);
  save(); Sync.sendMessage(crewId,kind,code).catch(()=>{});
  return true;
}
function crewUnread(c){ const seen=c.seenAt||0; return msgsOf(c.id).filter(m=>m.from!=='me'&&m.at>seen).length; }
function markCrewSeen(c){ c.seenAt=Date.now(); save(); }
function isMuted(id){ return (S.muted||[]).includes(id); }
function toggleMute(id){ S.muted=S.muted||[]; S.muted=isMuted(id)?S.muted.filter(x=>x!==id):[...S.muted,id]; save(); }

/* Group challenges pay more per head, capped so a big crew is not a shortcut. */
function crewMultiplier(n){ return Math.min(CREW_BONUS_CAP, 1 + CREW_BONUS_PER_HEAD*Math.max(0,n-2)); }

/* ---------- Friends ---------- */
const CHEER_COINS = 5;
const DEMO_NAMES = ['Sam','Maya','Emily','Harry','Alex','Jordan'];
function nextDemoName(){
  const used=new Set(friendList().map(f=>f.name));
  return DEMO_NAMES.find(n=>!used.has(n)) || 'Friend';
}
/* ---------- Co-op challenges ----------
   Started, not automatic. Up to four people across all live challenges.
   Slots: one legendary (one friend), plus either one rare or two commons
   (two friends max each). A legendary with Emily and a common with Harry
   can run at the same time — both of them cannot sit on the legendary.
   Grouping on rare/common shares the chest — it does not mint another one.
   Nothing here can be failed: windows roll forward, so a bad patch costs
   time, never progress you already had. */
const TIERS_C = {
  /* Common grey · Rare blue · Legendary purple — matches the chest panels. */
  common:    {label:'Common',    colour:'#94a3b8', rolls:[10,20,30]},
  rare:      {label:'Rare',      colour:'#3b82f6', rolls:[50,70,90]},
  legendary: {label:'Legendary', colour:'#a855f7', rolls:[150,180,200]},
};
const CHAL_COOLDOWN_DAYS = 1;
const CHALLENGES = {
  /* Same four shapes at every tier — only the bar moves. */
  common:[
    {id:'c1',name:'Clear streak',     desc:'Everyone clears the day, 3 days running.',           type:'bothClearStreak', need:3},
    {id:'c2',name:'Coin haul',        desc:'Earn 250 coins between you in 4 days.',              type:'coinsEarned',     need:250, window:4},
    {id:'c3',name:'Show up',          desc:'Everyone opens the app 7 days running.',             type:'bothOpenStreak',  need:7},
    {id:'c4',name:'Shop silence',     desc:'Nobody buys a reward for 3 days.',                   type:'noBuys',          need:3},
  ],
  rare:[
    {id:'r1',name:'Clear streak',     desc:'Everyone clears the day, 7 days running.',           type:'bothClearStreak', need:7},
    {id:'r2',name:'Coin haul',        desc:'Earn 500 coins between you in 7 days.',              type:'coinsEarned',     need:500, window:7},
    {id:'r3',name:'Show up',          desc:'Everyone opens the app 14 days running.',            type:'bothOpenStreak',  need:14},
    {id:'r4',name:'Shop silence',     desc:'Nobody buys a reward for 7 days.',                   type:'noBuys',          need:7},
  ],
  legendary:[
    {id:'l1',name:'Clear streak',     desc:'Everyone clears the day, 14 days running.',          type:'bothClearStreak', need:14},
    {id:'l2',name:'Coin haul',        desc:'Earn 1000 coins between you in 14 days.',            type:'coinsEarned',     need:1000,window:14},
    {id:'l3',name:'Show up',          desc:'Everyone opens the app 30 days running.',            type:'bothOpenStreak',  need:30},
    {id:'l4',name:'Shop silence',     desc:'Nobody buys a reward for 14 days.',                  type:'noBuys',          need:14},
  ],
};
const findChallenge = id => Object.entries(CHALLENGES).flatMap(([tier,l])=>l.map(c=>({...c,tier}))).find(c=>c.id===id);
function monthOf(d=today()){ return (d||today()).slice(0,7); }
function nextMonth(d=today()){
  let [y,m]=(d||today()).split('-').map(Number);
  if(m===12){ y++; m=1; } else m++;
  return y+'-'+String(m).padStart(2,'0');
}
function pairOf(f){ return S.pairs[f.id] || (S.pairs[f.id]={done:[],chests:[]}); }
/* Completed quest → locked until the named month (YYYY-MM). Fail uses the 1-day cooldown instead. */
function lockQuestUntil(questId, unlockMonth){
  S.chalLocks=S.chalLocks||{};
  S.chalLocks[questId]=unlockMonth||nextMonth();
  save();
  try{ Sync.pushChalLocks(); }catch(e){}
}
function iQuestLocked(questId){
  const u=(S.chalLocks||{})[questId];
  return !!(u && monthOf()<u);
}
function friendQuestLocked(f, questId){
  if(!f||!questId) return false;
  const u=f.chalLocks?.[questId];
  if(u && monthOf()<u) return true;
  const mk=monthOf();
  return (pairOf(f).chests||[]).some(c=>c.questId===questId && c.at && String(c.at).slice(0,7)===mk);
}
function questLockReasons(questId, memberIds){
  const why=[];
  if(iQuestLocked(questId)) why.push('You already finished this this month');
  for(const id of (memberIds||[])){
    const f=S.friends[id]; if(!f) continue;
    if(friendQuestLocked(f,questId)) why.push(esc(f.name)+' already finished this');
  }
  return why;
}
function questAvailable(questId, memberIds){ return !questLockReasons(questId, memberIds).length; }
function firstOpenQuest(tier, memberIds){
  const list=CHALLENGES[tier]||[];
  return (list.find(q=>questAvailable(q.id, memberIds))||list[0]||{}).id;
}
function chalList(state){ return (state||S).challenges || []; }
function chalBusyPeople(list){
  const s=new Set();
  for(const c of (list||chalList())) (c.memberIds||[]).forEach(id=>s.add(id));
  return s;
}
function chalCounts(list){
  const cs=list||chalList();
  return {
    legendary:cs.filter(c=>c.tier==='legendary').length,
    rare:cs.filter(c=>c.tier==='rare').length,
    common:cs.filter(c=>c.tier==='common').length,
    people:chalBusyPeople(cs).size,
  };
}
function tierSlotOpen(tier, list){
  const n=chalCounts(list);
  if(tier==='legendary') return n.legendary<1;   // the tiers run side by side:
  if(tier==='rare')      return n.rare<1;        // one legendary, one rare and
  if(tier==='common')    return n.common<2;      // two commons can all be live
  return false;
}
function peopleLeft(list){ return Math.max(0, CHAL_PEOPLE_MAX - chalCounts(list).people); }
function partyCap(tier){ return CHAL_PARTY[tier]||1; }
function slotOk(draft, list){
  const members=[...new Set(draft.memberIds||[])].filter(Boolean);
  const cap=partyCap(draft.tier);
  if(members.length<1 || members.length>cap) return false;
  const busy=chalBusyPeople(list);
  if(members.some(id=>busy.has(id))) return false;
  if(busy.size+members.length>CHAL_PEOPLE_MAX) return false;
  if(!tierSlotOpen(draft.tier, list)) return false;
  return true;
}
function canStartChallenge(){
  if(chalOnCooldown()) return false;
  const busy=chalBusyPeople();
  return peopleLeft()>0
    && (tierSlotOpen('legendary')||tierSlotOpen('rare')||tierSlotOpen('common'))
    && friendList().some(f=>!busy.has(f.id));
}
function slotSummary(){
  const n=chalCounts();
  const bits=[];
  bits.push(n.legendary?'Legendary taken':'Legendary open');
  if(n.rare) bits.push('Rare taken');
  else if(n.common) bits.push(n.common===1?'1 common · 1 left':'2 commons taken');
  else bits.push('Rare or 2 commons open');
  bits.push(n.people+' of '+CHAL_PEOPLE_MAX+' people');
  return bits.join(' · ');
}
function liveQuest(c){
  const def=findChallenge(c.questId||c.id);
  if(!def) return null;
  const members=(c.memberIds||[]).map(id=>S.friends[id]).filter(Boolean);
  return {...def,...c,tier:c.tier||def.tier,members};
}
function friendChallenge(fid){ return chalList().find(c=>(c.memberIds||[]).includes(fid)); }
function partyNames(members){
  const names=(members||[]).map(f=>f.name).filter(Boolean);
  if(!names.length) return 'you';
  if(names.length===1) return 'you and '+names[0];
  return 'you, '+names.slice(0,-1).join(', ')+' and '+names[names.length-1];
}
function questNeed(ch){
  const party=1+((ch.members||ch.memberIds||[]).length);
  if(ch.type==='combined') return Math.max(ch.need, Math.round(ch.need*party/2));
  return ch.need;
}
function liveDesc(ch){
  const who=partyNames(ch.members);
  const n=questNeed(ch);
  const many=(ch.members||[]).length>1;
  const together=many?'all':'both';
  const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
  const days=ch.window?`${ch.window} days`:'';
  if(ch.type==='bothClearStreak') return `${cap(who)} ${together} clear the day, ${n} days running. One miss ends it.`;
  if(ch.type==='bothOpenStreak') return `${cap(who)} ${together} open the app ${n} days running. Miss a day and it ends.`;
  if(ch.type==='coinsEarned') return `Earn ${n} coins between ${who} in ${days}. Window ends empty = fail.`;
  if(ch.type==='noBuys') return `Nobody buys a reward for ${n} days. One shop buy ends it.`;
  if(ch.type==='eachClear') return `Each of ${who} clears ${n} days.`;
  if(ch.type==='combined') return `${n} cleared days between ${who}.`;
  return ch.desc;
}
function allClearedOn(members,k){ return !!S.days[k]?.cleared && members.every(f=>clearedOn(f,k)); }
function allOpenedOn(members,k){ return members.every(f=>!!f.days?.[k]) && (!!S.days[k] || S.flags.lastOpen===k); }
function coinsEarnedSince(from,to){
  let n=0; for(let x=from;x<=to;x=addDays(x,1)) n+=(dayStats(x).points||0); return n;
}
function friendCoinsSince(f,from,to){
  /* Friends sync done/expected only — estimate 10 coins per done task. */
  let n=0; for(let x=from;x<=to;x=addDays(x,1)){ const d=f.days?.[x]; if(d?.done) n+=10*(d.done||0); } return n;
}
function buysSince(from,to){
  return (S.locker||[]).filter(l=>{ const b=l.boughtAt; return b&&b>=from&&b<=to; }).length;
}
function challengeProgress(ch){
  const members=ch.members||(ch.memberIds||[]).map(id=>S.friends[id]).filter(Boolean);
  const from=ch.startedAt||today(), k=today();
  const inRange=x=>x>=from&&x<=k;
  const need=questNeed({...ch,members});
  if(ch.type==='bothClearStreak'||ch.type==='bothOpenStreak'){
    const hit=ch.type==='bothClearStreak'?(x=>allClearedOn(members,x)):(x=>allOpenedOn(members,x));
    let n=0,x=hit(k)?k:addDays(k,-1);
    while(inRange(x)&&hit(x)){ n++; x=addDays(x,-1); }
    return {have:Math.min(n,need),need};
  }
  if(ch.type==='coinsEarned'){
    const end=ch.window?addDays(from,ch.window-1):k;
    const to=k<end?k:end;
    const mine=coinsEarnedSince(from,to);
    const theirs=members.reduce((a,f)=>a+friendCoinsSince(f,from,to),0);
    return {have:Math.min(mine+theirs,need),need,mine,theirs:members.map(f=>({id:f.id,name:f.name,n:friendCoinsSince(f,from,to)}))};
  }
  if(ch.type==='noBuys'){
    const buys=buysSince(from,k);
    /* Progress = clean days so far (streak of no buys from start). */
    let n=0; for(let x=from;x<=k;x=addDays(x,1)){ if(buysSince(x,x)>0) break; n++; }
    return {have:Math.min(n,need),need,buys};
  }
  const start=ch.window?(from>addDays(k,-(ch.window-1))?from:addDays(k,-(ch.window-1))):from;
  let mine=0;
  for(let x=start;x<=k;x=addDays(x,1)){ if(S.days[x]?.cleared) mine++; }
  const theirs=members.map(f=>{
    let n=0; for(let x=start;x<=k;x=addDays(x,1)){ if(clearedOn(f,x)) n++; }
    return {id:f.id,name:f.name,n};
  });
  if(ch.type==='eachClear') return {have:Math.min(mine,...theirs.map(t=>t.n),need),need,mine,theirs};
  const combined=mine+theirs.reduce((a,t)=>a+t.n,0);
  return {have:Math.min(combined,need),need,mine,theirs};
}
async function startChallenge(tier,questId,memberIds,crewId){
  if(chalOnCooldown()) return null;
  const ids0=[...(memberIds||[])];
  if(!questAvailable(questId, ids0)) return null;
  const def=findChallenge(questId);
  if(!def||def.tier!==tier) return null;
  const ids=[...new Set(memberIds||[])].filter(id=>S.friends[id]);
  // Prefer the chat's crewId when inviting from a chat (caller passes it).
  const draft={id:uid(),questId,tier,startedAt:null,memberIds:ids,crewId:crewId||null,
    status:'pending', hostId:S.me.id, accepted:[S.me.id]};
  if(!slotOk(draft,S.challenges)) return null;
  S.challenges=chalList().concat(draft); save();
  if(crewId){
    const names=ids.map(id=>S.friends[id]?.name||'friend').join(', ');
    msgsOf(crewId).push({id:uid(),from:'me',kind:'system',code:`${TIERS_C[tier].label} invite: ${def.name} — waiting on ${names}`,at:Date.now()});
    Sync.sendMessage(crewId,'system',`${TIERS_C[tier].label} invite: ${def.name} — accept to start`).catch(()=>{});
  }
  save();
  await Sync.pushChallenge(draft);
  if(S.syncError) toast(S.syncError);
  return draft;
}
function dropChallenge(id){ Sync.removeChallenge(id).catch(()=>{});
  S.challenges=chalList().filter(c=>c.id!==id); save();
}
function setChalCooldown(until){
  S.chalCooldownUntil=until||addDays(today(),CHAL_COOLDOWN_DAYS);
  save();
}
function chalOnCooldown(){ return !!(S.chalCooldownUntil && S.chalCooldownUntil>today()); }
function failChallenge(id,reason){
  const c=chalList().find(x=>x.id===id); if(!c) return;
  dropChallenge(id);
  setChalCooldown();
  if(c.crewId){
    const msg=reason||'Challenge failed';
    msgsOf(c.crewId).push({id:uid(),from:'me',kind:'system',code:msg,at:Date.now()});
    Sync.sendMessage(c.crewId,'system',msg).catch(()=>{});
  }
  S.flags.pendingToast=reason||'Challenge failed · 1 day cooldown';
  save();
}
function challengeBroken(raw){
  if(!chalIsActive(raw)||!raw.startedAt) return null;
  const ch=liveQuest(raw); if(!ch) return null;
  const members=ch.members||[];
  const from=raw.startedAt, k=today();
  /* Past days in the run must stay perfect for streak types. */
  if(ch.type==='bothClearStreak'||ch.type==='bothOpenStreak'){
    const hit=ch.type==='bothClearStreak'?(x=>allClearedOn(members,x)):(x=>allOpenedOn(members,x));
    for(let x=from;x<k;x=addDays(x,1)){
      if(!hit(x)) return ch.type==='bothClearStreak'?'Clear streak broken — challenge over':'Open streak broken — challenge over';
    }
    return null;
  }
  if(ch.type==='noBuys'){
    if(buysSince(from,k)>0) return 'Someone bought a reward — challenge over';
    return null;
  }
  if(ch.type==='coinsEarned'&&ch.window){
    const end=addDays(from,ch.window-1);
    if(k>end){
      const pr=challengeProgress(ch);
      if(pr.have<pr.need) return 'Coin window closed — challenge over';
    }
  }
  return null;
}
function checkChallenges(){
  let changed=false;
  for(const c of [...chalList()]){
    if(!chalIsActive(c)) continue;
    const why=challengeBroken(c);
    if(why){ failChallenge(c.id,why); changed=true; }
  }
  return changed;
}
function pullFriendFromChallenges(fid){
  S.challenges=chalList().map(c=>({...c,memberIds:(c.memberIds||[]).filter(id=>id!==fid)})).filter(c=>c.memberIds.length);
}
function claimChest(cid){
  const raw=chalList().find(c=>c.id===cid); if(!raw||!chalIsActive(raw)) return null;
  const ch=liveQuest(raw); if(!ch) return null;
  const pr=challengeProgress(ch); if(pr.have<pr.need) return null;
  const t=TIERS_C[ch.tier];
  const heads=(ch.memberIds||[]).length+1;
  const amount=Math.round(t.rolls[Math.floor(Math.random()*t.rolls.length)]*crewMultiplier(heads)/5)*5;
  S.points.coins+=amount; S.points.xp+=amount;
  /* Rare: chance of one shop extra. Legendary: two guaranteed. Common: coins only. */
  let extras=0;
  if(ch.tier==='legendary') extras=2;
  else if(ch.tier==='rare' && Math.random()<RARE_EXTRA_CHANCE) extras=1;
  if(extras) grantChestExtras(extras, ch.tier);
  const qid=ch.questId||ch.id;
  for(const f of ch.members){
    const p=pairOf(f);
    p.done=p.done||[]; p.chests=p.chests||[];
    p.done.push(qid);
    p.chests.push({tier:ch.tier,questId:qid,amount,at:today(),name:ch.name,crew:ch.members.map(x=>x.name),extras:extras||undefined});
  }
  lockQuestUntil(qid, nextMonth());
  S.challenges=chalList().filter(c=>c.id!==cid); save();
  const mult=crewMultiplier(heads);
  return {tier:ch.tier,amount,name:ch.name,colour:t.colour,heads,extras,
    rolls:t.rolls.map(r=>Math.round(r*mult/5)*5)};
}
function migratePairChallenges(state){
  const m=state||S;
  m.pairs=m.pairs||{};
  m.challenges=Array.isArray(m.challenges)?m.challenges:[];
  const leftovers=[];
  for(const [fid,p] of Object.entries(m.pairs)){
    if(p?.challenge){
      leftovers.push({fid,ch:p.challenge});
      delete p.challenge;
    }
  }
  const rank={legendary:0,rare:1,common:2};
  leftovers.sort((a,b)=>(rank[a.ch.tier]??3)-(rank[b.ch.tier]??3));
  const known=m.friends||{};
  for(const {fid,ch} of leftovers){
    if(Object.keys(known).length && !known[fid]) continue;
    const draft={id:uid(),questId:ch.id,tier:ch.tier||'common',startedAt:ch.startedAt||today(),memberIds:[fid]};
    if(slotOk(draft,m.challenges)) m.challenges.push(draft);
  }
  m.challenges=m.challenges.map(c=>{
    const cap=partyCap(c.tier);
    const ids=[...new Set(c.memberIds||[])];
    if(ids.length>cap) return {...c, memberIds:ids.slice(0,cap)};
    return ids.length===c.memberIds.length?c:{...c, memberIds:ids};
  }).filter(c=>(c.memberIds||[]).length);
}

function normalizeChallenges(){
  S.challenges=chalList().map(c=>{
    if(c.status) return c;
    // Older rows started immediately — keep them active.
    return {...c, status:'active', accepted:[...(c.memberIds||[])]};
  });
}
function chalStatus(c){ return c?.status||'active'; }
function chalIsActive(c){ return chalStatus(c)==='active'; }
function chalIsPending(c){ return chalStatus(c)==='pending'; }
function chalHost(c){ return c.hostId||c.ownerId||null; }
function iHostChallenge(c){ return !!(S.me&&chalHost(c)&&chalHost(c)===S.me.id); }
function iAcceptedChallenge(c){
  if(!S.me) return false;
  if(iHostChallenge(c)) return true;
  return (c.accepted||[]).includes(S.me.id);
}
function allAccepted(c){
  const need=[...(c.memberIds||[])];
  const acc=new Set(c.accepted||[]);
  if(chalHost(c)) acc.add(chalHost(c));
  return need.every(id=>acc.has(id));
}
function activateChallenge(c){
  c.status='active';
  c.startedAt=today();
  if(!c.accepted) c.accepted=[];
  if(S.me&&!c.accepted.includes(S.me.id)) c.accepted.push(S.me.id);
  (c.memberIds||[]).forEach(id=>{ if(!c.accepted.includes(id)) c.accepted.push(id); });
  const def=findChallenge(c.questId);
  if(c.crewId&&def){
    msgsOf(c.crewId).push({id:uid(),from:'me',kind:'system',code:`${TIERS_C[c.tier].label} challenge started: ${def.name}`,at:Date.now()});
    Sync.sendMessage(c.crewId,'system',`${TIERS_C[c.tier].label} challenge started: ${def.name}`).catch(()=>{});
  }
  save(); Sync.pushChallenge(c).catch(()=>{});
}
function acceptChallenge(id){
  const c=chalList().find(x=>x.id===id); if(!c||!chalIsPending(c)||!S.me) return;
  c.accepted=c.accepted||[];
  if(!c.accepted.includes(S.me.id)) c.accepted.push(S.me.id);
  save();
  if(allAccepted(c)) activateChallenge(c);
  else Sync.pushChallenge(c).catch(()=>{});
  haptic('success'); render(); toast(chalIsActive(c)?'Challenge is on':'Accepted — waiting on the others');
}
function declineChallenge(id){
  const c=chalList().find(x=>x.id===id); if(!c) return;
  dropChallenge(id);
  if(c.crewId){
    msgsOf(c.crewId).push({id:uid(),from:'me',kind:'system',code:'Challenge invite declined',at:Date.now()});
    Sync.sendMessage(c.crewId,'system','Challenge invite declined').catch(()=>{});
  }
  haptic(); render(); toast('Invite declined');
}

function me(){ if(!S.me){ S.me={id:uid()+uid(),name:'',code:('STDY'+Math.random().toString(36).slice(2,6)).toUpperCase()}; save(); } return S.me; }
function myDay(k=today()){ const s=dayStats(k); return {date:k,cleared:!!S.days[k]?.cleared,done:s.done,expected:s.expected,streak:S.streak.login,consistency:avgStrength(),level:level().L,title:title().name}; }
function friendList(){ return Object.values(S.friends); }
function clearedOn(f,k){ return !!f.days?.[k]?.cleared; }
/* Shared streak: a day counts only if you both cleared it. Today is optional so it doesn't read as broken before bedtime. */
function pairStreak(f){
  let n=0, k=(S.days[today()]?.cleared && clearedOn(f,today())) ? today() : addDays(today(),-1);
  while(S.days[k]?.cleared && clearedOn(f,k)){ n++; k=addDays(k,-1); }
  return n;
}

function canCheer(f){ const p=S.pairs[f.id]||{}; return p.cheerDate!==today(); }

function readableSyncError(e){
  const m=String(e?.message||e||'');
  if(/^network$|dynamically imported module|Failed to fetch|NetworkError|ERR_/i.test(m)) return "Can't reach the server. You're offline or the connection is blocked.";
  if(/Invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if(/Token has expired|invalid|otp_expired/i.test(m)) return 'That code has expired — send another.';
  if(/redirect|not allowed/i.test(m)) return "This address isn't in Supabase's allowed redirect list yet.";
  if(/For security purposes|rate/i.test(m)) return 'Too many tries — wait a minute and go again.';
  if(/User already registered|already been registered/i.test(m)) return 'That email already has an account — sign in instead.';
  if(/Password should be|at least 6/i.test(m)) return 'Password needs to be at least 6 characters.';
  if(/Email not confirmed/i.test(m)) return 'Confirm the email first, or switch off email confirmation in Supabase.';
  if(/function .*add_friend|add_friend.*does not exist|PGRST202/i.test(m)) return "The database functions aren't there. Re-run supabase.sql — it has changed.";
  if(/Could not find the '(status|accepted)' column|column .*\b(status|accepted)\b.*coop|coop.*\b(status|accepted)\b/i.test(m)) return "Challenge invites need a DB update — paste coop-accept.sql in the Supabase SQL editor.";
  if(/relation .* does not exist|schema cache|PGRST20[0-9]/i.test(m)) return "The database tables aren't there. Run supabase.sql in the SQL editor.";
  if(/row-level security|violates row-level/i.test(m)) return 'Blocked by row-level security. Check the policies in supabase.sql ran.';
  if(/Invalid API key|JWT|apikey/i.test(m)) return 'That publishable key was rejected. Check it matches the project URL.';
  return m.slice(0,120)||'Sync failed.';
}

/* Direct REST client — no CDN, no dynamic import, nothing to block or fail to load.
   Supabase auth and PostgREST are plain HTTP, so we just call them. */
function apiBase(){ return SYNC.url.replace(/\/+$/,''); }
async function api(path,{method='GET',body,headers={},noAuth=false,retry=true}={}){
  const h={apikey:SYNC.anonKey,'Content-Type':'application/json',...headers};
  if(!noAuth && S.session?.access_token) h.Authorization='Bearer '+S.session.access_token;
  let res;
  try{ res=await fetch(apiBase()+path,{method,headers:h,body:body?JSON.stringify(body):undefined}); }
  catch(e){ throw new Error('network'); }
  if(res.status===401 && retry && S.session?.refresh_token && !noAuth){
    if(await refreshSession()) return api(path,{method,body,headers,noAuth,retry:false});
  }
  const text=await res.text();
  let data=null; try{ data=text?JSON.parse(text):null; }catch(e){ data=text; }
  if(!res.ok){
    const msg=data?.error_description||data?.msg||data?.message||data?.error||data?.hint||`HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
function setSession(s){
  if(!s?.access_token){ return false; }
  S.session={access_token:s.access_token,refresh_token:s.refresh_token,
    expires_at:Date.now()+((s.expires_in||3600)*1000)-60000,user_id:s.user?.id||S.session?.user_id};
  save(); return true;
}
async function refreshSession(){
  if(!S.session?.refresh_token) return false;
  try{ const d=await api('/auth/v1/token?grant_type=refresh_token',
        {method:'POST',body:{refresh_token:S.session.refresh_token},noAuth:true,retry:false});
    return setSession(d);
  }catch(e){ return false; }
}

function vaultWeight(s){
  if(!s) return 0;
  const days=Object.keys(s.days||{}).length;
  const tasks=(s.tasks||[]).filter(x=>!x.archived).length;
  const notes=(s.notes||[]).length;
  const todos=(s.todos||[]).length;
  const coins=s.points?.coins||0;
  return days*3 + tasks*2 + notes + todos + (coins>0?1:0);
}
function stripForVault(){
  const {friends,outbox,inbox,syncError,demo,session,...rest}=S;   // never back up the auth token or cached friend data
  return rest;
}
const Sync = {
  configured(){ return !!(SYNC.url && SYNC.anonKey); },
  live(){ return this.configured() && !S.demo; },
  signedIn(){ return !!(S.me && S.me.id && S.auth==='in'); },

  async session(){
    if(!this.live()) return null;
    if(!S.session?.refresh_token){ S.auth='out'; save(); return null; }
    if(S.session.expires_at && Date.now()<S.session.expires_at){ S.auth='in'; S.syncError=null; save(); return S.session; }
    const ok=await refreshSession();          // expired while the app was closed
    if(ok){ S.auth='in'; S.syncError=null; save(); return S.session; }
    S.syncError="Can't reach the server. You're offline or the connection is blocked.";
    save(); return null;                       // keep S.auth as-is: offline must not sign you out
  },
  async signUp(email,password,name){
    if(!this.live()){ me().name=name; S.auth='in'; save(); return; }
    let d; try{ d=await api('/auth/v1/signup',{method:'POST',body:{email:email.trim(),password},noAuth:true}); }
    catch(e){ throw new Error(readableSyncError(e)); }
    if(!setSession(d)) throw new Error('Account made — now confirm the email, then sign in. (Or switch off email confirmation in Supabase → Authentication.)');
    const id=d.user?.id||S.session.user_id, code=me().code;
    try{ await api('/rest/v1/profiles?on_conflict=id',{method:'POST',body:{id,code,display_name:name},
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'}}); }
    catch(e){ throw new Error(readableSyncError(e)); }
    S.me={id,email:email.trim(),name,code}; S.auth='in'; S.syncError=null; save();
    await this.backup();
  },
  /* Sends a reset link. Supabase needs this exact address in
     Authentication → URL Configuration → Redirect URLs. */
  async resetPassword(email){
    if(!this.live()) throw new Error('No server configured.');
    /* Supabase matches the allow-list exactly, and a missing trailing slash is
       enough to make it fall back to the Site URL. Always send the slashed form. */
    let to=location.origin+location.pathname;
    if(!to.endsWith('/')) to+='/';
    try{ await api('/auth/v1/recover',{method:'POST',body:{email:email.trim(),redirect_to:to},noAuth:true}); }
    catch(e){ throw new Error(readableSyncError(e)); }
  },
  /* Arrives back from the email link with a token in the URL. */
  async claimRecovery(){
    if(!this.live()) return false;
    /* Tokens can come back in the hash or the query, depending on the flow. */
    const h=new URLSearchParams((location.hash||'').replace(/^#/,''));
    const qs=new URLSearchParams(location.search||'');
    const grab=k=>h.get(k)||qs.get(k);
    const err=grab('error_description')||grab('error');
    if(err){ history.replaceState(null,'',location.pathname);
      S.syncError=decodeURIComponent(String(err).replace(/\+/g,' ')); save(); return false; }
    const at=grab('access_token');
    if(at && (grab('type')==='recovery' || !S.session)){
      setSession({access_token:at,refresh_token:grab('refresh_token'),expires_in:Number(grab('expires_in'))||3600});
      history.replaceState(null,'',location.pathname);
      return true;
    }
    /* PKCE style: exchange the one-time code for a session. */
    const code=qs.get('code');
    if(code){
      try{ const d=await api('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:code},noAuth:true});
        if(setSession(d)){ history.replaceState(null,'',location.pathname); return true; }
      }catch(e){}
      history.replaceState(null,'',location.pathname);
    }
    return false;
  },
  async setPassword(pw){
    if(!this.live()) return;
    try{ const d=await api('/auth/v1/user',{method:'PUT',body:{password:pw}});
      const id=d?.id||S.session?.user_id;
      let prof=null; try{ prof=(await api(`/rest/v1/profiles?id=eq.${id}&select=code,display_name`))?.[0]; }catch(e){}
      S.me={id,email:d?.email||S.me?.email||'',name:prof?.display_name||S.me?.name||'Me',code:prof?.code||me().code};
      S.auth='in'; S.syncError=null; save();
      return await this.restore();
    }catch(e){ throw new Error(readableSyncError(e)); }
  },
  async signIn(email,password){
    if(!this.live()){ S.auth='in'; save(); return; }
    let d; try{ d=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email:email.trim(),password},noAuth:true}); }
    catch(e){ throw new Error(readableSyncError(e)); }
    if(!setSession(d)) throw new Error('Signed in but no session came back.');
    const id=d.user?.id||S.session.user_id;
    let prof=null; try{ prof=(await api(`/rest/v1/profiles?id=eq.${id}&select=code,display_name`))?.[0]; }catch(e){}
    S.me={id,email:email.trim(),name:prof?.display_name||'Me',code:prof?.code||me().code};
    S.auth='in'; S.syncError=null; save();
    if(!prof){ try{ await api('/rest/v1/profiles?on_conflict=id',{method:'POST',body:{id,code:S.me.code,display_name:S.me.name},
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'}}); }catch(e){} }
    return await this.restore();
  },
  async signOut(){
    if(this.live()){ try{ await api('/auth/v1/logout',{method:'POST'}); }catch(e){} }
    S.auth='out'; S.session=null; S.friends={}; S.inbox=[]; save();
  },
  async rename(name){
    S.me.name=name; save();
    if(!this.live()||!this.signedIn()) return;
    try{ await api(`/rest/v1/profiles?id=eq.${S.me.id}`,{method:'PATCH',body:{display_name:name},headers:{Prefer:'return=minimal'}});
      S.syncError=null; save(); }
    catch(e){ S.syncError=readableSyncError(e); save(); }
  },

  /* ---- full-state backup so a new phone restores everything ----
     Never overwrite a newer cloud vault with thinner local data (that was the
     cross-device bug: computer sign-in kept empty local state, then backup
     clobbered the phone). */
  async fetchVault(){
    if(!this.live()||!this.signedIn()) return null;
    try{ const rows=await api(`/rest/v1/vault?user_id=eq.${S.me.id}&select=blob,updated_at`);
      const row=rows?.[0]; if(!row?.blob) return null;
      return {blob:row.blob, updatedAt:Date.parse(row.updated_at)||0};
    }catch(e){ S.syncError=readableSyncError(e); save(); return null; }
  },
  async backup(){
    if(!this.live()||!this.signedIn()) return;
    try{
      const remote=await this.fetchVault();
      const localAt=S.vaultAt||0;
      if(remote && remote.updatedAt > localAt+5000 && vaultWeight(remote.blob) > vaultWeight(S)){
        /* Cloud is newer and richer — pull it instead of wiping it. */
        this.applyVault(remote.blob, remote.updatedAt);
        return;
      }
      if(remote && remote.updatedAt > localAt+5000 && vaultWeight(remote.blob) >= vaultWeight(S)){
        /* Same richness but cloud newer: still don't clobber; wait for explicit restore. */
        return;
      }
      await api('/rest/v1/vault?on_conflict=user_id',{method:'POST',
        body:{user_id:S.me.id,blob:stripForVault(),updated_at:new Date().toISOString()},
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
      S.vaultAt=Date.now(); S.syncError=null; save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  async restore(){
    const v=await this.fetchVault();
    return v?.blob||null;
  },
  applyVault(blob, at){
    const me0=S.me, auth0=S.auth, sess0=S.session;      // the vault never holds the token — keep the live one
    S={...fresh(),...blob,me:me0,auth:auth0,session:sess0,friends:{},inbox:[],settings:{...fresh().settings,...(blob.settings||{})},flags:{...fresh().flags,...(blob.flags||{})}};
    S.vaultAt=at||Date.now();
    migratePairChallenges(S);
    save();
  },
  async pullVaultSmart(){
    if(!this.live()||!this.signedIn()) return false;
    const remote=await this.fetchVault();
    if(!remote) return false;
    const localAt=S.vaultAt||0;
    const thin=vaultWeight(S)<3;
    const newer=remote.updatedAt > localAt+5000;
    const richer=vaultWeight(remote.blob) > vaultWeight(S);
    if(thin && remote.blob){ this.applyVault(remote.blob, remote.updatedAt); return true; }
    if(newer && richer){ this.applyVault(remote.blob, remote.updatedAt); return true; }
    return false;
  },

  /* ---- friends ---- */
  async addByCode(code){
    code=code.trim().toUpperCase();
    if(code===me().code) throw new Error('That is your own code.');
    if(!this.live()){
      const f={id:'demo-'+code,name:nextDemoName(),code,days:{},demo:true};
      for(let i=0;i<28;i++){ const k=addDays(today(),-i); f.days[k]={cleared:Math.random()<(i<7?0.75:0.6)}; }
      f.consistency=71; f.streak=12; f.level=6; f.title='Committed';
      S.friends[f.id]=f; save(); return f;
    }
    if(!this.signedIn()) throw new Error('Sign in first.');
    let data; try{ data=await api('/rest/v1/rpc/add_friend',{method:'POST',body:{p_code:code}}); }  // both directions, server-side
    catch(e){ throw new Error(readableSyncError(e)); }
    const row=Array.isArray(data)?data[0]:data;
    if(!row) throw new Error('No one with that code.');
    S.friends[row.id]={id:row.id,name:row.display_name,code:row.code,days:{}}; save();
    await this.pull(); return S.friends[row.id];
  },
  async removeFriend(id){
    pullFriendFromChallenges(id);
    S.friends=Object.fromEntries(Object.entries(S.friends).filter(([k])=>k!==id));
    if(S.pairs) delete S.pairs[id];
    save();
    if(!this.live()||!this.signedIn()) return;
    try{ await api('/rest/v1/rpc/remove_friend',{method:'POST',body:{p_other:id}}); }catch(e){}
  },

  async push(){
    if(!this.live()||!this.signedIn()) return;
    try{ const rows=[myDay(),myDay(addDays(today(),-1))].map(d=>({...d,user_id:S.me.id}));
      await api('/rest/v1/daily_stats?on_conflict=user_id,date',{method:'POST',body:rows,
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
      S.outbox=[]; S.syncError=null; save();
    }catch(e){ S.outbox=[myDay()]; S.syncError=readableSyncError(e); save(); }
  },
  async pull(){
    if(!this.live()) return this._demoDrift();
    if(!this.signedIn()) return;
    try{ await this._pull(); S.syncError=null; save(); }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  async _pull(){
    // 1. discover anyone who added US, so pairing works from either side
    const links=await api('/rest/v1/rpc/my_friends',{method:'POST',body:{}});
    (links||[]).forEach(p=>{ if(!S.friends[p.id]) S.friends[p.id]={id:p.id,name:p.display_name,code:p.code,days:{},avatar:p.avatar||null,chalLocks:p.chal_locks||{}};
      else { S.friends[p.id].name=p.display_name; S.friends[p.id].avatar=p.avatar||S.friends[p.id].avatar||null; if(p.chal_locks) S.friends[p.id].chalLocks=p.chal_locks; } });
    const ids=Object.keys(S.friends).filter(id=>!id.startsWith('demo-'));
    if(ids.length){
      try{
        const rows=await api(`/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,chal_locks`);
        (rows||[]).forEach(r=>{ if(S.friends[r.id]) S.friends[r.id].chalLocks=r.chal_locks||{}; });
      }catch(e){ /* column may not exist yet — local locks still work */ }
    }
    // Prune challenge members we no longer know — but never wipe pending invites
    // (friend cache can be briefly empty mid-sync) or challenges you're on.
    S.challenges=chalList().map(c=>{
      const mine=S.me&&(chalHost(c)===S.me.id||(c.accepted||[]).includes(S.me.id)||(c.memberIds||[]).includes(S.me.id));
      if(chalIsPending(c)) return c; // pending invites keep members even if friends[] is empty
      const ids=(c.memberIds||[]).filter(id=>S.friends[id]);
      if(mine && !ids.length && (c.memberIds||[]).length) return c;
      return {...c, memberIds:ids};
    }).filter(c=>chalIsPending(c)||(c.memberIds||[]).length||(S.me&&chalHost(c)===S.me.id));
    // 2. their daily stats
    if(ids.length){
      const since=addDays(today(),-30);
      const data=await api(`/rest/v1/daily_stats?user_id=in.(${ids.join(',')})&date=gte.${since}&select=*`);
      (data||[]).forEach(r=>{ const f=S.friends[r.user_id]; if(!f) return;
        f.days[r.date]={cleared:r.cleared,done:r.done,expected:r.expected};
        if(r.date===today()||!f.consistency){ f.consistency=r.consistency; f.streak=r.streak; f.level=r.level; f.title=r.title; } });
    }
    // 3. cheers AND nudges addressed to us
    const ch=await api(`/rest/v1/cheers?to_id=eq.${S.me.id}&applied=is.false&select=*`);
    let coins=0; const inbox=[];
    for(const x of (ch||[])){
      const from=S.friends[x.from_id]?.name||'A friend';
      if(x.kind==='cheer'){ coins+=CHEER_COINS; inbox.push({id:x.id,text:`${from} cheered you`,coins:CHEER_COINS,date:x.date}); }
      else inbox.push({id:x.id,text:`${from} nudged you`,coins:0,date:x.date});
    }
    if(ch?.length){
      S.points.coins+=coins;
      S.inbox=[...inbox,...(S.inbox||[])].slice(0,10);
      await api(`/rest/v1/cheers?id=in.(${ch.map(x=>x.id).join(',')})`,{method:'PATCH',body:{applied:true},headers:{Prefer:'return=minimal'}});
      S.flags.pendingToast=inbox.length===1?inbox[0].text+(coins?` · +${coins} coins`:''):`${inbox.length} messages from friends`;
    }
    save();
  },
  _demoDrift(){
    let changed=false;
    friendList().forEach(f=>{
      if(f?.demo && !f.days[today()]){ f.days[today()]={cleared:Math.random()<0.7}; changed=true; }
    });
    if(changed) save();
  },
  async sendMessage(crewId,kind,code){
    if(!this.live()||!this.signedIn()) return;
    try{ await api('/rest/v1/messages',{method:'POST',
      body:{crew_id:crewId,from_id:S.me.id,kind,code},headers:{Prefer:'return=minimal'}});
      S.syncError=null; save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  async upsertCrew(c){
    if(!this.live()||!this.signedIn()) return;
    try{
      await api('/rest/v1/crews?on_conflict=id',{method:'POST',
        body:{id:c.id,owner_id:S.me.id,name:c.name||null},
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
      const rows=[S.me.id,...(c.memberIds||[])].map(uid=>({crew_id:c.id,user_id:uid}));
      await api('/rest/v1/crew_members?on_conflict=crew_id,user_id',{method:'POST',body:rows,
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
      S.syncError=null; save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  /* Re-upload crews that only exist on this device (e.g. created while tables were missing). */
  async pushCrews(){
    if(!this.live()||!this.signedIn()) return;
    for(const c of crewList()) await this.upsertCrew(c);
  },
  /* Chats someone else made you part of. Without this, only the person who
     created the chat ever knew it existed. */
  async pullCrews(){
    if(!this.live()||!this.signedIn()) return;
    try{
      const rows=await api('/rest/v1/rpc/my_crews',{method:'POST',body:{}});
      (rows||[]).forEach(r=>{
        const others=(r.members||[]).filter(id=>id!==S.me.id);
        const have=crewList().find(c=>c.id===r.id);
        if(have){ have.name=r.name||have.name; have.memberIds=others; }
        else { crewList().push({id:r.id,name:r.name||'',memberIds:others,createdAt:Date.now()}); S.msgs[r.id]=S.msgs[r.id]||[]; }
      });
      save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  async pushChalLocks(){
    if(!this.live()||!this.signedIn()||!S.me?.id) return;
    try{ await api(`/rest/v1/profiles?id=eq.${S.me.id}`,{method:'PATCH',
      body:{chal_locks:S.chalLocks||{}},headers:{Prefer:'return=minimal'}}); }catch(e){}
  },
  /* Challenges are shared too — the other side needs the same row. */
  async pushChallenge(ch){
    if(!this.live()||!this.signedIn()) return;
    try{ await api('/rest/v1/coop?on_conflict=id',{method:'POST',
      body:{id:ch.id,owner_id:ch.hostId||S.me.id,crew_id:ch.crewId||null,tier:ch.tier,
            quest_id:ch.questId,started_at:ch.startedAt||null,
            members:[ch.hostId||S.me.id,...(ch.memberIds||[])].filter((v,i,a)=>a.indexOf(v)===i),
            status:ch.status||'active', accepted:ch.accepted||[]},
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
      S.syncError=null; save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  async removeChallenge(id){
    if(!this.live()||!this.signedIn()) return;
    try{ await api(`/rest/v1/coop?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}); }catch(e){}
  },
  async pullChallenges(){
    if(!this.live()||!this.signedIn()) return;
    try{
      const rows=await api('/rest/v1/rpc/my_coop',{method:'POST',body:{}});
      const mine=chalList();
      (rows||[]).forEach(r=>{
        const host=r.owner_id;
        const others=(r.members||[]).filter(id=>id!==S.me.id);
        const mapped={id:r.id,questId:r.quest_id,tier:r.tier,startedAt:r.started_at,
          memberIds:others,crewId:r.crew_id||null, status:r.status||'active',
          hostId:host, accepted:r.accepted||[]};
        const have=mine.find(c=>c.id===r.id);
        if(have){
          have.status=mapped.status; have.accepted=mapped.accepted; have.startedAt=mapped.startedAt;
          have.hostId=mapped.hostId; have.memberIds=mapped.memberIds; have.crewId=mapped.crewId;
        } else mine.push(mapped);
      });
      S.challenges=mine; save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  async pullMessages(){
    if(!this.live()||!this.signedIn()) return;
    const ids=crewList().map(c=>c.id); if(!ids.length) return;
    try{
      const since=new Date(Date.now()-7*864e5).toISOString();
      const rows=await api(`/rest/v1/messages?crew_id=in.(${ids.join(',')})&created_at=gte.${since}&select=*&order=created_at.asc`);
      (rows||[]).forEach(r=>{
        if(r.from_id===S.me.id) return;
        const list=msgsOf(r.crew_id);
        if(list.some(m=>m.sid===r.id)) return;
        list.push({id:uid(),sid:r.id,from:r.from_id,kind:r.kind,code:r.code,at:new Date(r.created_at).getTime()});
      });
      Object.keys(S.msgs).forEach(k=>{ S.msgs[k]=S.msgs[k].sort((a,b)=>a.at-b.at).slice(-200); });
      save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  async cheer(f,kind){
    const p=S.pairs[f.id]||(S.pairs[f.id]={}); p.cheerDate=today(); save();
    if(!this.live()||!this.signedIn()) return;
    try{ await api('/rest/v1/cheers?on_conflict=from_id,to_id,date',{method:'POST',
        body:{from_id:S.me.id,to_id:f.id,kind,date:today(),applied:false},
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
      S.syncError=null; save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
};

/* ---------- Theme ---------- */
function applyTheme(){
  const st=S.settings, p=themePalette(st);
  const acc=p.accent;
  const r=document.documentElement.style;
  const ink=p.fg;
  r.setProperty('--bg',p.bg);
  r.setProperty('--surface',p.surface);
  r.setProperty('--surface2',p.surface2);
  r.setProperty('--line',p.line);
  r.setProperty('--fg',ink);
  r.setProperty('--fg2',p.fg2);
  r.setProperty('--fg3',p.fg3);
  r.setProperty('--accent',acc);
  r.setProperty('--accent-fg', luminance(acc)>0.5?'#0b0f0e':'#ffffff');
  r.setProperty('--accent-on-dark', isDarkMode(st)? acc : lighten(acc));
  r.setProperty('--accent-soft',`color-mix(in srgb, ${acc} ${isDarkMode(st)?22:16}%, transparent)`);
  r.setProperty('--danger','#f87171');
  r.setProperty('--glow', st.glow?`0 6px 24px color-mix(in srgb, ${acc} 35%, transparent)`:'none');
  r.setProperty('--glow-f', st.glow?`drop-shadow(0 0 6px color-mix(in srgb, ${acc} 60%, transparent))`:'none');
  r.setProperty('--font',`var(--font-${st.font})`);
  r.setProperty('--fs',`${16*st.textSize/100}px`);
  r.setProperty('--r','18px'); r.setProperty('--r-sm','12px');
  r.setProperty('--pad','16px'); r.setProperty('--gap','14px');
  document.body.classList.toggle('reduce',prefersCalm());
  document.body.classList.toggle('light', !isDarkMode(st));
  applyMotif(st, acc);
  const meta=document.querySelector('meta[name=theme-color]');
  if(meta) meta.content=p.bg;
}
function hexrgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
function luminance(h){const [r,g,b]=hexrgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b;}
function lighten(h){const [r,g,b]=hexrgb(h);return `rgb(${[r,g,b].map(v=>Math.round(v+(255-v)*.5)).join(',')})`;}

function haptic(kind='light'){ if(!S.settings.haptics||!navigator.vibrate) return; navigator.vibrate(kind==='heavy'?[18,40,18]:kind==='success'?[10,30,10,30,10]:8); }

/* ---------- Task helpers ---------- */
const activeOn = (t,k) => t.createdAt<=k && (!t.archived || (t.archivedAt && t.archivedAt>k));
const activeTasks = (k=today()) => S.tasks.filter(t=>activeOn(t,k)).sort((a,b)=>a.order-b.order);
/* Cadence: daily (default), everyOther (due when daysBetween(anchor,k)%2===0),
   or weekdays (due when date's getDay() is in t.weekdays).
   weekdays values are JS Date.getDay() style: 0=Sun … 6=Sat (native). Empty array = daily fallback.
   UI lists Mon–Sun; weekOf() stays Monday-start independently. */
const WD_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; // index = getDay()
const WD_ORDER = [1,2,3,4,5,6,0]; // Mon-first for chips / tags
function taskCadence(t){
  if(t.cadence==='everyOther') return 'everyOther';
  if(t.cadence==='weekdays') return 'weekdays';
  return 'daily';
}
function taskWeekdays(t){
  const raw=Array.isArray(t.weekdays)?t.weekdays:[];
  return [...new Set(raw.filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort((a,b)=>a-b);
}
function taskExpectedOn(t,k){
  if(!activeOn(t,k)) return false;
  const c=taskCadence(t);
  if(c==='everyOther'){
    const anchor=t.cadenceAnchor||t.createdAt||k;
    return daysBetween(anchor,k)%2===0;
  }
  if(c==='weekdays'){
    const days=taskWeekdays(t);
    if(!days.length) return true; // empty = treat as daily
    return days.includes(parse(k).getDay());
  }
  return true;
}
function cadenceTagHtml(t){
  const c=taskCadence(t);
  if(c==='everyOther') return `<span class="tag">every other</span>`;
  if(c==='weekdays'){
    const days=taskWeekdays(t);
    if(!days.length) return '';
    const label=WD_ORDER.filter(d=>days.includes(d)).map(d=>WD_SHORT[d]).join(' · ');
    return `<span class="tag">${label}</span>`;
  }
  return '';
}
const dueTasks = (k=today()) => activeTasks(k).filter(t=>taskExpectedOn(t,k));
function day(k){ return S.days[k] || (S.days[k]={tasks:{},points:0,bonus:0,note:'',perfect:false}); }
function statusOf(k,tid){ return S.days[k]?.tasks?.[tid]?.status || 'open'; }
function expectedOn(k){ // task ids expected that day
  const d=S.days[k]; if(d && d.finalized) return Object.keys(d.tasks);
  return dueTasks(k).map(t=>t.id);
}
function dayStats(k){
  const ids=expectedOn(k); const done=ids.filter(id=>statusOf(k,id)==='done').length;
  return {expected:ids.length,done,missed:ids.filter(id=>statusOf(k,id)==='missed').length,
    points:(S.days[k]?.points||0)+(S.days[k]?.bonus||0),
    perfect:ids.length>0&&ids.every(id=>statusOf(k,id)==='done')};
}
/* Loop-style habit strength: 0–100, climbs ~5/day, decays 5%/day. Never resets to zero on a miss.
   Off-cadence days are skipped entirely — no decay, not treated as a miss. */
function strengthOf(t,k=today()){ let s=0; for(let x=t.createdAt;x<=k;x=addDays(x,1)){
  if(!taskExpectedOn(t,x)) continue;
  const st=statusOf(x,t.id); if(x===k&&st==='open') break; s=s*0.95+(st==='done'?5:0);
} return clamp(Math.round(s),0,100); }
function avgStrength(k=today()){ const ts=activeTasks(k); if(!ts.length) return 0; return Math.round(ts.reduce((a,t)=>a+strengthOf(t,k),0)/ts.length); }
/* Weak habits pay more (up to ×1.5); strong ones settle toward base.
   Pay uses lagged strength so 1 miss does not raise the badge — needs ~STRENGTH_PAY_LAG days of slip. */
function payStrengthOf(t,k=today()){ return strengthOf(t, addDays(k, -(1+STRENGTH_PAY_LAG))); }
function taskValue(t){ return Math.round(TASK_BASE*(1.5-0.5*payStrengthOf(t)/100)); }
function taskValueAt(t,k){ return Math.round(TASK_BASE*(1.5-0.5*payStrengthOf(t,k)/100)); }
function paidValueAt(t,mins,k){ return Math.max(1, Math.round(taskValueAt(t,k)*timeScale(t,mins))); }
/* Overtime pays coins only — never XP — so long sessions can't buy levels or titles. Consistency does that. */
function overtimeFor(t,mins){ if(!t.target||!mins) return 0; return clamp(Math.floor((mins-t.target)/OT_PER),0,OT_TASK_CAP); }
/* Scale a task's pay by how much of its target was done. No target or no time logged = full pay. */
function timeScale(t,mins){
  if(!t.target||!mins||mins>=t.target) return 1;
  return TIME_FLOOR + (1-TIME_FLOOR)*(mins/t.target);
}
function paidValue(t,mins){ return Math.max(1, Math.round(taskValue(t)*timeScale(t,mins))); }
function overtimeToday(k=today()){ return Object.values(S.days[k]?.tasks||{}).reduce((a,x)=>a+(x.bonus||0),0); }
function level(){ let L=1,xp=S.points.xp; while(xp>=xpToNext(L)){xp-=xpToNext(L);L++;} return {L,into:xp,need:xpToNext(L)}; }
function title(){ const L=level().L; let t=TITLES[0]; for(const x of TITLES) if(L>=x[1]) t=x; const next=TITLES[TITLES.indexOf(t)+1]; return {name:t[0],level:L,next:next?{name:next[0],at:next[1]}:null}; }
function weekOf(k){ return addDays(k,-((parse(k).getDay()+6)%7)); }
/* Rolling windows so any period can be compared with the one before it. */
const RANGE_DAYS={day:1,week:7,month:30,year:365};
function windowStats(r,back=0){
  const n=RANGE_DAYS[r]||7, end=addDays(today(),-n*back), start=addDays(end,-(n-1));
  let e=0,d=0,p=0,pf=0,m=0,mins=0;
  for(let x=start;x<=end;x=addDays(x,1)){ const s=dayStats(x); e+=s.expected;d+=s.done;p+=s.points;m+=s.missed; if(s.perfect)pf++;
    for(const t of Object.values(S.days[x]?.tasks||{})) if(t.minutes) mins+=t.minutes; }
  return {rate:e?Math.round(100*d/e):0,points:p,perfect:pf,missed:m,minutes:mins,days:n,expected:e};
}
function weekdayPattern(weeks=8){
  const out=Array.from({length:7},()=>({e:0,d:0}));
  for(let i=0;i<weeks*7;i++){ const k=addDays(today(),-i); const s=dayStats(k); if(!s.expected) continue;
    const w=(parse(k).getDay()+6)%7; out[w].e+=s.expected; out[w].d+=s.done; }
  return out.map(x=>x.e?Math.round(100*x.d/x.e):null);
}
function timeOfDay(){
  const b=[0,0,0]; for(const d of Object.values(S.days)) for(const t of Object.values(d.tasks||{}))
    if(t.doneAt){ const h=new Date(t.doneAt).getHours(); b[h<12?0:h<17?1:2]++; }
  return b;
}
function reasonBreakdown(days=90){
  const cut=addDays(today(),-days), c={}; let n=0;
  for(const m of allMisses()) if(m.date>=cut && m.reason){ c[m.reason]=(c[m.reason]||0)+1; n++; }
  return {total:n,items:Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([r,v])=>[r,Math.round(100*v/n)])};
}
const historyDays = () => Object.values(S.days).filter(d=>d.finalized).length;
function weakLink(){
  if(historyDays()<14) return null; // needs enough history to be a fair call
  const ts=activeTasks().map(t=>({t,s:strengthOf(t)})).sort((a,b)=>a.s-b.s);
  if(ts.length<2) return null; const {t,s}=ts[0]; if(s>=80 || ts[1].s-s<10) return null;
  const dows={}; for(const [k,d] of Object.entries(S.days)) if(d.tasks?.[t.id]?.status==='missed'){ const n=parse(k).toLocaleDateString(undefined,{weekday:'long'}); dows[n]=(dows[n]||0)+1; }
  const worst=Object.entries(dows).sort((a,b)=>b[1]-a[1])[0];
  return {name:t.name,strength:s,day:worst&&worst[1]>=2?worst[0]:null};
}
function weekCleared(mon){ let c=0,any=false; for(let i=0;i<7;i++){const s=dayStats(addDays(mon,i)); if(s.expected)any=true; if(s.perfect)c++;} return {cleared:c,any}; }
/* One affirmation, picked fresh each time a tab is opened. With only one saved
   you always get that one; with several you get a different one each time. */
let tabAff=null;
function randomAffirmation(){ const a=S.whys||[]; if(!a.length) return null; return a[Math.floor(Math.random()*a.length)]; }
function rollTabAff(){ tabAff=randomAffirmation(); return tabAff; }
function affirmationLine(){
  const a=tabAff||rollTabAff();
  if(!a) return '';
  return `<p class="afline">${esc(a.text)}</p>`;
}
function affirmationToday(){
  const a=S.whys||[];
  if(!a.length) return null;
  const n=parse(today()).getTime()/86400000|0;
  return a[n%a.length];
}

/* ---------- Day boundary / streak ---------- */
function rollover(){
  const t=today(); const last=S.flags.lastOpen;
  if(last===t) return;
  // finalize every day between last open and today
  if(last){ let k=last; while(k<t){ finalize(k); k=addDays(k,1);} }
  // login streak — a streak freeze covers exactly one skipped day
  const notes=[];
  if(last && addDays(last,1)===t) S.streak.login+=1;
  else S.streak.login=1;
  S.streak.best=Math.max(S.streak.best,S.streak.login);
  const d=day(t);
  const lb=loginBonus(S.streak.login);
  if(lb && !d.bonusGiven){ d.bonus=lb; d.bonusGiven=true; S.points.coins+=lb; S.points.xp+=lb; }
  // weekly chest for the week that just finished
  const lastMon=addDays(weekOf(t),-7);
  if(last && !S.chests[lastMon]){ const w=weekCleared(lastMon); if(w.any){ S.chests[lastMon]=w.cleared>=CHEST_DAYS?'won':'missed'; if(w.cleared>=CHEST_DAYS){ const cc=chestCoins(); S.points.coins+=cc; S.points.xp+=cc; notes.push(`Weekly chest: ${w.cleared} days cleared · +${cc}`); } } }
  if(notes.length) S.flags.pendingToast=notes.join(' · ');
  S.flags.lastOpen=t; S.undo=null; sel.clear(); save();
  try{ checkChallenges(); }catch(e){}
}
function finalize(k){
  const d=day(k); if(d.finalized) return;
  for(const t of dueTasks(k)){
    if(!d.tasks[t.id]) d.tasks[t.id]={status:'missed'};
    if(d.tasks[t.id].status==='missed' && !d.tasks[t.id].reason) S.pendingMisses.push({date:k,taskId:t.id});
  }
  d.finalized=true;
}

function clearedStreak(){ let n=0,k=today(); while(S.days[k]?.cleared){ n++; k=addDays(k,-1); } return n; }
function clearWeekBonus(block){ return Math.min(CLEAR_WEEK_CAP, CLEAR_WEEK_BONUS*Math.pow(2,block-1)); }
function nextClearReward(){
  const n=clearedStreak(), block=Math.floor(n/7)+1;
  return {days:7-(n%7), amount:clearWeekBonus(block), streak:n};
}
/* Pays once per completed 7-day block; resets when the run breaks. */
function payClearStreak(){
  const n=clearedStreak(), block=Math.floor(n/7);
  if(block < (S.clearPaidBlock||0)) S.clearPaidBlock=block;   // run broke — climb again
  if(block>=1 && (S.clearPaidBlock||0)<block){
    const amount=clearWeekBonus(block);
    S.clearPaidBlock=block; S.points.coins+=amount; S.points.xp+=amount; save();
    return {amount,block,days:block*7,capped:amount>=CLEAR_WEEK_CAP};
  }
  save(); return null;
}
function clearedStreakAt(end){ let n=0,k=end; while(S.days[k]?.cleared){ n++; k=addDays(k,-1); } return n; }
function payClearStreakAt(end){
  const n=clearedStreakAt(end), block=Math.floor(n/7);
  if(block < (S.clearPaidBlock||0)) S.clearPaidBlock=block;
  if(block>=1 && (S.clearPaidBlock||0)<block){
    const amount=clearWeekBonus(block);
    S.clearPaidBlock=block; S.points.coins+=amount; S.points.xp+=amount;
    const d=day(end);
    d.clearStreakPay=(d.clearStreakPay||0)+amount; d.clearStreakBlock=block;
    save();
    return {amount,block,days:block*7,capped:amount>=CLEAR_WEEK_CAP};
  }
  save(); return null;
}
/* Mark a task done on a past day (yesterday catch-up). Same economy as same-day; no double award. */
function completeOnDate(k,id){
  const d=day(k);
  if(d.tasks[id]?.status==='done') return {coins:0,already:true};
  const tasks=dueTasks(k);
  const t=tasks.find(x=>x.id===id)||S.tasks.find(x=>x.id===id);
  if(!t||!taskExpectedOn(t,k)) return null;
  const v=paidValueAt(t,null,k);
  d.tasks[id]={status:'done',doneAt:Date.now(),value:v,bonus:0,minutes:null,full:true,catchUp:true};
  let coins=v, xp=v;
  const n=tasks.length;
  const allDone=tasks.filter(x=>d.tasks[x.id]?.status==='done').length;
  let cleared=false;
  if(n && allDone===n && !d.cleared){ d.cleared=true; d.clearBonus=CLEAR_PER_TASK*n; coins+=d.clearBonus; xp+=d.clearBonus; cleared=true; }
  d.points=(d.points||0)+coins; S.points.coins+=coins; S.points.xp+=xp; d.perfect=!!d.cleared;
  let streakWin=null;
  if(cleared){ streakWin=payClearStreakAt(k); if(streakWin){ coins+=streakWin.amount; } }
  S.pendingMisses=(S.pendingMisses||[]).filter(p=>!(p.date===k && p.taskId===id));
  save();
  return {coins,cleared,streakWin,name:t.name};
}
function dropPending(date,taskId){
  S.pendingMisses=(S.pendingMisses||[]).filter(p=>!(p.date===date && p.taskId===taskId));
}
function saveMissReason(date,taskId,reason){
  const e=day(date).tasks[taskId];
  if(!e) return;
  e.status='missed'; e.reason=reason;
  if(reason && !DEFAULT_REASONS.includes(reason) && !S.customReasons.includes(reason)) S.customReasons.push(reason);
  dropPending(date,taskId);
}

/* ---------- Completing ---------- */
const sel=new Set();
function completeSelected(mins){
  const k=today(), ids=[...sel]; if(!ids.length) return;
  const d=day(k), tasks=dueTasks(k), n=tasks.length;
  let coins=0, xp=0; const changed=[]; let otRoom=OT_DAY_CAP-overtimeToday(k);
  for(const id of ids){
    if(d.tasks[id]?.status==='done') continue;
    const t=tasks.find(x=>x.id===id);
    const m=mins?.[id]||null;
    const v=paidValue(t,m);                              // short session pays less, still counts as done
    const bonus=clamp(overtimeFor(t,m),0,Math.max(0,otRoom)); otRoom-=bonus;
    d.tasks[id]={status:'done',doneAt:Date.now(),value:v,bonus,minutes:m,full:!t.target||!m||m>=t.target};
    coins+=v+bonus; xp+=v; changed.push(id);
  }
  const allDone=tasks.filter(t=>d.tasks[t.id]?.status==='done').length;
  let cleared=false;
  if(n && allDone===n && !d.cleared){ d.cleared=true; d.clearBonus=CLEAR_PER_TASK*n; coins+=d.clearBonus; xp+=d.clearBonus; cleared=true; }
  d.points+=coins; S.points.coins+=coins; S.points.xp+=xp; d.perfect=!!d.cleared;
  sel.clear(); save();
  haptic(cleared?'success':'light');
  changed.forEach(id=>document.querySelector(`[data-task="${id}"]`)?.classList.add('leaving'));
  const streakWin = cleared ? payClearStreak() : null;
  const streakPay=streakWin?.amount||0;
  if(streakPay){ d.clearStreakPay=(d.clearStreakPay||0)+streakPay; d.clearStreakBlock=streakWin.block; }
  S.undo={date:k,ids:changed,coins:coins+streakPay,xp:xp+streakPay,cleared,streakPay,streakBlock:streakWin?.block||null};
  save();
  setTimeout(()=>{ render(); if(cleared&&typeof friendsTick==='function') friendsTick();
    if(streakWin) setTimeout(()=>streakScene(streakWin),900);
    toast(cleared?`Day cleared · +${coins}`:`${changed.length===1?'Marked done':changed.length+' marked done'} · +${coins}`); if(cleared) celebrate(); }, motionOK()?220:0);
}
function clawClearStreak(d){
  const pay=d.clearStreakPay||0; if(!pay) return 0;
  S.points.coins-=pay; S.points.xp-=pay;
  if(d.clearStreakBlock) S.clearPaidBlock=Math.max(0,d.clearStreakBlock-1);
  d.clearStreakPay=0; d.clearStreakBlock=null;
  return pay;
}
function undoLast(){
  const u=S.undo; if(!u) return; const d=day(u.date);
  u.ids.forEach(id=>{ delete d.tasks[id]; });
  const dayPts=u.coins-(u.streakPay||0);
  let refund=dayPts;
  if(u.cleared){ d.cleared=false; d.clearBonus=0; refund+=clawClearStreak(d); }
  d.points-=dayPts; S.points.coins-=refund; S.points.xp-=refund; d.perfect=false;
  /* Coins may go negative: if you spent the reward then undid the tick, you owe the refund. */
  if(S.points.xp<0) S.points.xp=0;
  if(d.points<0) d.points=0;
  S.undo=null; save(); haptic(); render(); toast(`Undone · −${refund} coins`);
}
/* Unmark one done task today — refunds its coins (and day-clear / streak pay if that breaks the clear). */
function unmarkDone(id){
  const k=today(), d=day(k), e=d.tasks[id];
  if(!e||e.status!=='done') return;
  let dayPts=(e.value||0)+(e.bonus||0), wallet=(e.value||0)+(e.bonus||0), xp=e.value||0;
  delete d.tasks[id];
  if(d.cleared){
    const cb=d.clearBonus||0;
    dayPts+=cb; wallet+=cb; xp+=cb;
    d.cleared=false; d.clearBonus=0; d.perfect=false;
    wallet+=clawClearStreak(d);
  }
  d.points-=dayPts; S.points.coins-=wallet; S.points.xp-=xp;
  /* Coins may go negative after a spend-then-undo — debt until you earn it back. */
  if(S.points.xp<0) S.points.xp=0;
  if(d.points<0) d.points=0;
  if(S.undo&&S.undo.ids?.includes(id)){
    S.undo.ids=S.undo.ids.filter(x=>x!==id);
    if(!S.undo.ids.length) S.undo=null;
  }
  save(); haptic(); render(); toast(`Undone · −${wallet} coins`);
}
function doneSheet(id){
  const t=S.tasks.find(x=>x.id===id); if(!t) return;
  const e=day(today()).tasks[id]; if(!e||e.status!=='done') return;
  const timed=!!t.target;
  const o=overlay(`<div class="sheet"><div class="grab"></div>
    <h2>${esc(t.name)}</h2>
    <p class="muted small" style="margin-bottom:14px">${timed?(e.minutes!=null?`Logged ${e.minutes}m · target ${t.target}m.`:`Timed · target ${t.target}m.`)+' Edit the time, or undo anytime today — coins come back.':'Marked done. Undo refunds the coins anytime today.'}</p>
    <div class="stack">
      ${timed?`<button class="btn primary block" data-edit>Edit time</button>`:''}
      <button class="btn ${timed?'':'primary'} block" data-undo>Undo</button>
      <button class="btn ghost block" data-x>Cancel</button>
    </div></div>`);
  o.querySelector('[data-x]').onclick=()=>close(o);
  const ub=o.querySelector('[data-undo]'); if(ub) ub.onclick=()=>{ close(o); unmarkDone(id); };
  const eb=o.querySelector('[data-edit]'); if(eb) eb.onclick=()=>{ close(o); timeSheet([t], true); };
}
/* Recast a done timed task's minutes today. Coins/XP move by the difference only. */
function recastDone(id,mins){
  const k=today(), d=day(k), e=d.tasks[id];
  if(!e||e.status!=='done') return;
  const t=S.tasks.find(x=>x.id===id); if(!t) return;
  const oldCoins=(e.value||0)+(e.bonus||0), oldXp=e.value||0;
  const others=overtimeToday(k)-(e.bonus||0);
  const v=paidValue(t,mins);
  const bonus=clamp(overtimeFor(t,mins),0,Math.max(0,OT_DAY_CAP-others));
  e.minutes=mins; e.value=v; e.bonus=bonus; e.full=!t.target||!mins||mins>=t.target;
  const dc=(v+bonus)-oldCoins, dx=v-oldXp;
  d.points+=dc; S.points.coins+=dc; S.points.xp+=dx;
  save(); haptic(); render();
  toast(dc>0?`Time updated · +${dc}`:dc<0?`Time updated · ${dc}`:'Time updated');
}

/* ---------- Toast ---------- */
let toastT;
function toast(msg,action,fn){
  const el=document.getElementById('toast'); clearTimeout(toastT);
  el.innerHTML=`<span>${esc(msg)}</span>${action?`<button id="toastact">${esc(action)}</button>`:''}`;
  if(action) el.querySelector('#toastact').onclick=()=>{ el.classList.remove('show'); fn&&fn(); };
  el.classList.add('show'); toastT=setTimeout(()=>el.classList.remove('show'),action?12000:2200);
}
function fxCanvas(){
  let c=document.getElementById('fx');
  if(!c){ c=document.createElement('canvas'); c.id='fx'; document.body.appendChild(c); }
  return c;
}
function celebrate(){
  if(!motionOK()) return;
  const c=fxCanvas(),x=c.getContext('2d'); c.width=innerWidth;c.height=innerHeight;
  const acc=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const P=Array.from({length:90},()=>({x:innerWidth/2,y:innerHeight*.35,vx:(Math.random()-.5)*14,vy:-Math.random()*14-4,r:Math.random()*5+3,c:Math.random()<.6?acc:'#fff',a:Math.random()*6,s:Math.random()*.2-.1}));
  let f=0; (function step(){ x.clearRect(0,0,c.width,c.height); P.forEach(p=>{p.vy+=.45;p.x+=p.vx;p.y+=p.vy;p.a+=p.s;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.globalAlpha=Math.max(0,1-f/70);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.6);x.restore();}); if(++f<80) requestAnimationFrame(step); else x.clearRect(0,0,c.width,c.height); })();
}
/* ---------- Router ---------- */
let remOpen=false, rewOpen=false, newRewardFreq='monthly', newRewardPer=3;
let tab='today', authState={mode:'up'}, taskState={month:{},sel:{}}, planState={sub:'list',when:'today',at:'',noteQ:'',affQ:'',openAff:null,editAff:null,openNote:null,editNote:null}, friendsState={sub:'list',open:null}, progState={month:today().slice(0,7),sel:today(),range:'week',sub:'overview',taskId:null};
let $app;
const ICON={check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  archive:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
  chest:(c)=>{
    const id=('c'+String(c).replace(/[^a-zA-Z0-9]/g,''));
    return `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${id}m" x1="8" y1="10" x2="56" y2="56"><stop stop-color="#e8eef5"/><stop offset=".35" stop-color="#9aa6b5"/><stop offset=".7" stop-color="#5c6674"/><stop offset="1" stop-color="#2a313b"/></linearGradient>
        <linearGradient id="${id}p" x1="16" y1="14" x2="48" y2="52"><stop stop-color="#fff" stop-opacity=".55"/><stop offset=".25" stop-color="${c}"/><stop offset=".75" stop-color="${c}" stop-opacity=".85"/><stop offset="1" stop-color="#1a1030" stop-opacity=".9"/></linearGradient>
        <radialGradient id="${id}g" cx="32" cy="28" r="22"><stop stop-color="${c}" stop-opacity=".9"/><stop offset="1" stop-color="${c}" stop-opacity=".35"/></radialGradient>
        <linearGradient id="${id}hi" x1="12" y1="8" x2="40" y2="40"><stop stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <!-- feet -->
      <path d="M12 54h8l-2 4H14zM44 54h8l-2 4H46z" fill="url(#${id}m)"/>
      <!-- body shell -->
      <path d="M8 28h48v24c0 2.2-1.8 4-4 4H12c-2.2 0-4-1.8-4-4V28z" fill="url(#${id}m)"/>
      <!-- body panel -->
      <path d="M12 32h40v16c0 1.2-1 2.2-2.2 2.2H14.2C13 50.2 12 49.2 12 48V32z" fill="url(#${id}p)"/>
      <path d="M14 34h36v12c0 .8-.6 1.4-1.4 1.4H15.4c-.8 0-1.4-.6-1.4-1.4V34z" fill="url(#${id}g)" opacity=".85"/>
      <!-- lid -->
      <path d="M8 28c0-10 8.5-18 24-18s24 8 24 18H8z" fill="url(#${id}m)"/>
      <path d="M12 26c1.2-8 8-14 20-14s18.8 6 20 14H12z" fill="url(#${id}p)"/>
      <path d="M16 24c1-5.5 6-10 16-10s15 4.5 16 10H16z" fill="url(#${id}g)" opacity=".9"/>
      <!-- metal bands -->
      <path d="M20 10.5v43.5M44 10.5v43.5" stroke="url(#${id}m)" stroke-width="5" stroke-linecap="round"/>
      <path d="M20 10.5v43.5M44 10.5v43.5" stroke="#fff" stroke-opacity=".25" stroke-width="1.2"/>
      <path d="M8 28h48" stroke="#1a2030" stroke-opacity=".55" stroke-width="2.2"/>
      <path d="M10 48h44" stroke="url(#${id}m)" stroke-width="3.5" stroke-linecap="round"/>
      <!-- lock plate -->
      <circle cx="32" cy="38" r="7.2" fill="url(#${id}m)" stroke="#1a2030" stroke-opacity=".4" stroke-width="1"/>
      <circle cx="32" cy="38" r="4.6" fill="#1a2030" opacity=".55"/>
      <circle cx="32" cy="37.2" r="1.6" fill="#c9d2de"/>
      <path d="M32 38.6v3.2" stroke="#c9d2de" stroke-width="1.4" stroke-linecap="round"/>
      <!-- rivets -->
      <circle cx="20" cy="28" r="1.3" fill="#d7dee8"/><circle cx="44" cy="28" r="1.3" fill="#d7dee8"/>
      <circle cx="20" cy="48" r="1.3" fill="#d7dee8"/><circle cx="44" cy="48" r="1.3" fill="#d7dee8"/>
      <!-- gloss -->
      <path d="M14 16c4-6 12-9 18-9 2 0 4 .3 6 .8-6 1.2-12 5-16 10.5L14 16z" fill="url(#${id}hi)"/>
    </svg>`;
  },
  coin:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15 9.5A3 3 0 0 0 9.5 11c0 2.5 5 1.5 5 4a3 3 0 0 1-5.5 1.5" stroke-linecap="round"/></svg>',
  flame:'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.5 2.5c.4 3.2 3 4.6 4.3 7.2 1.5 3 .9 6.8-2 8.9.4-1.7 0-3.6-1.3-4.9-.2 1.7-1.2 2.7-2.6 3.3-1.3.6-2 1.9-1.6 3.2C7.6 19 6 16.6 6 13.8c0-2.8 1.6-4.4 3-6.3.9 1.1 1.3 2.3 1.2 3.7 2.7-1.6 3.9-5.3 3.3-8.7z"/></svg>'};

function setTab(t){ if(t!=='progress') progState.taskId=null; endTour(true); rollTabAff(); tab=t; sel.clear(); render(); window.scrollTo({top:0}); setTimeout(()=>tour(t),350); }
function render(){
  if(!$app || !document.body.contains($app)) $app=document.getElementById('app');
  if(!$app) return;
  const ind=document.getElementById('tabind');
  document.querySelectorAll('.tabbar button').forEach((b,i)=>{ const on=b.dataset.tab===tab; b.classList.toggle('active',on); if(on && ind) ind.style.transform=`translateX(${i*100}%)`; });
  $app.innerHTML=`<div class="page">${({today:vToday,plan:vPlan,progress:vProgress,friends:vFriends,shop:vShop,settings:vSettings})[tab]()}</div>`;
  bind();
}

/* ---------- Today ---------- */
function vToday(){
  const k=today(), tasks=dueTasks(k), d=S.days[k]||{}, st=dayStats(k);
  const open=tasks.filter(t=>statusOf(k,t.id)!=='done'), done=tasks.filter(t=>statusOf(k,t.id)==='done');
  const row=t=>{const s=strengthOf(t);return `<li><button class="task ${sel.has(t.id)?'selected':''}" data-task="${t.id}"><span class="box">${ICON.check}</span><span class="name">${esc(t.name)}${t.target?`<span class="tag">${t.target}m</span>`:''}${cadenceTagHtml(t)}<span class="str"><i style="width:${s}%"></i></span></span><span class="val">+${taskValue(t)}</span></button></li>`;};
  const a=affirmationToday(); const n=tasks.length;
  const circ=2*Math.PI*52, pct=n?st.done/n:0;
  const mon=weekOf(k); const wk=Array.from({length:7},(_,i)=>{const dk=addDays(mon,i);const s=dayStats(dk);return {dk,cleared:s.perfect,fut:dk>k||!s.expected,frozen:S.days[dk]?.frozen}});
  const wc=wk.filter(x=>x.cleared).length;
  const lb=loginBonus(S.streak.login+1);
  return `
  <div class="head"><div><div class="eyebrow">${fmt(k,{weekday:'long',day:'numeric',month:'long'})}</div><h1>Today</h1></div>
    <div class="headpills"><span class="pill ${S.streak.login>=2?'accent':''}" data-tour="streak">${ICON.flame} ${S.streak.login}d</span>
      <button class="pill coins" data-go="shop" data-tour="coins">${ICON.coin} ${S.points.coins.toLocaleString()}</button></div></div>
  <div class="card ring-card" data-tour="ring">
    <div class="ring"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="bar" cx="60" cy="60" r="52" stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-pct)}"/></svg>
      <div class="center"><div><b>+${d.points||0}</b><span>today</span></div></div></div>
    <div class="ring-meta">
      <h3>${n===0?'Nothing set yet':d.cleared?'Day cleared':`${st.done} of ${n}`}</h3>
      <p class="muted small">${n===0?'Add tasks in Settings to start earning.':d.cleared?`Clear bonus +${d.clearBonus} banked.`:`${open.length} left · finish them for +${CLEAR_PER_TASK*n}`}</p>
      ${d.bonus?`<p class="small" style="margin-top:6px;color:var(--accent)">+${d.bonus} streak bonus today</p>`:`<p class="tiny muted" style="margin-top:6px">Tomorrow's streak bonus: +${lb}</p>`}
    </div>
  </div>
  ${(()=>{const nx=nextClearReward(); if(!activeTasks().length) return '';
    return `<div class="card clearstreak"><div class="row between"><div><b class="small">${nx.streak?`${nx.streak} day full-clear streak`:'Full-clear streak'}</b>
      <p class="tiny muted">${nx.streak?`${nx.days} more full ${nx.days===1?'day':'days'} for +${nx.amount} coins`:`Tick everything 7 days running for +${nx.amount} coins`}</p></div>
      <span class="pill ${nx.streak>=7?'accent':''}">${ICON.flame} ${nx.streak}</span></div></div>`;})()}
  <div class="card weekstrip" data-tour="week"><div class="row between"><div><b class="small">Weekly chest</b><p class="tiny muted">${wc>=CHEST_DAYS?`Earned · +${chestCoins()} lands Monday`:`Clear ${CHEST_DAYS} of 7 for +${chestCoins()} · ${wc} so far`}</p></div>
    <div class="dots big">${wk.map(x=>`<i class="${x.cleared?'d':x.frozen?'f':x.fut?'':x.dk===k?'t':'m'}" title="${fmt(x.dk)}"></i>`).join('')}</div></div></div>
  ${a?`<p class="whisper">${esc(a.text)}</p>`:''}
  <div class="section" style="margin-top:14px">
    ${n===0?`<div class="card empty"><b>No tasks yet</b>Pick two or three things you want to keep doing.<br><button class="btn primary sm" style="margin-top:14px" data-go="settings" data-open="tasks">Add tasks</button></div>`:
    open.length===0?`<div class="card empty"><b>All done</b>Everything's ticked. See you tomorrow.</div>`:`
    <ul class="tasks" data-tour="tasks">${open.map(row).join('')}</ul>
    <p class="tiny muted" style="margin:10px 4px 0">Tap to pick, then confirm below.</p>`}
    ${done.length?`<details class="fold" open><summary><span>Done today (${done.length})</span><span class="tiny">undo anytime today</span></summary><ul class="tasks" style="margin-top:8px">${done.map(t=>{ const e=d.tasks[t.id];
      return `<li class="donerow"><button class="task done" data-donetap="${t.id}"><span class="box">${ICON.check}</span><span class="name">${esc(t.name)}</span><span class="val">+${(e?.value||0)+(e?.bonus||0)}${e?.minutes!=null?`<span class="tiny muted" style="display:block;text-align:right;font-weight:400">${e.minutes}m</span>`:''}</span></button>
        <div class="donerow-acts">${t.target?`<button class="btn sm ghost" data-edittime="${t.id}">Edit</button>`:''}<button class="btn sm" data-undone="${t.id}">Undo</button></div></li>`; }).join('')}</ul></details>`:''}
  </div>
  ${iosInstallNudge()}
  ${backupNudge()}
  ${planLine()}`;
}

function planLine(){
  const lt=todosToday().length, ah=todosAhead().length;
  if(!lt&&!ah&&!backlog().length) return '';
  return `<button class="card planline" data-go="plan"><div><b>${lt?`${lt} on your list today`:ah?`Nothing today · ${ah} coming up`:'Your list is clear'}</b>
    <p class="tiny muted">${backlog().length?`${backlog().length} in someday`:'Tap to plan ahead'}</p></div><span class="chev">›</span></button>`;
}

/* iPhone users need the home-screen install before notifications are possible at all. */
function iosInstallNudge(){
  if(!isIOS()||isStandalone()) return '';
  if(S.flags.iosNudge) return '';
  return `<button class="card callout planline" data-iosinstall style="margin-top:14px"><div>
    <b>Add Steady to your home screen</b>
    <p class="tiny muted" style="margin-top:2px">Opens full screen without the browser bar, and it's the only way iPhone will let it send you reminders. Share → Add to Home Screen.</p></div>
    <span class="chev">›</span></button>`;
}

/* Shown on every open until they sign in — then it disappears for good.
   No dismiss button: an accidental tap shouldn't cost someone their backup. */
function backupNudge(){
  if(!Sync.live() || Sync.signedIn()) return '';
  if(!S.tasks.length) return '';
  const d=historyDays();
  return `<button class="card callout planline" data-go="friends" style="margin-top:14px"><div>
    <b>Save your progress</b>
    <p class="small muted" style="margin-top:2px">Your ${d>=3?`${d} days of history, `:''}streak and coins live only on this phone. Change phone, clear your browser or lose it, and it is gone.</p>
    <p class="tiny muted" style="margin-top:6px">A free account backs everything up and restores it on any phone. Tap to set one up.</p></div>
    <span class="chev">›</span></button>`;
}

function vPlan(){
  const sub=planState.sub==='affirmations'||planState.sub==='notes'||planState.sub==='list'?planState.sub:'list';
  planState.sub=sub;
  const q = sub==='notes'?(planState.noteQ||''):sub==='affirmations'?(planState.affQ||''):'';
  const search = (sub==='notes'||sub==='affirmations')?`<div class="card" style="margin-bottom:12px;padding:12px">
    <input type="search" id="${sub==='notes'?'notesearch':'affsearch'}" placeholder="${sub==='notes'?'Search notes by a word…':'Search affirmations by a word…'}" value="${esc(q)}" autocomplete="off">
    <p class="tiny muted" style="margin-top:8px">${(()=>{
      if(!(q||'').trim()) return 'Last opened sits at the top.';
      const n = sub==='notes'?notesFiltered().length:whysFiltered().length;
      return n?`${n} match${n===1?'':'es'}`:'No matches';
    })()}</p></div>`:'';
  return `<div class="head"><div><div class="eyebrow">Outside the points — nothing here can be failed</div><h1>Plan</h1></div></div>
  ${affirmationLine()}
  <div class="seg" style="margin-bottom:14px">${[['list','List'],['notes','Notes'],['affirmations','Affirmations']].map(([v,l])=>`<button class="${sub===v?'on':''}" data-psub="${v}">${l}</button>`).join('')}</div>
  ${search}
  ${sub==='list'?pList():sub==='notes'?pNotes():pAffirmations()}`;
}

function pList(){
  const overdue=S.todos.filter(t=>!t.done&&t.day&&t.day<today()).sort((a,b)=>a.day<b.day?-1:1);
  const tod=todosOn(today()), ahead=todosAhead(), bl=backlog(), dn=todosDone();
  const w=planState.when;
  const group=(title,items,note)=>items.length?`<div class="section"><h2>${title}${note?` <span class="muted">${note}</span>`:''}</h2><div class="card"><ul class="tasks">${items.map(rowTodo).join('')}</ul></div></div>`:'';
  const byDay=(()=>{ const g={}; ahead.forEach(t=>(g[t.day]=g[t.day]||[]).push(t)); return g; })();
  return `
  <div class="card" data-tour="listadd">
    <input type="text" id="newtodo" placeholder="Something to get done…" maxlength="400">
    <div class="row" style="margin-top:8px;align-items:center;gap:8px">
      <input type="time" id="newtodoat" value="${planState.at||''}" style="width:126px">
      <span class="tiny muted">optional — a time nudges you</span>
      ${planState.at?`<button class="btn sm ghost" id="clearat">Clear</button>`:''}</div>
    <div class="chips" style="margin-top:10px">
      ${[['today','Today'],['tomorrow','Tomorrow'],['someday','Someday']].map(([v,l])=>`<button class="chip ${w===v?'on':''}" data-when="${v}">${l}</button>`).join('')}
      <button class="chip ${w&&w.includes('-')?'on':'add'}" data-when="pick">${w&&w.includes('-')?whenLabel(w):'Pick a date'}</button>
      <button class="btn primary sm" id="addtodo" style="margin-left:auto">Add</button></div>
  </div>
  ${group('Overdue',overdue,'moved along with you')}
  ${group('Today',tod)}
  ${Object.entries(byDay).map(([k,items])=>group(whenLabel(k),items,fmt(k,{day:'numeric',month:'short'}))).join('')}
  ${group('Someday',bl,'no date yet')}
  ${dn.length?`<details class="fold"><summary><span>Ticked off today (${dn.length})</span></summary><div class="card" style="margin-top:8px"><ul class="tasks">${dn.map(t=>{ const more=textHasMore(t.text); const h=`<button class="tick on" data-todo="${t.id}">${ICON.check}</button><span class="name">${esc(firstLine(t.text))}</span>`; return more?`<li><details class="planfold"><summary class="todo done">${h}</summary><div class="planfold-body">${esc(t.text)}</div></details></li>`:`<li><div class="todo done">${h}</div></li>`; }).join('')}</ul></div></details>`:''}
  ${!overdue.length&&!tod.length&&!ahead.length&&!bl.length&&!dn.length?`<div class="card empty"><b>Nothing planned</b>Add things whenever you think of them — today, a date, or someday.</div>`:''}`;
}
function rowTodo(t){
  const more=textHasMore(t.text);
  const head=`<button class="tick" data-todo="${t.id}" aria-label="Done">${ICON.check}</button>
    <span class="name">${esc(firstLine(t.text))}${t.at?`<span class="tag">${esc(t.at)}</span>`:''}</span>
    <button class="iconbtn ghosty" data-tmove="${t.id}" aria-label="Reschedule">${ICON.cal}</button>
    <button class="iconbtn ghosty" data-tdrop="${t.id}" aria-label="Remove">${ICON.trash}</button>`;
  if(!more) return `<li><div class="todo">${head}</div></li>`;
  return `<li><details class="planfold"><summary class="todo">${head}</summary>
    <div class="planfold-body">${esc(t.text)}</div></details></li>`;
}

function pNotes(){
  const all=notesSorted(), ns=notesFiltered(), q=planState.noteQ||'';
  return `
  <button class="btn primary block" id="newnote" style="margin-bottom:14px">New note</button>
  ${ns.length?`<div class="card" style="padding:0;overflow:hidden">${ns.map(n=>{
      const open=planState.openNote===n.id;
      const editing=planState.editNote===n.id;
      const title=firstLine(noteTitle(n), 52);
      const body=(n.body||'').trim();
      return `<div class="planfold noterowfold ${open?'open':''}" data-noterow="${n.id}">
        <button type="button" class="noterow" data-notetog="${n.id}">
          <div class="grow"><div class="row between" style="gap:10px;align-items:baseline">
            <b class="planfold-title">${esc(title)}</b>
            <span class="tiny muted" style="flex:none">${fmt(dkey(new Date(n.createdAt)),{day:'numeric',month:'short',year:'2-digit'})}</span>
          </div></div><span class="chev">${open?'‹':'›'}</span>
        </button>
        ${open?`<div class="planfold-body" data-notebody="${n.id}">
          ${editing?`<input type="text" class="ntitle" data-note-title="${n.id}" maxlength="400" value="${esc(n.title||'')}" placeholder="Title" style="width:100%;margin-bottom:8px">
            <textarea data-note-body="${n.id}" maxlength="5000" rows="6" placeholder="Write anything…" style="width:100%;resize:vertical">${esc(n.body||'')}</textarea>
            <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
              <button type="button" class="btn primary sm" data-notesave="${n.id}">Save</button>
              <button type="button" class="btn sm ghost" data-notecancel="${n.id}">Cancel</button>
              <button type="button" class="btn sm ghost" data-note="${n.id}">Full editor</button>
            </div>`
          :`<p style="white-space:pre-wrap;overflow-wrap:anywhere">${body?esc(body):'<span class="muted">No body yet</span>'}</p>
            <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
              <button type="button" class="btn sm primary" data-noteedit="${n.id}">Edit</button>
              <button type="button" class="btn sm ghost" data-note="${n.id}">Full editor</button>
            </div>`}
        </div>`:''}
      </div>`; }).join('')}</div>`:
    all.length?`<div class="card empty"><b>Nothing matched</b>Try another word from the title.</div>`:
    `<div class="card empty"><b>No notes</b>Somewhere to write things down.</div>`}`;
}

function pAffirmations(){
  const all=whysSorted(), list=whysFiltered(), q=planState.affQ||'';
  return `
  <div class="card" style="margin-bottom:14px;padding:12px">
    <textarea id="newwhy" placeholder="Add an affirmation…" maxlength="700" rows="2" style="width:100%;resize:vertical"></textarea>
    <button class="btn primary block" id="addwhy" style="margin-top:8px">Add</button>
    <p class="tiny muted" style="margin-top:8px">First line in the list — tap to expand. Tap again (when not editing) to close. Edit from the open view.</p>
  </div>
  ${list.length?`<div class="card" style="padding:4px 12px">${list.map(w=>{
      const open=planState.openAff===w.id;
      const editing=planState.editAff===w.id;
      const line=esc(firstLine(w.text));
      const del=`<button class="iconbtn" data-delwhy="${w.id}" aria-label="Remove">${ICON.trash}</button>`;
      return `<div class="planfold afffold ${open?'open':''}" data-affrow="${w.id}">
        <div class="editrow" style="border:0;padding:10px 0" data-afftog="${w.id}">
          <span class="name planfold-title">${line}</span>${del}
        </div>
        ${open?`<div class="planfold-body" data-affbody="${w.id}">
          ${editing?`<textarea data-affedit="${w.id}" maxlength="700" rows="4" style="width:100%;resize:vertical">${esc(w.text)}</textarea>
            <div class="row" style="gap:8px;margin-top:10px">
              <button type="button" class="btn primary sm" data-affsave="${w.id}">Save</button>
              <button type="button" class="btn sm ghost" data-affcancel="${w.id}">Cancel</button>
            </div>`
          :`${(()=>{ const rest=restAfterFirstLine(w.text); return rest
              ?`<button type="button" class="afffull" data-touchwhy="${w.id}">${esc(rest)}</button>`
              :`<p class="tiny muted">That’s the whole line.</p>`; })()}
            <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
              <button type="button" class="btn sm primary" data-affeditbtn="${w.id}">Edit</button>
              <button type="button" class="btn sm ghost" data-touchwhy="${w.id}">Bring to top</button>
            </div>`}
        </div>`:''}
      </div>`;
    }).join('')}</div>`:
    all.length?`<div class="card empty"><b>Nothing matched</b>Try another word.</div>`:
    `<div class="card empty"><b>No affirmations yet</b>Add one above — on the days you can’t be bothered, it’s what catches you.</div>`}`;
}



/* ---------- Progress ---------- */
const DELTA=(now,prev)=>{ if(prev===null||prev===undefined) return ''; const d=now-prev; if(!d) return `<span class="delta flat">—</span>`;
  return `<span class="delta ${d>0?'up':'down'}">${d>0?'▲':'▼'}${Math.abs(d)}</span>`; };

function vProgress(){
  const L=level();
  if(progState.taskId){
    const t=S.tasks.find(x=>x.id===progState.taskId);
    if(!t){ progState.taskId=null; }
    else return pTaskDetail(t);
  }
  const sub=progState.sub==='calendar'?'overview':(progState.sub||'overview');
  progState.sub=sub;
  const head=`<div class="head"><div><div class="eyebrow">${S.points.xp} XP · level ${L.L}</div><h1>Progress</h1></div></div>
    ${affirmationLine()}
    <div class="seg" style="margin-bottom:14px">${[['overview','Overview'],['tasks','Tasks']].map(([v,l])=>`<button class="${sub===v?'on':''}" data-sub="${v}">${l}</button>`).join('')}</div>`;
  return head + ({overview:pOverview,tasks:pTasks})[sub]();
}

function pOverview(){
  const hist=historyDays();
  const str=avgStrength(), prev=hist>=30?avgStrength(addDays(today(),-30)):null;
  const R=windowStats(progState.range), P=windowStats(progState.range,1); const cmp=P.expected>0;
  const wd=weekdayPattern(), tod=timeOfDay(), todMax=Math.max(1,...tod);
  const wl=weakLink(), rb=reasonBreakdown(), rec=records();
  const chests=Object.values(S.chests).filter(x=>x==='won').length;
  const label={day:'yesterday',week:'previous 7 days',month:'previous 30 days',year:'previous year'}[progState.range];
  const hrs=R.minutes>=60?`${(R.minutes/60).toFixed(1)}h`:`${R.minutes}m`;
  return `
  <div class="card hero" data-tour="hero">
    <div class="row between" style="align-items:flex-start"><div><div class="eyebrow">Consistency</div><div class="heroval">${str}<small>%</small> ${DELTA(str,prev)}</div>
      <p class="tiny muted">Average habit strength${prev!==null?` · ${str>=prev?'up':'down'} from ${prev}% a month ago`:hist<7?` · building up, ${7-hist} day${7-hist===1?'':'s'} until trends appear`:''}</p></div>
      <div class="ring sm"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="bar" cx="60" cy="60" r="52" stroke-dasharray="${2*Math.PI*52}" stroke-dashoffset="${2*Math.PI*52*(1-str/100)}"/></svg></div></div>
    <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap"><span class="pill">${ICON.flame} ${S.streak.login} day streak</span><span class="pill">${chests} chest${chests===1?'':'s'}</span></div>
  </div>

  <div class="card" data-tour="stats"><div class="seg">${['day','week','month','year'].map(r=>`<button class="${progState.range===r?'on':''}" data-range="${r}">${{day:'Day',week:'Week',month:'Month',year:'Year'}[r]}</button>`).join('')}</div>
    <p class="tiny muted" style="margin:10px 2px 0">${cmp?`Compared with the ${label}`:'No earlier period to compare with yet'}</p>
    <div class="stats"><div class="stat"><b>${R.rate}% ${cmp?DELTA(R.rate,P.rate):''}</b><span>completed</span></div>
      <div class="stat"><b>${R.points} ${cmp?DELTA(R.points,P.points):''}</b><span>coins earned</span></div>
      <div class="stat"><b>${R.perfect} ${cmp?DELTA(R.perfect,P.perfect):''}</b><span>days cleared</span></div>
      <div class="stat"><b>${R.minutes?hrs:R.missed} ${R.minutes||!cmp?'':DELTA(R.missed,P.missed)}</b><span>${R.minutes?'time logged':'missed'}</span></div></div></div>

  ${wl?`<div class="card callout"><b>Weak link: ${esc(wl.name)}</b><p class="small muted">Strength ${wl.strength}%${wl.day?` — most often missed on a ${wl.day}.`:'. Everything else is holding up better.'}</p></div>`:''}

  ${hist<14?'':`<div class="card" data-tour="pattern"><div class="section" style="margin:0"><h2>By weekday <span class="muted">last 8 weeks</span></h2></div>
    <div class="wdays">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=>{const v=wd[i];return `<div class="wd"><div class="wdbar"><i class="${v===null?'none':v<50?'low':''}" style="height:${v===null?0:Math.max(v,3)}%"></i></div><span class="n">${d[0]}</span><span class="tiny muted">${v===null?'–':v+'%'}</span></div>`}).join('')}</div></div>`}

  ${tod[0]+tod[1]+tod[2]>0?`<div class="card"><div class="section" style="margin:0"><h2>When you finish</h2></div>
    ${[['Morning',tod[0]],['Afternoon',tod[1]],['Evening',tod[2]]].map(([l,v])=>`<div class="tod"><span class="small">${l}</span><div class="todbar"><i style="width:${100*v/todMax}%"></i></div><span class="tiny muted">${v}</span></div>`).join('')}</div>`:''}

  ${rb.total?`<div class="card"><div class="section" style="margin:0"><h2>Why you miss <span class="muted">${rb.total} in 90 days</span></h2></div>
    ${rb.items.map(([r,pc])=>`<div class="tod"><span class="small">${esc(r)}</span><div class="todbar"><i class="warn" style="width:${pc}%"></i></div><span class="tiny muted">${pc}%</span></div>`).join('')}</div>`:''}

  ${S.recaps.length?`<div class="card"><div class="section" style="margin:0"><h2>Recaps</h2></div>
    ${S.recaps.slice().reverse().map(r=>`<button class="noterow" data-recap="${r.week||r.n}" style="padding:12px 0"><div class="grow"><b>${esc(r.name)}${r.weekly?' <span class="tiny muted">week</span>':''}</b><p class="tiny muted">${fmt(r.at,{day:'numeric',month:'short',year:'numeric'})} · ${r.rate}% · ${r.cleared} cleared${r.missTotal?` · ${r.missTotal} missed`:''}</p></div><span class="chev">›</span></button>`).join('')}</div>`:
    `<div class="card"><div class="row between"><div><b class="small">Next recap</b><p class="tiny muted">${(()=>{const nx=MILESTONES.find(([n])=>daysSinceStart()<n); return nx?`${nx[0]-daysSinceStart()} day${nx[0]-daysSinceStart()===1?'':'s'} to ${nx[1].toLowerCase()}`:'All milestones reached';})()}</p></div>
      <span class="pill">day ${daysSinceStart()}</span></div></div>`}
  <div class="card"><div class="row between" style="margin-bottom:8px"><b class="small">Note for today</b><span class="tiny muted">${fmt(today(),{weekday:'short',day:'numeric',month:'short'})}</span></div>
    <textarea id="daynote" placeholder="Anything about today…" rows="2">${esc(S.days[today()]?.note||'')}</textarea>
    <p class="tiny muted" style="margin-top:6px">Day notes used to live on the calendar. They’re here now — and also on a day you tap inside a task.</p></div>

  <details class="acc"><summary>Records</summary><div class="body"><ul class="list">
    <li><span>Best login streak</span><b>${rec.bestLogin} d</b></li>
    <li><span>Longest run of cleared days</span><b>${rec.perfectRun} d</b></li>
    <li><span>Best week</span><b>${rec.bestWeek} coins</b></li>
    <li><span>Weekly chests won</span><b>${chests}</b></li>
    <li><span>Weakest weekday</span><b>${rec.worstDay||'—'}</b></li></ul></div></details>`;
}

function pCalendar(){
  const k=today(); const [y,m]=progState.month.split('-').map(Number);
  const first=new Date(y,m-1,1), off=(first.getDay()+6)%7, days=new Date(y,m,0).getDate();
  let cells=''; for(let i=0;i<off;i++) cells+='<div></div>';
  for(let i=1;i<=days;i++){ const dk=`${y}-${pad(m)}-${pad(i)}`; const s=dayStats(dk); const p=s.expected?s.done/s.expected:0;
    const lvl=s.expected===0||dk>k?'':p>=1?'l4':p>=.66?'l3':p>=.33?'l2':p>0?'l1':'';
    cells+=`<button class="cell ${lvl} ${dk===k?'today':''} ${dk===progState.sel?'sel':''} ${dk>k?'future':''} ${S.days[dk]?.note?'hasnote':''}" data-day="${dk}">${i}</button>`; }
  const selS=dayStats(progState.sel);
  const selTasks=expectedOn(progState.sel).map(id=>({t:S.tasks.find(x=>x.id===id),st:S.days[progState.sel]?.tasks?.[id]})).filter(x=>x.t);
  const mstat=(()=>{ let e=0,d=0,c=0; for(let i=1;i<=days;i++){const dk=`${y}-${pad(m)}-${pad(i)}`; if(dk>=k) continue; const s=dayStats(dk); e+=s.expected;d+=s.done; if(s.perfect)c++;} return {rate:e?Math.round(100*d/e):0,cleared:c,any:e>0}; })();
  return `
  <div class="card" data-tour="heat">
    <div class="row between" style="margin-bottom:4px"><button class="iconbtn" data-month="-1">‹</button><b>${first.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</b><button class="iconbtn" data-month="1" ${progState.month>=k.slice(0,7)?'disabled style="opacity:.3"':''}>›</button></div>
    <p class="tiny muted" style="text-align:center;margin-bottom:12px">${mstat.any?`${mstat.rate}% completed · ${mstat.cleared} day${mstat.cleared===1?'':'s'} cleared`:'No history this month'}</p>
    <div class="heat">${['M','T','W','T','F','S','S'].map(x=>`<div class="dow">${x}</div>`).join('')}${cells}</div>
    <div class="legend"><span class="tiny muted">Less</span>${['','l1','l2','l3','l4'].map(c=>`<i class="${c}"></i>`).join('')}<span class="tiny muted">More</span></div>
  </div>
  <div class="card"><div class="row between" style="margin-bottom:10px"><b>${fmt(progState.sel,{weekday:'long',day:'numeric',month:'long'})}</b><span class="small muted">${selS.expected?`${selS.done}/${selS.expected} · ${selS.points} coins`:'no tasks'}</span></div>
    ${progState.sel>today()?'<p class="muted small">Not here yet.</p>':selTasks.length?`<ul class="list">${selTasks.map(x=>`<li><span>${esc(x.t.name)}</span><span class="small ${x.st?.status==='done'?'':'muted'}" style="${x.st?.status==='done'?'color:var(--accent)':''}">${x.st?.status==='done'?`done${x.st.minutes?' · '+x.st.minutes+'m':''}`:x.st?.status==='missed'?`missed${x.st.reason?' · '+esc(x.st.reason):''}`:'open'}</span></li>`).join('')}</ul>`:'<p class="muted small">Nothing scheduled.</p>'}
    ${progState.sel>today()?'':`<textarea id="daynote" placeholder="Note for this day…" rows="2" style="margin-top:12px">${esc(S.days[progState.sel]?.note||'')}</textarea>`}</div>`;
}

function pTasks(){
  const list=S.tasks.filter(t=>!t.archived).map(t=>({t,s:strengthOf(t)})).sort((a,b)=>b.s-a.s);
  if(!list.length) return '<div class="card empty"><b>No tasks yet</b>Add some in Settings and this fills up.</div>';
  return `<p class="tiny muted" style="margin:0 2px 10px">Tap a task for its history and calendar.</p>` + list.map(({t,s})=>{ const ts=taskStats(t);
    return `<button class="card taskcard taskrow" data-opentask="${t.id}"><div class="grow"><div class="row between"><b>${esc(t.name)}${t.target?`<span class="tag">${t.target}m</span>`:''}</b><span class="small ${s<50?'muted':''}" style="${s>=50?'color:var(--accent)':''}">${s}%</span></div>
      <div class="strbar"><i style="width:${s}%"></i></div>
      <div class="row between" style="margin-top:8px"><span class="dots">${ts.recent.map(x=>`<i class="${x==='done'?'d':x==='missed'?'m':''}"></i>`).join('')}</span><span class="chev">›</span></div></div></button>`; }).join('');
}

function taskMonthBars(t){
  const k=today();
  const start=t.createdAt.slice(0,7);
  const months=[];
  let y=Number(start.slice(0,4)), m=Number(start.slice(5,7));
  const endY=Number(k.slice(0,4)), endM=Number(k.slice(5,7));
  while(y<endY || (y===endY && m<=endM)){
    const key=`${y}-${pad(m)}`;
    const days=new Date(y,m,0).getDate();
    let done=0, miss=0, active=0;
    for(let d=1;d<=days;d++){
      const dk=`${y}-${pad(m)}-${pad(d)}`;
      if(dk>k || !activeOn(t,dk)) continue;
      active++;
      const st=statusOf(dk,t.id);
      if(st==='done') done++;
      else if(st==='missed') miss++;
    }
    months.push({key, label:new Date(y,m-1,1).toLocaleDateString(undefined,{month:'short',year:'2-digit'}), done, miss, active});
    m++; if(m>12){ m=1; y++; }
  }
  const show=months.slice(-12);
  const max=Math.max(1, ...show.map(x=>x.done));
  return `<div class="card" data-tour="thistchart"><div class="section" style="margin:0 0 8px"><h2>History <span class="muted">days done / month</span></h2></div>
    <div class="monthchart">${show.map(x=>`<div class="col ${x.key===k.slice(0,7)?'today':''}"><span class="n">${x.done||''}</span><div class="bar ${x.done?'':'zero'}" style="height:${Math.max(4, Math.round(100*x.done/max))}%"></div><span class="tiny muted">${esc(x.label)}</span></div>`).join('')}</div>
    ${show.length<2?`<p class="tiny muted" style="margin-top:8px">More months appear as you keep going.</p>`:''}</div>`;
}

function pTaskDetail(t){
  const s=strengthOf(t), ts=taskStats(t);
  return `
  <div class="head"><div><button class="btn sm ghost" data-taskback style="margin-bottom:8px">‹ Tasks</button>
    <div class="eyebrow">${s}% strength${t.target?` · ${t.target}m target`:''}</div><h1>${esc(t.name)}</h1></div></div>
  ${affirmationLine()}
  <div class="card"><div class="stats"><div class="stat"><b>${ts.streak}</b><span>current streak</span></div><div class="stat"><b>${ts.best}</b><span>best streak</span></div>
    <div class="stat"><b>${ts.done}</b><span>done all time</span></div><div class="stat"><b>${ts.misses}</b><span>missed all time</span></div>
    ${t.target?`<div class="stat"><b>${ts.hours}</b><span>total time</span></div><div class="stat"><b>${ts.avgMin}m</b><span>avg (target ${t.target}m)</span></div>`:''}</div>
    <div class="strbar" style="margin-top:12px"><i style="width:${s}%"></i></div></div>
  ${taskMonthBars(t)}
  <div class="card"><div class="section" style="margin:0 0 4px"><h2>Calendar</h2></div>
    ${taskHistory(t)}
  </div>
  ${ts.reasons.length?`<div class="card"><div class="section" style="margin:0 0 6px"><h2>Why it was missed</h2></div>
    ${ts.reasons.slice(0,6).map(([r,n])=>`<div class="tod"><span class="small">${esc(r)}</span><div class="todbar"><i class="warn" style="width:${100*n/ts.misses}%"></i></div><span class="tiny muted">${n}</span></div>`).join('')}</div>`:''}`;
}

/* Full history for one task — every month back to the day it was created. */
function taskHistory(t){
  const k=today();
  const start=t.createdAt.slice(0,7), endM=k.slice(0,7);
  const m=taskState.month[t.id]||endM;
  const [y,mo]=m.split('-').map(Number);
  const first=new Date(y,mo-1,1), off=(first.getDay()+6)%7, days=new Date(y,mo,0).getDate();
  let cells=''; for(let i=0;i<off;i++) cells+='<div></div>';
  let done=0,miss=0;
  for(let i=1;i<=days;i++){
    const dk=`${y}-${pad(mo)}-${pad(i)}`;
    let cls='off';
    if(activeOn(t,dk) && dk<=k){ const st=statusOf(dk,t.id); cls=st==='done'?'done':st==='missed'?'miss':'none'; if(st==='done')done++; if(st==='missed')miss++; }
    cells+=`<button class="cell ${cls} ${dk===k?'today':''} ${taskState.sel[t.id]===dk?'sel':''}" data-tday="${t.id}|${dk}">${i}</button>`;
  }
  const sel=taskState.sel[t.id];
  const e=sel?S.days[sel]?.tasks?.[t.id]:null;
  return `<div class="thist" style="margin-top:14px">
    <div class="row between" style="margin-bottom:4px">
      <button class="iconbtn" data-tmonth="${t.id}|-1" ${m<=start?'disabled style="opacity:.25"':''}>‹</button>
      <b class="small">${first.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</b>
      <button class="iconbtn" data-tmonth="${t.id}|1" ${m>=endM?'disabled style="opacity:.25"':''}>›</button></div>
    <p class="tiny muted" style="text-align:center;margin-bottom:10px">${done} done · ${miss} missed this month</p>
    <div class="heat theat">${['M','T','W','T','F','S','S'].map(x=>`<div class="dow">${x}</div>`).join('')}${cells}</div>
    <div class="legend"><span class="tiny muted">Done</span><i class="done"></i><i class="miss"></i><span class="tiny muted">Missed</span></div>
    ${sel?`<div class="card" style="margin-top:10px;padding:12px"><div class="row between"><b class="small">${fmt(sel,{weekday:'long',day:'numeric',month:'long'})}</b>
      <span class="small" style="color:${e?.status==='done'?'var(--accent)':e?.status==='missed'?'var(--danger)':'var(--fg2)'}">${e?.status==='done'?'Done':e?.status==='missed'?'Missed':activeOn(t,sel)&&sel<=k?'Not recorded':'Not active yet'}</span></div>
      ${e?.minutes?`<p class="tiny muted" style="margin-top:4px">${e.minutes} minutes${t.target?` (target ${t.target})`:''}${e.bonus?` · +${e.bonus} bonus`:''}</p>`:''}
      ${e?.reason?`<p class="tiny muted" style="margin-top:4px">Reason: ${esc(e.reason)}</p>`:''}
      ${e?.comment?`<p class="tiny muted" style="margin-top:2px">“${esc(e.comment)}”</p>`:''}
      ${sel<=k?`<textarea id="daynote" data-noteday="${sel}" placeholder="Note for this day…" rows="2" style="margin-top:10px">${esc(S.days[sel]?.note||'')}</textarea>`:''}</div>`:
      `<p class="tiny muted" style="text-align:center;margin-top:8px">Tap a day to see what happened.</p>`}
  </div>`;
}

function allMisses(){ const out=[]; for(const [k,d] of Object.entries(S.days)) for(const [id,x] of Object.entries(d.tasks||{})) if(x.status==='missed'){const t=S.tasks.find(t=>t.id===id); out.push({date:k,name:t?.name||'(deleted)',reason:x.reason,comment:x.comment});} return out.sort((a,b)=>a.date<b.date?-1:1); }
function records(){
  const k=today(); const keys=Object.keys(S.days).sort(); let run=0,best=0; 
  if(keys.length){ for(let x=keys[0];x<=k;x=addDays(x,1)){ if(dayStats(x).perfect){run++;best=Math.max(best,run);} else run=0; } }
  const weeks={}; for(const x of keys){const d=parse(x);const w=addDays(x,-((d.getDay()+6)%7)); weeks[w]=(weeks[w]||0)+dayStats(x).points;}
  const reasons={},dows={}; for(const m of allMisses()){ if(m.reason) reasons[m.reason]=(reasons[m.reason]||0)+1; const dn=parse(m.date).toLocaleDateString(undefined,{weekday:'long'}); dows[dn]=(dows[dn]||0)+1; }
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0];
  return {bestLogin:S.streak.best,perfectRun:best,bestWeek:Math.max(0,...Object.values(weeks)),topReason:top(reasons),worstDay:top(dows)};
}
function taskStats(t){
  const k=today(); let streak=0,best=0,run=0,done=0,misses=0; const reasons={},comments=[];
  for(let x=t.createdAt;x<=k;x=addDays(x,1)){
    if(!taskExpectedOn(t,x)) continue;
    const s=statusOf(x,t.id); if(s==='done'){run++;best=Math.max(best,run);done++;} else if(s==='missed'){run=0;misses++;const r=S.days[x].tasks[t.id];if(r.reason)reasons[r.reason]=(reasons[r.reason]||0)+1;if(r.comment)comments.push({date:x,comment:r.comment});}
  }
  // current streak: consecutive due-days done ending today or yesterday
  let x=statusOf(k,t.id)==='done'?k:addDays(k,-1);
  while(x>=t.createdAt){
    if(!taskExpectedOn(t,x)){ x=addDays(x,-1); continue; }
    if(statusOf(x,t.id)==='done'){ streak++; x=addDays(x,-1); } else break;
  }
  const recent=Array.from({length:14},(_,i)=>{ const dk=addDays(k,i-13); return taskExpectedOn(t,dk)?statusOf(dk,t.id):'off'; });
  const mins=[]; for(const d of Object.values(S.days)){ const e=d.tasks?.[t.id]; if(e?.minutes) mins.push(e.minutes); }
  const total=mins.reduce((a,b)=>a+b,0);
  return {streak,best,done,misses,reasons:Object.entries(reasons).sort((a,b)=>b[1]-a[1]),comments:comments.slice(-5).reverse(),recent,
    hours:total>=60?`${(total/60).toFixed(1)}h`:`${total}m`, avgMin:mins.length?Math.round(total/mins.length):0};
}

/* ---------- Friends ---------- */
const chestSVG = tier => ICON.chest(TIERS_C[tier].colour);
function challengeCard(raw){
  const ch=liveQuest(raw); if(!ch) return '';
  const t=TIERS_C[ch.tier];
  if(chalIsPending(raw)){
    const waiting=ch.members.filter(f=>!(raw.accepted||[]).includes(f.id));
    const needMe=!iAcceptedChallenge(raw);
    return `<div class="card chal ${ch.tier}" style="--tier:${t.colour}">
      <div class="row between" style="align-items:flex-start">
        <div><span class="tierbadge">Invite</span><b style="display:block;margin-top:6px;font-size:1.1rem">${esc(ch.name)}</b>
          <p class="small muted" style="margin-top:2px">${esc(t.label)} · ${esc(liveDesc(ch))}</p>
          <p class="tiny muted" style="margin-top:6px">${needMe?'Needs your accept':waiting.length?('Waiting on '+waiting.map(f=>f.name).join(', ')):'Starting…'}</p></div>
        <div class="chestmini">${chestSVG(ch.tier)}</div></div>
      ${needMe?`<div class="row" style="gap:8px;margin-top:12px"><button class="btn primary" style="flex:1" data-acceptchal="${raw.id}">Accept</button>
        <button class="btn ghost" style="flex:1" data-declinechal="${raw.id}">Decline</button></div>`:
        `<div class="row between" style="margin-top:12px"><p class="tiny muted">Invite sent — clock starts when everyone accepts.</p>
          <button class="btn sm ghost" data-dropchal="${raw.id}">Cancel</button></div>`}
    </div>`;
  }
  const pr=challengeProgress(ch), done=pr.have>=pr.need, pc=Math.round(100*pr.have/pr.need);
  const mineCleared=!!S.days[today()]?.cleared;
  const pills=[`<span class="pill ${mineCleared?'accent':''}">You ${mineCleared?'✓':'—'}</span>`]
    .concat(ch.members.map(f=>`<span class="pill ${clearedOn(f,today())?'accent':''}">${esc(f.name)} ${clearedOn(f,today())?'✓':'—'}</span>`)).join('');
  const counts=pr.theirs?`<div class="crewcounts">${[`<span>You ${pr.mine}</span>`,...pr.theirs.map(x=>`<span>${esc(x.name)} ${x.n}</span>`)].join('')}</div>`:'';
  return `<div class="card chal ${ch.tier} ${done?'ready':''}" style="--tier:${t.colour}">
    <div class="row between" style="align-items:flex-start">
      <div><span class="tierbadge">${t.label}</span><b style="display:block;margin-top:6px;font-size:1.1rem">${esc(ch.name)}</b>
        <p class="small muted" style="margin-top:2px">${esc(liveDesc(ch))}</p></div>
      <div class="chestmini ${done?'shake':''}">${chestSVG(ch.tier)}</div></div>
    <div class="faces" style="margin-top:12px">${ch.members.map(f=>`<span class="avatar" title="${esc(f.name)}">${esc((f.name||'?')[0]).toUpperCase()}</span>`).join('')}</div>
    <div class="row between" style="margin-top:12px"><span class="tiny muted">${pr.have} of ${pr.need}</span>
      <span class="tiny muted">${t.rolls[0]}–${t.rolls[t.rolls.length-1]} coins${ch.tier==='legendary'?' · 2 shop extras':ch.tier==='rare'?' · chance of shop extra':''}</span></div>
    <div class="bar quest chal-bar"><i style="width:${clamp(pc,0,100)}%"></i></div>
    ${counts}
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">${pills}</div>
    ${done?`<button class="btn primary block" style="margin-top:12px" data-chest="${ch.id}">Open the chest</button>`:
      `<div class="row between" style="margin-top:10px"><p class="tiny muted">${ch.members.length>1?'One chest for the pair, not one each.':'One chest when you finish.'}</p>
        <button class="btn sm ghost" data-dropchal="${ch.id}">Drop</button></div>`}
  </div>`;
}
function startChallengeModal(crewId,after){
  if(chalOnCooldown()){ toast('Cooldown until '+fmt(S.chalCooldownUntil,{day:'numeric',month:'short'})+' — after a fail, try again tomorrow'); return; }
  const crew=crewId?crewOf(crewId):null;
  const busy=chalBusyPeople();
  const free=(crew?crewMembers(crew):friendList()).filter(f=>!busy.has(f.id));
  if(!free.length){ toast('Everyone is already on a challenge'); return; }
  const left=peopleLeft();
  if(left<1){ toast('Too many people on challenges'); return; }
  const openTiers=['legendary','rare','common'].filter(t=>tierSlotOpen(t));
  if(!openTiers.length){ toast('No challenge slots free'); return; }
  const picks=new Set();
  if(crew) free.slice(0,CHAL_PARTY_MAX).forEach(f=>picks.add(f.id));
  else if(free.length===1) picks.add(free[0].id);
  let tier=openTiers.includes('legendary')?'legendary':openTiers[0];
  let qid=firstOpenQuest(tier, [...picks]);
  const o=overlay(`<div class="modal tall"><div id="chalform"></div></div>`,'center');
  const draw=()=>{
    const cap=Math.min(partyCap(tier), left);
    const atCap=picks.size>=cap;
    if(picks.size>cap) [...picks].slice(cap).forEach(id=>picks.delete(id));
    const members=[...picks];
    if(!questAvailable(qid, members)) qid=firstOpenQuest(tier, members);
    const box=o.querySelector('#chalform');
    const n=chalCounts();
    const why=`Slots: legendary ${n.legendary}/1 · rare ${n.rare}/1 · common ${n.common}/2. Finish a quest and it locks until next month for everyone. Fail → try again tomorrow.`;
    const whoHint=`Up to ${CHAL_PARTY_MAX} people on any tier. The more of you, the bigger the pot — and the harder it gets.`;
    const anyOpen=(CHALLENGES[tier]||[]).some(q=>questAvailable(q.id, members));
    box.innerHTML=`<h2>Start a challenge</h2>
      <p class="tiny muted" style="margin-top:6px">${whoHint} ${cap} ${cap===1?'seat':'seats'} left on this one.</p>
      <p class="small" style="margin-top:14px"><b>Who's in</b></p>
      <div class="chips" style="margin-top:8px">${free.map(f=>`<button type="button" class="chip ${picks.has(f.id)?'on':''}" data-fid="${f.id}" ${!picks.has(f.id)&&atCap?'disabled':''}>${esc(f.name)}</button>`).join('')}</div>
      <p class="tiny muted" style="margin-top:8px">${picks.size} of ${cap} selected${picks.size>=2?` · pot ×${crewMultiplier(picks.size+1).toFixed(2).replace(/0$/,'')} for ${picks.size+1} people`:''}</p>
      <p class="small" style="margin-top:16px"><b>Tier</b></p>
      <div class="chips" style="margin-top:8px">${['legendary','rare','common'].map(t=>{
        const open=tierSlotOpen(t); const label=TIERS_C[t].label;
        return `<button type="button" class="chip ${tier===t?'on':''}" data-tier="${t}" ${open?'':'disabled'}>${label}${open?'':' · taken'}</button>`;
      }).join('')}</div>
      <p class="tiny muted" style="margin-top:8px">${why}</p>
      <div style="margin-top:8px">${CHALLENGES[tier].map(q=>{
        const locks=questLockReasons(q.id, members);
        const locked=!!locks.length;
        const on=qid===q.id&&!locked;
        return `<button type="button" class="questpick ${on?'on':''} ${locked?'locked':''}" data-qid="${q.id}" ${locked?'disabled':''}><b>${esc(q.name)}</b><p class="tiny muted">${esc(q.desc)}</p>
          <p class="tiny muted" style="margin-top:4px">${locked?locks[0]:`${TIERS_C[tier].rolls[0]}–${TIERS_C[tier].rolls[TIERS_C[tier].rolls.length-1]} coins`}</p></button>`;
      }).join('')}</div>
      ${!anyOpen?`<p class="tiny muted" style="margin-top:8px">Nothing left open for this group this month — try another tier or wait.</p>`:''}
      <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok ${picks.size&&anyOpen&&questAvailable(qid,members)?'':'disabled'}>Start</button></div>`;
    box.querySelectorAll('[data-fid]').forEach(b=>b.onclick=()=>{ if(picks.has(b.dataset.fid)) picks.delete(b.dataset.fid); else { if(picks.size>=cap) return; picks.add(b.dataset.fid);} haptic(); draw(); });
    box.querySelectorAll('[data-tier]').forEach(b=>b.onclick=()=>{ if(b.disabled) return; tier=b.dataset.tier; qid=firstOpenQuest(tier, [...picks]); haptic(); draw(); });
    box.querySelectorAll('[data-qid]').forEach(b=>b.onclick=()=>{ if(b.disabled) return; qid=b.dataset.qid; haptic(); draw(); });
    box.querySelector('[data-x]').onclick=()=>close(o);
    const ok=box.querySelector('[data-ok]');
    ok.onclick=async()=>{ if(!picks.size||!questAvailable(qid,[...picks])) return; ok.disabled=true;
      const started=await startChallenge(tier,qid,[...picks],crewId); close(o);
      if(started){ haptic('success'); if(after) after(); else render();
        toast(S.syncError?S.syncError:(chalIsPending(started)?'Invite sent — waiting for accept':'Challenge started')); }
      else toast('Could not start that'); };
  };
  draw();
  o.onclick=e=>{ if(e.target===o) close(o); };
}
function vFriends(){
  const m=me(), fs=friendList();
  const live=Sync.live(), inn=Sync.signedIn();
  const banner=S.syncError?`<div class="card syncerr"><div class="row between"><div><b>Not syncing right now</b><p class="small muted">${esc(S.syncError)}</p></div><div class="stack" style="gap:6px"><button class="btn sm" id="retrysync">Retry</button><button class="btn sm ghost" id="conncheck2">Diagnose</button></div></div>
    <p class="tiny muted" style="margin-top:8px">Everything else works as normal — your tasks and history are on this device.</p></div>`:'';
  const meChip=inn?`<button class="mechip" id="avpick" aria-label="Change your picture"><span class="mechip-name">${esc(m.name||'You')}</span>${avatarHtml(m)}<span class="avedit">${ICON.edit}</span></button><input type="file" id="avfile" accept="image/*" hidden>`:'';
  const head=`<div class="head"><div><div class="eyebrow">${!live?'Local only':!inn?'Signed out':S.syncError?'Offline':'Synced'}</div><h1>Friends</h1></div>${meChip}</div>${affirmationLine()}${banner}`;

  if(live && !inn) return head + `
  <div class="card" data-tour="code"><div class="seg" style="margin-bottom:14px">${[['in','Sign in'],['up','Create account']].map(([v,l])=>`<button class="${authState.mode===v?'on':''}" data-authmode="${v}">${l}</button>`).join('')}</div>
      <div class="stack">
        ${authState.mode==='up'?`<input type="text" id="auname" placeholder="Your name" maxlength="24" value="${esc(m.name||'')}">`:''}
        <input type="email" id="auemail" placeholder="Email" autocomplete="email">
        <input type="password" id="aupass" placeholder="Password" autocomplete="${authState.mode==='up'?'new-password':'current-password'}">
        <button class="btn primary block" id="authgo">${authState.mode==='up'?'Create account':'Sign in'}</button>
        ${authState.mode==='in'?`<button class="btn ghost block" id="forgotpw">Forgotten your password?</button>`:''}
      </div>
      <p class="tiny muted" style="margin-top:12px">${authState.mode==='up'?'An account backs up everything — tasks, history, coins — so a new phone restores it all. Only aggregates are ever shared with friends.':'Signing in on a new phone restores your tasks, history and coins.'}</p>
    </div>
    <div class="card empty"><b>Why an account?</b>Without one, clearing your browser data loses everything. Your habits stay on the device either way — this is just the safety net.</div>`;

  const inbox=(S.inbox||[]).slice(0,3);
  const sub=(['list','chats','challenges'].includes(friendsState.sub)?friendsState.sub:'list');
  friendsState.sub=sub;
  const openId=friendsState.open;
  const seg=`<div class="seg" style="margin-bottom:14px" data-tour="fsubs">${[['list','Friend list'],['chats','Chats'],['challenges','Active challenges']].map(([v,l])=>`<button class="${sub===v?'on':''}" data-fsub="${v}">${l}</button>`).join('')}</div>`;

  const inboxCard=inbox.length?`<div class="card callout" style="margin-bottom:10px"><b>${inbox.length===1?'New message':`${inbox.length} new messages`}</b>
    <ul class="list" style="margin-top:6px">${inbox.map(x=>`<li><span>${esc(x.text)}</span><span class="small ${x.coins?'':'muted'}" style="${x.coins?'color:var(--accent)':''}">${x.coins?`+${x.coins}`:fmt(x.date,{day:'numeric',month:'short'})}</span></li>`).join('')}</ul>
    <button class="btn sm block" id="clearinbox" style="margin-top:10px">Clear</button></div>`:'';

  const addFriendCard=`<div class="card" style="margin-bottom:10px" data-tour="code"><div class="row"><input type="text" id="addcode" placeholder="Add a friend's code" maxlength="12" style="text-transform:uppercase"><button class="btn primary" id="addfriend">Add</button></div>
    ${!live?`<p class="tiny muted" style="margin-top:10px">No server configured — adding a code creates a demo friend so you can see how it works.</p>`:
      `<p class="tiny muted" style="margin-top:10px">Adding a code pairs you both ways — they'll see you too, no need to add you back.</p>`}
    <div class="row between" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)"><div><div class="eyebrow">Your code</div><b style="font-size:1.25rem;letter-spacing:.08em">${m.code}</b>
      <p class="tiny muted" style="margin-top:4px">${live?esc(S.me?.email||''):''}</p></div>
    <div class="stack" style="gap:6px"><button class="btn sm" id="copycode">Copy</button><button class="btn sm ghost" id="renameme">Rename</button>${avatarOf(m)?`<button class="btn sm ghost" id="avclear">Remove pic</button>`:''}</div></div></div>`;

  const listPane=addFriendCard+(!fs.length
    ?`<div class="card empty"><b>No one yet</b>Swap codes with someone and you'll both get a shared streak, chats and co-op challenges.<br><span class="tiny muted" style="display:block;margin-top:10px">No leaderboard, on purpose — you're on the same side.</span></div>`
    :fs.map(f=>{
      const open=openId===f.id;
      const ps=pairStreak(f), cleared=clearedOn(f,today()), mineCleared=!!S.days[today()]?.cleared;
      const on=friendChallenge(f.id); const onQ=on&&chalIsActive(on)?liveQuest(on):null;
      const others=onQ?onQ.members.filter(x=>x.id!==f.id):[];
      return `<div class="card friendrow ${open?'open':''}" style="padding:0;overflow:hidden">
        <button class="friendhead" data-ftog="${f.id}" style="width:100%;text-align:left;padding:14px;background:transparent;border:0;color:inherit;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer">
          <span class="row" style="gap:12px;align-items:center">${avatarHtml(f)}<b>${esc(f.name)}</b></span>
          <span class="chev" style="transform:rotate(${open?'90':'0'}deg);transition:transform .15s">›</span>
        </button>
        ${open?`<div style="padding:0 14px 14px;border-top:1px solid var(--line)">
          <button class="card friendcard" data-friend="${f.id}" style="margin-top:12px"><div class="row between" style="width:100%"><div class="row" style="gap:10px">${avatarHtml(f)}
            <div><b>${f.consistency??0}% consistent</b><p class="tiny muted">${f.streak??0} day streak · level ${f.level??1}</p></div></div>
            <span class="pill ${cleared?'accent':''}">${cleared?'Cleared today':'Not yet today'}</span></div></button>
          <div class="card pairstreak" style="margin-top:10px"><div class="row between"><div><div class="eyebrow">Shared streak</div><div class="heroval">${ps}<small>days</small></div>
            <p class="tiny muted">${ps?'Days you both cleared in a row.':'Starts the first day you both clear.'}</p></div>
            <div class="pairfire ${ps?'lit':''}">${ICON.flame}</div></div>
            <div class="row" style="gap:8px;margin-top:12px"><span class="pill ${mineCleared?'accent':''}">You ${mineCleared?'✓':'—'}</span><span class="pill ${cleared?'accent':''}">${esc(f.name)} ${cleared?'✓':'—'}</span></div></div>
          ${onQ?`<div class="card" style="margin-top:10px;border-color:color-mix(in srgb,${TIERS_C[onQ.tier].colour} 35%,var(--line))"><div class="row between"><div><span class="tierbadge" style="--tier:${TIERS_C[onQ.tier].colour}">${TIERS_C[onQ.tier].label}</span>
            <b style="display:block;margin-top:6px">On ${esc(onQ.name)}</b>
            <p class="tiny muted">${others.length?'with '+others.map(x=>esc(x.name)).join(', '):'just the two of you'}</p></div>
            <div class="chestmini">${chestSVG(onQ.tier)}</div></div></div>`:''}
          ${(()=>{ const p=pairOf(f); const ch=(p.chests||[]).slice(-6).reverse(); if(!ch.length) return '';
            return `<details class="fold" style="margin-top:8px"><summary><span>Chests won (${p.chests.length})</span><span class="tiny">${p.chests.reduce((a,c)=>a+c.amount,0)} coins</span></summary>
              <div class="card" style="margin-top:8px"><ul class="list">${ch.map(c=>`<li><span><i class="dotc" style="background:${TIERS_C[c.tier].colour}"></i>${esc(c.name)}${c.crew?.length?`<span class="tiny muted"> · ${esc(c.crew.join(', '))}</span>`:''}</span><span class="small" style="color:${TIERS_C[c.tier].colour}">+${c.amount}</span></li>`).join('')}</ul></div></details>`; })()}
          <button class="btn ${canCheer(f)?'primary':''} block" style="margin-top:10px" data-cheer="${f.id}" data-kind="${cleared?'cheer':'nudge'}" ${canCheer(f)?'':'disabled'}>
            ${!canCheer(f)?'Already sent today':cleared?`Cheer ${esc(f.name)} · +${CHEER_COINS} to them`:`Nudge ${esc(f.name)}`}</button>
          <div class="row between" style="margin-top:8px"><p class="tiny muted">${cleared?'A cheer sends them coins. One a day.':'A nudge is just a wave — no coins, no guilt trip.'}</p>
            <button class="btn sm ghost danger" data-unfriend="${f.id}">Remove</button></div>
        </div>`:''}
      </div>`;
    }).join('<div style="height:10px"></div>'));

  const chatsPane=`<div class="section" data-tour="crews">
    ${crewList().length?crewList().map(c=>{const u=crewUnread(c),last=msgsOf(c.id).slice(-1)[0];
      return `<button class="card crewrow" data-crew="${c.id}"><div class="grow"><div class="row between"><b>${esc(crewName(c))}</b>${u?`<span class="pill accent tiny">${u}</span>`:''}</div>
        <p class="tiny muted">${crewSize(c)} people${last?` · ${last.kind==='emote'?esc(last.code):esc(PHRASE_MAP[last.code]||'…')}`:' · say something'}</p></div><span class="chev">›</span></button>`;}).join(''):
      `<div class="card empty"><b>No chats yet</b>Start one with a friend, or a group — challenges get set up inside them.</div>`}
    ${fs.length?`<button class="btn ${crewList().length?'':'primary'} block" id="newcrew" style="margin-top:10px">New chat</button>`:
      `<div class="card empty"><b>Add a friend first</b>Chats need someone to talk to.</div>`}
  </div>`;

  const active=chalList().filter(chalIsActive);
  const pending=chalList().filter(chalIsPending);
  const chalPane=`<div class="section" data-tour="friend">
    <p class="tiny muted" style="margin:-4px 0 10px">${slotSummary()}${chalOnCooldown()?` · Cooldown until ${fmt(S.chalCooldownUntil,{day:'numeric',month:'short'})}`:''}</p>
    <button class="btn ${canStartChallenge()?'primary':''} block" id="startchal" ${canStartChallenge()?'':'disabled'} style="margin-bottom:12px">${canStartChallenge()?'Start a challenge':chalOnCooldown()?'Cooldown after last challenge':peopleLeft()<1?'Four people already on a challenge':'No slot free'}</button>
    ${pending.length?`<h2 style="margin:8px 0 10px">Waiting <span class="muted">${pending.length}</span></h2>${pending.map(c=>challengeCard(c)).join('')}`:''}
    <h2 style="margin:8px 0 10px">Running <span class="muted">${active.length}</span></h2>
    ${active.map(c=>challengeCard(c)).join('')||`<div class="card empty"><b>None running</b>Invite someone — the clock starts only after they accept.<br><span class="tiny muted" style="display:block;margin-top:10px">Invites show under Active challenges → Waiting, and at the top of the chat.</span></div>`}
  </div>`;

  const pane=sub==='chats'?chatsPane:sub==='challenges'?chalPane:listPane;

  return head + `
  ${inboxCard}
  ${seg}
  ${pane}`;

}

/* ---------- Shop ---------- */
function vShop(){
  const T=title(), L=level(); const str=avgStrength(); const canRate=true; const active=S.rewards.filter(x=>x.active);
  return `
  <div class="head"><div><div class="eyebrow">Coins to spend</div><h1>Shop</h1></div></div>
  ${affirmationLine()}
  <div class="card" data-tour="balance"><div class="balance">${S.points.coins}<small>coins</small></div>
    <div class="row between" style="margin-top:14px"><span class="pill accent">Level ${L.L} · ${T.name}</span><span class="tiny muted">${L.into} / ${L.need} XP</span></div>
    <div class="titlebar"><i style="width:${clamp(100*L.into/L.need,0,100)}%"></i></div>
    <p class="tiny muted" style="margin-top:8px">${T.next?`${T.next.name} at level ${T.next.at}. `:'Top title. '}XP is never spent — only coins are.</p></div>
  <div class="section"><h2>Rewards <span class="muted">you set the price</span></h2>
    ${(()=>{const p=pendingExtras(); if(!p.length) return '';
      return `<div class="card" style="margin-bottom:12px;border-color:color-mix(in srgb,var(--accent) 35%,var(--line))">
        <b class="small">${p.length} chest extra${p.length===1?'':'s'} to place</b>
        <p class="tiny muted" style="margin-top:4px">${active.length?'Pick which reward gets +1 buy this week.':'Add a reward first — they will wait.'}</p>
        ${active.length?`<button class="btn primary sm" style="margin-top:10px" id="placeextras">Choose</button>`:
          `<button class="btn primary sm" style="margin-top:10px" data-go="settings" data-open="rewards">Add a reward</button>`}</div>`;})()}
    ${active.length?active.map(x=>{const cost=rewardPrice(x); const afford=S.points.coins>=cost; const ok=afford&&canRate; return `<div class="card reward ${ok?'':'locked'}"><div class="row between"><b>${esc(x.name)}</b><span class="small muted">${Math.min(S.points.coins,cost)}/${cost}</span></div><p class="tiny muted">${earnEta(cost)}</p><div class="bar"><i style="width:${clamp(100*S.points.coins/cost,0,100)}%"></i></div>
      ${(()=>{const al=allowanceState(x); const can=ok&&!al.maxed; const mp=monthlyPlanned(x);
        return `<div class="row between" style="margin:8px 0 2px">
          <span class="tiny ${al.monthUsed>mp?'':'muted'}" style="${al.monthUsed>mp?'color:#f59e0b':''}">${al.monthUsed} of ${mp} this month</span>
          <span class="tiny muted">${al.maxed?`back ${fmt(al.next,{day:'numeric',month:'short'})}`
            :al.intoExtra?'chest extra left'
            :al.over?'one spare left'
            :rewardFreq(x)==='custom'?''
            :`${al.used} of ${al.limit} ${al.period}`}</span></div>
        ${al.extras?`<p class="tiny muted" style="margin:0 0 4px">+${al.extras} chest extra${al.extras===1?'':'s'} this week</p>`:''}
        <div class="bar quest allowbar ${al.over?'spare':''} ${al.maxed?'done':''}"><i style="width:${clamp(Math.round(100*al.monthUsed/mp),0,100)}%"></i></div>
        <button class="btn ${can?(al.over?'':'primary'):''} block" style="margin-top:8px" data-buy="${x.id}" ${can?'':'disabled'}>${
          al.maxed?`That is it ${al.period}` : al.intoExtra?'Buy with a chest extra' : al.over?'Buy the spare one' : ok?'Buy' : !afford?`${cost-S.points.coins} more coins`:'Buy'}</button>`;})()}</div>`}).join(''):`<div class="card empty"><b>No rewards yet</b>Choose up to ${MAX_REWARDS} things worth earning.<br><button class="btn primary sm" style="margin-top:14px" data-go="settings" data-open="rewards">Add a reward</button></div>`}</div>
  <div class="section"><h2>Looks <span class="muted">${looks().owned.length} of ${LOOK_ITEMS.length}</span></h2>
    <button class="card planline" id="openlooks"><div class="row" style="gap:12px;align-items:center">
      <span class="avatar big img">${charSVG(myChar())}</span>
      <div><b>Your character</b><p class="tiny muted">Hair, outfits, eyewear, headwear and backdrops — bought with coins.</p></div></div>
      <span class="chev">›</span></button></div>
  <div class="section" data-tour="locker"><h2>Locker <span class="muted">${S.locker.filter(x=>!x.usedAt).length} to use</span></h2>
    ${S.locker.length?`<div class="card"><ul class="list">${[...S.locker].reverse().map(x=>`<li class="locker-item ${x.usedAt?'used':''}"><div><div>${esc(x.name)}</div><div class="tiny muted">${x.usedAt?'Used '+fmt(x.usedAt):'Bought '+fmt(x.boughtAt)}</div></div>${x.usedAt?'':`<button class="btn sm" data-use="${x.id}">Mark used</button>`}</li>`).join('')}</ul></div>`:'<div class="card"><p class="muted small">Things you buy land here.</p></div>'}</div>`;
}
function buy(id){
  const r=S.rewards.find(x=>x.id===id); if(!r) return; const cost=rewardPrice(r); if(S.points.coins<cost) return;
  const al=allowanceState(r);
  if(al.maxed){ toast(`That is it ${al.period} — back ${fmt(al.next,{day:'numeric',month:'short'})}`); return; }
  const after=al.left-1;
  const leftAfter=al.hard-(al.used+1);
  const note = al.intoExtra
    ? `This uses a chest extra.${leftAfter?` ${leftAfter} still left after.`:` That is the last one ${al.period}.`}`
    : al.over
    ? (al.extras
      ? `This is your spare. After it you still have ${al.extras} chest extra${al.extras===1?'':'s'} this week.`
      : `This is one past what you planned. It is allowed once — after this it waits until ${fmt(al.next,{day:'numeric',month:'short'})}.`)
    : after>0 ? `${after} more ${al.period} after this.` : `That is your last planned one ${al.period}. You would have one spare after it.`;
  modal(`<h2>Buy ${esc(r.name)}?</h2><p class="muted">${cost} coins. ${S.points.coins-cost} left after. ${note}</p>`,'Buy',()=>{
    S.points.coins-=cost; S.locker.push({id:uid(),rewardId:id,name:r.name,boughtAt:today()}); save(); try{ checkChallenges(); }catch(e){} haptic('success'); render(); toast('Bought · in your locker'); });
}

/* ---------- Settings ---------- */
function vSettings(){
  const st=S.settings; const tg=(k,on)=>`<button class="toggle ${on?'on':''}" data-toggle="${k}" role="switch" aria-checked="${on}"></button>`;
  const segS=(k,opts)=>`<div class="seg">${opts.map(([v,l])=>`<button class="${st[k]===v?'on':''}" data-set="${k}" data-val="${v}">${l}</button>`).join('')}</div>`;
  return `
  <div class="head"><div><div class="eyebrow">Steady</div><h1>Settings</h1></div></div>
  ${affirmationLine()}
  <details class="acc" id="acc-tasks" data-tour="tasks"><summary>Tasks <span class="muted">${activeTasks().length} / ${MAX_TASKS}</span></summary><div class="body">
    ${(()=>{const live=S.tasks.filter(t=>!t.archived); const n=live.length; const full=n>=MAX_TASKS; return `
    <div class="stack" style="margin-bottom:10px"><div class="row"><input type="text" id="newtask" placeholder="${full?'Task cap reached':'e.g. Walk the dog'}" maxlength="60"${full?' disabled':''}><input type="number" id="newtarget" placeholder="min" min="1" max="600" style="width:74px;padding:12px 8px;text-align:center"${full?' disabled':''}></div>
      <button class="btn primary block" id="addtask"${full?' disabled':''}>Add</button></div>
    <p class="tiny muted" style="margin:-4px 0 10px">${n} / ${MAX_TASKS} tasks${full?'':'. Minutes optional — every '+OT_PER+' minutes past a target pays +1 coin.'}</p>
    ${n?live.slice().sort((a,b)=>a.order-b.order).map(t=>`<div class="editrow"><span class="name">${esc(t.name)}${t.target?`<span class="tag">${t.target}m</span>`:''}${cadenceTagHtml(t)}</span><button class="iconbtn" data-rename="${t.id}" aria-label="Rename">${ICON.edit}</button><button class="iconbtn" data-deltask="${t.id}" aria-label="Remove">${ICON.trash}</button></div>`).join(''):'<p class="muted small">Add the things you want to keep doing daily.</p>'}`;})()}
    <p class="tiny muted" style="margin-top:10px">Finish every due task to clear the day. Removing one takes it off the list; past days stay in Progress.</p></div></details>
  <details class="acc" id="acc-rewards" ${rewOpen?'open':''}><summary>Rewards <span class="muted">${S.rewards.filter(x=>x.active).length} / ${MAX_REWARDS}</span></summary><div class="body">
    ${budgetCard()}
    <div class="stack" style="margin:12px 0 10px">
      <input type="text" id="newreward" placeholder="e.g. Takeaway night" maxlength="60" ${S.rewards.filter(x=>x.active).length>=MAX_REWARDS?'disabled':''}>
      <div><span class="plabel">How often would you like this?</span>
        <div class="chips" id="freqpicks">${FREQS.map(f=>`<button type="button" class="chip ${newRewardFreq===f.id?'on':''}" data-freq="${f.id}">${f.label}</button>`).join('')}</div></div>
      ${newRewardFreq==='custom'?`<div class="row" style="align-items:center;gap:8px">
        <input type="number" id="newper" min="1" max="${MAX_PER_MONTH}" step="1" value="${newRewardPer}" style="width:78px;padding:12px 8px;text-align:center">
        <span class="small muted">times a month</span></div>`:''}
      <div class="row"><input type="number" id="newprice" min="${MIN_REWARD_PRICE}" step="10" value="${suggestFromFreq(newRewardFreq,null,newRewardPer)}" style="width:118px;padding:12px 8px;text-align:center" ${S.rewards.filter(x=>x.active).length>=MAX_REWARDS?'disabled':''}>
        <button class="btn primary grow" id="addreward" ${S.rewards.filter(x=>x.active).length>=MAX_REWARDS?'disabled':''}>Add</button></div>
      <p class="tiny muted" id="priceeta">${earnEta(suggestFromFreq(newRewardFreq,null,newRewardPer))}</p>
      <p class="tiny muted">Suggested from what you actually earn. Type over it if you disagree — the budget above keeps you honest.</p>
    </div>
    ${S.rewards.filter(x=>x.active).map(x=>`<div class="editrow"><span class="name">${esc(x.name)}
      <span class="tiny muted" style="font-weight:400;display:block">${rewardPrice(x)} coins · ${esc(freqLabel(x).toLowerCase())} · ${Math.round(monthlyCostOf(x))}/month</span></span>
      <button class="iconbtn" data-editreward="${x.id}" aria-label="Edit">${ICON.edit}</button><button class="iconbtn" data-delreward="${x.id}" aria-label="Remove">${ICON.trash}</button></div>`).join('')
      ||'<p class="muted small">Tell it how often you want something and it works out the price from what you earn.</p>'}</div></details>
  <details class="acc" id="acc-look" data-tour="look"><summary>Customise <span class="muted">${(THEMES[st.theme]||THEMES.teal).label} · ${isDarkMode()?'dark':'light'}</span></summary><div class="body">
    <div class="opt" style="flex-direction:column;align-items:stretch;gap:10px"><label>Theme</label>
      <div class="themes">${Object.entries(THEMES).map(([n,t])=>{ const p=t[isDarkMode(st)?'dark':'light']; return `<button class="themechip ${st.theme===n?'on':''}" data-set="theme" data-val="${n}" aria-label="${t.label}"><span class="preview" style="background:${p.bg};border-color:${p.line}"><i style="background:${p.accent}"></i></span><span class="tiny">${t.label}</span></button>`; }).join('')}</div></div>
    <div class="opt" style="flex-direction:column;align-items:stretch;gap:10px"><label>Design</label>
      <div class="designs">${MOTIFS.map(m=>`<button class="designchip ${st.motif===m.id?'on':''}" data-set="motif" data-val="${m.id}" aria-label="${m.label}"><span class="glyph">${MOTIF_GLYPH[m.id]}</span><span class="tiny">${esc(m.label)}</span></button>`).join('')}</div></div>
    <div class="opt"><label>Font</label>${segS('font',[['system','System'],['rounded','Rounded'],['serif','Serif'],['mono','Mono']])}</div>
    <div class="opt"><label>Text size <span class="hint">${st.textSize}%</span></label><div class="row"><button class="btn sm" data-size="-10">A−</button><button class="btn sm" data-size="10">A+</button></div></div>
    <div class="opt"><label>Haptics <span class="hint">buzz on confirms</span></label>${tg('haptics',st.haptics)}</div>
    <div class="opt"><label>Glow</label>${tg('glow',st.glow)}</div>
    <div class="opt"><label>Reset</label><button class="btn sm" id="resetlook">Defaults</button></div></div></details>
  <details class="acc" id="acc-remind" data-tour="remind" ${remOpen?'open':''}><summary>Reminders <span class="muted">${remindCfg().on&&notifyState()==='granted'?'on':'off'}</span></summary><div class="body">
    <div class="opt"><label>Reminders <span class="hint">a nudge in the morning, and in the evening if anything's open</span></label>
      <button class="toggle ${remindCfg().on?'on':''}" data-remind-on role="switch" aria-checked="${remindCfg().on}"></button></div>
    ${(()=>{ const st=notifyState(), c=remindCfg();
      if(!c.on) return '<p class="tiny muted" style="margin-top:8px">Switched off. Nothing will be sent.</p>';
      if(st==='unsupported') return '<p class="small muted" style="margin-top:8px">This browser can\'t do notifications.</p>';
      if(st==='ios-needs-install') return `<div class="card callout" style="margin-top:10px"><b>Add Steady to your home screen first</b>
        <p class="small muted" style="margin-top:6px">iPhone only allows notifications once the app is on your home screen. Safari → <b>Share</b> → <b>Add to Home Screen</b>, then open it from the icon.</p></div>`;
      if(st==='denied') return `<div class="card callout" style="margin-top:10px"><b>Your browser is blocking them</b>
        <p class="small muted" style="margin-top:6px">The switch above is on, but permission was denied so nothing can get through. Nobody can undo that from inside a web page — you have to clear it in the browser:</p>
        <ol class="steps-list" style="margin-top:8px">
          <li><b>Brave / Chrome:</b> tap the <b>padlock</b> or <b>⚙</b> next to the web address → <b>Permissions</b> → <b>Notifications</b> → set to Ask or Allow.</li>
          <li>Or: Settings → Site settings → Notifications → find this site → <b>Allow</b>.</li>
          <li><b>iPhone:</b> Settings → Notifications → Steady → Allow.</li>
        </ol>
        <button class="btn sm block" style="margin-top:10px" id="recheck">I've done that — check again</button></div>`;
      if(st==='default') return `<div class="stack" style="margin-top:10px"><p class="small muted">One last step: your browser needs to allow them.</p>
        <button class="btn primary block" id="asknotify">Allow notifications</button></div>`;
      return `<div class="opt"><label>Morning nudge</label><input type="time" id="remmorning" value="${c.morning}" style="width:130px"></div>
        <div class="opt"><label>Evening, if unfinished</label><button class="toggle ${c.eveningOn?'on':''}" data-remind-eve role="switch" aria-checked="${c.eveningOn}"></button></div>
        ${c.eveningOn?`<div class="opt"><label>Evening time</label><input type="time" id="remevening" value="${c.evening}" style="width:130px"></div>`:''}
        <div class="opt"><label>Affirmation <span class="hint">sends one of your own lines</span></label><button class="toggle ${c.affOn?'on':''}" data-remind-aff role="switch" aria-checked="${c.affOn}"></button></div>
        ${c.affOn?`<div class="opt"><label>Affirmation time</label><input type="time" id="remaff" value="${c.aff}" style="width:130px"></div>`:''}
        <div class="opt"><label>List reminders <span class="hint">for Plan items with a time</span></label><button class="toggle ${c.todos!==false?'on':''}" data-remind-todos role="switch" aria-checked="${c.todos!==false}"></button></div>
        <p class="tiny muted" style="margin-top:10px">${PUSH.vapidPublic?'Reminders arrive whether the app is open or not.':'These fire while the app is open. For reminders when it is closed, the server side needs setting up — see push.sql.'}</p>`;
    })()}
  </div></details>
  ${(()=>{ const live=Sync.live(), inn=Sync.signedIn();
    if(!live) return `<details class="acc"><summary>Account</summary><div class="body"><p class="tiny muted">No server configured on this build.</p>
      <button class="btn sm block" id="syncnow" style="margin-top:10px">Update app</button></div></details>`;
    if(!inn) return `<details class="acc" id="acc-account" data-tour="account"><summary>Account</summary><div class="body"><p class="tiny muted">Sign in on Friends first — backups ride with your account.</p>
      <button class="btn sm block" id="syncnow" style="margin-top:10px">Update app</button></div></details>`;
    return `<details class="acc" id="acc-account" data-tour="account"><summary>Account <span class="muted">${S.vaultAt?'synced':'not yet'}</span></summary><div class="body">
      <p class="tiny muted">${esc(S.me?.email||me().name||'')}</p>
      <p class="tiny muted" style="margin-top:8px">${S.vaultAt?`Last backup ${new Date(S.vaultAt).toLocaleString()}`:'Not pulled from the cloud yet on this device'}</p>
      <p class="tiny muted" style="margin-top:4px">Saves itself a few seconds after changes. Use Restore if another device is ahead.</p>
      <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn primary sm" id="restorevault">Restore from account</button>
        <button class="btn sm" id="backupnow">Backup now</button>
        <button class="btn sm" id="syncnow">Update app</button></div>
      <button class="btn sm ghost danger block" id="signout" style="margin-top:14px">Sign out</button>
    </div></details>`;
  })()}
  <details class="acc"><summary>Help</summary><div class="body small muted stack">
    <p><b style="color:var(--fg)">The idea.</b> Nothing here ever takes points off you. Missing a day costs you what you would have earned, and that is all. The app's job is to notice patterns you would not, and to make keeping your word worth something.</p>

    <p><b style="color:var(--fg)">Coins and XP.</b> Every task done pays around ${TASK_BASE} coins and XP — more when that habit has been slipping for a few days (up to ×1.5), less when it is already solid. One miss does not raise the pay. Coins get spent in the Shop. XP is never spent — it drives your level and title.</p>
    <p><b style="color:var(--fg)">Habit strength.</b> Each task carries a 0–100% score that climbs about 5 a day when done and fades 5% a day when not. A miss dents it; it never resets to zero.</p>
    <p><b style="color:var(--fg)">Day cleared.</b> Tick everything and you get +${CLEAR_PER_TASK} per task on top.</p>
    <p><b style="color:var(--fg)">Timed tasks.</b> Set a target in minutes and you will be asked how long it took. Turning up earns ${Math.round(TIME_FLOOR*100)}% of the coins whatever the clock says; the rest scales with how much of the target you did — 15 of 30 minutes on a 10-coin task pays 8, not 5. Over the target pays +1 coin per ${OT_PER} minutes (max +${OT_TASK_CAP} a task, +${OT_DAY_CAP} a day), coins only, never XP. A short session still counts as <i>done</i>: it never touches your streak, your day clear or your strength. Under Done today you can Undo anytime the same day, or Edit the minutes on a timed task — coins move by the difference. No countdown.</p>
    <p><b style="color:var(--fg)">Full-clear streak.</b> Tick everything 7 days running for +${CLEAR_WEEK_BONUS} coins, doubling each further week — ${[1,2,3,4,5].map(x=>clearWeekBonus(x)).join(', ')} — then holding at ${CLEAR_WEEK_CAP}. Miss a clear and it starts again from ${CLEAR_WEEK_BONUS}.</p>
    <p><b style="color:var(--fg)">Login streak.</b> Just for opening the app: +5 from day two, +10 from day seven, +15 from day thirty.</p>
    <p><b style="color:var(--fg)">Weekly chest.</b> Clear ${CHEST_DAYS} of 7 days and a free day's coins land on Monday.</p>

    <p><b style="color:var(--fg)">Rewards.</b> Up to ${MAX_REWARDS}. You say how often you would like each one — weekly, fortnightly, monthly, or your own number of times a month — and the price comes from what you actually earn over the last four weeks. Type over it if you disagree. The budget line shows what all your rewards want per month against what you bring in; amber past 90%, red past 100%. <b>Balance these for me</b> rescales the prices to fit and shows you the before and after first.</p>
    <p><b style="color:var(--fg)">Allowances.</b> The frequency is a real limit. You get what you planned plus ${SPARES} spare, then it waits — the counter goes amber when you use that spare. A Rare or Legendary challenge chest can add a further buy for the current week on a reward you choose; unused extras expire when the week ends. Without that, a cheap reward is buyable every day and stops meaning anything. The Shop itself is always open; the limits do the work, so there is no consistency gate on spending.</p>

    <p><b style="color:var(--fg)">Every other day.</b> In Settings → Tasks → edit, switch a task to Every other day — today counts, tomorrow rests, and so on. Off days stay off the Today list, are not auto-missed, and do not dent habit strength.</p>
    <p><b style="color:var(--fg)">Days of the week.</b> Same edit screen — pick Days of week and tap Mon–Sun chips (e.g. Mon/Wed/Fri workout). Only those days are due; other days skip the list like every-other off days.</p>
    <p><b style="color:var(--fg)">Misses.</b> Anything due and untouched at local midnight becomes a miss on next open, and you are asked why. Those answers are the most useful thing in the app: they feed <i>Why you miss</i> in Progress, the breakdown on each task, the day detail in a task's history, and every recap.</p>
    <p><b style="color:var(--fg)">When something keeps slipping.</b> Miss the same task ${STUCK_MISSES} days running and the app offers to halve the target and suggests things that actually work — shrinking it, anchoring it to a habit that never slips, deciding when and where in advance. It will not ask again about that task for ${ADVICE_COOLDOWN} days.</p>

    <p><b style="color:var(--fg)">Recaps.</b> A short one every Monday for the week just gone, with your completion rate against the week before and what you said when you missed. Bigger ones at 7, 30, 100 and 365 days. Each is snapshotted when earned, so revisiting one shows what it said at the time. They live in Progress → Overview.</p>
    <p><b style="color:var(--fg)">Challenges.</b> Starting one sends an invite. The clock and the chest only begin after everyone accepts. Decline or cancel frees the slot. Common / Rare / Legendary share the same four shapes — clear streak, coin haul, show up, shop silence — with the bar raised each tier. Chests pay coins; Rare has a chance of +1 shop buy for the week, Legendary gives two — you pick which rewards. Finish a quest and that exact one locks until next month for you with every friend; if someone in the invite already finished it this month, it stays greyed out. Fail and it ends at once — you can try again the next day.</p>
    <p><b style="color:var(--fg)">Plan.</b> A list, notes and affirmations, all outside the economy — nothing on the list or in notes can be failed. List items take any date, and a time if you want a nudge. Unfinished ones follow you along as <i>overdue</i> rather than becoming misses.</p>
    <p><b style="color:var(--fg)">Notes.</b> A title, the date you made it, and a box to write in. It saves as you type, and whichever note you touched last sits at the top of the list. Search by any word in the title. Delete from the bin in the corner; an empty note removes itself when you leave.</p>
    <p><b style="color:var(--fg)">Affirmations.</b> Under Plan. Add as many as you like; one is picked at random on open and when you change tabs. Search by word; tap a line to bring it to the top.</p>
    <p><b style="color:var(--fg)">Reminders.</b> One switch. A morning nudge, an evening one only if something is still open, one that just reads you one of your own affirmations, and anything on your list with a time on it. If your browser has blocked notifications, no app can undo that from the inside — the Reminders panel tells you where to clear it.</p>

    <p><b style="color:var(--fg)">Friends.</b> Pair by swapping codes; adding one code links you both ways. Chats are fixed phrases and emotes only — nothing free-typed, so there is nothing to moderate. Challenges are started inside a chat: pick a tier, and the harder the tier the bigger the chest — Rare and Legendary can also unlock an extra Shop buy for the week. One legendary, one rare and two commons can run at once. No leaderboard, deliberately.</p>
    <p><b style="color:var(--fg)">Accounts.</b> The account exists only to back things up and to pair with people — everything works without one. Backing up happens by itself a few seconds after anything changes. Forgotten your password? Use the link on the sign-in screen and it emails you a reset. Lost the email as well? Your tasks, history and coins are still on this phone; sign up again with another email and this device carries on. You would lose the old backup and any pairing, nothing else.</p>
    <p><b style="color:var(--fg)">Your character.</b> Shop → Looks, or tap your picture on Friends. Eight faces, six skin tones and eight hair colours are yours from the start, and they're separate choices — so any face can be any tone with any hair, including ginger. Cosmetics cost coins: hair styles, outfits, eyewear, headwear and backdrops. Nothing is limited to one kind of character; any item works on any of them.</p>
    <p><b style="color:var(--fg)">Your picture.</b> You can use an image instead. Tap your name and avatar at the top right of Friends. Any square image works — render one out of Blender if you like. It gets squashed to 128px, about 5KB, which is small enough to travel with your profile so friends see it. Remove it and you go back to the initial.</p>
    <p><b style="color:var(--fg)">Friends.</b> Tap a friend to see the two of you together — chests won, coins they brought in, which tiers, and every chest with its date.</p>
    <p><b style="color:var(--fg)">Light and dark.</b> Follows your phone. Change it in your phone's display settings and the app follows.</p>
    <p><b style="color:var(--fg)">Privacy.</b> Everything lives on this device by default. With a friend, only aggregates sync — cleared and done counts, streak, consistency, level. Task names, notes, miss reasons and your affirmation never leave this device.</p>
    <p class="tiny">Build ${BUILD}</p>
    <div class="row" style="margin-top:8px;flex-wrap:wrap;gap:8px"><button class="btn sm" id="conncheck">Check connection</button><button class="btn sm" id="replay">Replay tour</button><button class="btn sm" id="replayonb">Replay setup</button><button class="btn sm" id="export">Export data</button><button class="btn sm danger" id="wipe">Erase everything</button></div>
  </div></details>`;
}
/* ---------- Event binding ---------- */
function bind(){
  const q=s=>$app.querySelector(s), qa=s=>[...$app.querySelectorAll(s)];
  qa('[data-go]').forEach(b=>b.onclick=()=>{ const open=b.dataset.open; setTab(b.dataset.go); if(open){ const acc=document.getElementById('acc-'+open); if(acc){acc.open=true; acc.querySelector('input')?.focus();} } });
  // Today
  qa('[data-task]').forEach(b=>b.onclick=()=>{ const id=b.dataset.task; sel.has(id)?sel.delete(id):sel.add(id); b.classList.toggle('selected'); haptic(); updateConfirm(); });
  qa('[data-donetap]').forEach(b=>b.onclick=()=>doneSheet(b.dataset.donetap));
  qa('[data-undone]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); unmarkDone(b.dataset.undone); });
  qa('[data-edittime]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const t=S.tasks.find(x=>x.id===b.dataset.edittime); if(t?.target) timeSheet([t], true); });
  updateConfirm();
  // Progress
  // Plan — list
  qa('[data-psub]').forEach(b=>b.onclick=()=>{ planState.sub=b.dataset.psub; planState.openAff=planState.editAff=planState.openNote=planState.editNote=null; haptic(); render(); window.scrollTo({top:0}); });
  qa('[data-fsub]').forEach(b=>b.onclick=()=>{ friendsState.sub=b.dataset.fsub; friendsState.open=null; haptic(); render(); window.scrollTo({top:0}); });
  qa('[data-ftog]').forEach(b=>b.onclick=()=>{ const id=b.dataset.ftog; friendsState.open=friendsState.open===id?null:id; haptic(); render(); });
  qa('[data-acceptchal]').forEach(b=>b.onclick=()=>acceptChallenge(b.dataset.acceptchal));
  qa('[data-declinechal]').forEach(b=>b.onclick=()=>declineChallenge(b.dataset.declinechal));
  qa('[data-when]').forEach(b=>b.onclick=()=>{ const v=b.dataset.when;
    if(v==='pick'){ promptDate('When?', planState.when&&planState.when.includes('-')?planState.when:addDays(today(),2), d=>{ planState.when=d; render(); }); return; }
    planState.when=v; haptic(); render(); });
  const whenDay=()=>{ const w=planState.when; return w==='today'?today():w==='tomorrow'?addDays(today(),1):w==='someday'?null:w; };
  const nta=q('#newtodoat'); if(nta) nta.onchange=()=>{ planState.at=nta.value; render(); };
  const cat=q('#clearat'); if(cat) cat.onclick=()=>{ planState.at=''; render(); };
  const nl=q('#newtodo'); if(nl){ const add=()=>{const v=nl.value.trim(); if(!v) return;
      addTodo(v,whenDay(),document.getElementById('newtodoat')?.value||null); haptic(); render(); document.getElementById('newtodo')?.focus();};
    q('#addtodo').onclick=add; nl.onkeydown=e=>{if(e.key==='Enter')add();}; }
  qa('[data-todo]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); const el=b.closest('.todo')||b.closest('summary'); const id=b.dataset.todo; const t=S.todos.find(x=>x.id===id);
    haptic(); if(!t.done&&S.settings.motion){ el.classList.add('ticking'); setTimeout(()=>{toggleTodo(id);render();},200); } else { toggleTodo(id); render(); } });
  qa('[data-tmove]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); const t=S.todos.find(x=>x.id===b.dataset.tmove);
    moveSheet(t); });
  qa('[data-pull]').forEach(b=>b.onclick=()=>{ setTodoDay(b.dataset.pull,today()); haptic(); render(); toast('Moved to today'); });
  qa('[data-tdrop]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); const t=S.todos.find(x=>x.id===b.dataset.tdrop); dropTodo(b.dataset.tdrop); haptic(); render();
    toast('Removed','Undo',()=>{ S.todos.push(t); save(); render(); }); });
  // Plan — notes
  const nn=q('#newnote'); if(nn) nn.onclick=()=>{ const n=addNote(); planState.openNote=n.id; planState.editNote=n.id; planState.openAff=planState.editAff=null; haptic(); render(); };
  qa('[data-note]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); noteEditor(b.dataset.note); });
  qa('[data-notetog]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation();
    const id=b.dataset.notetog;
    if(planState.editNote===id) return;
    if(planState.openNote===id){ planState.openNote=null; planState.editNote=null; }
    else { planState.openNote=id; planState.editNote=null; planState.openAff=planState.editAff=null; }
    haptic(); render(); });
  qa('[data-notebody]').forEach(b=>b.onclick=e=>{
    if(planState.editNote===b.dataset.notebody) return;
    if(e.target.closest('button,input,textarea,a')) return;
    planState.openNote=null; planState.editNote=null; haptic(); render();
  });
  qa('[data-noteedit]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); planState.openNote=b.dataset.noteedit; planState.editNote=b.dataset.noteedit; haptic(); render();
    setTimeout(()=>document.querySelector(`[data-note-title="${b.dataset.noteedit}"]`)?.focus(),40); });
  qa('[data-notesave]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation();
    const id=b.dataset.notesave; const n=S.notes.find(x=>x.id===id); if(!n) return;
    const ti=document.querySelector(`[data-note-title="${id}"]`);
    const ta=document.querySelector(`[data-note-body="${id}"]`);
    n.title=ti?ti.value:''; n.body=ta?ta.value:''; touchNote(n); planState.editNote=null; haptic('success'); render(); toast('Saved'); });
  qa('[data-notecancel]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); planState.editNote=null; haptic(); render(); });
  const nsearch=q('#notesearch'); if(nsearch){ nsearch.oninput=()=>{ planState.noteQ=nsearch.value; render(); const el=document.getElementById('notesearch'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }; }
  // Friends  // Friends
  qa('[data-authmode]').forEach(b=>b.onclick=()=>{ authState.mode=b.dataset.authmode; haptic(); render(); });
  const ag=q('#authgo'); if(ag) ag.onclick=async()=>{
    const email=q('#auemail').value.trim(), pass=q('#aupass').value, name=(q('#auname')?.value||me().name||'Me').trim();
    if(!email||!pass) { toast('Email and password needed'); return; }
    ag.disabled=true; ag.textContent='…';
    try{
      if(authState.mode==='up'){ await Sync.signUp(email,pass,name); render(); toast('Account created'); friendsTick(); }
      else{
        const blob=await Sync.signIn(email,pass);
        const localHeavy=vaultWeight(S)>=3;
        if(blob && localHeavy && vaultWeight(blob) > 0){
          render();
          modal('<h2>Restore your backup?</h2><p class="muted">Your account has a backup (likely from your other device). Restoring replaces what is on <b>this</b> device with that backup. Cancel keeps this device as it is — but will not upload over a newer cloud backup.</p>','Restore',()=>{ Sync.applyVault(blob); render(); toast('Restored from account'); friendsTick(); });
        } else {
          if(blob) Sync.applyVault(blob);
          render(); toast(blob?'Signed in · backup restored':'Signed in'); friendsTick();
        }
      }
    }catch(e){ ag.disabled=false; ag.textContent=authState.mode==='up'?'Create account':'Sign in'; toast(e.message||'Could not sign in'); }
  };
  const fp=q('#forgotpw'); if(fp) fp.onclick=()=>forgotSheet();
  const so=q('#signout'); if(so) so.onclick=()=>modal('<h2>Sign out?</h2><p class="muted">Your tasks and history stay on this device. Sign back in any time.</p>','Sign out',async()=>{ await Sync.signOut(); render(); toast('Signed out'); });
  const rvault=q('#restorevault'); if(rvault) rvault.onclick=async()=>{
    rvault.disabled=true; rvault.textContent='…';
    try{
      const remote=await Sync.fetchVault();
      if(!remote?.blob){ toast('No backup on the account yet — open the app on your phone for a minute so it can upload.'); }
      else {
        modal('<h2>Restore from account?</h2><p class="muted">This replaces what is on <b>this</b> device with the cloud backup (usually your phone). You cannot undo it from here.</p>','Restore',()=>{ Sync.applyVault(remote.blob, remote.updatedAt); render(); toast('Restored from account'); friendsTick(); });
      }
    }catch(e){ toast(e.message||'Could not reach backup'); }
    finally{ rvault.disabled=false; rvault.textContent='Restore from account'; }
  };
  const bn=q('#backupnow'); if(bn) bn.onclick=async()=>{
    bn.disabled=true; bn.textContent='…';
    try{ await Sync.backup(); toast(S.syncError||'Backup saved'); render(); }
    catch(e){ toast(e.message||'Backup failed'); }
    finally{ bn.disabled=false; bn.textContent='Backup now'; }
  };
  const rn=q('#renameme'); if(rn) rn.onclick=()=>prompt$('Your name',me().name||'',async v=>{ await Sync.rename(v); render(); });
  const ci=q('#clearinbox'); if(ci) ci.onclick=()=>{ S.inbox=[]; save(); render(); };
  const avp=q('#avpick'), avf=q('#avfile');
  if(avp&&avf){ avp.onclick=()=>{
      const o=overlay(`<div class="modal"><h2>Your picture</h2>
        <div class="stack" style="margin-top:12px">
          <button class="btn primary block" data-mkchar>Build a character</button>
          <button class="btn block" data-mkphoto>Use an image</button>
          ${avatarOf(me())?`<button class="btn block danger" data-mkclear>Remove the image</button>`:''}
        </div>
        <p class="tiny muted" style="margin-top:10px">An image overrides your character. Remove it to go back.</p>
        <div style="display:flex;gap:10px;margin-top:16px"><button class="btn" style="flex:1" data-x>Cancel</button></div></div>`,'center');
      o.querySelector('[data-x]').onclick=()=>close(o);
      o.querySelector('[data-mkchar]').onclick=()=>{ close(o); charSheet(); };
      o.querySelector('[data-mkphoto]').onclick=()=>{ close(o); avf.click(); };
      const mc=o.querySelector('[data-mkclear]'); if(mc) mc.onclick=async()=>{ close(o); await setMyAvatar(null); render(); toast('Image removed'); };
    };
    avf.onchange=async()=>{ const f=avf.files?.[0]; if(!f) return;
      try{ const d=await fileToAvatar(f); await setMyAvatar(d); haptic('success'); render(); toast('Picture set'); }
      catch(e){ toast(e.message||'Could not use that image'); }
      avf.value=''; }; }
  const avc=q('#avclear'); if(avc) avc.onclick=async()=>{ await setMyAvatar(null); haptic(); render(); toast('Picture removed'); };
  const cc=q('#copycode'); if(cc) cc.onclick=()=>{ navigator.clipboard?.writeText(me().code); toast('Code copied'); };
  const af=q('#addfriend'); if(af){ const add=async()=>{ const v=q('#addcode').value.trim(); if(!v) return; af.disabled=true; af.textContent='…';
      try{ const f=await Sync.addByCode(v); haptic('success'); render(); toast(`${f.name} added`); }
      catch(e){ af.disabled=false; af.textContent='Add'; toast(e.message||'Could not add that code'); } };
    af.onclick=add; q('#addcode').onkeydown=e=>{if(e.key==='Enter')add();}; }
  qa('[data-unfriend]').forEach(b=>b.onclick=()=>{ const f=S.friends[b.dataset.unfriend];
    modal(`<h2>Remove ${esc(f.name)}?</h2><p class="muted">Your shared streak goes with it. If they're on a challenge, they leave it.</p>`,'Remove',async()=>{ await Sync.removeFriend(f.id); render(); toast('Removed'); },true); });
  const sc=q('#startchal'); if(sc) sc.onclick=()=>startChallengeModal();
  qa('[data-friend]').forEach(b=>b.onclick=()=>{ const f=S.friends[b.dataset.friend]; if(f) friendSheet(f); });
  const sn2=q('#syncnow'); if(sn2) sn2.onclick=async()=>{ sn2.textContent='…';
    try{
      await Sync.pushCrews().catch(()=>{});
      await Promise.all(chalList().map(c=>Sync.pushChallenge(c).catch(()=>{})));
      await Sync.pull(); await Sync.pullCrews(); await Sync.pullChallenges(); await Sync.pullMessages();
    }catch(e){}
    try{
      if(navigator.serviceWorker){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.update()));
        if(window.caches){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
      }
    }catch(e){}
    toast(S.syncError?S.syncError:`Friends synced · build ${BUILD}`);
    setTimeout(()=>location.reload(),600);
  };
  const ol=q('#openlooks'); if(ol) ol.onclick=()=>charSheet();
  qa('[data-crew]').forEach(b=>b.onclick=()=>chatView(b.dataset.crew));
  const nc=q('#newcrew'); if(nc) nc.onclick=()=>crewSheet(null);
  qa('[data-chest]').forEach(b=>b.onclick=()=>{ const win=claimChest(b.dataset.chest); if(win) chestScene(win); else toast('Not ready yet'); });
  qa('[data-dropchal]').forEach(b=>b.onclick=()=>{
    const ch=liveQuest(chalList().find(c=>c.id===b.dataset.dropchal)||{});
    modal(`<h2>Drop ${esc(ch?.name||'this challenge')}?</h2><p class="muted">No chest, no penalty. The slot frees up. Starting it again resets the timer.</p>`,'Drop',()=>{ dropChallenge(b.dataset.dropchal); render(); toast('Challenge dropped'); },true);
  });
  qa('[data-cheer]').forEach(b=>b.onclick=async()=>{ const f=S.friends[b.dataset.cheer]; const kind=b.dataset.kind;
    b.disabled=true; await Sync.cheer(f,kind); haptic('success'); render();
    toast(S.syncError ? S.syncError : (kind==='cheer'?`Cheer sent to ${f.name}`:`Nudge sent to ${f.name}`)); });
  qa('[data-recap]').forEach(b=>b.onclick=()=>{ const key=b.dataset.recap;
    const r=S.recaps.find(x=>String(x.week||x.n)===key); if(r) recapView(r,false); });
  qa('[data-sub]').forEach(b=>b.onclick=()=>{progState.sub=b.dataset.sub; progState.taskId=null; haptic();render();window.scrollTo({top:0});});
  qa('[data-opentask]').forEach(b=>b.onclick=()=>{ progState.taskId=b.dataset.opentask; progState.sub='tasks'; haptic(); render(); window.scrollTo({top:0}); });
  qa('[data-taskback]').forEach(b=>b.onclick=()=>{ progState.taskId=null; progState.sub='tasks'; haptic(); render(); window.scrollTo({top:0}); });
  qa('[data-day]').forEach(b=>b.onclick=()=>{progState.sel=b.dataset.day;render();});
  qa('[data-tday]').forEach(b=>b.onclick=()=>{ const [id,dk]=b.dataset.tday.split('|');
    taskState.sel[id]=taskState.sel[id]===dk?null:dk; if(!taskState.month[id]) taskState.month[id]=dk.slice(0,7); haptic(); render(); });
  qa('[data-tmonth]').forEach(b=>b.onclick=()=>{ const [id,step]=b.dataset.tmonth.split('|');
    const cur=taskState.month[id]||today().slice(0,7); const [y,m]=cur.split('-').map(Number);
    const d=new Date(y,m-1+Number(step),1); taskState.month[id]=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
    taskState.sel[id]=null; haptic(); render(); });
  qa('[data-month]').forEach(b=>b.onclick=()=>{const [y,m]=progState.month.split('-').map(Number);const d=new Date(y,m-1+Number(b.dataset.month),1);progState.month=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;render();});
  qa('[data-jump]').forEach(b=>b.onclick=()=>{progState.month=b.dataset.jump;render();});
  qa('[data-range]').forEach(b=>b.onclick=()=>{progState.range=b.dataset.range;render();});
  const dn=q('#daynote'); if(dn) dn.oninput=()=>{ const k=dn.dataset.noteday||today(); day(k).note=dn.value; save(); };
  // Shop
  qa('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy));
  const pe=q('#placeextras'); if(pe) pe.onclick=()=>offerChestExtras();
  qa('[data-use]').forEach(b=>b.onclick=()=>{const x=S.locker.find(l=>l.id===b.dataset.use); x.usedAt=today(); save(); haptic(); render(); toast('Enjoy it.');});
  // Settings — tasks
  const nt=q('#newtask'); const addT=()=>{ const v=nt.value.trim(); if(!v) return;
    if(S.tasks.filter(t=>!t.archived).length>=MAX_TASKS){ toast("That's the "+MAX_TASKS+" task cap."); return; }
    const tg=clamp(Math.round(Number(q('#newtarget').value)||0),0,600);
    S.tasks.push({id:uid(),name:v,createdAt:today(),order:S.tasks.length,archived:false,target:tg||null}); save(); haptic(); render(); document.getElementById('acc-tasks').open=true; document.getElementById('newtask')?.focus();
    toast('Task added'); };
  if(nt){ q('#addtask').onclick=addT; nt.onkeydown=e=>{if(e.key==='Enter')addT();}; q('#newtarget').onkeydown=e=>{if(e.key==='Enter')addT();}; }
  qa('[data-rename]').forEach(b=>b.onclick=()=>{const t=S.tasks.find(x=>x.id===b.dataset.rename); editTask(t);});
  qa('[data-deltask]').forEach(b=>b.onclick=()=>{const t=S.tasks.find(x=>x.id===b.dataset.deltask); modal(`<h2>Remove “${esc(t.name)}”?</h2><p class="muted">It leaves today’s list. Past days stay in Progress.</p>`,'Remove',()=>{t.archived=true;t.archivedAt=today();delete (S.days[today()]?.tasks||{})[t.id];save();render();document.getElementById('acc-tasks').open=true;toast('Removed');},true);});
  // rewards
  qa('[data-tier]').forEach(b=>b.onclick=()=>{qa('[data-tier]').forEach(x=>x.classList.remove('on'));b.classList.add('on');});
  const nw=q('#newwhy'); if(nw){ const add=()=>{const v=nw.value.trim(); if(!v) return; const now=Date.now(); S.whys.push({id:uid(),text:v,createdAt:now,touchedAt:now}); save(); haptic(); render(); document.getElementById('newwhy')?.focus();};
    q('#addwhy').onclick=add; nw.onkeydown=e=>{ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){ e.preventDefault(); add(); } }; }
  const asearch=q('#affsearch'); if(asearch){ asearch.oninput=()=>{ planState.affQ=asearch.value; render(); const el=document.getElementById('affsearch'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }; }
  qa('[data-afftog]').forEach(b=>b.onclick=e=>{
    if(e.target.closest('[data-delwhy]')) return;
    e.preventDefault(); e.stopPropagation();
    const id=b.dataset.afftog;
    if(planState.editAff===id) return;
    if(planState.openAff===id){ planState.openAff=null; planState.editAff=null; }
    else { planState.openAff=id; planState.editAff=null; planState.openNote=planState.editNote=null; }
    haptic(); render();
  });
  qa('[data-affbody]').forEach(b=>b.onclick=e=>{
    if(planState.editAff===b.dataset.affbody) return;
    if(e.target.closest('button,textarea,input,a')) return;
    planState.openAff=null; planState.editAff=null; haptic(); render();
  });
  qa('[data-affeditbtn]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation();
    planState.openAff=b.dataset.affeditbtn; planState.editAff=b.dataset.affeditbtn; haptic(); render();
    setTimeout(()=>document.querySelector(`[data-affedit="${b.dataset.affeditbtn}"]`)?.focus(),40); });
  qa('[data-affsave]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation();
    const id=b.dataset.affsave; const w=S.whys.find(x=>x.id===id); if(!w) return;
    const ta=document.querySelector(`[data-affedit="${id}"]`);
    const v=(ta?.value||'').trim(); if(!v){ toast('Write something first'); return; }
    w.text=v; touchWhy(w); planState.editAff=null; haptic('success'); render(); toast('Saved'); });
  qa('[data-affcancel]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); planState.editAff=null; haptic(); render(); });
  qa('[data-touchwhy]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); const w=S.whys.find(x=>x.id===b.dataset.touchwhy); if(!w) return; touchWhy(w); haptic(); render(); });
  qa('[data-delwhy]').forEach(b=>b.onclick=e=>{ e.preventDefault(); e.stopPropagation();
    if(planState.openAff===b.dataset.delwhy){ planState.openAff=null; planState.editAff=null; }
    S.whys=S.whys.filter(w=>w.id!==b.dataset.delwhy); save(); render(); });
  const nr=q('#newreward'); const np=q('#newprice');
  const refreshEta=()=>{ const eta=q('#priceeta'); if(!eta||!np) return; const n=Math.round(Number(np.value)||0);
    if(!n){ eta.textContent='Type a price — days are from a clear of the tasks you have set.'; return; }
    if(n<MIN_REWARD_PRICE){ eta.textContent='Minimum '+MIN_REWARD_PRICE+' coins so nothing is free.'; return; }
    eta.textContent=earnEta(n); };
  const ra2=q('#acc-rewards'); if(ra2) ra2.addEventListener('toggle',()=>{ rewOpen=ra2.open; });
  if(np) np.oninput=refreshEta;
  qa('[data-freq]').forEach(b=>b.onclick=()=>{ newRewardFreq=b.dataset.freq;
    const keep=(nr?.value||''); haptic(); rewOpen=true; render();
    const n2=document.getElementById('newreward'); if(n2) n2.value=keep; });
  const nper=q('#newper'); if(nper) nper.oninput=()=>{ newRewardPer=clamp(Math.round(Number(nper.value)||1),1,MAX_PER_MONTH);
    const np2=document.getElementById('newprice'); if(np2){ np2.value=suggestFromFreq('custom',null,newRewardPer); }
    refreshEta(); };
  const rb=q('[data-rebalance]'); if(rb) rb.onclick=()=>rebalanceSheet();
  const addR=()=>{ const v=(nr?.value||'').trim(); if(!v||S.rewards.filter(x=>x.active).length>=MAX_REWARDS) return;
    let price=Math.round(Number(np?.value)||0); if(!price) price=suggestFromFreq(newRewardFreq,null,newRewardPer);
    if(price<MIN_REWARD_PRICE){ toast('Minimum '+MIN_REWARD_PRICE+' coins'); return; }
    const rec={id:uid(),name:v,active:true,tier:'custom',price,freq:newRewardFreq};
    if(newRewardFreq==='custom') rec.perMonth=clamp(Math.round(Number(q('#newper')?.value)||newRewardPer),1,MAX_PER_MONTH);
    S.rewards.push(rec); save(); haptic(); rewOpen=true; render();
    const b=budgetState();
    if(pendingExtras().length){ toast('Reward added · place your chest extra'); queueMicrotask(()=>offerChestExtras()); }
    else if(b.level==='over') toast('Over budget — tap Balance these for me','Balance',()=>rebalanceSheet());
    else toast('Reward added'); };
  if(nr){ q('#addreward').onclick=addR; nr.onkeydown=e=>{if(e.key==='Enter')addR();}; if(np) np.onkeydown=e=>{if(e.key==='Enter')addR();}; }
  qa('[data-editreward]').forEach(b=>b.onclick=()=>{ const r=S.rewards.find(x=>x.id===b.dataset.editreward); if(r) editReward(r); });
  qa('[data-delreward]').forEach(b=>b.onclick=()=>{const x=S.rewards.find(r=>r.id===b.dataset.delreward);x.active=false;save();render();document.getElementById('acc-rewards').open=true;});
  // quotes
  // look
  const keepLook=()=>{ const acc=document.getElementById('acc-look'); if(acc) acc.open=true; };
  qa('[data-set]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.set, v=b.dataset.val||null;
    S.settings[k]=v;
    if(k==='mode' && S.settings.ink){
      const L=luminance(S.settings.ink);
      if(isDarkMode()? L<0.45 : L>0.28) S.settings.ink=null;
    }
    save(); applyTheme(); haptic(); render(); keepLook();
  });
  const ca=q('#customink'); if(ca) ca.oninput=()=>{S.settings.ink=ca.value;save();applyTheme();}; if(ca) ca.onchange=()=>{render();keepLook();};
  qa('[data-toggle]').forEach(b=>b.onclick=()=>{S.settings[b.dataset.toggle]=!S.settings[b.dataset.toggle];save();applyTheme();haptic();render();keepLook();});
  qa('[data-size]').forEach(b=>b.onclick=()=>{S.settings.textSize=clamp(S.settings.textSize+Number(b.dataset.size),80,130);save();applyTheme();render();keepLook();});
  const rl=q('#resetlook'); if(rl) rl.onclick=()=>{S.settings=fresh().settings;save();applyTheme();render();keepLook();toast('Customise reset');};
  const runCheck=async(btn)=>{ const old=btn.textContent; btn.textContent='…';
    const L=await connectionReport(); btn.textContent=old;
    modal(`<h2>Connection check</h2><ul class="list" style="margin-top:8px">${L.map(([k,v])=>`<li><span class="small muted">${esc(k)}</span><span class="small" style="text-align:right;max-width:62%">${esc(v)}</span></li>`).join('')}</ul>`,'Copy',()=>{
      navigator.clipboard?.writeText(L.map(([k,v])=>k+': '+v).join('\n')); toast('Copied'); }); };
  const ck=q('#conncheck'); if(ck) ck.onclick=()=>runCheck(ck);
  const ck2=q('#conncheck2'); if(ck2) ck2.onclick=()=>runCheck(ck2);
  const keepRem=()=>{ const a=document.getElementById('acc-remind'); if(a) a.open=true; };
  const ra=q('#acc-remind'); if(ra) ra.addEventListener('toggle',()=>{ remOpen=ra.open; });
  const an=q('#asknotify'); if(an) an.onclick=async()=>{ an.textContent='…';
    const r=await askNotify(); render(); keepRem();
    toast(r==='granted'?'Reminders on':r==='denied'?'Blocked in your browser settings':'Not enabled'); };
  const ro=q('[data-remind-on]'); if(ro) ro.onclick=async()=>{ const c=remindCfg(); c.on=!c.on; save(); haptic();
    if(c.on && notifyState()==='default'){ await askNotify(); }
    render(); keepRem(); };
  const rc=q('#recheck'); if(rc) rc.onclick=()=>{ render(); keepRem();
    toast(notifyState()==='granted'?'Working now':'Still blocked in the browser'); };
  const raf=q('[data-remind-aff]'); if(raf) raf.onclick=()=>{ const c=remindCfg(); c.affOn=!c.affOn; save(); haptic(); render(); keepRem(); };
  const rav=q('#remaff'); if(rav) rav.onchange=()=>{ remindCfg().aff=rav.value; save(); subscribePush().catch(()=>{}); toast('Affirmation time set'); };
  const rtd=q('[data-remind-todos]'); if(rtd) rtd.onclick=()=>{ const c=remindCfg(); c.todos=c.todos===false; save(); haptic(); render(); keepRem(); };
  const re=q('[data-remind-eve]'); if(re) re.onclick=()=>{ const c=remindCfg(); c.eveningOn=!c.eveningOn; save(); haptic(); render(); keepRem(); };
  const rm=q('#remmorning'); if(rm) rm.onchange=()=>{ remindCfg().morning=rm.value; save(); subscribePush().catch(()=>{}); toast('Morning nudge set'); };
  const rv=q('#remevening'); if(rv) rv.onchange=()=>{ remindCfg().evening=rv.value; save(); subscribePush().catch(()=>{}); toast('Evening nudge set'); };
  const ii=q('[data-iosinstall]'); if(ii) ii.onclick=()=>iosInstallSheet();
  const rp=q('#replay'); if(rp) rp.onclick=()=>{S.flags.tours={};save();setTab('today');};
  const rob=q('#replayonb'); if(rob) rob.onclick=()=>{ haptic(); onboarding(()=>{ render(); toast('Setup replayed'); }, true); };
  const ex=q('#export'); if(ex) ex.onclick=()=>{const a=document.createElement('a');a.href='data:application/json,'+encodeURIComponent(JSON.stringify(S,null,2));a.download=`steady-${today()}.json`;a.click();};
  const wp=q('#wipe'); if(wp) wp.onclick=()=>modal('<h2>Erase everything?</h2><p class="muted">Tasks, history, points and rewards. This cannot be undone.</p>','Erase',()=>{localStorage.removeItem(KEY);location.reload();},true);
}
function updateConfirm(){
  const bar=document.getElementById('confirmbar'), btn=document.getElementById('confirmbtn');
  const n=sel.size; bar.classList.toggle('show',n>0&&tab==='today'); document.body.classList.toggle('has-confirm',n>0&&tab==='today');
  btn.textContent=n>1?`Mark ${n} done`:'Mark done'; btn.onclick=()=>{ haptic('heavy'); const timed=[...sel].map(id=>S.tasks.find(t=>t.id===id)).filter(t=>t?.target); timed.length?timeSheet(timed):completeSelected(); };
}

/* ---------- Modal & sheet ---------- */
function overlay(html,cls=''){ const o=document.createElement('div'); o.className='overlay '+cls; o.innerHTML=html; document.body.appendChild(o); requestAnimationFrame(()=>o.classList.add('show')); return o; }
function close(o){ o.classList.remove('show'); setTimeout(()=>o.remove(),250); }
function modal(html,ok,fn,danger){
  const o=overlay(`<div class="modal">${html}<div class="foot" style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn ${danger?'danger':'primary'}" style="flex:1" data-ok>${esc(ok)}</button></div></div>`,'center');
  o.querySelector('[data-x]').onclick=()=>close(o); o.onclick=e=>{if(e.target===o)close(o)}; o.querySelector('[data-ok]').onclick=()=>{close(o);fn();};
}
function prompt$(titleTxt,val,fn){
  const o=overlay(`<div class="modal"><h2>${esc(titleTxt)}</h2><input type="text" id="pv" value="${esc(val)}" style="margin-top:12px" maxlength="60"><div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok>Save</button></div></div>`,'center');
  const i=o.querySelector('#pv'); setTimeout(()=>{i.focus();i.select();},100);
  o.querySelector('[data-x]').onclick=()=>close(o); const ok=()=>{const v=i.value.trim();if(v){close(o);fn(v);}}; o.querySelector('[data-ok]').onclick=ok; i.onkeydown=e=>{if(e.key==='Enter')ok();};
}

function editTask(t){
  let cad=taskCadence(t);
  let wdays=taskWeekdays(t).length?taskWeekdays(t):[parse(today()).getDay()];
  const cadHint=()=>cad==='everyOther'?'Due today, then every other day. Off days skip the list and do not count as misses.'
    :cad==='weekdays'?'Only on the days you pick. Other days skip the list and do not count as misses.'
    :'Shows up every day.';
  const wdChips=()=>WD_ORDER.map(d=>`<button type="button" class="chip ${wdays.includes(d)?'on':''}" data-wd="${d}">${WD_SHORT[d]}</button>`).join('');
  const o=overlay(`<div class="modal"><h2>Edit task</h2><div class="stack" style="margin-top:12px"><input type="text" id="en" value="${esc(t.name)}" maxlength="60">
    <div class="row"><input type="number" id="et" value="${t.target||''}" placeholder="Target minutes (optional)" min="1" max="600" style="flex:1;padding:12px 14px"><button class="btn sm" id="eclear">Clear</button></div>
    <p class="tiny muted">With a target set, you'll be asked how long it took each time you tick it off.</p>
    <div><span class="plabel">How often</span>
      <div class="chips" id="ecad" style="margin-top:8px">
        <button type="button" class="chip ${cad==='daily'?'on':''}" data-cad="daily">Daily</button>
        <button type="button" class="chip ${cad==='everyOther'?'on':''}" data-cad="everyOther">Every other day</button>
        <button type="button" class="chip ${cad==='weekdays'?'on':''}" data-cad="weekdays">Days of week</button>
      </div>
      <div class="chips" id="ewdays" style="margin-top:8px;${cad==='weekdays'?'':'display:none'}">${wdChips()}</div>
      <p class="tiny muted" style="margin-top:8px" id="ecadhint">${cadHint()}</p>
    </div></div>
    <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok>Save</button></div></div>`,'center');
  const refreshWd=()=>{ const box=o.querySelector('#ewdays'); if(box) box.innerHTML=wdChips(); bindWd(); };
  const bindWd=()=>{
    o.querySelectorAll('[data-wd]').forEach(b=>b.onclick=()=>{
      const d=+b.dataset.wd; haptic();
      if(wdays.includes(d)){
        if(wdays.length<=1){ toast('Pick at least one day'); return; }
        wdays=wdays.filter(x=>x!==d);
      } else {
        wdays=[...wdays,d].sort((a,b)=>a-b);
      }
      refreshWd();
    });
  };
  o.querySelector('#eclear').onclick=()=>{o.querySelector('#et').value='';};
  o.querySelectorAll('[data-cad]').forEach(b=>b.onclick=()=>{
    cad=b.dataset.cad; haptic();
    o.querySelectorAll('[data-cad]').forEach(x=>x.classList.toggle('on',x.dataset.cad===cad));
    const box=o.querySelector('#ewdays');
    if(box) box.style.display=cad==='weekdays'?'':'none';
    if(cad==='weekdays' && !wdays.length) wdays=[parse(today()).getDay()];
    if(cad==='weekdays') refreshWd();
    const h=o.querySelector('#ecadhint');
    if(h) h.textContent=cadHint();
  });
  bindWd();
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelector('[data-ok]').onclick=()=>{ const n=o.querySelector('#en').value.trim(); if(!n) return; t.name=n;
    const tg=clamp(Math.round(Number(o.querySelector('#et').value)||0),0,600); t.target=tg||null;
    const prev=taskCadence(t);
    if(cad==='weekdays' && !wdays.length){ toast('Pick at least one day'); return; }
    t.cadence=cad;
    if(cad==='everyOther' && (prev!=='everyOther' || !t.cadenceAnchor)) t.cadenceAnchor=today();
    if(cad!=='everyOther') delete t.cadenceAnchor;
    if(cad==='weekdays') t.weekdays=[...wdays].sort((a,b)=>a-b);
    else delete t.weekdays;
    save(); close(o); render(); document.getElementById('acc-tasks').open=true; };
}


function editReward(r){
  const cur=rewardPrice(r);
  const sp=suggestedPrices();
  const o=overlay(`<div class="modal"><h2>Price for “${esc(r.name)}”</h2>
    <div style="margin-top:12px"><span class="plabel">How often</span>
      <div class="chips" id="efreq">${FREQS.map(f=>`<button type="button" class="chip ${rewardFreq(r)===f.id?'on':''}" data-ef="${f.id}">${f.label}</button>`).join('')}</div>
      <div class="row" id="eperwrap" style="align-items:center;gap:8px;margin-top:8px;${rewardFreq(r)==='custom'?'':'display:none'}">
        <input type="number" id="eper" min="1" max="${MAX_PER_MONTH}" step="1" value="${Math.round(perMonthOf(r))}" style="width:78px;padding:10px 8px;text-align:center">
        <span class="small muted">times a month</span></div></div>
    <input type="number" id="ep" value="${cur}" min="${MIN_REWARD_PRICE}" step="10" style="margin-top:12px">
    <div class="chips" style="margin-top:10px"><button type="button" class="chip" data-epreset="${sp.week}">A week · ${sp.week}</button><button type="button" class="chip" data-epreset="${sp.fortnight}">A fortnight · ${sp.fortnight}</button></div>
    <p class="tiny muted" id="eeta" style="margin-top:10px">${earnEta(cur)}</p>
    <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok>Save</button></div></div>`,'center');
  const i=o.querySelector('#ep'); const eta=o.querySelector('#eeta');
  let ef=rewardFreq(r);
  const eperWrap=o.querySelector('#eperwrap'), eper=o.querySelector('#eper');
  const epv=()=>clamp(Math.round(Number(eper?.value)||1),1,MAX_PER_MONTH);
  o.querySelectorAll('[data-ef]').forEach(b=>b.onclick=()=>{ ef=b.dataset.ef;
    o.querySelectorAll('[data-ef]').forEach(x=>x.classList.toggle('on',x===b));
    if(eperWrap) eperWrap.style.display = ef==='custom' ? '' : 'none';
    const others=S.rewards.filter(x=>x.active&&x.id!==r.id);
    o.querySelector('#ep').value=suggestFromFreq(ef,others,epv()); upd(); haptic(); });
  if(eper) eper.oninput=()=>{ const others=S.rewards.filter(x=>x.active&&x.id!==r.id);
    o.querySelector('#ep').value=suggestFromFreq('custom',others,epv()); upd(); };
  const upd=()=>{ const n=Math.round(Number(i.value)||0); eta.textContent=n<MIN_REWARD_PRICE?('Minimum '+MIN_REWARD_PRICE+' coins'):earnEta(n); };
  i.oninput=upd;
  o.querySelectorAll('[data-epreset]').forEach(b=>b.onclick=()=>{ i.value=b.dataset.epreset; o.querySelectorAll('[data-epreset]').forEach(x=>x.classList.toggle('on',x===b)); upd(); });
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelector('[data-ok]').onclick=()=>{
    const n=Math.max(MIN_REWARD_PRICE, Math.round(Number(i.value)||0));
    if(n<cur){
      close(o);
      const instant=S.points.coins>=n && S.points.coins<cur;
      modal(`<h2>Lower the price?</h2><p class="muted">${esc(r.name)} from ${cur} to ${n} coins.${instant?' You will be able to buy it immediately.':''}</p>`,'Lower it',()=>{ r.price=n; r.tier='custom'; r.freq=ef; if(ef==='custom') r.perMonth=epv(); else delete r.perMonth; save(); rewOpen=true; render(); });
      return;
    }
    r.price=n; r.tier='custom'; r.freq=ef; if(ef==='custom') r.perMonth=epv(); else delete r.perMonth; save(); close(o); rewOpen=true; render();
  };
}

function promptDate(titleTxt,val,fn){
  const o=overlay(`<div class="modal"><h2>${esc(titleTxt)}</h2><input type="date" id="pd" value="${val}" min="${today()}" style="margin-top:12px;width:100%;padding:12px 14px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--surface2)">
    <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok>Set</button></div></div>`,'center');
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelector('[data-ok]').onclick=()=>{ const v=o.querySelector('#pd').value; close(o); if(v) fn(v); };
}
function moveSheet(t){
  const opts=[['Today',today()],['Tomorrow',addDays(today(),1)],[whenLabel(addDays(today(),2)),addDays(today(),2)],['Next week',addDays(today(),7)],['Someday',null]];
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>Move “${esc(t.text)}”</h2><p class="muted small" style="margin-bottom:14px">Currently ${whenLabel(t.day).toLowerCase()}.</p>
    <div class="chips">${opts.map((x,i)=>`<button class="chip" data-mv="${i}">${esc(x[0])}</button>`).join('')}<button class="chip add" data-mvpick>Pick a date</button></div>
    <div class="row" style="margin-top:12px;align-items:center;gap:8px"><input type="time" id="mvat" value="${t.at||''}" style="width:126px"><span class="tiny muted">time (optional)</span><button class="btn sm" id="mvatsave">Set</button></div>
    <div class="foot"><button class="btn" data-x>Cancel</button></div></div>`);
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{ setTodoDay(t.id,opts[b.dataset.mv][1]); close(o); haptic(); render(); });
  o.querySelector('[data-mvpick]').onclick=()=>{ close(o); promptDate('When?',t.day&&t.day>today()?t.day:addDays(today(),2),d=>{ setTodoDay(t.id,d); haptic(); render(); }); };
  o.querySelector('#mvatsave').onclick=()=>{ setTodoTime(t.id,o.querySelector('#mvat').value||null); haptic(); close(o); render(); toast(t.at?`Reminder at ${t.at}`:'Time cleared'); };
}
function noteEditor(id){
  const n=S.notes.find(x=>x.id===id); if(!n) return;
  migrateNote(n);
  touchNote(n);                                        // opening it counts as using it
  const g=document.createElement('div'); g.className='gate noteedit';
  g.innerHTML=`
    <div class="noteedit-bar">
      <button class="btn ghost sm" data-back>‹ Notes</button>
      <span class="tiny muted" id="nsaved"></span>
      <button class="iconbtn" data-del aria-label="Delete note">${ICON.trash}</button>
    </div>
    <div class="noteedit-head">
      <input type="text" id="ntitle" class="ntitle" placeholder="Title" maxlength="400" value="${esc(n.title||'')}">
      <span class="tiny muted ndate">${fmt(dkey(new Date(n.createdAt)),{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</span>
    </div>
    <textarea id="nbody" class="nbody" placeholder="Write anything…">${esc(n.body||'')}</textarea>`;
  document.body.appendChild(g);

  const ti=g.querySelector('#ntitle'), ta=g.querySelector('#nbody'), st=g.querySelector('#nsaved');
  let t0;
  const flag=()=>{ st.textContent='Saved'; clearTimeout(flag.t); flag.t=setTimeout(()=>st.textContent='',1200); };
  const store=()=>{ n.title=ti.value; n.body=ta.value; touchNote(n); flag(); };
  const queue=()=>{ clearTimeout(t0); t0=setTimeout(store,400); };
  ti.oninput=queue; ta.oninput=queue;
  ti.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); ta.focus(); } };

  const leave=()=>{ clearTimeout(t0); n.title=ti.value; n.body=ta.value;
    if(noteEmpty(n)) dropNote(id); else touchNote(n);
    g.remove(); render(); };
  g.querySelector('[data-back]').onclick=leave;
  g.querySelector('[data-del]').onclick=()=>modal('<h2>Delete this note?</h2><p class="muted">It cannot be recovered.</p>','Delete',()=>{ clearTimeout(t0); dropNote(id); g.remove(); render(); },true);

  setTimeout(()=>{ (n.title||n.body?ta:ti).focus(); },120);
}


/* ---------- Time sheet (timed tasks) ---------- */
function timeSheet(timed, edit){
  const mins={}; timed.forEach(t=>{
    const logged=edit? day(today()).tasks[t.id]?.minutes : null;
    mins[t.id]=logged||t.target;
  });
  const room=()=>{
    let used=overtimeToday();
    if(edit) timed.forEach(t=>{ used-=(day(today()).tasks[t.id]?.bonus||0); });
    return OT_DAY_CAP-used;
  };
  const opts=t=>{
    const tg=t.target;
    const under=[Math.max(1,Math.round(tg/2)), Math.max(1,tg-10), Math.max(1,tg-5)]
      .filter(v=>v<tg).filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b);
    const over=[tg+5,tg+10,tg+15,tg+30];
    return [...under, tg, ...over];
  };
  const card=t=>{ const list=opts(t); let ti=list.indexOf(mins[t.id]);
    const extra=ti<0&&mins[t.id]?`<button class="chip on" data-m="${mins[t.id]}">${mins[t.id]}m</button>`:'';
    if(ti<0) ti=-1;
    return `<div class="card" style="padding:14px" data-time="${t.id}"><div class="row between"><b>${esc(t.name)}</b><span class="small muted" data-out>target ${t.target}m</span></div>
    <div class="timerow">${list.map((m,i)=>`<button class="chip ${i===ti?'on':''}" data-m="${m}">${m}m</button>`).join('')}${extra}<button class="chip add" data-other>Other</button></div></div>`; };
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>${edit?(timed.length===1?'Update time':'Update times'):`How long did ${timed.length===1?'it':'each'} take?`}</h2><p class="muted small" style="margin-bottom:14px">${edit?'Coins move by the difference. Still done either way.':'Still counts as done either way — a short session just pays less of the coins. Over the target pays +1 per '+OT_PER+' minutes on top.'}</p><p class="small" style="color:var(--accent);margin-bottom:12px" data-cap hidden>Daily time bonus capped at +${OT_DAY_CAP} — extra minutes past this won't add more.</p><div class="stack">${timed.map(card).join('')}</div><div class="foot"><button class="btn" data-skip>${edit?'Cancel':'Skip'}</button><button class="btn primary" data-ok>${edit?'Save':'Mark done'}</button></div></div>`);
  const refresh=()=>{ let left=room();
    timed.forEach(t=>{ const c=o.querySelector(`[data-time="${t.id}"] [data-out]`); const raw=overtimeFor(t,mins[t.id]); const b=clamp(raw,0,Math.max(0,left)); left-=b;
      const pay=paidValue(t,mins[t.id]);
      c.innerHTML=b?`<span class="otval">+${pay+b}</span> coins`
        :mins[t.id]<t.target?`<span class="otval">+${pay}</span> coins <span class="tiny muted">of ${taskValue(t)}</span>`
        :`<span class="otval">+${pay}</span> coins`; });
    if(!edit) o.querySelector('[data-ok]').textContent=sel.size>1?`Mark ${sel.size} done`:'Mark done';
    const cap=o.querySelector('[data-cap]'); if(cap) cap.hidden=left>0; };
  timed.forEach(t=>{ const el=o.querySelector(`[data-time="${t.id}"]`);
    const pick=(m,btn)=>{ el.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); btn?.classList.add('on'); mins[t.id]=m; haptic(); refresh(); };
    el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>pick(Number(b.dataset.m),b));
    el.querySelector('[data-other]').onclick=()=>promptNum('Minutes on “'+t.name+'”',mins[t.id],v=>{ const b=document.createElement('button'); b.className='chip on'; b.textContent=v+'m'; b.dataset.m=v; b.onclick=()=>pick(v,b); el.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); el.querySelector('[data-other]').before(b); mins[t.id]=v; refresh(); });
  });
  o.querySelector('[data-skip]').onclick=()=>{ close(o); if(!edit) completeSelected(); };
  o.querySelector('[data-ok]').onclick=()=>{ close(o); if(edit) timed.forEach(t=>recastDone(t.id,mins[t.id])); else completeSelected(mins); };
  refresh();
}
function promptNum(titleTxt,val,fn){
  const o=overlay(`<div class="modal"><h2>${esc(titleTxt)}</h2><input type="number" id="pv" value="${val}" min="1" max="600" style="margin-top:12px;width:100%;padding:12px 14px"><div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok>Save</button></div></div>`,'center');
  const i=o.querySelector('#pv'); setTimeout(()=>{i.focus();i.select();},100);
  o.querySelector('[data-x]').onclick=()=>close(o);
  const ok=()=>{ const v=clamp(Math.round(Number(i.value)||0),1,600); close(o); fn(v); };
  o.querySelector('[data-ok]').onclick=ok; i.onkeydown=e=>{if(e.key==='Enter')ok();};
}

/* ---------- Yesterday catch-up + miss-why ---------- */
/* Session snooze: Ask me later once per open; cleared when the app is shown again. */
let catchUpSnooze=false;
function yesterdayKey(){ return addDays(today(),-1); }
function yesterdayPending(){ const y=yesterdayKey(); return (S.pendingMisses||[]).filter(p=>p.date===y); }
function olderPending(){ const y=yesterdayKey(); return (S.pendingMisses||[]).filter(p=>p.date<y); }

function catchUpGate(){
  if(document.querySelector('.gate,.overlay')) return false;
  if(catchUpSnooze) return false;
  const y=yesterdayKey();
  let pend=yesterdayPending();
  if(!pend.length) return false;

  const reasons=[...DEFAULT_REASONS,...S.customReasons];
  const cardHtml=p=>{
    const t=S.tasks.find(x=>x.id===p.taskId);
    return `<div class="card catchup-card" style="padding:12px" data-tid="${esc(p.taskId)}" data-date="${esc(p.date)}">
      <div class="row between"><b>${esc(t?.name||'Task')}</b><span class="tiny muted">${fmt(p.date)}</span></div>
      <div class="catchup-acts" data-acts>
        <button class="btn primary" data-did>I did it</button>
        <button class="btn" data-missed>Missed</button>
      </div>
      <div class="catchup-why" data-why hidden>
        <p class="tiny muted" style="margin:10px 0 8px">What got in the way?</p>
        <div class="chips">${reasons.map(r=>`<button class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join('')}<button class="chip add" data-custom>+ Other</button></div>
        <input type="text" placeholder="Or type your own reason" style="margin-top:10px;padding:9px 12px;width:100%" data-c maxlength="120">
        <button class="btn primary block" data-save-miss style="margin-top:10px" disabled>Save</button>
      </div>
    </div>`;
  };

  const o=overlay(`<div class="sheet"><div class="grab"></div>
    <h2>Yesterday — anything you forgot to tick?</h2>
    <p class="muted small" style="margin-bottom:14px">No stress. Mark what you did, or note a miss. Only yesterday — nothing further back.</p>
    <div class="stack" data-list>${pend.map(cardHtml).join('')}</div>
    <div class="foot"><button class="btn ghost" data-later>Ask me later</button></div>
  </div>`);

  const list=o.querySelector('[data-list]');
  const removeCard=(card, note)=>{
    card.remove();
    if(list.querySelectorAll('.catchup-card').length) return;
    close(o); haptic(note?.cleared?'success':'light'); render();
    toast(note?.msg || 'Yesterday sorted.');
    if(note?.cleared && typeof friendsTick==='function') friendsTick();
    if(note?.streakWin) setTimeout(()=>streakScene(note.streakWin),600);
    setTimeout(maybeGates,280);
  };

  list.querySelectorAll('.catchup-card').forEach(card=>{
    const tid=card.dataset.tid, date=card.dataset.date;
    card.querySelector('[data-did]').onclick=()=>{
      const res=completeOnDate(date,tid);
      if(!res){ removeCard(card); return; }
      if(res.already){ dropPending(date,tid); save(); removeCard(card); return; }
      haptic(res.cleared?'success':'light');
      const msg=res.cleared?`Yesterday cleared · +${res.coins}`:`${res.name} · +${res.coins}`;
      if(list.querySelectorAll('.catchup-card').length>1){
        card.remove();
        toast(msg);
        if(res.cleared && typeof friendsTick==='function') friendsTick();
        if(res.streakWin) setTimeout(()=>streakScene(res.streakWin),600);
      } else {
        removeCard(card, {msg, cleared:res.cleared, streakWin:res.streakWin});
      }
    };
    card.querySelector('[data-missed]').onclick=()=>{
      card.querySelector('[data-acts]').hidden=true;
      const why=card.querySelector('[data-why]'); why.hidden=false;
      const picked={}; const saveBtn=card.querySelector('[data-save-miss]');
      const reasonOf=()=>{ const typed=card.querySelector('[data-c]')?.value.trim()||''; return (picked.r||typed||'').trim(); };
      const check=()=>{ saveBtn.disabled=!reasonOf(); };
      card.querySelectorAll('[data-r]').forEach(c=>c.onclick=()=>{
        card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); c.classList.add('on');
        picked.r=c.dataset.r; const inp=card.querySelector('[data-c]'); if(inp) inp.value=''; haptic(); check();
      });
      const inp=card.querySelector('[data-c]');
      if(inp) inp.oninput=()=>{ if(inp.value.trim()){ card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); delete picked.r; } check(); };
      card.querySelector('[data-custom]').onclick=()=>prompt$('What got in the way?','',v=>{
        if(!v) return;
        if(!S.customReasons.includes(v)){ S.customReasons.push(v); save(); }
        const b=document.createElement('button'); b.className='chip on'; b.textContent=v; b.dataset.r=v;
        b.onclick=()=>{ card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); b.classList.add('on'); picked.r=v; if(inp) inp.value=''; check(); };
        card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));
        card.querySelector('[data-custom]').before(b); picked.r=v; if(inp) inp.value=''; check();
      });
      saveBtn.onclick=()=>{
        const reason=reasonOf(); if(!reason) return;
        saveMissReason(date,tid,reason); save(); haptic(); removeCard(card);
      };
    };
  });

  o.querySelector('[data-later]').onclick=()=>{
    catchUpSnooze=true; close(o); haptic();
    toast('OK — ask again later today.');
    setTimeout(maybeGates,280); // older miss reasons can still show
  };
  return true;
}

function missGate(){
  if(document.querySelector('.gate,.overlay')) return false;
  /* Older-than-yesterday only — yesterday goes through catchUpGate (I did it | Missed). */
  const pend=olderPending(); if(!pend.length) return false;
  const reasons=[...DEFAULT_REASONS,...S.customReasons]; const picked={};
  const item=(p,i)=>{const t=S.tasks.find(x=>x.id===p.taskId); return `<div class="card" style="padding:12px" data-miss="${i}"><div class="row between"><b>${esc(t?.name||'Task')}</b><span class="tiny muted">${fmt(p.date)}</span></div><div class="chips" style="margin-top:10px">${reasons.map(r=>`<button class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join('')}<button class="chip add" data-custom>+ Other</button></div><input type="text" placeholder="Or type your own reason" style="margin-top:10px;padding:9px 12px" data-c maxlength="120"></div>`;};
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>${pend.length===1?'One thing slipped':pend.length+' things slipped'}</h2><p class="muted small" style="margin-bottom:14px">No points lost. Pick a chip or type your own — patterns show up in Progress.</p>${pend.length>1?`<div class="chips" style="margin-bottom:12px"><span class="tiny muted" style="align-self:center">Same for all:</span>${reasons.map(r=>`<button class="chip" data-all="${esc(r)}">${esc(r)}</button>`).join('')}</div>`:''}<div class="stack">${pend.map(item).join('')}</div><div class="foot"><button class="btn primary" data-ok disabled>Save</button></div></div>`);
  const okb=o.querySelector('[data-ok]');
  const reasonOf=card=>{ const i=card.dataset.miss; const typed=card.querySelector('[data-c]')?.value.trim()||''; return (picked[i]||typed||'').trim(); };
  const check=()=>{ okb.disabled=[...o.querySelectorAll('[data-miss]')].some(card=>!reasonOf(card)); };
  o.querySelectorAll('[data-miss]').forEach(card=>{ const i=card.dataset.miss;
    card.querySelectorAll('[data-r]').forEach(c=>c.onclick=()=>{card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');picked[i]=c.dataset.r; haptic(); check();});
    const inp=card.querySelector('[data-c]'); if(inp) inp.oninput=()=>{ if(inp.value.trim()){ card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); delete picked[i]; } check(); };
    card.querySelector('[data-custom]').onclick=()=>prompt$('What got in the way?','',v=>{ if(!v) return; if(!S.customReasons.includes(v)){S.customReasons.push(v);save();} const b=document.createElement('button');b.className='chip on';b.textContent=v;b.dataset.r=v;b.onclick=()=>{card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');picked[i]=v; if(inp) inp.value=''; check();}; card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); card.querySelector('[data-custom]').before(b); picked[i]=v; if(inp) inp.value=''; check(); });
  });
  o.querySelectorAll('[data-all]').forEach(a=>a.onclick=()=>{ o.querySelectorAll('[data-all]').forEach(x=>x.classList.remove('on')); a.classList.add('on'); o.querySelectorAll('[data-miss]').forEach(card=>{ card.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x.dataset.r===a.dataset.all)); picked[card.dataset.miss]=a.dataset.all; const inp=card.querySelector('[data-c]'); if(inp) inp.value=''; }); haptic(); check(); });
  okb.onclick=()=>{
    const answered=new Set();
    o.querySelectorAll('[data-miss]').forEach(card=>{
      const i=card.dataset.miss; const p=pend[i]; if(!p) return;
      const reason=reasonOf(card); saveMissReason(p.date,p.taskId,reason); answered.add(p.date+'|'+p.taskId);
    });
    S.pendingMisses=(S.pendingMisses||[]).filter(p=>!answered.has(p.date+'|'+p.taskId));
    save(); close(o); haptic(); render(); toast('Noted. Fresh day.');
  };
  return true;
}

/* ---------- Quote gate ---------- */
function quoteGate(next){
  const a=affirmationToday();
  if(!a||S.flags.quoteDate===today()){ next(); return; }
  const g=document.createElement('div'); g.className='gate';
  g.innerHTML=`<p class="q">${esc(a.text)}<span class="qend">&rdquo;</span></p><div class="actions"><button class="btn primary block" id="startday">Start the day</button></div>`;
  document.body.appendChild(g);
  g.querySelector('#startday').onclick=()=>{ S.flags.quoteDate=today(); save(); haptic(); g.style.transition='opacity .3s'; g.style.opacity=0; setTimeout(()=>{g.remove();next();},300); };
}

/* ---------- Onboarding ---------- */
function onboarding(next, force){
  if(S.flags.onboarded && !force){ next(); return; }
  let step=0; const picks=new Set(); const targets={}; let line='';
  const g=document.createElement('div'); g.className='gate onb'; document.body.appendChild(g);
  const SUG=[['Walk',20],['Read',15],['No phone in bed',0],['Drink 2L water',0],['Tidy up',10],['Stretch',10],['Journal',0],['Study',30]];
  const LAST=2;
  const draw=()=>{
    const steps=`<div class="steps">${[0,1,2].map(i=>`<i class="${i<=step?'on':''}"></i>`).join('')}</div>`;
    const back=step>0?`<button class="btn ghost sm" data-back style="margin-bottom:10px">‹ Back</button>`:'';
    if(step===0) g.innerHTML=`${steps}${back}<h1>Nothing is taken from you.</h1>
      <p>Miss a day and you only lose what you would have earned. No broken streak that punishes you. No debt. No guilt trip from the app.</p>
      <p style="margin-top:12px">Steady’s job is to notice patterns you would not, and to make keeping your word to yourself worth something.</p>
      <div class="actions"><button class="btn primary block" data-n>Got it</button></div>`;
    if(step===1) g.innerHTML=`${steps}${back}<h1>Why are you doing this?</h1>
      <p>Not the goal — the reason underneath it. What is it you actually want out of keeping your word to yourself?</p>
      <textarea id="onbwhy" style="margin-top:16px" maxlength="700" placeholder="e.g. I want to be someone who follows through."></textarea>
      <p class="tiny muted" style="margin-top:10px">This is your affirmation. You'll see it on the opening screen every day, and it sits under Plan → Affirmations where you can change it or add more. On the days you can't be bothered, it's the thing that's meant to catch you.</p>
      <div class="actions"><button class="btn primary block" data-n ${line?'':'disabled'}>Next</button>
        <button class="btn ghost block" data-skipwhy style="margin-top:8px">Skip — I'll write one later</button></div>`;
    if(step===2) g.innerHTML=`${steps}${back}<h1>Pick two or three to start.</h1><p>You can change these any time in Settings. Fewer is better.</p><div class="chips" style="margin-top:18px">${SUG.map(([s,m])=>`<button class="chip ${picks.has(s)?'on':''}" data-p="${esc(s)}" data-mt="${m}">${esc(s)}${m?` <span class="tiny muted">${m}m</span>`:''}</button>`).join('')}</div><div class="row" style="margin-top:14px"><input type="text" id="onbtask" placeholder="Or write your own" maxlength="60"><button class="btn" id="onbadd">Add</button></div><div class="actions"><button class="btn primary block" data-n>${picks.size?`Start with ${picks.size}`:'Start with none for now'}</button></div>`;
    g.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{
      if(step===1) line=(g.querySelector('#onbwhy')?.value||'').trim();
      haptic();
      if(step<LAST){ step++; draw(); } else finish();
    });
    g.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{ if(step===1) line=(g.querySelector('#onbwhy')?.value||'').trim()||line; haptic(); step=Math.max(0,step-1); draw(); });
    g.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{const v=b.dataset.p;if(picks.has(v))picks.delete(v);else{if(picks.size>=MAX_TASKS)return;picks.add(v);targets[v]=Number(b.dataset.mt)||null;}draw();});
    const oa=g.querySelector('#onbadd'); if(oa){ const add=()=>{const v=g.querySelector('#onbtask').value.trim();if(v){if(picks.size>=MAX_TASKS)return;picks.add(v);targets[v]=null;draw();}}; oa.onclick=add; g.querySelector('#onbtask').onkeydown=e=>{if(e.key==='Enter')add();}; }
    const sk=g.querySelector('[data-skipwhy]'); if(sk) sk.onclick=()=>{ line=''; haptic(); step=2; draw(); };
    const ta=g.querySelector('#onbwhy'); if(ta){ const go=g.querySelector('[data-n]'); ta.value=line||''; go.disabled=!ta.value.trim(); ta.oninput=()=>{ go.disabled=!ta.value.trim(); }; setTimeout(()=>ta.focus(),50); }
  };
  const finish=()=>{
    const replaying=!!S.flags.onboarded;
    if(!replaying){
      if(line){ const now=Date.now(); S.whys=[{id:uid(),text:line,createdAt:now,touchedAt:now}]; }
      [...picks].forEach((n,i)=>S.tasks.push({id:uid(),name:n,createdAt:today(),order:i,archived:false,target:targets[n]||null}));
    }
    S.flags.onboarded=true; save(); g.remove(); next();
  };
  draw();
}

/* ---------- Spotlight tour ---------- */
const TOURS={
  today:[['ring','Coins earned today. Each task pays around 10 — more after a few days of slipping, less when that habit is solid.'],['tasks','Tap to pick, confirm below. Timed ones ask how long — and Done today lets you Undo anytime (coins come back) or Edit the minutes.'],['week','Clear 6 of 7 days and a chest lands Monday.'],['coins','Your coin balance. Tap it to jump to the shop.']],
  plan:[['listadd','List, Notes and Affirmations. Add anything for today, a date, or someday — nothing here can be failed.']],
  progress:[['hero','One number: how consistent you have been lately, and which way it is moving.'],['stats','Every figure is compared with the period before it.'],['pattern','Where you actually fall over. Thursdays are rarely a coincidence.']],
  shop:[['balance','Coins to spend. XP fills the level bar and is never spent. The shop stays open — allowances on each reward do the limiting.'],['locker','What you buy lands here. Mark it used when you’ve enjoyed it.']],
  settings:[['tasks','Add, rename or remove tasks.'],['look','Make it yours — theme, designs, font, type size.'],['remind','Optional nudges: morning, evening if anything’s open, and your own affirmations.'],['account','Update app, backup/restore, and sign out live here.']],
  friends:[['fsubs','Three tabs: Friend list, Chats, and Active challenges.'],['code','Add a friend’s code here — pairs both ways. Your code sits underneath to share. Only totals sync, never task names or notes.']],
};
let tourLive=null;
function endTour(markSeen){
  if(!tourLive) return;
  tourLive.spot.remove(); tourLive.card.remove();
  if(markSeen){ S.flags.tours[tourLive.page]=true; save(); }
  tourLive=null;
}
function tour(page){
  if(tourLive) return;                                             // never stack a second walkthrough
  if(S.flags.tours[page]||!TOURS[page]||document.querySelector('.gate,.overlay')) return;
  const steps=TOURS[page].filter(([id])=>$app.querySelector(`[data-tour="${id}"]`)); if(!steps.length) return;
  let i=0; const spot=document.createElement('div'); spot.className='tour-spot'; const card=document.createElement('div'); card.className='tour-card';
  tourLive={page,spot,card};
  document.body.append(spot,card);
  const draw=()=>{ const [id,txt]=steps[i]; const el=$app.querySelector(`[data-tour="${id}"]`); el.scrollIntoView({block:'center',behavior:'smooth'});
    setTimeout(()=>{ const r=el.getBoundingClientRect(); Object.assign(spot.style,{top:r.top-6+'px',left:r.left-6+'px',width:r.width+12+'px',height:r.height+12+'px'});
      card.innerHTML=`<p>${txt}</p><div class="row"><span class="tiny muted">${i+1} of ${steps.length}</span><span class="row"><button class="btn sm ghost" data-skip>Skip</button><button class="btn sm primary" data-next>${i<steps.length-1?'Next':'Got it'}</button></span></div>`;
      const below=r.bottom+180<innerHeight; card.style.top=below?r.bottom+16+'px':''; card.style.bottom=below?'':innerHeight-r.top+16+'px';
      card.querySelector('[data-next]').onclick=()=>{haptic(); if(++i<steps.length) draw(); else end();}; card.querySelector('[data-skip]').onclick=end; },260); };
  const end=()=>{ endTour(true); };
  draw();
}

function iosInstallSheet(){
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>Put Steady on your home screen</h2>
    <p class="muted small" style="margin-bottom:14px">It opens full screen with no browser bar, works offline, and it's the only way iPhone allows reminders.</p>
    <ol class="steps-list">
      <li>Tap the <b>Share</b> button — the square with an arrow coming out of it, at the bottom of Safari.</li>
      <li>Scroll down the list and tap <b>Add to Home Screen</b>.</li>
      <li>Tap <b>Add</b>, top right.</li>
      <li>Open Steady from the new icon, not from Safari.</li>
    </ol>
    <p class="tiny muted" style="margin-top:12px">It has to be Safari — Chrome and Brave on iPhone can't do this bit.</p>
    <div class="foot"><button class="btn" data-later>Not now</button><button class="btn primary" data-done>Done that</button></div></div>`);
  o.querySelector('[data-later]').onclick=()=>close(o);
  o.querySelector('[data-done]').onclick=()=>{ S.flags.iosNudge=today(); save(); close(o); render(); };
}

function budgetCard(){
  const b=budgetState();
  if(!b.active.length) return `<div class="card" style="padding:12px"><b class="small">Your monthly budget</b>
    <p class="tiny muted" style="margin-top:3px">About ${b.income} coins a month${b.real?'':' (estimated until you have a week of history)'}. Add a reward and this shows whether it fits.</p></div>`;
  const msg = b.level==='over'
    ? `That does not fit. Something will have to give — fewer rewards, or rarer ones.`
    : b.level==='tight' ? `That is just about everything you earn. No slack for a chest.`
    : `That fits, with room for challenges.`;
  return `<div class="card budget ${b.level}" style="padding:12px">
    <div class="row between"><b class="small">Your rewards want ${b.spend} a month</b><span class="small" style="color:${b.level==='over'?'var(--danger)':b.level==='tight'?'#f59e0b':'var(--accent)'}">${b.pct}%</span></div>
    <div class="bar quest budgetbar"><i style="width:${clamp(b.pct,0,100)}%"></i></div>
    <p class="tiny muted" style="margin-top:6px">You earn about ${b.income}${b.real?'':' (estimated)'} · ${b.redemptions} redemption${b.redemptions===1?'':'s'} a month · ${msg}</p>
    ${rebalancePlan().length?`<button class="btn sm block" style="margin-top:10px" data-rebalance>Balance these for me</button>`:''}
  </div>`;
}
function rebalanceSheet(){
  const plan=rebalancePlan();
  if(!plan.length){ toast('Already balanced'); return; }
  const b=budgetState();
  const after=plan.reduce((a,x)=>a+x.to*x.per,0)
    + b.active.filter(r=>!plan.some(x=>x.r.id===r.id)).reduce((a,r)=>a+monthlyCostOf(r),0);
  const warn=plan.filter(x=>x.raises&&x.halfway);
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>Rebalance your rewards?</h2>
    <p class="muted small" style="margin-bottom:12px">Frequencies stay exactly as you set them. Only the prices move.</p>
    <ul class="list">${plan.map(x=>`<li><div><div>${esc(x.r.name)}</div><div class="tiny muted">${esc(x.label.toLowerCase())}</div></div>
      <div style="text-align:right"><span class="tiny muted" style="text-decoration:line-through">${x.from}</span>
      <b style="margin-left:8px;color:${x.raises?'var(--danger)':'var(--accent)'}">${x.to}</b></div></li>`).join('')}</ul>
    <p class="tiny muted" style="margin-top:10px">Afterwards: ${Math.round(after)} a month of your ~${b.income}.</p>
    ${warn.length?`<div class="card callout" style="margin-top:10px;padding:12px"><b class="small">Heads up</b>
      <p class="tiny muted" style="margin-top:3px">${warn.map(x=>`You are ${S.points.coins} of ${x.from} into <b>${esc(x.r.name)}</b> — this moves the post to ${x.to}.`).join(' ')}</p></div>`:''}
    <div class="foot"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Apply</button></div></div>`);
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelector('[data-ok]').onclick=()=>{ applyRebalance(plan); haptic('success'); close(o); render();
    const a=document.getElementById('acc-rewards'); if(a) a.open=true; toast('Rebalanced'); };
}

function friendStats(f){
  const p=pairOf(f); const ch=p.chests||[];
  const byTier={common:0,rare:0,legendary:0};
  ch.forEach(c=>{ if(byTier[c.tier]!==undefined) byTier[c.tier]++; });
  const cheersOut=Object.values(S.pairs).length?0:0;
  return {chests:ch.length, coins:ch.reduce((a,c)=>a+(c.amount||0),0), byTier,
    done:(p.done||[]).length, recent:[...ch].reverse().slice(0,8), streak:pairStreak(f)};
}
function friendSheet(f){
  const st=friendStats(f);
  const o=overlay(`<div class="sheet"><div class="grab"></div>
    <div class="row" style="gap:12px;align-items:center">${avatarHtml(f,'big')}
      <div><h2 style="margin:0">${esc(f.name)}</h2><p class="tiny muted">${esc(f.title||'')} · level ${f.level??1} · code ${esc(f.code||'')}</p></div></div>
    <div class="stats" style="margin-top:14px">
      <div class="stat"><b>${st.chests}</b><span>chests together</span></div>
      <div class="stat"><b>${st.coins}</b><span>coins from them</span></div>
      <div class="stat"><b>${st.streak}</b><span>shared streak</span></div>
      <div class="stat"><b>${f.consistency??0}%</b><span>their consistency</span></div>
    </div>
    ${st.chests?`<div class="card" style="margin-top:12px;padding:12px"><b class="small">Chests by tier</b>
      <div style="margin-top:8px">${Object.entries(st.byTier).map(([t,n])=>`<div class="tod"><span class="small" style="color:${TIERS_C[t].colour}">${TIERS_C[t].label}</span>
        <div class="todbar"><i style="width:${clamp(Math.round(100*n/Math.max(1,st.chests)),0,100)}%;background:${TIERS_C[t].colour}"></i></div>
        <span class="tiny muted">${n}</span></div>`).join('')}</div></div>`:
      `<div class="card empty" style="margin-top:12px"><b>No chests yet</b>Start a challenge in a chat and the first one is on its way.</div>`}
    ${st.recent.length?`<details class="fold"><summary><span>Every chest</span><span class="tiny">${st.chests}</span></summary>
      <ul class="list">${st.recent.map(c=>`<li><span><i class="dotc" style="background:${TIERS_C[c.tier].colour}"></i>${esc(c.name||'Challenge')}</span>
        <span class="row" style="gap:10px"><span class="tiny muted">${fmt(c.at,{day:'numeric',month:'short'})}</span><b class="small" style="color:${TIERS_C[c.tier].colour}">+${c.amount}</b></span></li>`).join('')}</ul></details>`:''}
    <p class="tiny muted" style="margin-top:12px">${st.done} challenge${st.done===1?'':'s'} finished together.</p>
    <div class="foot"><button class="btn" data-x>Close</button></div></div>`);
  o.querySelector('[data-x]').onclick=()=>close(o);
}

function forgotSheet(){
  let sent=false;
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>Forgotten your password</h2>
    <div id="fpstep"></div>
    <div class="foot"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Send it</button></div></div>`);
  const step=o.querySelector('#fpstep'), ok=o.querySelector('[data-ok]');
  const drawSend=()=>{
    step.innerHTML=`<p class="muted small" style="margin-bottom:12px">Put in the email you signed up with. You'll get a message with a <b>6-digit code</b> and a link — either will do.</p>
      <input type="email" id="fpmail" placeholder="Email" autocomplete="email" value="${esc(S.me?.email||'')}">
      <div class="card" style="margin-top:12px;padding:12px"><b class="small">If you've lost the email too</b>
        <p class="tiny muted" style="margin-top:4px">Your tasks, history and coins are still on this phone — the account is only the backup. Sign up again with another email and this device carries on as it is. You'd lose the old backup and any pairing, nothing else.</p></div>`;
    ok.textContent='Send it';
  };
  const drawCode=email=>{
    step.innerHTML=`<p class="muted small" style="margin-bottom:12px">Sent to <b>${esc(email)}</b>. Type the 6-digit code from the email below — that works whatever your phone does with the link.</p>
      <input type="text" id="fpcode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-digit code" style="letter-spacing:.3em;text-align:center;font-size:1.2rem">
      <button class="btn ghost block" id="fpresend" style="margin-top:10px">Send another</button>
      <p class="tiny muted" style="margin-top:10px">No code in the email, only a link? Add <b>{{ .Token }}</b> to the Reset Password template in Supabase → Authentication → Email Templates.</p>`;
    ok.textContent='Check code';
    o.querySelector('#fpresend').onclick=async()=>{ try{ await Sync.resetPassword(email); toast('Sent again'); }catch(e){ toast(e.message||'Could not send'); } };
    setTimeout(()=>o.querySelector('#fpcode')?.focus(),100);
  };
  drawSend();
  o.querySelector('[data-x]').onclick=()=>close(o);
  ok.onclick=async()=>{
    if(!sent){
      const em=o.querySelector('#fpmail').value.trim();
      if(!em){ toast('Needs your email'); return; }
      ok.disabled=true; ok.textContent='…';
      try{ await Sync.resetPassword(em); sent=em; ok.disabled=false; drawCode(em); toast('Check your email'); }
      catch(e){ ok.disabled=false; ok.textContent='Send it'; toast(e.message||'Could not send it'); }
      return;
    }
    const code=o.querySelector('#fpcode').value.trim();
    if(code.length<6){ toast('Needs the 6-digit code'); return; }
    ok.disabled=true; ok.textContent='…';
    try{ await Sync.verifyRecoveryCode(sent,code); close(o); newPasswordGate(); }
    catch(e){ ok.disabled=false; ok.textContent='Check code'; toast(e.message||'Code not accepted'); }
  };
}
function newPasswordGate(){
  const g=document.createElement('div'); g.className='gate';
  g.innerHTML=`<h1 style="font-size:1.9rem;margin-bottom:10px">Set a new password</h1>
    <p class="muted">You came back from the reset link. Pick something you'll remember — at least 6 characters.</p>
    <div class="stack" style="margin-top:18px">
      <input type="password" id="np1" placeholder="New password" autocomplete="new-password">
      <input type="password" id="np2" placeholder="Again, to be sure" autocomplete="new-password">
      <button class="btn primary block" id="npgo">Save it</button></div>`;
  document.body.appendChild(g);
  g.querySelector('#npgo').onclick=async()=>{
    const a=g.querySelector('#np1').value, b=g.querySelector('#np2').value;
    if(a.length<6){ toast('At least 6 characters'); return; }
    if(a!==b){ toast('Those do not match'); return; }
    const btn=g.querySelector('#npgo'); btn.disabled=true; btn.textContent='…';
    try{ const blob=await Sync.setPassword(a);
      g.remove();
      if(blob && (S.tasks.length||Object.keys(S.days).length)){
        render();
        modal('<h2>Restore your backup?</h2><p class="muted">This device already has data on it. Restoring replaces it with what is saved to your account.</p>','Restore',()=>{ Sync.applyVault(blob); render(); toast('Restored'); });
      } else { if(blob) Sync.applyVault(blob); render(); toast('Password changed'); }
    }catch(e){ btn.disabled=false; btn.textContent='Save it'; toast(e.message||'Could not change it'); }
  };
}

function charSheet(){
  let tab='face';
  const o=overlay(`<div class="sheet"><div class="grab"></div>
    <div class="charpreview" id="cprev"></div>
    <div class="seg" id="ctabs" style="margin:12px 0"></div>
    <div id="cbody"></div>
    <div class="foot"><button class="btn" data-x>Done</button></div></div>`);
  const TABS=[['face','Face'],['skin','Skin'],['hairc','Hair colour'],...SLOTS.map(([k,l])=>[k,l])];
  const draw=()=>{
    const a=myChar();
    o.querySelector('#cprev').innerHTML=charSVG(a);
    o.querySelector('#ctabs').innerHTML=TABS.map(([k,l])=>`<button class="${tab===k?'on':''}" data-ctab="${k}">${l}</button>`).join('');
    const body=o.querySelector('#cbody');
    if(tab==='face'){
      body.innerHTML=`<div class="charGrid">${BASES.map(bs=>`<button class="charpick ${a.base===bs.id?'on':''}" data-cbase="${bs.id}">
        ${charSVG({...a,base:bs.id},64)}</button>`).join('')}</div>
        <p class="tiny muted" style="margin-top:8px">Eight faces. Skin and hair are separate, so any of them can be anyone.</p>`;
    } else if(tab==='skin'){
      body.innerHTML=`<div class="swatches">${TONES.map(t=>`<button class="sw ${a.tone===t.id?'on':''}" data-ctone="${t.id}" style="background:${t.hex}"></button>`).join('')}</div>`;
    } else if(tab==='hairc'){
      body.innerHTML=`<div class="swatches">${HAIR_COLOURS.map(c=>`<button class="sw ${a.hairCol===c.id?'on':''}" data-chair="${c.id}" style="background:${c.hex}"></button>`).join('')}</div>`;
    } else {
      const items=LOOK_ITEMS.filter(i=>i.slot===tab);
      const optional=tab==='glasses'||tab==='hat';
      body.innerHTML=`<div class="lookGrid">
        ${optional?`<button class="lookpick ${!a[tab]?'on':''}" data-cequip="${tab}|"><span class="lookname">None</span></button>`:''}
        ${items.map(i=>{const owned=ownsLook(i.id), on=a[tab]===i.id;
          return `<button class="lookpick ${on?'on':''} ${owned?'':'locked'}" data-${owned?'cequip':'cbuy'}="${owned?tab+'|'+i.id:i.id}">
            <span class="lookthumb">${charSVG({...a,[tab]:i.id},52)}</span>
            <span class="lookname">${esc(i.name)}</span>
            ${owned?'':`<span class="lookcost">${i.cost}</span>`}</button>`;}).join('')}
      </div>
      <p class="tiny muted" style="margin-top:8px">Locked items cost coins. Any item works on any character.</p>`;
    }
    o.querySelectorAll('[data-ctab]').forEach(b=>b.onclick=()=>{ tab=b.dataset.ctab; draw(); });
    o.querySelectorAll('[data-cbase]').forEach(b=>b.onclick=()=>{ myChar().base=b.dataset.cbase; save(); haptic(); draw(); });
    o.querySelectorAll('[data-ctone]').forEach(b=>b.onclick=()=>{ myChar().tone=b.dataset.ctone; save(); haptic(); draw(); });
    o.querySelectorAll('[data-chair]').forEach(b=>b.onclick=()=>{ myChar().hairCol=b.dataset.chair; save(); haptic(); draw(); });
    o.querySelectorAll('[data-cequip]').forEach(b=>b.onclick=()=>{ const [slot,id]=b.dataset.cequip.split('|');
      myChar()[slot]=id||null; save(); haptic(); draw(); });
    o.querySelectorAll('[data-cbuy]').forEach(b=>b.onclick=()=>{ const it=lookItem(b.dataset.cbuy);
      modal(`<h2>Buy ${esc(it.name)}?</h2><p class="muted">${it.cost} coins. ${S.points.coins-it.cost} left after.</p>`,'Buy',()=>{
        if(buyLook(it.id)){ myChar()[it.slot]=it.id; save(); haptic('success'); draw(); toast('Yours'); }
        else toast(`${it.cost-S.points.coins} more coins needed`); }); });
  };
  draw();
  o.querySelector('[data-x]').onclick=()=>{ close(o); render(); };
}

/* ---------- Chat thread ---------- */
function crewSheet(existing){
  const fs=friendList();
  if(!fs.length){ toast('Add a friend first'); return; }
  const picked=new Set(existing?existing.memberIds:[]);
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>${existing?'Edit chat':'New chat'}</h2>
    <p class="muted small" style="margin-bottom:12px">Pick who's in. Up to ${CREW_MAX} people including you — challenges are started from inside the chat.</p>
    <div class="chips" id="crewpicks"></div>
    <input type="text" id="crewname" placeholder="Name it (optional)" maxlength="30" style="margin-top:12px" value="${esc(existing?.name||'')}">
    <div class="foot"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>${existing?'Save':'Start'}</button></div></div>`);
  const draw=()=>{ o.querySelector('#crewpicks').innerHTML=fs.map(f=>`<button class="chip ${picked.has(f.id)?'on':''}" data-m="${f.id}">${esc(f.name)}</button>`).join('');
    o.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ const id=b.dataset.m;
      if(picked.has(id)) picked.delete(id); else { if(picked.size>=CREW_MAX-1){ toast(`Up to ${CREW_MAX} including you`); return; } picked.add(id); }
      haptic(); draw(); }); };
  draw();
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelector('[data-ok]').onclick=()=>{
    if(!picked.size){ toast('Pick at least one person'); return; }
    const name=o.querySelector('#crewname').value.trim();
    if(existing){ existing.memberIds=[...picked]; existing.name=name; save(); Sync.upsertCrew(existing).catch(()=>{}); close(o); render(); }
    else { const c=makeCrew([...picked],name); Sync.upsertCrew(c).catch(()=>{}); close(o); render(); chatView(c.id); }
  };
}

function chalMatchesCrew(x,crewId){
  if(x.crewId===crewId) return true;
  const crew=crewOf(crewId); if(!crew) return false;
  const party=new Set([...(x.memberIds||[])]);
  if(chalHost(x)) party.add(chalHost(x));
  const others=crew.memberIds||[];
  // Fallback: invite covers this chat's members even if crewId was missing/mismatched
  return others.length>0 && others.every(id=>party.has(id));
}
function chatView(crewId){
  const c=crewOf(crewId); if(!c) return;
  markCrewSeen(c);
  const g=document.createElement('div'); g.className='gate chat'; document.body.appendChild(g);
  let mode='phrase';
  const nameOf=id=>id==='me'?'You':(S.friends[id]?.name||'Them');
  const draw=()=>{
    const ms=msgsOf(crewId);
    g.innerHTML=`
    <div class="chat-bar">
      <button class="btn ghost sm" data-back>‹ Back</button>
      <div class="chat-title"><b>${esc(crewName(c))}</b><span class="tiny muted">${crewSize(c)} people</span></div>
      <button class="iconbtn" data-cinfo aria-label="Chat settings">⋯</button>
    </div>
    <div class="chat-scroll" id="scroll">
      ${(()=>{ const pending=chalList().find(x=>chalIsPending(x)&&chalMatchesCrew(x,crewId));
        const live=chalList().find(x=>chalIsActive(x)&&chalMatchesCrew(x,crewId));
        if(pending) return challengeCard(pending);
        if(live) return chalCardInChat(live);
        return `<div class="card chatchal"><b class="small">No challenge running here</b>
        <p class="tiny muted" style="margin:4px 0 10px">Invite starts a challenge — the clock only runs after everyone accepts. With ${crewSize(c)} of you the pot is ×${crewMultiplier(crewSize(c)).toFixed(2).replace(/0$/,'')}.</p>
        <button class="btn primary sm block" data-startchal>Invite to a challenge</button></div>`; })()}
      ${ms.length?ms.map((m,i)=>{
        const mine=m.from==='me';
        const showName=!mine && (i===0 || ms[i-1].from!==m.from);
        if(m.kind==='system') return `<p class="msgsys">${esc(m.code)}</p>`;
        const who=mine?null:S.friends[m.from];
        return `<div class="msgrow ${mine?'mine':''}">${showName?`<span class="msgwho">${who?avatarHtml(who,'mini'):''}${esc(nameOf(m.from))}</span>`:''}
          <div class="msg ${m.kind==='emote'?'emote':''}">${m.kind==='emote'?esc(m.code):esc(PHRASE_MAP[m.code]||'…')}</div></div>`;
      }).join(''):`<p class="tiny muted" style="text-align:center;padding:26px 0">Nothing said yet. Pick a phrase below.</p>`}
    </div>
    <div class="chat-compose">
      <div class="seg" style="margin-bottom:8px"><button class="${mode==='phrase'?'on':''}" data-mode="phrase">Phrases</button><button class="${mode==='emote'?'on':''}" data-mode="emote">Emotes</button></div>
      <div class="composewrap">${mode==='phrase'?
        PHRASES.map(gr=>`<div class="pgroup"><span class="plabel">${gr.g}</span><div class="chips">${gr.items.map(i=>`<button class="chip" data-say="${i.id}">${esc(i.t)}</button>`).join('')}</div></div>`).join(''):
        `<div class="emotes">${EMOTES.map(e=>`<button class="emotebtn" data-emote="${e}">${e}</button>`).join('')}</div>`}
      </div>
    </div>`;
    const sc=g.querySelector('#scroll'); sc.scrollTop=sc.scrollHeight;
    g.querySelector('[data-back]').onclick=()=>{ markCrewSeen(c); g.remove(); render(); };
    g.querySelector('[data-cinfo]').onclick=()=>chatInfo(c,()=>{ g.remove(); render(); });
    g.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{ mode=b.dataset.mode; haptic(); draw(); });
    g.querySelectorAll('[data-say]').forEach(b=>b.onclick=()=>{
      if(sendMsg(crewId,'phrase',b.dataset.say)){ haptic(); draw(); } else toast('Give it a second'); });
    g.querySelectorAll('[data-emote]').forEach(b=>b.onclick=()=>{
      if(sendMsg(crewId,'emote',b.dataset.emote)){ haptic(); draw(); } else toast('Give it a second'); });
    const sb=g.querySelector('[data-startchal]'); if(sb) sb.onclick=()=>startChallengeModal(crewId,()=>draw());
    g.querySelectorAll('[data-acceptchal]').forEach(b=>b.onclick=()=>{ acceptChallenge(b.dataset.acceptchal); draw(); });
    g.querySelectorAll('[data-declinechal]').forEach(b=>b.onclick=()=>{ declineChallenge(b.dataset.declinechal); draw(); });
    const cb=g.querySelector('[data-chest]'); if(cb) cb.onclick=()=>{ const win=claimChest(cb.dataset.chest); if(win){ g.remove(); render(); chestScene(win); } else toast('Not ready yet'); };
    const db=g.querySelector('[data-dropchal]'); if(db) db.onclick=()=>modal('<h2>Drop this challenge?</h2><p class="muted">The slot frees up, but progress starts again if you retry.</p>','Drop',()=>{ dropChallenge(db.dataset.dropchal); draw(); },true);
  };
  // Force challenge + message pull on open so invites appear without a full Update.
  (async()=>{ try{ await Sync.pullChallenges(); await Sync.pullMessages(); }catch(e){} if(document.body.contains(g)) draw(); })();
  draw();
  const chalSig=()=>chalList().filter(x=>chalMatchesCrew(x,crewId)).map(x=>x.id+':'+(x.status||'')+':'+(x.accepted||[]).join(',')).join('|');
  let lastSig=chalSig();
  const poll=setInterval(async()=>{
    if(!document.body.contains(g)){ clearInterval(poll); return; }
    const n=msgsOf(crewId).length;
    const sig=lastSig;
    try{ await Sync.pullChallenges(); await Sync.pullMessages(); }catch(e){}
    const next=chalSig();
    if(msgsOf(crewId).length!==n || next!==sig){ lastSig=next; draw(); }
  }, 2500);
  const _back=()=>{ clearInterval(poll); };
  const origDraw=draw;
  // wrap back button rebinding each draw — hook once via Mutation-free override on remove
  const obs=new MutationObserver(()=>{ if(!document.body.contains(g)){ clearInterval(poll); obs.disconnect(); } });
  obs.observe(document.body,{childList:true});
}
function chalCardInChat(raw){
  const ch=liveQuest(raw)||raw;
  const pr=challengeProgress(ch), t=TIERS_C[ch.tier], done=pr.have>=pr.need;
  const q=findChallenge(ch.questId||ch.cid)||{};
  const mult=crewMultiplier((raw.memberIds||[]).length+1);
  const lo=Math.round(t.rolls[0]*mult), hi=Math.round(t.rolls[t.rolls.length-1]*mult);
  return `<div class="card chatchal ${done?'ready':''}" style="--tier:${t.colour}">
    <div class="row between" style="align-items:flex-start">
      <div><span class="tierbadge">${t.label}</span><b style="display:block;margin-top:6px">${esc(q.name||'Challenge')}</b>
        <p class="tiny muted">${esc(q.desc||'')}</p></div>
      <div class="chestmini ${done?'shake':''}">${chestSVG(ch.tier)}</div></div>
    <div class="row between" style="margin-top:10px"><span class="tiny muted">${pr.have} of ${pr.need}</span><span class="tiny muted">${lo}–${hi} coins</span></div>
    <div class="bar quest chal-bar"><i style="width:${clamp(Math.round(100*pr.have/pr.need),0,100)}%"></i></div>
    ${done?`<button class="btn primary block" style="margin-top:10px" data-chest="${raw.id}">Open the chest</button>`:
      `<button class="btn ghost sm block" style="margin-top:8px" data-dropchal="${raw.id}">Drop it</button>`}</div>`;
}
function chatInfo(c,onLeave){
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>${esc(crewName(c))}</h2>
    <ul class="list" style="margin-bottom:12px">${crewMembers(c).map(f=>`<li><span>${esc(f.name)}</span><span class="tiny muted">${f.consistency??0}%</span></li>`).join('')}</ul>
    <div class="stack">
      <button class="btn block" data-edit>Add or remove people</button>
      <button class="btn block" data-mute>${isMuted(c.id)?'Unmute this chat':'Mute this chat'}</button>
      <button class="btn block danger" data-leave>Delete chat</button></div>
    <div class="foot"><button class="btn" data-x>Close</button></div></div>`);
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelector('[data-edit]').onclick=()=>{ close(o); crewSheet(c); };
  o.querySelector('[data-mute]').onclick=()=>{ toggleMute(c.id); close(o); toast(isMuted(c.id)?'Muted':'Unmuted'); };
  o.querySelector('[data-leave]').onclick=()=>modal('<h2>Delete this chat?</h2><p class="muted">The messages go. Any challenge running in it is dropped.</p>','Delete',()=>{
    (S.challenges||[]).filter(x=>x.crewId===c.id).forEach(x=>dropChallenge(x.id));
    S.crews=crewList().filter(x=>x.id!==c.id); delete S.msgs[c.id]; save(); close(o); onLeave&&onLeave(); },true);
}

/* ---------- Full-clear streak reward ---------- */
function streakScene(win){
  const g=document.createElement('div'); g.className='gate streakwin';
  g.innerHTML=`<div class="chest-wrap">
    <div class="glow"></div>
    <div class="chest-eyebrow">${win.days} days, every task</div>
    <h1 class="chest-title">Full clear streak</h1>
    <div class="streakflame">${ICON.flame}</div>
    <div class="chest-prize show"><span class="num">+${win.amount}</span><small>coins</small></div>
    <p class="tiny muted" style="margin-top:14px;max-width:30ch;margin-inline:auto">
      ${win.capped?'That is the biggest weekly bonus — it stays here for as long as you keep the run going.':
        `Keep every task ticked for another 7 days and the next one is +${clearWeekBonus(win.block+1)}.`}</p>
    <button class="btn primary block" id="swclaim" style="margin-top:26px">Nice</button>
  </div>`;
  document.body.appendChild(g);
  if(motionOK()) burst(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#2dd4bf');
  haptic('success');
  g.querySelector('#swclaim').onclick=()=>{ g.remove(); render(); };
}

/* ---------- Stuck-task advice ----------
   Fires after a run of misses. Suggestions are the ones with actual evidence behind
   them: shrink it, anchor it to something you already do, pin down when and where,
   pair it with something you enjoy, cut the friction. */
function consecutiveMisses(t){
  let n=0,k=addDays(today(),-1);
  while(k>=t.createdAt){
    if(!taskExpectedOn(t,k)){ k=addDays(k,-1); continue; }
    const st=statusOf(k,t.id); if(st==='missed'){n++;k=addDays(k,-1);} else break;
  }
  return n;
}
function stuckTask(){
  for(const t of activeTasks()){
    if(consecutiveMisses(t)<STUCK_MISSES) continue;
    const last=(S.advice||{})[t.id];
    if(last && (parse(today())-parse(last))/86400000 < ADVICE_COOLDOWN) continue;
    return t;
  }
  return null;
}
function adviceSheet(t){
  const misses=consecutiveMisses(t);
  const half=t.target?Math.max(1,Math.round(t.target/2)):null;
  const tips=[
    ['Make it smaller','A version so small it is almost silly is the one that survives a bad week. Two minutes counts. You can always do more once you have started.'],
    ['Pin down when and where','Deciding the exact moment beforehand — "after I put the kettle on", "before I sit down" — works far better than intending to do it at some point today.'],
    ['Hook it to something you already do','Anchor it to a habit that never slips. Straight after brushing your teeth, straight after locking the van. The old habit does the remembering.'],
    ['Move it earlier','Whatever the plan, the day usually eats the evening. Things done early get done.'],
    ['Pair it with something you like','Only listen to that podcast while you walk. The thing you want carries the thing you should.'],
    ['Cut the friction','Kit by the door, book on the pillow, phone in another room. Make starting need no decisions.'],
  ];
  const o=overlay(`<div class="sheet"><div class="grab"></div>
    <h2>${esc(t.name)} keeps slipping</h2>
    <p class="muted small" style="margin-bottom:6px">Missed ${misses} days in a row. Nothing has been taken off you — but ${misses} is usually the task asking to be changed, not you needing to try harder.</p>
    ${t.target?`<div class="card" style="margin:12px 0"><b class="small">Shrink the target?</b>
      <p class="tiny muted" style="margin:4px 0 10px">${t.target} minutes → ${half} minutes. A target you actually hit beats one you keep missing.</p>
      <button class="btn primary sm block" data-half>Make it ${half} minutes</button></div>`:''}
    <div class="stack">${tips.map(([h,b])=>`<div class="card" style="padding:12px"><b class="small">${h}</b><p class="tiny muted" style="margin-top:3px">${b}</p></div>`).join('')}</div>
    <div class="foot"><button class="btn" data-x>Leave it as it is</button></div></div>`);
  const done=()=>{ S.advice=S.advice||{}; S.advice[t.id]=today(); save(); close(o); render(); };
  o.querySelector('[data-x]').onclick=done;
  const h=o.querySelector('[data-half]');
  if(h) h.onclick=()=>{ t.target=half; save(); haptic(); done(); toast(`Target now ${half} minutes`); };
}

/* ---------- Chest opening ---------- */
function chestScene(win){
  const {tier,amount,name,rolls,colour}=win;
  document.querySelectorAll('.tour-spot,.tour-card').forEach(e=>e.remove());
  const top=amount===Math.max(...rolls);
  const g=document.createElement('div'); g.className='gate chest '+tier; g.style.setProperty('--tier',colour);
  g.innerHTML=`<div class="chest-wrap">
    <div class="glow"></div><div class="rays"></div><div class="flash"></div>
    <div class="chest-eyebrow" id="chesteyebrow">${TIERS_C[tier].label} chest</div>
    <h1 class="chest-title">${esc(name)}</h1>
    <div class="chest-stage"><div class="chest-art" id="chestart">${ICON.chest(colour)}</div><div class="pedestal"></div></div>
    <p class="chest-hint" id="chesthint">Tap to open</p>
    <div class="chest-prize" id="prize"><span class="num">0</span><small>coins</small></div>
    <button class="btn primary block" id="chestclaim" hidden>Take it</button>
  </div>`;
  document.body.appendChild(g);
  const art=g.querySelector('#chestart'), hint=g.querySelector('#chesthint'),
        prize=g.querySelector('#prize'), num=prize.querySelector('.num'),
        claim=g.querySelector('#chestclaim'), eyebrow=g.querySelector('#chesteyebrow');
  const finish=()=>{ num.textContent=amount; prize.classList.add('locked');
    if(top){ eyebrow.textContent='Best roll!'; eyebrow.classList.add('best'); burst(colour); }
    claim.hidden=false; };
  if(!motionOK()){ hint.remove(); prize.classList.add('show'); finish(); }
  let opened=false;
  art.onclick=()=>{
    if(opened) return; opened=true;
    hint.remove(); haptic('light');
    /* 1. rumble — something is about to happen */
    art.classList.add('rumble'); g.classList.add('charging');
    setTimeout(()=>{
      /* 2. spin, growing as it goes */
      art.classList.remove('rumble'); art.classList.add('spin'); haptic('heavy');
    }, 520);
    setTimeout(()=>{
      /* 3. crack it open */
      art.classList.remove('spin'); art.classList.add('open');
      g.classList.add('burst'); g.classList.add('flashing');
      haptic('success'); burst(colour);
      prize.classList.add('show');
    }, 1680);
    setTimeout(()=>{
      /* 4. reveal the number slowly, easing to a stop */
      const dur=1500, t0=performance.now();
      const tick=now=>{
        const p=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-p,3);
        num.textContent=Math.max(1,Math.round(amount*e));
        if(p<1) requestAnimationFrame(tick);
        else { haptic(top?'success':'light'); finish(); }
      };
      requestAnimationFrame(tick);
    }, 1900);
  };
  claim.onclick=()=>{
    g.remove(); render();
    const ex=win.extras||0;
    toast(ex?`+${amount} coins · ${ex} shop extra${ex===1?'':'s'}`:`+${amount} coins`);
    if(ex) queueMicrotask(()=>offerChestExtras());
  };
}
/* After a rare/legendary challenge chest: pick which shop reward each extra lands on. */
function offerChestExtras(){
  pruneRewardExtras();
  const pend=pendingExtras();
  if(!pend.length) return;
  const active=(S.rewards||[]).filter(r=>r.active);
  if(!active.length){
    toast('Add a Shop reward to claim your chest extra', 'Shop', ()=>setTab('shop'));
    return;
  }
  /* How many of this week's chal extras are already assigned — drives first/second copy. */
  const assignedThis=S.rewardExtras.filter(e=>e.rewardId&&e.source==='chal'&&e.weekStart===weekOf(today())).length;
  const still=pend.length;
  const ordinal = still===1 && assignedThis===0 ? 'Pick a reward for your extra'
    : assignedThis===0 ? 'Pick a reward for your first extra'
    : 'Pick for your second extra';
  const o=overlay(`<div class="sheet"><div class="grab"></div>
    <h2>${esc(ordinal)}</h2>
    <p class="muted small" style="margin-bottom:14px">+1 buy this week for the one you choose. Stacks with what you planned and your spare.${still>1?' You will pick again for the next one.':''}</p>
    <div class="stack">${active.map(r=>{
      const al=allowanceState(r);
      const already=extrasForReward(r);
      return `<button class="btn block" data-pick="${r.id}" style="text-align:left;justify-content:space-between;display:flex;gap:10px">
        <span><b>${esc(r.name)}</b>${already?`<span class="tiny muted" style="display:block;font-weight:400">already +${already} this week</span>`:''}</span>
        <span class="tiny muted" style="align-self:center">${al.used}/${al.hard}</span>
      </button>`;
    }).join('')}</div>
    <div class="foot"><button class="btn ghost block" data-later>Later</button></div></div>`);
  o.querySelector('[data-later]').onclick=()=>{ close(o); toast('Extras waiting in the Shop'); };
  o.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{
    const ex=pendingExtras()[0]; if(!ex){ close(o); return; }
    if(!assignExtra(ex.id, b.dataset.pick)){ toast('Could not assign that'); return; }
    haptic('success'); close(o); render();
    const r=(S.rewards||[]).find(x=>x.id===b.dataset.pick);
    toast(r?`+1 buy on ${r.name} this week`:'Extra assigned');
    if(pendingExtras().length) queueMicrotask(()=>offerChestExtras());
  });
}
function burst(colour){
  if(!motionOK()) return;
  const c=fxCanvas(),x=c.getContext('2d'); c.width=innerWidth;c.height=innerHeight;
  const P=Array.from({length:130},()=>({x:innerWidth/2,y:innerHeight*.42,
    vx:(Math.random()-.5)*17,vy:-Math.random()*17-3,r:Math.random()*6+3,
    c:Math.random()<.55?colour:(Math.random()<.5?'#fff':'#ffd76a'),a:Math.random()*6,s:Math.random()*.25-.12}));
  let f=0; (function step(){ x.clearRect(0,0,c.width,c.height);
    P.forEach(p=>{p.vy+=.5;p.x+=p.vx;p.y+=p.vy;p.a+=p.s;
      x.save();x.translate(p.x,p.y);x.rotate(p.a);x.globalAlpha=Math.max(0,1-f/90);
      x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.5);x.restore();});
    if(++f<100) requestAnimationFrame(step); else x.clearRect(0,0,c.width,c.height); })();
}

/* ---------- Recap ---------- */
function recapView(r,earned){
  const hrs=r.minutes>=60?`${(r.minutes/60).toFixed(1)} hours`:`${r.minutes} minutes`;
  const card=(big,label,note)=>`<div class="rcard"><b>${big}</b><span>${label}</span>${note?`<p class="tiny muted">${note}</p>`:''}</div>`;
  const g=document.createElement('div'); g.className='gate recap';
  g.innerHTML=`<div class="recap-bar"><button class="btn ghost sm" data-close>${earned?'Close':'‹ Back'}</button><span class="tiny muted">${fmt(r.from,{day:'numeric',month:'short'})} – ${fmt(r.at,{day:'numeric',month:'short'})}</span></div>
  <div class="recap-scroll">
    <div class="rhero"><div class="eyebrow">${earned?'You made it':'Recap'}</div><h1>${esc(r.name)}</h1>
      <p class="muted">${r.weekly?`${fmt(r.from,{day:'numeric',month:'short'})} – ${fmt(r.at,{day:'numeric',month:'short'})} · `:''}${r.shown} day${r.shown===1?'':'s'} of showing up.</p></div>

    ${card(`${r.rate}%`,'of everything you set yourself',r.prevRate!=null?`${r.rate>=r.prevRate?'Up':'Down'} from ${r.prevRate}% the week before.`:'Across '+r.expected+' chances.')}
    ${card(r.cleared,`day${r.cleared===1?'':'s'} cleared completely`,'Every task done.')}
    ${card(r.coins.toLocaleString(),'coins earned',`Level ${r.level} · ${esc(r.title)}`)}
    ${card(r.bestStreak,'day best streak','Longest run of opening the app.')}
    ${r.minutes?card(hrs,'logged on timed tasks',''):''}
    ${r.chests?card(r.chests,`weekly chest${r.chests===1?'':'es'} won`,''):''}

    ${r.strongest?`<div class="rcard soft"><span class="eyebrow">Most solid</span><b class="mid">${esc(r.strongest.name)}</b><p class="small muted">${r.strongest.s}% strength. This is the one that stuck.</p></div>`:''}
    ${r.weakest&&r.weakest.s<r.strongest?.s?`<div class="rcard soft"><span class="eyebrow">Hardest going</span><b class="mid">${esc(r.weakest.name)}</b><p class="small muted">${r.weakest.s}% strength. Worth asking whether it is the right habit, or just the wrong time of day.</p></div>`:''}

    ${(r.reasonList&&r.reasonList.length)?`<div class="rcard soft"><span class="eyebrow">Why you missed</span>
      <div style="margin-top:10px">${r.reasonList.map(([why,n])=>`<div class="tod"><span class="small">${esc(why)}</span>
        <div class="todbar"><i class="warn" style="width:${clamp(Math.round(100*n/Math.max(1,r.missTotal)),6,100)}%"></i></div>
        <span class="tiny muted">${n}</span></div>`).join('')}</div>
      ${r.worstDay?`<p class="small muted" style="margin-top:10px">${esc(r.worstDay[0])}s were hardest.</p>`:''}
      <p class="tiny muted" style="margin-top:6px">Straight from what you told it when it asked. Nothing was taken off you for any of it.</p></div>`:
      (r.topReason||r.worstDay)?`<div class="rcard soft"><span class="eyebrow">When you slipped</span>
      ${r.topReason?`<b class="mid">${esc(r.topReason[0])}</b><p class="small muted">${r.topReason[1]} time${r.topReason[1]===1?'':'s'}.</p>`:''}
      ${r.worstDay?`<p class="small muted" style="margin-top:8px">${esc(r.worstDay[0])}s were hardest.</p>`:''}</div>`:''}

    <div class="rcard soft last"><p>${r.rate>=80?'That is a good rate. The habit is the point, not the score — but that is a good rate.':r.rate>=50?'Half the battle is turning up at all, and you did that '+r.shown+' times.':'It has been a rough run. Nothing was taken off you for it, and the days are still there to be had.'}</p>
      <p class="small muted" style="margin-top:8px">Nothing here is shared with anyone.</p></div>
    <button class="btn primary block" data-close style="margin-top:16px">${earned?'Keep going':'Done'}</button>
  </div>`;
  document.body.appendChild(g);
  g.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{ g.remove(); render(); });
}
function maybeRecap(){ const r=earnRecap(); if(r){ haptic('success'); recapView(r,true); celebrate(); return true; } return false; }

/* ---------- Boot ---------- */
let _bkT;
function scheduleBackup(){ clearTimeout(_bkT); _bkT=setTimeout(()=>Sync.backup().catch(()=>{}),8000); }
function friendsTick(){
  if(Sync.live()&&Sync.signedIn()) scheduleBackup();
  if(!friendList().length && !Sync.signedIn()) return;
  const pushLocalChals=()=>Promise.all(chalList().map(c=>Sync.pushChallenge(c).catch(()=>{})));
  Sync.pushCrews().catch(()=>{})
    .then(()=>pushLocalChals())
    .then(()=>Sync.pull())
    .then(()=>Sync.pullCrews())
    .then(()=>Sync.pullChallenges())
    .then(()=>{ try{ checkChallenges(); }catch(e){} })
    .then(()=>Sync.pullMessages())
    .then(()=>{ if(tab==='friends'||tab==='shop') render(); })
    .catch(()=>{});
  Sync.push().catch(()=>{});
}
function maybeGates(){ if(S.flags.pendingToast){ toast(S.flags.pendingToast); S.flags.pendingToast=null; save(); }
  if(catchUpGate()) return;              // yesterday: I did it | Missed
  if(missGate()) return;                 // older slips → reasons, then advice, then recap
  const st=stuckTask(); if(st){ adviceSheet(st); return; }
  if(maybeRecap()) return;
  tour(tab); }
let _booted=false;
export function bootSteady(){
  $app=document.getElementById('app');
  try{ migratePairChallenges(S); normalizeChallenges(); }catch(e){ console.error(e); }
  document.querySelectorAll('.tabbar button').forEach(b=>b.onclick=()=>{haptic();setTab(b.dataset.tab)});
  try{ applyTheme(); }catch(e){ console.error(e); }

  const reveal=()=>{
    const tb=document.getElementById('tabbar'); if(tb) tb.hidden=false;
    try{ render(); }catch(e){ console.error(e); if($app) $app.innerHTML=`<div class="page"><div class="card"><b>Something went wrong</b><p class="small muted" style="margin-top:8px">${esc(e.message||e)}</p></div></div>`; }
    setTimeout(maybeGates,300);
    friendsTick();
  };
  const begin=()=>{
    if(document.querySelector('.gate')) return;
    try{
      if(!S.flags?.onboarded){ onboarding(()=>{ rollover(); quoteGate(reveal); }); return; }
      rollover();
      quoteGate(reveal);
    }catch(e){
      console.error(e);
      reveal();
    }
  };

  begin();

  if(!_booted){
    _booted=true;
    try{
      const mq=matchMedia('(prefers-color-scheme: dark)');
      const on=()=>{applyTheme();};
      if(mq.addEventListener) mq.addEventListener('change',on);
      else if(mq.addListener) mq.addListener(on);
    }catch(e){}
    setInterval(()=>{ if(S.flags.lastOpen!==today()){ rollover(); render(); maybeGates(); } try{ reminderTick(); }catch(e){} },30000);
    setTimeout(()=>{ try{ reminderTick(); }catch(e){} },4000);
    document.addEventListener('visibilitychange',()=>{ if(document.hidden) return;
      const rolled=S.flags.lastOpen!==today();
      if(rolled){ rollover(); render(); }
      const wasSnoozed=catchUpSnooze;
      catchUpSnooze=false;               // Ask me later only lasts until next show
      if(rolled || wasSnoozed) maybeGates();
    });
    /* Arriving back from a password-reset email takes priority over everything. */
    Sync.claimRecovery().then(rec=>{
      if(rec){ document.querySelectorAll('.gate').forEach(g=>g.remove()); newPasswordGate(); return null; }
      return Sync.session();
    }).catch(()=>null).then(async()=>{
      try{
        if(Sync.signedIn()){
          const pulled=await Sync.pullVaultSmart();
          if(pulled){ render(); toast('Restored newer backup from your account'); }
        }
      }catch(e){}
      if(tab==='friends') render();
      friendsTick();
    });
  }
}

