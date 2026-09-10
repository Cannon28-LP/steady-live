// @ts-nocheck
/* ============ Steady — local-first consistency tracker ============ */
const KEY = 'steady.v2';
const BUILD = '2026-09-09-live';   // shown in Settings → Help, so you can tell which build a phone is running
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
const MAX_REWARDS = 10, BUY_STRENGTH = 70, TASK_BASE = 10, CLEAR_PER_TASK = 5, CHEST_DAYS = 6;
const MAX_TASKS = 10, MIN_REWARD_PRICE = 10;
const CHAL_PEOPLE_MAX = 24;      // slots, not headcount, are the real limit now
const CREW_MAX = 8;              // past this a chat stops being a conversation
const CHAL_PARTY_MAX = 6;
const CREW_BONUS_PER_HEAD = 0.10, CREW_BONUS_CAP = 2.0;
const CHAL_PARTY = {legendary:CHAL_PARTY_MAX, rare:CHAL_PARTY_MAX, common:CHAL_PARTY_MAX};
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
const freezeCost = () => round10(dayRate()*1.5);
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
  {id:'weekly',    label:'Weekly',        per:4.33},
  {id:'fortnight', label:'Fortnightly',   per:2.17},
  {id:'monthly',   label:'Monthly',       per:1},
  {id:'rare',      label:'Now and then',  per:0.5},
];
const freqOf = id => FREQS.find(f=>f.id===id) || FREQS[2];
const BUDGET_SHARE = 0.8;                 // leave slack for freezes, challenges and chests
/* Real coins a month: measured if there's history, estimated from the task list if not. */
function monthlyIncome(){
  const k=today(); let total=0,n=0;
  for(let i=1;i<=28;i++){ const d=addDays(k,-i); const st=dayStats(d); if(st.expected){ total+=st.points; n++; } }
  if(n>=5) return {coins:Math.max(1,Math.round(total/n*30.4)), real:true};
  return {coins:Math.max(1,round10(clearDayPay()*30.4*0.75)), real:false};
}
function rewardFreq(r){ return r.freq || 'monthly'; }
function monthlyCostOf(r){ return rewardPrice(r)*freqOf(rewardFreq(r)).per; }
/* What each reward should cost if the active set is to fit the budget. */
function suggestFromFreq(freqId, others){
  const inc=monthlyIncome().coins*BUDGET_SHARE;
  const list=(others||S.rewards.filter(x=>x.active));
  const shares=list.length+1;                     // this one plus the rest
  const share=inc/shares;
  return Math.max(MIN_REWARD_PRICE, round10(share/freqOf(freqId).per));
}
function budgetState(){
  const inc=monthlyIncome();
  const active=S.rewards.filter(x=>x.active);
  const spend=active.reduce((a,r)=>a+monthlyCostOf(r),0);
  const pct=inc.coins?Math.round(100*spend/inc.coins):0;
  const redemptions=active.reduce((a,r)=>a+freqOf(rewardFreq(r)).per,0);
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
    const to=Math.max(MIN_REWARD_PRICE, round10(share/freqOf(rewardFreq(r)).per));
    const progress=Math.min(1,(S.points.coins||0)/from);
    return {r,from,to,freq:rewardFreq(r),raises:to>from,halfway:progress>=0.5};
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
function isDarkMode(st=S.settings){
  return st.mode==='dark' || (st.mode==='system' && matchMedia('(prefers-color-scheme: dark)').matches);
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
const fmt = (k,o={weekday:'short',day:'numeric',month:'short'}) => parse(k).toLocaleDateString(undefined,o);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function fresh(){
  return {
    tasks:[], rewards:[], locker:[], customReasons:[],
    quotes: [],
    days:{}, streak:{login:0,best:0}, points:{coins:0,xp:0}, freezes:0, chests:{},
    clearPaidBlock:0, advice:{}, recaps:[], me:null, auth:'out', friends:{}, pairs:{}, challenges:[], demo:false, outbox:[], inbox:[], todos:[], notes:[], whys:[], vaultAt:null,
    crews:[], msgs:{}, muted:[],
    settings:{theme:'teal',mode:'dark',ink:null,motif:'none',font:'system',textSize:100,motion:true,haptics:true,glow:true,
      remind:{on:false,morning:'08:00',evening:'20:00',eveningOn:true,fired:{}}},
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
function addTodo(text,day){ S.todos.push({id:uid(),text,day:day||null,done:false,createdAt:Date.now()}); save(); }
function setTodoDay(id,day){ const t=S.todos.find(x=>x.id===id); if(t){ t.day=day||null; save(); } }
function whenLabel(k){ if(!k) return 'Someday'; const d=(parse(k)-parse(today()))/86400000;
  if(d<0) return 'Overdue'; if(d===0) return 'Today'; if(d===1) return 'Tomorrow';
  if(d<7) return parse(k).toLocaleDateString(undefined,{weekday:'long'});
  return fmt(k,{day:'numeric',month:'short'}); }

/* ---------- Notes ---------- */
function noteTitle(n){ return (n.body||'').split('\n')[0].trim() || 'New note'; }
function notePreview(n){ const r=(n.body||'').split('\n').slice(1).join(' ').trim(); return r||'No additional text'; }
function addNote(){ const n={id:uid(),body:'',updatedAt:Date.now()}; S.notes.unshift(n); save(); return n; }
function saveNote(id,body){ const n=S.notes.find(x=>x.id===id); if(n){ n.body=body; n.updatedAt=Date.now(); save(); } }
function dropNote(id){ S.notes=S.notes.filter(n=>n.id!==id); save(); }
function notesSorted(){ return [...S.notes].sort((a,b)=>b.updatedAt-a.updatedAt); }
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
    topReason:top(reasons)||null, worstDay:top(dows)||null};
}
function earnRecap(){ const due=dueRecap(); if(!due) return null;
  const r=buildRecap(due.n,due.name); S.recaps.push(r); save(); return r; }

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
function remindCfg(){ const s=S.settings; s.remind=s.remind||{on:false,morning:'08:00',evening:'20:00',eveningOn:true,fired:{}}; return s.remind; }
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
  const due=(slot,at)=>at && hm>=at && c.fired[slot]!==k;
  if(due('morning',c.morning)){ c.fired.morning=k; save();
    showLocal('Steady', reminderBody(), 'steady-morning'); return; }
  if(c.eveningOn && due('evening',c.evening)){
    const st=dayStats(k); if(st.expected && st.done<st.expected){ c.fired.evening=k; save();
      showLocal('Still time', reminderBody(), 'steady-evening'); }
    else { c.fired.evening=k; save(); }
  }
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
  common:    {label:'Common',    colour:'#22c55e', rolls:[10,20,30]},
  rare:      {label:'Rare',      colour:'#3b82f6', rolls:[50,70,90]},
  legendary: {label:'Legendary', colour:'#a855f7', rolls:[150,180,200]},
};
const CHALLENGES = {
  common:[
    {id:'c1',name:'Two in a row',       desc:'Everyone on it clears the day, two days running.',        type:'bothClearStreak', need:2},
    {id:'c2',name:'Three good days',    desc:'Each of you clears three days this week.',               type:'eachClear',       need:3, window:7},
    {id:'c3',name:'Turn up together',   desc:'Everyone on it opens the app three days running.',       type:'bothOpenStreak',  need:3},
    {id:'c4',name:'Six between you',    desc:'Six cleared days between everyone on it.',               type:'combined',        need:6, window:7},
  ],
  rare:[
    {id:'r1',name:'Five days standing', desc:'Everyone on it opens the app five days running.',        type:'bothOpenStreak',  need:5},
    {id:'r2',name:'Four in a row',      desc:'Everyone on it clears the day, four days running.',      type:'bothClearStreak', need:4},
    {id:'r3',name:'Five each',          desc:'Each of you clears five days in a week.',                type:'eachClear',       need:5, window:7},
    {id:'r4',name:'Twenty between you', desc:'Twenty cleared days between everyone in a fortnight.',   type:'combined',        need:20,window:14},
  ],
  legendary:[
    {id:'l1',name:'Twelve days',        desc:'Everyone on it clears every task, twelve days running.', type:'bothClearStreak', need:12},
    {id:'l2',name:'A fortnight of it',  desc:'Everyone on it opens the app fourteen days running.',    type:'bothOpenStreak',  need:14},
    {id:'l3',name:'Twenty-five each',   desc:'Each of you clears twenty-five days in a month.',        type:'eachClear',       need:25,window:30},
    {id:'l4',name:'Fifty between you',  desc:'Fifty cleared days between everyone in a month.',        type:'combined',        need:50,window:30},
  ],
};
const findChallenge = id => Object.entries(CHALLENGES).flatMap(([tier,l])=>l.map(c=>({...c,tier}))).find(c=>c.id===id);
function pairOf(f){ return S.pairs[f.id] || (S.pairs[f.id]={done:[],chests:[]}); }
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
  const windowWord=ch.window===7?'week':ch.window===14?'fortnight':ch.window===30?'month':(ch.window?ch.window+' days':'');
  if(ch.type==='bothClearStreak') return `${cap(who)} ${together} clear the day, ${n} days running.`;
  if(ch.type==='bothOpenStreak') return `${cap(who)} ${together} open the app ${n} days running.`;
  if(ch.type==='eachClear') return `Each of ${who} clears ${n} days this ${windowWord||'window'}.`;
  if(ch.type==='combined') return `${n} cleared days between ${who}${windowWord?' in a '+windowWord:''}.`;
  return ch.desc;
}
function allClearedOn(members,k){ return !!S.days[k]?.cleared && members.every(f=>clearedOn(f,k)); }
function allOpenedOn(members,k){ return !!S.days[k] && members.every(f=>!!f.days?.[k]); }
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
function startChallenge(tier,questId,memberIds,crewId){
  const def=findChallenge(questId);
  if(!def||def.tier!==tier) return null;
  const ids=[...new Set(memberIds||[])].filter(id=>S.friends[id]);
  const draft={id:uid(),questId,tier,startedAt:today(),memberIds:ids,crewId:crewId||null};
  if(!slotOk(draft,S.challenges)) return null;
  S.challenges=chalList().concat(draft); save();
  if(crewId) msgsOf(crewId).push({id:uid(),from:'me',kind:'system',code:`${TIERS_C[tier].label} challenge started: ${def.name}`,at:Date.now()});
  save(); return draft;
}
function dropChallenge(id){
  S.challenges=chalList().filter(c=>c.id!==id); save();
}
function pullFriendFromChallenges(fid){
  S.challenges=chalList().map(c=>({...c,memberIds:(c.memberIds||[]).filter(id=>id!==fid)})).filter(c=>c.memberIds.length);
}
function claimChest(cid){
  const raw=chalList().find(c=>c.id===cid); if(!raw) return null;
  const ch=liveQuest(raw); if(!ch) return null;
  const pr=challengeProgress(ch); if(pr.have<pr.need) return null;
  const t=TIERS_C[ch.tier];
  const heads=(ch.memberIds||[]).length+1;
  const amount=Math.round(t.rolls[Math.floor(Math.random()*t.rolls.length)]*crewMultiplier(heads)/5)*5;
  S.points.coins+=amount; S.points.xp+=amount;
  for(const f of ch.members){
    const p=pairOf(f);
    p.done=p.done||[]; p.chests=p.chests||[];
    p.done.push(ch.questId||ch.id);
    p.chests.push({tier:ch.tier,amount,at:today(),name:ch.name,crew:ch.members.map(x=>x.name)});
  }
  S.challenges=chalList().filter(c=>c.id!==cid); save();
  const mult=crewMultiplier(heads);
  return {tier:ch.tier,amount,name:ch.name,colour:t.colour,heads,
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
  if(/User already registered|already been registered/i.test(m)) return 'That email already has an account — sign in instead.';
  if(/Password should be|at least 6/i.test(m)) return 'Password needs to be at least 6 characters.';
  if(/Email not confirmed/i.test(m)) return 'Confirm the email first, or switch off email confirmation in Supabase.';
  if(/function .*add_friend|add_friend.*does not exist|PGRST202/i.test(m)) return "The database functions aren't there. Re-run supabase.sql — it has changed.";
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

  /* ---- full-state backup so a new phone restores everything ---- */
  async backup(){
    if(!this.live()||!this.signedIn()) return;
    try{ await api('/rest/v1/vault?on_conflict=user_id',{method:'POST',
        body:{user_id:S.me.id,blob:stripForVault(),updated_at:new Date().toISOString()},
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
      S.vaultAt=Date.now(); S.syncError=null; save();
    }catch(e){ S.syncError=readableSyncError(e); save(); }
  },
  async restore(){
    if(!this.live()||!this.signedIn()) return null;
    try{ const rows=await api(`/rest/v1/vault?user_id=eq.${S.me.id}&select=blob,updated_at`);
      return rows?.[0]?.blob||null;
    }catch(e){ S.syncError=readableSyncError(e); save(); return null; }
  },
  applyVault(blob){
    const me0=S.me, auth0=S.auth;
    S={...fresh(),...blob,me:me0,auth:auth0,friends:{},inbox:[],settings:{...fresh().settings,...(blob.settings||{})},flags:{...fresh().flags,...(blob.flags||{})}};
    migratePairChallenges(S);
    save();
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
    (links||[]).forEach(p=>{ if(!S.friends[p.id]) S.friends[p.id]={id:p.id,name:p.display_name,code:p.code,days:{}};
      else S.friends[p.id].name=p.display_name; });
    const ids=Object.keys(S.friends).filter(id=>!id.startsWith('demo-'));
    // drop challenge members we no longer know, now that the friend list is current
    S.challenges=chalList().map(c=>({...c,memberIds:(c.memberIds||[]).filter(id=>S.friends[id])})).filter(c=>c.memberIds.length);
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
  const ink=st.ink||p.fg;
  r.setProperty('--bg',p.bg);
  r.setProperty('--surface',p.surface);
  r.setProperty('--surface2',p.surface2);
  r.setProperty('--line',p.line);
  r.setProperty('--fg',ink);
  r.setProperty('--fg2', st.ink?`color-mix(in srgb, ${ink} 62%, ${p.bg})`:p.fg2);
  r.setProperty('--fg3', st.ink?`color-mix(in srgb, ${ink} 34%, ${p.bg})`:p.fg3);
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
  document.body.classList.toggle('reduce',!st.motion);
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
function day(k){ return S.days[k] || (S.days[k]={tasks:{},points:0,bonus:0,note:'',perfect:false}); }
function statusOf(k,tid){ return S.days[k]?.tasks?.[tid]?.status || 'open'; }
function expectedOn(k){ // task ids expected that day
  const d=S.days[k]; if(d && d.finalized) return Object.keys(d.tasks);
  return activeTasks(k).map(t=>t.id);
}
function dayStats(k){
  const ids=expectedOn(k); const done=ids.filter(id=>statusOf(k,id)==='done').length;
  return {expected:ids.length,done,missed:ids.filter(id=>statusOf(k,id)==='missed').length,
    points:(S.days[k]?.points||0)+(S.days[k]?.bonus||0),
    perfect:ids.length>0&&ids.every(id=>statusOf(k,id)==='done')};
}
/* Loop-style habit strength: 0–100, climbs ~5/day, decays 5%/day. Never resets to zero on a miss. */
function strengthOf(t,k=today()){ let s=0; for(let x=t.createdAt;x<=k;x=addDays(x,1)){ const st=statusOf(x,t.id); if(x===k&&st==='open') break; s=s*0.95+(st==='done'?5:0); } return clamp(Math.round(s),0,100); }
function avgStrength(k=today()){ const ts=activeTasks(k); if(!ts.length) return 0; return Math.round(ts.reduce((a,t)=>a+strengthOf(t,k),0)/ts.length); }
function taskValue(t){ return Math.round(TASK_BASE*(1+0.5*strengthOf(t,addDays(today(),-1))/100)); }
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
  else if(last && addDays(last,2)===t && S.freezes>0){ S.freezes--; S.streak.login+=1; day(addDays(t,-1)).frozen=true; notes.push('Streak freeze used — streak kept'); }
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
}
function finalize(k){
  const d=day(k); if(d.finalized) return;
  for(const t of activeTasks(k)){
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

/* ---------- Completing ---------- */
const sel=new Set();
function completeSelected(mins){
  const k=today(), ids=[...sel]; if(!ids.length) return;
  const d=day(k), tasks=activeTasks(k), n=tasks.length;
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
  S.undo={date:k,ids:changed,coins,xp,cleared};
  sel.clear(); save();
  haptic(cleared?'success':'light');
  changed.forEach(id=>document.querySelector(`[data-task="${id}"]`)?.classList.add('leaving'));
  const streakWin = cleared ? payClearStreak() : null;
  setTimeout(()=>{ render(); if(cleared&&typeof friendsTick==='function') friendsTick();
    if(streakWin) setTimeout(()=>streakScene(streakWin),900);
    toast(cleared?`Day cleared · +${coins}`:`${changed.length===1?'Marked done':changed.length+' marked done'} · +${coins}`, 'Undo', undoLast); if(cleared) celebrate(); }, S.settings.motion?220:0);
}
function undoLast(){
  const u=S.undo; if(!u) return; const d=day(u.date);
  u.ids.forEach(id=>{ delete d.tasks[id]; });
  if(u.cleared){ d.cleared=false; d.clearBonus=0; }
  d.points-=u.coins; S.points.coins-=u.coins; S.points.xp-=u.xp; d.perfect=false;
  S.undo=null; save(); haptic(); render(); toast('Undone');
}

/* ---------- Toast ---------- */
let toastT;
function toast(msg,action,fn){
  const el=document.getElementById('toast'); clearTimeout(toastT);
  el.innerHTML=`<span>${esc(msg)}</span>${action?`<button id="toastact">${esc(action)}</button>`:''}`;
  if(action) el.querySelector('#toastact').onclick=()=>{ el.classList.remove('show'); fn&&fn(); };
  el.classList.add('show'); toastT=setTimeout(()=>el.classList.remove('show'),action?6000:2200);
}
function fxCanvas(){
  let c=document.getElementById('fx');
  if(!c){ c=document.createElement('canvas'); c.id='fx'; document.body.appendChild(c); }
  return c;
}
function celebrate(){
  if(!S.settings.motion) return;
  const c=fxCanvas(),x=c.getContext('2d'); c.width=innerWidth;c.height=innerHeight;
  const acc=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const P=Array.from({length:90},()=>({x:innerWidth/2,y:innerHeight*.35,vx:(Math.random()-.5)*14,vy:-Math.random()*14-4,r:Math.random()*5+3,c:Math.random()<.6?acc:'#fff',a:Math.random()*6,s:Math.random()*.2-.1}));
  let f=0; (function step(){ x.clearRect(0,0,c.width,c.height); P.forEach(p=>{p.vy+=.45;p.x+=p.vx;p.y+=p.vy;p.a+=p.s;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.globalAlpha=Math.max(0,1-f/70);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.6);x.restore();}); if(++f<80) requestAnimationFrame(step); else x.clearRect(0,0,c.width,c.height); })();
}
/* ---------- Router ---------- */
let remOpen=false, rewOpen=false, newRewardFreq='monthly';
let tab='today', authState={mode:'up'}, taskState={month:{},sel:{}}, planState={sub:'list',when:'today'}, progState={month:today().slice(0,7),sel:today(),range:'week',sub:'overview'};
let $app;
const ICON={check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  archive:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
  chest:(c)=>`<svg viewBox="0 0 64 64" fill="none"><path d="M8 26h48v26a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="${c}" opacity=".9"/><path d="M8 26a24 24 0 0 1 48 0z" fill="${c}"/><rect x="26" y="30" width="12" height="14" rx="2" fill="#0b0f0e" opacity=".55"/><circle cx="32" cy="36" r="2.4" fill="${c}"/><path d="M8 26h48" stroke="#0b0f0e" stroke-opacity=".35" stroke-width="2.5"/></svg>`,
  coin:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15 9.5A3 3 0 0 0 9.5 11c0 2.5 5 1.5 5 4a3 3 0 0 1-5.5 1.5" stroke-linecap="round"/></svg>',
  flame:'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.5 2.5c.4 3.2 3 4.6 4.3 7.2 1.5 3 .9 6.8-2 8.9.4-1.7 0-3.6-1.3-4.9-.2 1.7-1.2 2.7-2.6 3.3-1.3.6-2 1.9-1.6 3.2C7.6 19 6 16.6 6 13.8c0-2.8 1.6-4.4 3-6.3.9 1.1 1.3 2.3 1.2 3.7 2.7-1.6 3.9-5.3 3.3-8.7z"/></svg>'};

function setTab(t){ endTour(true); tab=t; sel.clear(); render(); window.scrollTo({top:0}); setTimeout(()=>tour(t),350); }
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
  const k=today(), tasks=activeTasks(k), d=S.days[k]||{}, st=dayStats(k);
  const open=tasks.filter(t=>statusOf(k,t.id)!=='done'), done=tasks.filter(t=>statusOf(k,t.id)==='done');
  const row=t=>{const s=strengthOf(t);return `<li><button class="task ${sel.has(t.id)?'selected':''}" data-task="${t.id}"><span class="box">${ICON.check}</span><span class="name">${esc(t.name)}${t.target?`<span class="tag">${t.target}m</span>`:''}<span class="str"><i style="width:${s}%"></i></span></span><span class="val">+${taskValue(t)}</span></button></li>`;};
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
    ${done.length?`<details class="fold"><summary><span>Done today (${done.length})</span><span class="tiny">back tomorrow</span></summary><ul class="tasks" style="margin-top:8px">${done.map(t=>`<li><div class="task done"><span class="box">${ICON.check}</span><span class="name">${esc(t.name)}</span><span class="val">+${(d.tasks[t.id]?.value||0)+(d.tasks[t.id]?.bonus||0)}${d.tasks[t.id]?.minutes?`<span class="tiny muted" style="display:block;text-align:right;font-weight:400">${d.tasks[t.id].minutes}m</span>`:''}</span></div></li>`).join('')}</ul></details>`:''}
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
  const sub=planState.sub;
  return `<div class="head"><div><div class="eyebrow">Outside the points — nothing here can be failed</div><h1>Plan</h1></div></div>
  <div class="seg" style="margin-bottom:14px">${[['list','List'],['notes','Notes']].map(([v,l])=>`<button class="${sub===v?'on':''}" data-psub="${v}">${l}</button>`).join('')}</div>
  ${sub==='list'?pList():pNotes()}`;
}

function pList(){
  const overdue=S.todos.filter(t=>!t.done&&t.day&&t.day<today()).sort((a,b)=>a.day<b.day?-1:1);
  const tod=todosOn(today()), ahead=todosAhead(), bl=backlog(), dn=todosDone();
  const w=planState.when;
  const group=(title,items,note)=>items.length?`<div class="section"><h2>${title}${note?` <span class="muted">${note}</span>`:''}</h2><div class="card"><ul class="tasks">${items.map(rowTodo).join('')}</ul></div></div>`:'';
  const byDay=(()=>{ const g={}; ahead.forEach(t=>(g[t.day]=g[t.day]||[]).push(t)); return g; })();
  return `
  <div class="card" data-tour="listadd">
    <input type="text" id="newtodo" placeholder="Something to get done…" maxlength="80">
    <div class="chips" style="margin-top:10px">
      ${[['today','Today'],['tomorrow','Tomorrow'],['someday','Someday']].map(([v,l])=>`<button class="chip ${w===v?'on':''}" data-when="${v}">${l}</button>`).join('')}
      <button class="chip ${w&&w.includes('-')?'on':'add'}" data-when="pick">${w&&w.includes('-')?whenLabel(w):'Pick a date'}</button>
      <button class="btn primary sm" id="addtodo" style="margin-left:auto">Add</button></div>
  </div>
  ${group('Overdue',overdue,'moved along with you')}
  ${group('Today',tod)}
  ${Object.entries(byDay).map(([k,items])=>group(whenLabel(k),items,fmt(k,{day:'numeric',month:'short'}))).join('')}
  ${group('Someday',bl,'no date yet')}
  ${dn.length?`<details class="fold"><summary><span>Ticked off today (${dn.length})</span></summary><div class="card" style="margin-top:8px"><ul class="tasks">${dn.map(t=>`<li><div class="todo done"><button class="tick on" data-todo="${t.id}">${ICON.check}</button><span class="name">${esc(t.text)}</span></div></li>`).join('')}</ul></div></details>`:''}
  ${!overdue.length&&!tod.length&&!ahead.length&&!bl.length&&!dn.length?`<div class="card empty"><b>Nothing planned</b>Add things whenever you think of them — today, a date, or someday.</div>`:''}`;
}
function rowTodo(t){
  return `<li><div class="todo"><button class="tick" data-todo="${t.id}" aria-label="Done">${ICON.check}</button>
    <span class="name">${esc(t.text)}</span>
    <button class="iconbtn ghosty" data-tmove="${t.id}" aria-label="Reschedule">${ICON.cal}</button>
    <button class="iconbtn ghosty" data-tdrop="${t.id}" aria-label="Remove">${ICON.trash}</button></div></li>`;
}

function pNotes(){
  const ns=notesSorted();
  return `
  <button class="btn primary block" id="newnote" style="margin-bottom:14px">New note</button>
  ${ns.length?`<div class="card" style="padding:0;overflow:hidden">${ns.map(n=>`<button class="noterow" data-note="${n.id}">
      <div class="grow"><b>${esc(noteTitle(n))}</b><p class="tiny muted">${fmt(dkey(new Date(n.updatedAt)),{day:'numeric',month:'short'})} · ${esc(notePreview(n).slice(0,48))}</p></div><span class="chev">›</span></button>`).join('')}</div>`:
    `<div class="card empty"><b>No notes</b>Somewhere to put whatever's in your head.</div>`}`;
}

/* ---------- Progress ---------- */
const DELTA=(now,prev)=>{ if(prev===null||prev===undefined) return ''; const d=now-prev; if(!d) return `<span class="delta flat">—</span>`;
  return `<span class="delta ${d>0?'up':'down'}">${d>0?'▲':'▼'}${Math.abs(d)}</span>`; };

function vProgress(){
  const L=level();
  const sub=progState.sub||'overview';
  const head=`<div class="head"><div><div class="eyebrow">${S.points.xp} XP · level ${L.L}</div><h1>Progress</h1></div></div>
    <div class="seg" style="margin-bottom:14px">${[['overview','Overview'],['calendar','Calendar'],['tasks','Tasks']].map(([v,l])=>`<button class="${sub===v?'on':''}" data-sub="${v}">${l}</button>`).join('')}</div>`;
  return head + ({overview:pOverview,calendar:pCalendar,tasks:pTasks})[sub]();
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
    <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap"><span class="pill">${ICON.flame} ${S.streak.login} day streak</span><span class="pill">${chests} chest${chests===1?'':'s'}</span>${S.freezes?`<span class="pill accent">freeze ready</span>`:''}</div>
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
    ${S.recaps.slice().reverse().map(r=>`<button class="noterow" data-recap="${r.n}" style="padding:12px 0"><div class="grow"><b>${esc(r.name)}</b><p class="tiny muted">${fmt(r.at,{day:'numeric',month:'short',year:'numeric'})} · ${r.rate}% · ${r.cleared} days cleared</p></div><span class="chev">›</span></button>`).join('')}</div>`:
    `<div class="card"><div class="row between"><div><b class="small">Next recap</b><p class="tiny muted">${(()=>{const nx=MILESTONES.find(([n])=>daysSinceStart()<n); return nx?`${nx[0]-daysSinceStart()} day${nx[0]-daysSinceStart()===1?'':'s'} to ${nx[1].toLowerCase()}`:'All milestones reached';})()}</p></div>
      <span class="pill">day ${daysSinceStart()}</span></div></div>`}
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
  return list.map(({t,s})=>{ const ts=taskStats(t);
    return `<details class="card taskcard" ${taskState.month[t.id]?'open':''}><summary><div class="grow"><div class="row between"><b>${esc(t.name)}${t.target?`<span class="tag">${t.target}m</span>`:''}</b><span class="small ${s<50?'muted':''}" style="${s>=50?'color:var(--accent)':''}">${s}%</span></div>
      <div class="strbar"><i style="width:${s}%"></i></div>
      <div class="row between" style="margin-top:8px"><span class="dots">${ts.recent.map(x=>`<i class="${x==='done'?'d':x==='missed'?'m':''}"></i>`).join('')}</span><span class="tiny muted">last 14 days</span></div></div></summary>
      <div class="body">
        <div class="stats"><div class="stat"><b>${ts.streak}</b><span>current streak</span></div><div class="stat"><b>${ts.best}</b><span>best streak</span></div>
          <div class="stat"><b>${ts.done}</b><span>done all time</span></div><div class="stat"><b>${ts.misses}</b><span>missed all time</span></div>
          ${t.target?`<div class="stat"><b>${ts.hours}</b><span>total time</span></div><div class="stat"><b>${ts.avgMin}m</b><span>avg (target ${t.target}m)</span></div>`:''}</div>
        ${taskHistory(t)}
        ${ts.reasons.length?`<div style="margin-top:14px"><h2 style="font-size:.9rem;margin-bottom:6px">Why it was missed</h2>${ts.reasons.slice(0,4).map(([r,n])=>`<div class="tod"><span class="small">${esc(r)}</span><div class="todbar"><i class="warn" style="width:${100*n/ts.misses}%"></i></div><span class="tiny muted">${n}</span></div>`).join('')}</div>`:''}
      </div></details>`; }).join('');
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
      ${e?.comment?`<p class="tiny muted" style="margin-top:2px">“${esc(e.comment)}”</p>`:''}</div>`:
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
  for(let x=t.createdAt;x<=k;x=addDays(x,1)){ const s=statusOf(x,t.id); if(s==='done'){run++;best=Math.max(best,run);done++;} else if(s==='missed'){run=0;misses++;const r=S.days[x].tasks[t.id];if(r.reason)reasons[r.reason]=(reasons[r.reason]||0)+1;if(r.comment)comments.push({date:x,comment:r.comment});} }
  // current streak: consecutive done ending today or yesterday
  let x=statusOf(k,t.id)==='done'?k:addDays(k,-1); while(x>=t.createdAt&&statusOf(x,t.id)==='done'){streak++;x=addDays(x,-1);}
  const recent=Array.from({length:14},(_,i)=>statusOf(addDays(k,i-13),t.id));
  const mins=[]; for(const d of Object.values(S.days)){ const e=d.tasks?.[t.id]; if(e?.minutes) mins.push(e.minutes); }
  const total=mins.reduce((a,b)=>a+b,0);
  return {streak,best,done,misses,reasons:Object.entries(reasons).sort((a,b)=>b[1]-a[1]),comments:comments.slice(-5).reverse(),recent,
    hours:total>=60?`${(total/60).toFixed(1)}h`:`${total}m`, avgMin:mins.length?Math.round(total/mins.length):0};
}

/* ---------- Friends ---------- */
const chestSVG = tier => ICON.chest(TIERS_C[tier].colour);
function challengeCard(raw){
  const ch=liveQuest(raw); if(!ch) return '';
  const pr=challengeProgress(ch), t=TIERS_C[ch.tier], done=pr.have>=pr.need, pc=Math.round(100*pr.have/pr.need);
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
      <span class="tiny muted">${t.rolls[0]}–${t.rolls[t.rolls.length-1]} coins</span></div>
    <div class="bar quest chal-bar"><i style="width:${clamp(pc,0,100)}%"></i></div>
    ${counts}
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">${pills}</div>
    ${done?`<button class="btn primary block" style="margin-top:12px" data-chest="${ch.id}">Open the chest</button>`:
      `<div class="row between" style="margin-top:10px"><p class="tiny muted">${ch.members.length>1?'One chest for the pair, not one each.':'One chest when you finish.'}</p>
        <button class="btn sm ghost" data-dropchal="${ch.id}">Drop</button></div>`}
  </div>`;
}
function startChallengeModal(crewId,after){
  const crew=crewId?crewOf(crewId):null;
  const busy=chalBusyPeople();
  const free=(crew?crewMembers(crew):friendList()).filter(f=>!busy.has(f.id));
  if(!free.length){ toast('Everyone is already on a challenge'); return; }
  const left=peopleLeft();
  if(left<1){ toast('Too many people on challenges'); return; }
  const openTiers=['legendary','rare','common'].filter(t=>tierSlotOpen(t));
  if(!openTiers.length){ toast('No challenge slots free'); return; }
  const picks=new Set();
  if(crew) free.slice(0,CHAL_PARTY_MAX).forEach(f=>picks.add(f.id));   // the chat IS the group — everyone's in by default
  else if(free.length===1) picks.add(free[0].id);
  let tier=openTiers.includes('legendary')?'legendary':openTiers[0];
  let qid=CHALLENGES[tier][0].id;
  const o=overlay(`<div class="modal tall"><div id="chalform"></div></div>`,'center');
  const draw=()=>{
    const cap=Math.min(partyCap(tier), left);
    const atCap=picks.size>=cap;
    if(picks.size>cap) [...picks].slice(cap).forEach(id=>picks.delete(id));
    const box=o.querySelector('#chalform');
    const n=chalCounts();
    const why=`Slots: legendary ${n.legendary}/1 · rare ${n.rare}/1 · common ${n.common}/2. Harder tier, harder challenge, bigger chest.`;
    const whoHint=`Up to ${CHAL_PARTY_MAX} people on any tier. The more of you, the bigger the pot — and the harder it gets.`;
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
      <div style="margin-top:8px">${CHALLENGES[tier].map(q=>`<button type="button" class="questpick ${qid===q.id?'on':''}" data-qid="${q.id}"><b>${esc(q.name)}</b><p class="tiny muted">${esc(q.desc)}</p><p class="tiny muted" style="margin-top:4px">${TIERS_C[tier].rolls[0]}–${TIERS_C[tier].rolls[TIERS_C[tier].rolls.length-1]} coins</p></button>`).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok ${picks.size?'':'disabled'}>Start</button></div>`;
    box.querySelectorAll('[data-fid]').forEach(b=>b.onclick=()=>{ if(picks.has(b.dataset.fid)) picks.delete(b.dataset.fid); else { if(picks.size>=cap) return; picks.add(b.dataset.fid);} haptic(); draw(); });
    box.querySelectorAll('[data-tier]').forEach(b=>b.onclick=()=>{ if(b.disabled) return; tier=b.dataset.tier; qid=CHALLENGES[tier][0].id; haptic(); draw(); });
    box.querySelectorAll('[data-qid]').forEach(b=>b.onclick=()=>{ qid=b.dataset.qid; haptic(); draw(); });
    box.querySelector('[data-x]').onclick=()=>close(o);
    const ok=box.querySelector('[data-ok]');
    ok.onclick=()=>{ if(!picks.size) return; const started=startChallenge(tier,qid,[...picks],crewId); close(o);
      if(started){ haptic('success'); if(after) after(); else render(); toast('Challenge started'); } else toast('Could not start that'); };
  };
  draw();
  o.onclick=e=>{ if(e.target===o) close(o); };
}
function vFriends(){
  const m=me(), fs=friendList();
  const live=Sync.live(), inn=Sync.signedIn();
  const banner=S.syncError?`<div class="card syncerr"><div class="row between"><div><b>Not syncing right now</b><p class="small muted">${esc(S.syncError)}</p></div><div class="stack" style="gap:6px"><button class="btn sm" id="retrysync">Retry</button><button class="btn sm ghost" id="conncheck2">Diagnose</button></div></div>
    <p class="tiny muted" style="margin-top:8px">Everything else works as normal — your tasks and history are on this device.</p></div>`:'';
  const head=`<div class="head"><div><div class="eyebrow">${!live?'Local only':!inn?'Signed out':S.syncError?'Offline':'Synced'}</div><h1>Friends</h1></div></div>${banner}`;

  if(live && !inn) return head + `
    <div class="card" data-tour="code"><div class="seg" style="margin-bottom:14px">${[['in','Sign in'],['up','Create account']].map(([v,l])=>`<button class="${authState.mode===v?'on':''}" data-authmode="${v}">${l}</button>`).join('')}</div>
      <div class="stack">
        ${authState.mode==='up'?`<input type="text" id="auname" placeholder="Your name" maxlength="24" value="${esc(m.name||'')}">`:''}
        <input type="email" id="auemail" placeholder="Email" autocomplete="email">
        <input type="password" id="aupass" placeholder="Password" autocomplete="${authState.mode==='up'?'new-password':'current-password'}">
        <button class="btn primary block" id="authgo">${authState.mode==='up'?'Create account':'Sign in'}</button>
      </div>
      <p class="tiny muted" style="margin-top:12px">${authState.mode==='up'?'An account backs up everything — tasks, history, coins — so a new phone restores it all. Only aggregates are ever shared with friends.':'Signing in on a new phone restores your tasks, history and coins.'}</p>
    </div>
    <div class="card empty"><b>Why an account?</b>Without one, clearing your browser data loses everything. Your habits stay on the device either way — this is just the safety net.</div>`;

  const inbox=(S.inbox||[]).slice(0,3);
  return head + `
  ${inbox.length?`<div class="card callout"><b>${inbox.length===1?'New message':`${inbox.length} new messages`}</b>
    <ul class="list" style="margin-top:6px">${inbox.map(x=>`<li><span>${esc(x.text)}</span><span class="small ${x.coins?'':'muted'}" style="${x.coins?'color:var(--accent)':''}">${x.coins?`+${x.coins}`:fmt(x.date,{day:'numeric',month:'short'})}</span></li>`).join('')}</ul>
    <button class="btn sm block" id="clearinbox" style="margin-top:10px">Clear</button></div>`:''}

  <div class="card" data-tour="code"><div class="row between"><div><div class="eyebrow">Your code</div><b style="font-size:1.4rem;letter-spacing:.08em">${m.code}</b>
      <p class="tiny muted" style="margin-top:4px">${esc(m.name||'No name')}${live?` · ${esc(S.me?.email||'')}`:''}</p></div>
    <div class="stack" style="gap:6px"><button class="btn sm" id="copycode">Copy</button><button class="btn sm ghost" id="renameme">Rename</button></div></div>
    <div class="row" style="margin-top:12px"><input type="text" id="addcode" placeholder="Add a friend's code" maxlength="12" style="text-transform:uppercase"><button class="btn primary" id="addfriend">Add</button></div>
    ${!live?`<p class="tiny muted" style="margin-top:10px">No server configured — adding a code creates a demo friend so you can see how it works.</p>`:
      `<p class="tiny muted" style="margin-top:10px">Adding a code pairs you both ways — they'll see you too, no need to add you back.</p>`}</div>

  ${fs.length?`<div class="section" data-tour="crews"><h2>Chats <span class="muted">${crewList().length}</span></h2>
    ${crewList().length?crewList().map(c=>{const u=crewUnread(c),last=msgsOf(c.id).slice(-1)[0];
      return `<button class="card crewrow" data-crew="${c.id}"><div class="grow"><div class="row between"><b>${esc(crewName(c))}</b>${u?`<span class="pill accent tiny">${u}</span>`:''}</div>
        <p class="tiny muted">${crewSize(c)} people${last?` · ${last.kind==='emote'?esc(last.code):esc(PHRASE_MAP[last.code]||'…')}`:' · say something'}</p></div><span class="chev">›</span></button>`;}).join(''):
      `<div class="card empty"><b>No chats yet</b>Start one with a friend, or a group — challenges get set up inside them.</div>`}
    <button class="btn ${crewList().length?'':'primary'} block" id="newcrew" style="margin-top:10px">New chat</button></div>
  <div class="section" data-tour="friend"><h2>Challenges <span class="muted">${chalCounts().people} / ${CHAL_PEOPLE_MAX}</span></h2>
    <p class="tiny muted" style="margin:-4px 0 10px">${slotSummary()}</p>
    <button class="btn ${canStartChallenge()?'primary':''} block" id="startchal" ${canStartChallenge()?'':'disabled'} style="margin-bottom:12px">${canStartChallenge()?'Start a challenge':peopleLeft()<1?'Four people already on a challenge':'No slot free'}</button>
    ${chalList().map(c=>challengeCard(c)).join('')||`<div class="card empty"><b>None running</b>One legendary with one friend, plus a rare or two commons (two people each). Grouping on rare or common shares the chest.</div>`}
  </div>`:''}

  ${fs.map(f=>{ const ps=pairStreak(f), cleared=clearedOn(f,today()), mineCleared=!!S.days[today()]?.cleared;
    const on=friendChallenge(f.id); const onQ=on?liveQuest(on):null;
    const others=onQ?onQ.members.filter(x=>x.id!==f.id):[];
    return `<div class="section"><h2>${esc(f.name)} <span class="muted">${f.title||''}</span></h2>
    <div class="card"><div class="row between"><div class="row" style="gap:10px"><span class="avatar">${esc((f.name||'?')[0]).toUpperCase()}</span>
      <div><b>${f.consistency??0}% consistent</b><p class="tiny muted">${f.streak??0} day streak · level ${f.level??1}</p></div></div>
      <span class="pill ${cleared?'accent':''}">${cleared?'Cleared today':'Not yet today'}</span></div></div>

    <div class="card pairstreak"><div class="row between"><div><div class="eyebrow">Shared streak</div><div class="heroval">${ps}<small>days</small></div>
      <p class="tiny muted">${ps?'Days you both cleared in a row.':'Starts the first day you both clear.'}</p></div>
      <div class="pairfire ${ps?'lit':''}">${ICON.flame}</div></div>
      <div class="row" style="gap:8px;margin-top:12px"><span class="pill ${mineCleared?'accent':''}">You ${mineCleared?'✓':'—'}</span><span class="pill ${cleared?'accent':''}">${esc(f.name)} ${cleared?'✓':'—'}</span></div></div>

    ${onQ?`<div class="card" style="border-color:color-mix(in srgb,${TIERS_C[onQ.tier].colour} 35%,var(--line))"><div class="row between"><div><span class="tierbadge" style="--tier:${TIERS_C[onQ.tier].colour}">${TIERS_C[onQ.tier].label}</span>
      <b style="display:block;margin-top:6px">On ${esc(onQ.name)}</b>
      <p class="tiny muted">${others.length?'with '+others.map(x=>esc(x.name)).join(', '):'just the two of you'}</p></div>
      <div class="chestmini">${chestSVG(onQ.tier)}</div></div></div>`:''}

    ${(()=>{ const p=pairOf(f); const ch=(p.chests||[]).slice(-6).reverse(); if(!ch.length) return '';
      return `<details class="fold"><summary><span>Chests won (${p.chests.length})</span><span class="tiny">${p.chests.reduce((a,c)=>a+c.amount,0)} coins</span></summary>
        <div class="card" style="margin-top:8px"><ul class="list">${ch.map(c=>`<li><span><i class="dotc" style="background:${TIERS_C[c.tier].colour}"></i>${esc(c.name)}${c.crew?.length?`<span class="tiny muted"> · ${esc(c.crew.join(', '))}</span>`:''}</span><span class="small" style="color:${TIERS_C[c.tier].colour}">+${c.amount}</span></li>`).join('')}</ul></div></details>`; })()}

    <button class="btn ${canCheer(f)?'primary':''} block" data-cheer="${f.id}" data-kind="${cleared?'cheer':'nudge'}" ${canCheer(f)?'':'disabled'}>
      ${!canCheer(f)?'Already sent today':cleared?`Cheer ${esc(f.name)} · +${CHEER_COINS} to them`:`Nudge ${esc(f.name)}`}</button>
    <div class="row between" style="margin-top:8px"><p class="tiny muted">${cleared?'A cheer sends them coins. One a day.':'A nudge is just a wave — no coins, no guilt trip.'}</p>
      <button class="btn sm ghost danger" data-unfriend="${f.id}">Remove</button></div>
    </div>`; }).join('')}

  ${!fs.length?`<div class="card empty"><b>No one yet</b>Swap codes with someone and you'll both get a shared streak. One legendary at a time with one friend; rare and common can take two.<br><span class="tiny muted" style="display:block;margin-top:10px">No leaderboard, on purpose — you're on the same side.</span></div>`:''}
  ${live&&inn?`<div class="card"><div class="row between"><div><b class="small">Backup</b><p class="tiny muted">${S.vaultAt?`Last saved ${new Date(S.vaultAt).toLocaleString()}`:'Not backed up yet'}</p></div>
    <div class="row" style="gap:6px"><button class="btn sm" id="backupnow">Back up</button><button class="btn sm ghost" id="signout">Sign out</button></div></div></div>`:''}`;
}

/* ---------- Shop ---------- */
function vShop(){
  const T=title(), L=level(); const str=avgStrength(); const canRate=str>=BUY_STRENGTH; const active=S.rewards.filter(x=>x.active);
  return `
  <div class="head"><div><div class="eyebrow">Coins to spend</div><h1>Shop</h1></div></div>
  <div class="card" data-tour="balance"><div class="balance">${S.points.coins}<small>coins</small></div>
    <div class="row between" style="margin-top:14px"><span class="pill accent">Level ${L.L} · ${T.name}</span><span class="tiny muted">${L.into} / ${L.need} XP</span></div>
    <div class="titlebar"><i style="width:${clamp(100*L.into/L.need,0,100)}%"></i></div>
    <p class="tiny muted" style="margin-top:8px">${T.next?`${T.next.name} at level ${T.next.at}. `:'Top title. '}XP is never spent — only coins are.</p></div>
  <div class="card" data-tour="gate" style="border-color:${canRate?'var(--accent)':'var(--line)'}"><div class="row between"><div><b>${canRate?'Buying unlocked':'Buying locked'}</b><p class="small muted">${canRate?`Average habit strength ${str}%. Stays open while it's ${BUY_STRENGTH}%+.`:`Average habit strength ${str}%. Reaches ${BUY_STRENGTH}% with a steady run — one miss won't reset it.`}</p></div><b style="font-size:1.5rem;color:${canRate?'var(--accent)':'var(--fg2)'}">${str}%</b></div></div>
  ${(()=>{const fc=freezeCost();return `<div class="card reward ${S.points.coins>=fc&&!S.freezes?'':'locked'}" data-tour="freeze"><div class="row between"><b>Streak freeze</b><span class="small muted">${fc} coins</span></div><p class="small muted">Covers one missed day so your login streak survives. Hold one at a time.</p>
    <button class="btn ${S.freezes?'':S.points.coins>=fc?'primary':''} block" data-freeze ${S.freezes||S.points.coins<fc?'disabled':''}>${S.freezes?'Holding one':S.points.coins>=fc?'Buy':`${fc-S.points.coins} more coins`}</button></div>`})()}
  <div class="section"><h2>Rewards <span class="muted">you set the price</span></h2>
    ${active.length?active.map(x=>{const cost=rewardPrice(x); const afford=S.points.coins>=cost; const ok=afford&&canRate; return `<div class="card reward ${ok?'':'locked'}"><div class="row between"><b>${esc(x.name)}</b><span class="small muted">${Math.min(S.points.coins,cost)}/${cost}</span></div><p class="tiny muted">${earnEta(cost)}</p><div class="bar"><i style="width:${clamp(100*S.points.coins/cost,0,100)}%"></i></div>
      <button class="btn ${ok?'primary':''} block" data-buy="${x.id}" ${ok?'':'disabled'}>${ok?'Buy':!afford?`${cost-S.points.coins} more coins`:`Strength below ${BUY_STRENGTH}%`}</button></div>`}).join(''):`<div class="card empty"><b>No rewards yet</b>Choose up to ${MAX_REWARDS} things worth earning.<br><button class="btn primary sm" style="margin-top:14px" data-go="settings" data-open="rewards">Add a reward</button></div>`}</div>
  <div class="section" data-tour="locker"><h2>Locker <span class="muted">${S.locker.filter(x=>!x.usedAt).length} to use</span></h2>
    ${S.locker.length?`<div class="card"><ul class="list">${[...S.locker].reverse().map(x=>`<li class="locker-item ${x.usedAt?'used':''}"><div><div>${esc(x.name)}</div><div class="tiny muted">${x.usedAt?'Used '+fmt(x.usedAt):'Bought '+fmt(x.boughtAt)}</div></div>${x.usedAt?'':`<button class="btn sm" data-use="${x.id}">Mark used</button>`}</li>`).join('')}</ul></div>`:'<div class="card"><p class="muted small">Things you buy land here.</p></div>'}</div>`;
}
function buy(id){
  const r=S.rewards.find(x=>x.id===id); if(!r) return; const cost=rewardPrice(r); if(S.points.coins<cost||avgStrength()<BUY_STRENGTH) return;
  modal(`<h2>Buy ${esc(r.name)}?</h2><p class="muted">${cost} coins. ${S.points.coins-cost} left after. Your level and XP don't change.</p>`,'Buy',()=>{
    S.points.coins-=cost; S.locker.push({id:uid(),rewardId:id,name:r.name,boughtAt:today()}); save(); haptic('success'); render(); toast('Bought · in your locker'); });
}
function buyFreeze(){ const fc=freezeCost(); if(S.freezes||S.points.coins<fc) return; S.points.coins-=fc; S.freezes=1; save(); haptic('success'); render(); toast('Streak freeze ready'); }

/* ---------- Settings ---------- */
function vSettings(){
  const st=S.settings; const tg=(k,on)=>`<button class="toggle ${on?'on':''}" data-toggle="${k}" role="switch" aria-checked="${on}"></button>`;
  const segS=(k,opts)=>`<div class="seg">${opts.map(([v,l])=>`<button class="${st[k]===v?'on':''}" data-set="${k}" data-val="${v}">${l}</button>`).join('')}</div>`;
  return `
  <div class="head"><div><div class="eyebrow">Steady</div><h1>Settings</h1></div></div>
  <details class="acc" id="acc-tasks" data-tour="tasks"><summary>Tasks <span class="muted">${activeTasks().length} / ${MAX_TASKS}</span></summary><div class="body">
    ${(()=>{const live=S.tasks.filter(t=>!t.archived); const n=live.length; const full=n>=MAX_TASKS; return `
    <div class="stack" style="margin-bottom:10px"><div class="row"><input type="text" id="newtask" placeholder="${full?'Task cap reached':'e.g. Walk the dog'}" maxlength="60"${full?' disabled':''}><input type="number" id="newtarget" placeholder="min" min="1" max="600" style="width:74px;padding:12px 8px;text-align:center"${full?' disabled':''}></div>
      <button class="btn primary block" id="addtask"${full?' disabled':''}>Add</button></div>
    <p class="tiny muted" style="margin:-4px 0 10px">${n} / ${MAX_TASKS} tasks${full?'':'. Minutes optional — every '+OT_PER+' minutes past a target pays +1 coin.'}</p>
    ${n?live.slice().sort((a,b)=>a.order-b.order).map(t=>`<div class="editrow"><span class="name">${esc(t.name)}${t.target?`<span class="tag">${t.target}m</span>`:''}</span><button class="iconbtn" data-rename="${t.id}" aria-label="Rename">${ICON.edit}</button><button class="iconbtn" data-deltask="${t.id}" aria-label="Remove">${ICON.trash}</button></div>`).join(''):'<p class="muted small">Add the things you want to keep doing daily.</p>'}`;})()}
    <p class="tiny muted" style="margin-top:10px">Finish every task to clear the day. Removing one takes it off the list; past days stay in Progress.</p></div></details>
  <details class="acc" id="acc-rewards" ${rewOpen?'open':''}><summary>Rewards <span class="muted">${S.rewards.filter(x=>x.active).length} / ${MAX_REWARDS}</span></summary><div class="body">
    ${budgetCard()}
    <div class="stack" style="margin:12px 0 10px">
      <input type="text" id="newreward" placeholder="e.g. Takeaway night" maxlength="60" ${S.rewards.filter(x=>x.active).length>=MAX_REWARDS?'disabled':''}>
      <div><span class="plabel">How often would you like this?</span>
        <div class="chips" id="freqpicks">${FREQS.map(f=>`<button type="button" class="chip ${newRewardFreq===f.id?'on':''}" data-freq="${f.id}">${f.label}</button>`).join('')}</div></div>
      <div class="row"><input type="number" id="newprice" min="${MIN_REWARD_PRICE}" step="10" value="${suggestFromFreq(newRewardFreq)}" style="width:118px;padding:12px 8px;text-align:center" ${S.rewards.filter(x=>x.active).length>=MAX_REWARDS?'disabled':''}>
        <button class="btn primary grow" id="addreward" ${S.rewards.filter(x=>x.active).length>=MAX_REWARDS?'disabled':''}>Add</button></div>
      <p class="tiny muted" id="priceeta">${earnEta(suggestFromFreq(newRewardFreq))}</p>
      <p class="tiny muted">Suggested from what you actually earn. Type over it if you disagree — the budget above keeps you honest.</p>
    </div>
    ${S.rewards.filter(x=>x.active).map(x=>`<div class="editrow"><span class="name">${esc(x.name)}
      <span class="tiny muted" style="font-weight:400;display:block">${rewardPrice(x)} coins · ${freqOf(rewardFreq(x)).label.toLowerCase()} · ${Math.round(monthlyCostOf(x))}/month</span></span>
      <button class="iconbtn" data-editreward="${x.id}" aria-label="Edit">${ICON.edit}</button><button class="iconbtn" data-delreward="${x.id}" aria-label="Remove">${ICON.trash}</button></div>`).join('')
      ||'<p class="muted small">Tell it how often you want something and it works out the price from what you earn.</p>'}</div></details>
  <details class="acc"><summary>Quotes <span class="muted">${S.quotes.length}</span></summary><div class="body">
    <div class="row" style="margin-bottom:10px"><input type="text" id="newquote" placeholder="Add your own…" maxlength="200"><button class="btn primary" id="addquote">Add</button></div>
    ${S.quotes.filter(q=>q.custom).map(q=>`<div class="editrow"><span class="name" style="font-weight:500">${esc(q.text)}</span><button class="iconbtn" data-delquote="${q.id}">${ICON.trash}</button></div>`).join('')}
    <p class="tiny muted" style="margin-top:10px">${S.quotes.filter(q=>q.custom).length?`${S.quotes.filter(q=>q.custom).length} of yours.`:'Yours only — nothing is added for you.'}</p></div></details>
  <details class="acc" id="acc-look" data-tour="look"><summary>Customise <span class="muted">${(THEMES[st.theme]||THEMES.teal).label} · ${st.mode}</span></summary><div class="body">
    <div class="opt" style="flex-direction:column;align-items:stretch;gap:10px"><label>Theme</label>
      <div class="themes">${Object.entries(THEMES).map(([n,t])=>{ const p=t[isDarkMode(st)?'dark':'light']; return `<button class="themechip ${st.theme===n?'on':''}" data-set="theme" data-val="${n}" aria-label="${t.label}"><span class="preview" style="background:${p.bg};border-color:${p.line}"><i style="background:${p.accent}"></i></span><span class="tiny">${t.label}</span></button>`; }).join('')}</div></div>
    <div class="opt"><label>Mode</label>${segS('mode',[['dark','Dark'],['light','Light'],['system','Auto']])}</div>
    <div class="opt" style="flex-direction:column;align-items:stretch;gap:10px"><label>Font colour</label>
      <div class="swatches">${INKS.filter(c=>isDarkMode(st)?luminance(c.hex)>0.45:luminance(c.hex)<0.28).map(c=>`<button class="sw ${st.ink===c.hex?'on':''}" data-set="ink" data-val="${c.hex}" style="background:${c.hex}" aria-label="${c.id}" title="${c.id}"></button>`).join('')}
        <input type="color" id="customink" value="${st.ink||themePalette(st).fg}" aria-label="Custom font colour">
        <button class="btn sm ghost" data-set="ink" data-val="">Theme default</button></div>
      <p class="font-preview">Aa — this is your text colour.</p></div>
    <div class="opt" style="flex-direction:column;align-items:stretch;gap:10px"><label>Design</label>
      <div class="designs">${MOTIFS.map(m=>`<button class="designchip ${st.motif===m.id?'on':''}" data-set="motif" data-val="${m.id}" aria-label="${m.label}"><span class="glyph">${MOTIF_GLYPH[m.id]}</span><span class="tiny">${esc(m.label)}</span></button>`).join('')}</div></div>
    <div class="opt"><label>Font</label>${segS('font',[['system','System'],['rounded','Rounded'],['serif','Serif'],['mono','Mono']])}</div>
    <div class="opt"><label>Text size <span class="hint">${st.textSize}%</span></label><div class="row"><button class="btn sm" data-size="-10">A−</button><button class="btn sm" data-size="10">A+</button></div></div>
    <div class="opt"><label>Motion</label>${tg('motion',st.motion)}</div>
    <div class="opt"><label>Haptics <span class="hint">where supported</span></label>${tg('haptics',st.haptics)}</div>
    <div class="opt"><label>Glow</label>${tg('glow',st.glow)}</div>
    <div class="opt"><label>Reset</label><button class="btn sm" id="resetlook">Defaults</button></div></div></details>
  <details class="acc"><summary>Affirmation <span class="muted">${S.whys.length||'none'}</span></summary><div class="body">
    <div class="row" style="margin-bottom:10px"><input type="text" id="newwhy" placeholder="" maxlength="140"><button class="btn primary" id="addwhy">Add</button></div>
    ${S.whys.map(w=>`<div class="editrow"><span class="name" style="font-weight:500">${esc(w.text)}</span><button class="iconbtn" data-delwhy="${w.id}">${ICON.trash}</button></div>`).join('')||'<p class="muted small">This is what you see when the app opens. Nothing is written for you.</p>'}</div></details>
  <details class="acc" id="acc-remind" data-tour="remind" ${remOpen?'open':''}><summary>Reminders <span class="muted">${(()=>{const st=notifyState();const c=remindCfg();
    return st==='granted'?(c.on?'on':'off'):st==='ios-needs-install'?'needs installing':st==='denied'?'blocked':'off';})()}</span></summary><div class="body">
    ${(()=>{ const st=notifyState(), c=remindCfg();
      if(st==='unsupported') return '<p class="muted small">This browser can\'t do notifications.</p>';
      if(st==='ios-needs-install') return `<div class="card callout"><b>Add Steady to your home screen first</b>
        <p class="small muted" style="margin-top:6px">On iPhone, notifications only work once the app is on your home screen — Safari can't send them from a tab. Tap <b>Share</b> (the square with the arrow), scroll down, tap <b>Add to Home Screen</b>, then open Steady from the icon and come back here.</p></div>`;
      if(st==='denied') return `<div class="card callout"><b>Notifications are blocked</b>
        <p class="small muted" style="margin-top:6px">You'll need to allow them in your browser's site settings for this page, then come back.</p></div>`;
      if(st==='default') return `<div class="stack"><p class="small muted">A nudge in the morning, and one in the evening if anything's still open. Nothing else — no marketing, ever.</p>
        <button class="btn primary block" id="asknotify">Turn on reminders</button></div>`;
      return `<div class="opt"><label>Reminders</label><button class="toggle ${c.on?'on':''}" data-remind-on role="switch" aria-checked="${c.on}"></button></div>
        <div class="opt"><label>Morning nudge</label><input type="time" id="remmorning" value="${c.morning}" style="width:130px"></div>
        <div class="opt"><label>Evening, if unfinished</label><button class="toggle ${c.eveningOn?'on':''}" data-remind-eve role="switch" aria-checked="${c.eveningOn}"></button></div>
        ${c.eveningOn?`<div class="opt"><label>Evening time</label><input type="time" id="remevening" value="${c.evening}" style="width:130px"></div>`:''}
        <div class="opt"><label>Test it</label><button class="btn sm" id="remtest">Send one now</button></div>
        <p class="tiny muted" style="margin-top:10px">${PUSH.vapidPublic?'Reminders arrive whether the app is open or not.':'These fire while the app is open. For reminders when it is closed, the server side needs setting up — see push.sql.'}</p>`;
    })()}
  </div></details>
  <details class="acc"><summary>Help</summary><div class="body small muted stack">
    <p><b style="color:var(--fg)">Coins and XP.</b> Every task done pays ${TASK_BASE} coins and ${TASK_BASE} XP, times its habit strength (up to ×1.5). Coins are spent in the shop. XP is never spent — it drives your level and title.</p>
    <p><b style="color:var(--fg)">Habit strength.</b> Each task has a 0–100% strength that climbs about 5 a day when done and fades 5% a day when not. A miss dents it; it never resets to zero.</p>
    <p><b style="color:var(--fg)">Timed tasks.</b> Give a task a target in minutes and you'll be asked how long it took. Turning up earns ${Math.round(TIME_FLOOR*100)}% of the coins whatever the clock says; the rest scales with how much of the target you did. So 15 of 30 minutes on a 10-coin task pays 8, not 5. Going over pays +1 coin per ${OT_PER} minutes on top (max +${OT_TASK_CAP} per task, +${OT_DAY_CAP} a day), coins only, never XP. A short session is still <i>done</i> — it never touches your streak, your day clear or your habit strength. Skip the prompt and you get full pay.</p>
    <p><b style="color:var(--fg)">Full-clear streak.</b> Tick every task 7 days running and you get +${CLEAR_WEEK_BONUS} coins. It doubles each further week — ${[1,2,3,4,5].map(b=>clearWeekBonus(b)).join(', ')} — then holds at ${CLEAR_WEEK_CAP} for as long as the run lasts. Miss a full clear and it starts from ${CLEAR_WEEK_BONUS} again.</p>
    <p><b style="color:var(--fg)">When something keeps slipping.</b> Miss the same task ${STUCK_MISSES} days in a row and the app offers to halve the target and suggests a few things that actually work — shrinking it, anchoring it to a habit that never slips, deciding when and where in advance. It won't ask again about that task for ${ADVICE_COOLDOWN} days.</p>
    <p><b style="color:var(--fg)">Day cleared.</b> Finish every task and you get +${CLEAR_PER_TASK} per task on top. Nothing ever subtracts points.</p>
    <p><b style="color:var(--fg)">Weekly chest.</b> Clear ${CHEST_DAYS} of 7 days (Mon–Sun) and a free day's coins (+${chestCoins()}) land on Monday.</p>
    <p><b style="color:var(--fg)">Streak.</b> Open the app daily. +5 from day two, +10 from day seven, +15 from day thirty. A streak freeze (${freezeCost()} coins) covers one missed day.</p>
    <p><b style="color:var(--fg)">Shop.</b> You say how often you'd like a reward — weekly, fortnightly, monthly, now and then — and the price is worked out from what you actually earn (measured over your last four weeks, not a theoretical perfect run). Type over it if you disagree. The budget line shows what all your rewards want per month against what you bring in; over 90% it goes amber, over 100% red. <b>Balance these for me</b> rescales every price to fit while keeping your chosen frequencies, and shows you the before and after first — nothing changes until you tap Apply. Adding a reward makes the others cheaper, because a fixed income split more ways costs less each time: you can have more different rewards, or rarer and more meaningful ones, not both.</p>
    <p><b style="color:var(--fg)">Old note.</b> You set each reward's price in coins. Week and fortnight chips are 7 and 14 clear days from the tasks you have set (each task pays ${TASK_BASE} plus ${CLEAR_PER_TASK} for clearing). As you type a price, the days shown are that price divided by a clear day. Lowering a price asks you to confirm. You can only spend when average habit strength is ${BUY_STRENGTH}%+. Missing never costs you anything.</p>
    <p><b style="color:var(--fg)">Task cap.</b> Up to ${MAX_TASKS} tasks.</p>
    <p><b style="color:var(--fg)">Today's list.</b> The list under your tasks is outside the whole economy — no coins, no strength, no miss gate. Unfinished items just carry over. The backlog is a pool to pull from when you have cleared your day and are at a loose end.</p>
    <p><b style="color:var(--fg)">Chats.</b> Group chats of up to ${CREW_MAX}. You can't type — you pick from a set list of phrases and emotes, like the quick chat in a game. Nothing to moderate, nothing to leak, and no way to be unpleasant in it. There's a rate limit so nobody can spam. Challenges are set up inside a chat, and everyone in it joins by default.</p>
    <p><b style="color:var(--fg)">Group challenges.</b> Up to ${CHAL_PARTY_MAX} people. Each extra head adds ${Math.round(CREW_BONUS_PER_HEAD*100)}% to the pot, capped at double. Bigger groups make the streak-type challenges genuinely harder — one person's bad Tuesday can reset it — so that bonus is payment for real risk.</p>
    <p><b style="color:var(--fg)">Friends.</b> Pair up by swapping codes. Shared streaks, cheers and nudges work with everyone. Cheer them when they've cleared (+${CHEER_COINS} coins to them, once a day) or nudge when they haven't. There's no leaderboard, deliberately.</p>
    <p><b style="color:var(--fg)">Challenges and chests.</b> You start these. Up to ${CHAL_PEOPLE_MAX} people can be on live challenges at once. You choose the tier when you invite someone, and the tier sets how hard it is. You can have one legendary, one rare and two commons running at the same time — they don't block each other. A friend can only be on one challenge with you at a time. Finish it and you open <i>one</i> chest (grouping on rare or common shares it): <span style="color:${TIERS_C.common.colour}">Common</span> pays ${TIERS_C.common.rolls.join('/')}, <span style="color:${TIERS_C.rare.colour}">Rare</span> ${TIERS_C.rare.rolls.join('/')}, <span style="color:${TIERS_C.legendary.colour}">Legendary</span> ${TIERS_C.legendary.rolls.join('/')} — which one you get is luck. Combined totals scale with party size so grouping isn't a shortcut. Drop a challenge to free the slot; the timer starts again if you retry. Challenges can't be failed; a bad patch just takes longer.</p>
    <p class="tiny">Build ${BUILD}</p>
    <p><b style="color:var(--fg)">Privacy.</b> Everything lives on this device by default. If you add a friend, only aggregates sync: cleared/done counts, streak, consistency and level. Task names, day notes, miss reasons and your affirmation never leave this device.</p>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="conncheck">Check connection</button><button class="btn sm" id="replay">Replay tour</button><button class="btn sm" id="export">Export data</button><button class="btn sm danger" id="wipe">Erase everything</button></div></div></details>`;
}
/* ---------- Event binding ---------- */
function bind(){
  const q=s=>$app.querySelector(s), qa=s=>[...$app.querySelectorAll(s)];
  qa('[data-go]').forEach(b=>b.onclick=()=>{ const open=b.dataset.open; setTab(b.dataset.go); if(open){ const acc=document.getElementById('acc-'+open); if(acc){acc.open=true; acc.querySelector('input')?.focus();} } });
  // Today
  qa('[data-task]').forEach(b=>b.onclick=()=>{ const id=b.dataset.task; sel.has(id)?sel.delete(id):sel.add(id); b.classList.toggle('selected'); haptic(); updateConfirm(); });
  updateConfirm();
  // Progress
  // Plan — list
  qa('[data-psub]').forEach(b=>b.onclick=()=>{ planState.sub=b.dataset.psub; haptic(); render(); window.scrollTo({top:0}); });
  qa('[data-when]').forEach(b=>b.onclick=()=>{ const v=b.dataset.when;
    if(v==='pick'){ promptDate('When?', planState.when&&planState.when.includes('-')?planState.when:addDays(today(),2), d=>{ planState.when=d; render(); }); return; }
    planState.when=v; haptic(); render(); });
  const whenDay=()=>{ const w=planState.when; return w==='today'?today():w==='tomorrow'?addDays(today(),1):w==='someday'?null:w; };
  const nl=q('#newtodo'); if(nl){ const add=()=>{const v=nl.value.trim(); if(!v) return; addTodo(v,whenDay()); haptic(); render(); document.getElementById('newtodo')?.focus();};
    q('#addtodo').onclick=add; nl.onkeydown=e=>{if(e.key==='Enter')add();}; }
  qa('[data-todo]').forEach(b=>b.onclick=()=>{ const el=b.closest('.todo'); const id=b.dataset.todo; const t=S.todos.find(x=>x.id===id);
    haptic(); if(!t.done&&S.settings.motion){ el.classList.add('ticking'); setTimeout(()=>{toggleTodo(id);render();},200); } else { toggleTodo(id); render(); } });
  qa('[data-tmove]').forEach(b=>b.onclick=()=>{ const t=S.todos.find(x=>x.id===b.dataset.tmove);
    moveSheet(t); });
  qa('[data-pull]').forEach(b=>b.onclick=()=>{ setTodoDay(b.dataset.pull,today()); haptic(); render(); toast('Moved to today'); });
  qa('[data-tdrop]').forEach(b=>b.onclick=()=>{ const t=S.todos.find(x=>x.id===b.dataset.tdrop); dropTodo(b.dataset.tdrop); haptic(); render();
    toast('Removed','Undo',()=>{ S.todos.push(t); save(); render(); }); });
  // Plan — notes
  const nn=q('#newnote'); if(nn) nn.onclick=()=>{ const n=addNote(); render(); noteEditor(n.id); };
  qa('[data-note]').forEach(b=>b.onclick=()=>noteEditor(b.dataset.note));
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
        if(blob && (S.tasks.length||Object.keys(S.days).length)){
          render();
          modal('<h2>Restore your backup?</h2><p class="muted">This device already has data on it. Restoring replaces it with what is saved to your account.</p>','Restore',()=>{ Sync.applyVault(blob); render(); toast('Restored'); friendsTick(); });
        } else { if(blob) Sync.applyVault(blob); render(); toast('Signed in'); friendsTick(); }
      }
    }catch(e){ ag.disabled=false; ag.textContent=authState.mode==='up'?'Create account':'Sign in'; toast(e.message||'Could not sign in'); }
  };
  const so=q('#signout'); if(so) so.onclick=()=>modal('<h2>Sign out?</h2><p class="muted">Your tasks and history stay on this device. Sign back in any time.</p>','Sign out',async()=>{ await Sync.signOut(); render(); toast('Signed out'); });
  const bn=q('#backupnow'); if(bn) bn.onclick=async()=>{ bn.textContent='…'; await Sync.backup(); render(); toast(S.syncError?'Backup failed':'Backed up'); };
  const rn=q('#renameme'); if(rn) rn.onclick=()=>prompt$('Your name',me().name||'',async v=>{ await Sync.rename(v); render(); });
  const ci=q('#clearinbox'); if(ci) ci.onclick=()=>{ S.inbox=[]; save(); render(); };
  const cc=q('#copycode'); if(cc) cc.onclick=()=>{ navigator.clipboard?.writeText(me().code); toast('Code copied'); };
  const af=q('#addfriend'); if(af){ const add=async()=>{ const v=q('#addcode').value.trim(); if(!v) return; af.disabled=true; af.textContent='…';
      try{ const f=await Sync.addByCode(v); haptic('success'); render(); toast(`${f.name} added`); }
      catch(e){ af.disabled=false; af.textContent='Add'; toast(e.message||'Could not add that code'); } };
    af.onclick=add; q('#addcode').onkeydown=e=>{if(e.key==='Enter')add();}; }
  qa('[data-unfriend]').forEach(b=>b.onclick=()=>{ const f=S.friends[b.dataset.unfriend];
    modal(`<h2>Remove ${esc(f.name)}?</h2><p class="muted">Your shared streak goes with it. If they're on a challenge, they leave it.</p>`,'Remove',async()=>{ await Sync.removeFriend(f.id); render(); toast('Removed'); },true); });
  const sc=q('#startchal'); if(sc) sc.onclick=()=>startChallengeModal();
  qa('[data-crew]').forEach(b=>b.onclick=()=>chatView(b.dataset.crew));
  const nc=q('#newcrew'); if(nc) nc.onclick=()=>crewSheet(null);
  qa('[data-chest]').forEach(b=>b.onclick=()=>{ const win=claimChest(b.dataset.chest); if(win) chestScene(win); else toast('Not ready yet'); });
  qa('[data-dropchal]').forEach(b=>b.onclick=()=>{
    const ch=liveQuest(chalList().find(c=>c.id===b.dataset.dropchal)||{});
    modal(`<h2>Drop ${esc(ch?.name||'this challenge')}?</h2><p class="muted">No chest, no penalty. The slot frees up. Starting it again resets the timer.</p>`,'Drop',()=>{ dropChallenge(b.dataset.dropchal); render(); toast('Challenge dropped'); },true);
  });
  qa('[data-cheer]').forEach(b=>b.onclick=async()=>{ const f=S.friends[b.dataset.cheer]; const kind=b.dataset.kind;
    b.disabled=true; await Sync.cheer(f,kind); haptic('success'); render();
    toast(S.syncError?'Could not send':(kind==='cheer'?`Cheer sent to ${f.name}`:`Nudge sent to ${f.name}`)); });
  qa('[data-recap]').forEach(b=>b.onclick=()=>{ const r=S.recaps.find(x=>String(x.n)===b.dataset.recap); if(r) recapView(r,false); });
  qa('[data-sub]').forEach(b=>b.onclick=()=>{progState.sub=b.dataset.sub;haptic();render();window.scrollTo({top:0});});
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
  const dn=q('#daynote'); if(dn) dn.oninput=()=>{ day(progState.sel).note=dn.value; save(); };
  // Shop
  qa('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy));
  const fz=q('[data-freeze]'); if(fz) fz.onclick=buyFreeze;
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
  const nw=q('#newwhy'); if(nw){ const add=()=>{const v=nw.value.trim(); if(!v) return; S.whys.push({id:uid(),text:v}); save(); haptic(); render(); qa('.acc')[4].open=true; document.getElementById('newwhy')?.focus();};
    q('#addwhy').onclick=add; nw.onkeydown=e=>{if(e.key==='Enter')add();}; }
  qa('[data-delwhy]').forEach(b=>b.onclick=()=>{ S.whys=S.whys.filter(w=>w.id!==b.dataset.delwhy); save(); render(); qa('.acc')[4].open=true; });
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
  const rb=q('[data-rebalance]'); if(rb) rb.onclick=()=>rebalanceSheet();
  const addR=()=>{ const v=(nr?.value||'').trim(); if(!v||S.rewards.filter(x=>x.active).length>=MAX_REWARDS) return;
    let price=Math.round(Number(np?.value)||0); if(!price) price=suggestFromFreq(newRewardFreq);
    if(price<MIN_REWARD_PRICE){ toast('Minimum '+MIN_REWARD_PRICE+' coins'); return; }
    S.rewards.push({id:uid(),name:v,active:true,tier:'custom',price,freq:newRewardFreq}); save(); haptic(); rewOpen=true; render();
    const b=budgetState();
    if(b.level==='over') toast('Over budget — tap Balance these for me','Balance',()=>rebalanceSheet());
    else toast('Reward added'); };
  if(nr){ q('#addreward').onclick=addR; nr.onkeydown=e=>{if(e.key==='Enter')addR();}; if(np) np.onkeydown=e=>{if(e.key==='Enter')addR();}; }
  qa('[data-editreward]').forEach(b=>b.onclick=()=>{ const r=S.rewards.find(x=>x.id===b.dataset.editreward); if(r) editReward(r); });
  qa('[data-delreward]').forEach(b=>b.onclick=()=>{const x=S.rewards.find(r=>r.id===b.dataset.delreward);x.active=false;save();render();document.getElementById('acc-rewards').open=true;});
  // quotes
  const nq=q('#newquote'); if(nq){ q('#addquote').onclick=()=>{const v=nq.value.trim();if(!v)return;S.quotes.push({id:uid(),text:v,author:'',custom:true});save();render();$app.querySelectorAll('.acc')[2].open=true;}; }
  qa('[data-delquote]').forEach(b=>b.onclick=()=>{S.quotes=S.quotes.filter(x=>x.id!==b.dataset.delquote);save();render();$app.querySelectorAll('.acc')[2].open=true;});
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
  const ro=q('[data-remind-on]'); if(ro) ro.onclick=()=>{ const c=remindCfg(); c.on=!c.on; save(); haptic(); render(); keepRem(); };
  const re=q('[data-remind-eve]'); if(re) re.onclick=()=>{ const c=remindCfg(); c.eveningOn=!c.eveningOn; save(); haptic(); render(); keepRem(); };
  const rm=q('#remmorning'); if(rm) rm.onchange=()=>{ remindCfg().morning=rm.value; save(); subscribePush().catch(()=>{}); toast('Morning nudge set'); };
  const rv=q('#remevening'); if(rv) rv.onchange=()=>{ remindCfg().evening=rv.value; save(); subscribePush().catch(()=>{}); toast('Evening nudge set'); };
  const rt=q('#remtest'); if(rt) rt.onclick=async()=>{ const ok=await showLocal('Steady', reminderBody(), 'steady-test');
    toast(ok?'Sent':'Could not send — check permission'); };
  const ii=q('[data-iosinstall]'); if(ii) ii.onclick=()=>iosInstallSheet();
  const rp=q('#replay'); if(rp) rp.onclick=()=>{S.flags.tours={};save();setTab('today');};
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
  const o=overlay(`<div class="modal"><h2>Edit task</h2><div class="stack" style="margin-top:12px"><input type="text" id="en" value="${esc(t.name)}" maxlength="60">
    <div class="row"><input type="number" id="et" value="${t.target||''}" placeholder="Target minutes (optional)" min="1" max="600" style="flex:1;padding:12px 14px"><button class="btn sm" id="eclear">Clear</button></div>
    <p class="tiny muted">With a target set, you'll be asked how long it took each time you tick it off.</p></div>
    <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok>Save</button></div></div>`,'center');
  o.querySelector('#eclear').onclick=()=>{o.querySelector('#et').value='';};
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelector('[data-ok]').onclick=()=>{ const n=o.querySelector('#en').value.trim(); if(!n) return; t.name=n; const tg=clamp(Math.round(Number(o.querySelector('#et').value)||0),0,600); t.target=tg||null; save(); close(o); render(); document.getElementById('acc-tasks').open=true; };
}


function editReward(r){
  const cur=rewardPrice(r);
  const sp=suggestedPrices();
  const o=overlay(`<div class="modal"><h2>Price for “${esc(r.name)}”</h2>
    <div style="margin-top:12px"><span class="plabel">How often</span>
      <div class="chips" id="efreq">${FREQS.map(f=>`<button type="button" class="chip ${rewardFreq(r)===f.id?'on':''}" data-ef="${f.id}">${f.label}</button>`).join('')}</div></div>
    <input type="number" id="ep" value="${cur}" min="${MIN_REWARD_PRICE}" step="10" style="margin-top:12px">
    <div class="chips" style="margin-top:10px"><button type="button" class="chip" data-epreset="${sp.week}">A week · ${sp.week}</button><button type="button" class="chip" data-epreset="${sp.fortnight}">A fortnight · ${sp.fortnight}</button></div>
    <p class="tiny muted" id="eeta" style="margin-top:10px">${earnEta(cur)}</p>
    <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok>Save</button></div></div>`,'center');
  const i=o.querySelector('#ep'); const eta=o.querySelector('#eeta');
  let ef=rewardFreq(r);
  o.querySelectorAll('[data-ef]').forEach(b=>b.onclick=()=>{ ef=b.dataset.ef;
    o.querySelectorAll('[data-ef]').forEach(x=>x.classList.toggle('on',x===b));
    const others=S.rewards.filter(x=>x.active&&x.id!==r.id);
    o.querySelector('#ep').value=suggestFromFreq(ef,others); upd(); haptic(); });
  const upd=()=>{ const n=Math.round(Number(i.value)||0); eta.textContent=n<MIN_REWARD_PRICE?('Minimum '+MIN_REWARD_PRICE+' coins'):earnEta(n); };
  i.oninput=upd;
  o.querySelectorAll('[data-epreset]').forEach(b=>b.onclick=()=>{ i.value=b.dataset.epreset; o.querySelectorAll('[data-epreset]').forEach(x=>x.classList.toggle('on',x===b)); upd(); });
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelector('[data-ok]').onclick=()=>{
    const n=Math.max(MIN_REWARD_PRICE, Math.round(Number(i.value)||0));
    if(n<cur){
      close(o);
      const instant=S.points.coins>=n && S.points.coins<cur;
      modal(`<h2>Lower the price?</h2><p class="muted">${esc(r.name)} from ${cur} to ${n} coins.${instant?' You will be able to buy it immediately.':''}</p>`,'Lower it',()=>{ r.price=n; r.tier='custom'; r.freq=ef; save(); rewOpen=true; render(); });
      return;
    }
    r.price=n; r.tier='custom'; r.freq=ef; save(); close(o); rewOpen=true; render();
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
    <div class="foot"><button class="btn" data-x>Cancel</button></div></div>`);
  o.querySelector('[data-x]').onclick=()=>close(o);
  o.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{ setTodoDay(t.id,opts[b.dataset.mv][1]); close(o); haptic(); render(); });
  o.querySelector('[data-mvpick]').onclick=()=>{ close(o); promptDate('When?',t.day&&t.day>today()?t.day:addDays(today(),2),d=>{ setTodoDay(t.id,d); haptic(); render(); }); };
}
function noteEditor(id){
  const n=S.notes.find(x=>x.id===id); if(!n) return;
  const g=document.createElement('div'); g.className='gate noteedit';
  g.innerHTML=`<div class="noteedit-bar"><button class="btn ghost sm" data-back>‹ Notes</button><span class="tiny muted" id="nsaved"></span><button class="iconbtn" data-del aria-label="Delete">${ICON.trash}</button></div>
    <textarea id="nbody" placeholder="Start typing…">${esc(n.body)}</textarea>`;
  document.body.appendChild(g);
  const ta=g.querySelector('#nbody'); const st=g.querySelector('#nsaved');
  setTimeout(()=>ta.focus(),120);
  let t0; ta.oninput=()=>{ clearTimeout(t0); t0=setTimeout(()=>{ saveNote(id,ta.value); st.textContent='Saved'; setTimeout(()=>st.textContent='',1200); },400); };
  const leave=()=>{ saveNote(id,ta.value); if(!ta.value.trim()) dropNote(id); g.remove(); render(); };
  g.querySelector('[data-back]').onclick=leave;
  g.querySelector('[data-del]').onclick=()=>modal('<h2>Delete this note?</h2><p class="muted">It cannot be recovered.</p>','Delete',()=>{ dropNote(id); g.remove(); render(); },true);
}

/* ---------- Time sheet (timed tasks) ---------- */
function timeSheet(timed){
  const mins={}; timed.forEach(t=>mins[t.id]=t.target);
  const room=()=>OT_DAY_CAP-overtimeToday();
  const opts=t=>[t.target,t.target+5,t.target+10,t.target+15,t.target+30];
  const card=t=>`<div class="card" style="padding:14px" data-time="${t.id}"><div class="row between"><b>${esc(t.name)}</b><span class="small muted" data-out>target ${t.target}m</span></div>
    <div class="timerow">${opts(t).map((m,i)=>`<button class="chip ${i===0?'on':''}" data-m="${m}">${m}m${i===0?'':''}</button>`).join('')}<button class="chip add" data-other>Other</button></div></div>`;
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>How long did ${timed.length===1?'it':'each'} take?</h2><p class="muted small" style="margin-bottom:14px">Still counts as done either way — a short session just pays less of the coins. Over the target pays +1 per ${OT_PER} minutes on top.</p><p class="small" style="color:var(--accent);margin-bottom:12px" data-cap hidden>Daily time bonus capped at +${OT_DAY_CAP} — extra minutes past this won't add more.</p><div class="stack">${timed.map(card).join('')}</div><div class="foot"><button class="btn" data-skip>Skip</button><button class="btn primary" data-ok>Mark done</button></div></div>`);
  const refresh=()=>{ let left=room();
    timed.forEach(t=>{ const c=o.querySelector(`[data-time="${t.id}"] [data-out]`); const raw=overtimeFor(t,mins[t.id]); const b=clamp(raw,0,Math.max(0,left)); left-=b;
      const pay=paidValue(t,mins[t.id]);
      c.innerHTML=b?`<span class="otval">+${pay+b}</span> coins`
        :mins[t.id]<t.target?`<span class="otval">+${pay}</span> coins <span class="tiny muted">of ${taskValue(t)}</span>`
        :`<span class="otval">+${pay}</span> coins`; });
    o.querySelector('[data-ok]').textContent=sel.size>1?`Mark ${sel.size} done`:'Mark done';
    const cap=o.querySelector('[data-cap]'); if(cap) cap.hidden=left>0; };
  timed.forEach(t=>{ const el=o.querySelector(`[data-time="${t.id}"]`);
    const pick=(m,btn)=>{ el.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); btn?.classList.add('on'); mins[t.id]=m; haptic(); refresh(); };
    el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>pick(Number(b.dataset.m),b));
    el.querySelector('[data-other]').onclick=()=>promptNum('Minutes on “'+t.name+'”',mins[t.id],v=>{ const b=document.createElement('button'); b.className='chip on'; b.textContent=v+'m'; b.dataset.m=v; b.onclick=()=>pick(v,b); el.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); el.querySelector('[data-other]').before(b); mins[t.id]=v; refresh(); });
  });
  o.querySelector('[data-skip]').onclick=()=>{ close(o); completeSelected(); };
  o.querySelector('[data-ok]').onclick=()=>{ close(o); completeSelected(mins); };
  refresh();
}
function promptNum(titleTxt,val,fn){
  const o=overlay(`<div class="modal"><h2>${esc(titleTxt)}</h2><input type="number" id="pv" value="${val}" min="1" max="600" style="margin-top:12px;width:100%;padding:12px 14px"><div style="display:flex;gap:10px;margin-top:18px"><button class="btn" style="flex:1" data-x>Cancel</button><button class="btn primary" style="flex:1" data-ok>Save</button></div></div>`,'center');
  const i=o.querySelector('#pv'); setTimeout(()=>{i.focus();i.select();},100);
  o.querySelector('[data-x]').onclick=()=>close(o);
  const ok=()=>{ const v=clamp(Math.round(Number(i.value)||0),1,600); close(o); fn(v); };
  o.querySelector('[data-ok]').onclick=ok; i.onkeydown=e=>{if(e.key==='Enter')ok();};
}

/* ---------- Miss-why gate ---------- */
function missGate(){
  const pend=S.pendingMisses; if(!pend.length) return false;
  const reasons=[...DEFAULT_REASONS,...S.customReasons]; const picked={};
  const item=(p,i)=>{const t=S.tasks.find(x=>x.id===p.taskId); return `<div class="card" style="padding:12px" data-miss="${i}"><div class="row between"><b>${esc(t?.name||'Task')}</b><span class="tiny muted">${fmt(p.date)}</span></div><div class="chips" style="margin-top:10px">${reasons.map(r=>`<button class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join('')}<button class="chip add" data-custom>+ Other</button></div><input type="text" placeholder="Anything to add? (optional)" style="margin-top:10px;padding:9px 12px" data-c maxlength="120"></div>`;};
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>${pend.length===1?'One thing slipped':pend.length+' things slipped'}</h2><p class="muted small" style="margin-bottom:14px">No points lost. Just say why — patterns show up in Progress.</p>${pend.length>1?`<div class="chips" style="margin-bottom:12px"><span class="tiny muted" style="align-self:center">Same for all:</span>${reasons.map(r=>`<button class="chip" data-all="${esc(r)}">${esc(r)}</button>`).join('')}</div>`:''}<div class="stack">${pend.map(item).join('')}</div><div class="foot"><button class="btn primary" data-ok disabled>Save</button></div></div>`);
  const okb=o.querySelector('[data-ok]');
  const check=()=>{okb.disabled=Object.keys(picked).length<pend.length;};
  o.querySelectorAll('[data-miss]').forEach(card=>{ const i=card.dataset.miss;
    card.querySelectorAll('[data-r]').forEach(c=>c.onclick=()=>{card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');picked[i]=c.dataset.r;haptic();check();});
    card.querySelector('[data-custom]').onclick=()=>prompt$('What got in the way?','',v=>{ if(!S.customReasons.includes(v)){S.customReasons.push(v);save();} const b=document.createElement('button');b.className='chip on';b.textContent=v;b.dataset.r=v;b.onclick=()=>{card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');picked[i]=v;check();}; card.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); card.querySelector('[data-custom]').before(b); picked[i]=v; check(); });
  });
  o.querySelectorAll('[data-all]').forEach(a=>a.onclick=()=>{ o.querySelectorAll('[data-all]').forEach(x=>x.classList.remove('on')); a.classList.add('on'); o.querySelectorAll('[data-miss]').forEach(card=>{ card.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x.dataset.r===a.dataset.all)); picked[card.dataset.miss]=a.dataset.all; }); haptic(); check(); });
  okb.onclick=()=>{ o.querySelectorAll('[data-miss]').forEach(card=>{const i=card.dataset.miss;const p=pend[i];const e=day(p.date).tasks[p.taskId]; if(e){e.reason=picked[i];const c=card.querySelector('[data-c]').value.trim();if(c)e.comment=c;}}); S.pendingMisses=[]; save(); close(o); haptic(); render(); toast('Noted. Fresh day.'); };
  return true;
}

/* ---------- Quote gate ---------- */
function quoteGate(next){
  const a=affirmationToday();
  if(!a||S.flags.quoteDate===today()){ next(); return; }
  const g=document.createElement('div'); g.className='gate';
  g.innerHTML=`<p class="q">${esc(a.text)}</p><div class="actions"><button class="btn primary block" id="startday">Start the day</button></div>`;
  document.body.appendChild(g);
  g.querySelector('#startday').onclick=()=>{ S.flags.quoteDate=today(); save(); haptic(); g.style.transition='opacity .3s'; g.style.opacity=0; setTimeout(()=>{g.remove();next();},300); };
}

/* ---------- Onboarding ---------- */
function onboarding(next){
  if(S.flags.onboarded){ next(); return; }
  let step=0; const picks=new Set(); const targets={}; let line='';
  const g=document.createElement('div'); g.className='gate onb'; document.body.appendChild(g);
  const SUG=[['Walk',20],['Read',15],['No phone in bed',0],['Drink 2L water',0],['Tidy up',10],['Stretch',10],['Journal',0],['Study',30]];
  const draw=()=>{
    const steps=`<div class="steps">${[0,1].map(i=>`<i class="${i<=step?'on':''}"></i>`).join('')}</div>`;
    if(step===0) g.innerHTML=`${steps}<h1>Why are you doing this?</h1>
      <p>Not the goal — the reason underneath it. What is it you actually want out of keeping your word to yourself?</p>
      <textarea id="onbwhy" style="margin-top:16px" maxlength="140" placeholder="e.g. I want to be someone who follows through."></textarea>
      <p class="tiny muted" style="margin-top:10px">This is your affirmation. You'll see it on the opening screen every day, and it sits in Settings where you can change it or add more. On the days you can't be bothered, it's the thing that's meant to catch you.</p>
      <div class="actions"><button class="btn primary block" data-n ${line?'':'disabled'}>Next</button>
        <button class="btn ghost block" data-skip0 style="margin-top:8px">Skip — I'll write one later</button></div>`;
    if(step===1) g.innerHTML=`${steps}<h1>Pick two or three to start.</h1><p>You can change these any time in Settings. Fewer is better.</p><div class="chips" style="margin-top:18px">${SUG.map(([s,m])=>`<button class="chip ${picks.has(s)?'on':''}" data-p="${esc(s)}" data-mt="${m}">${esc(s)}${m?` <span class="tiny muted">${m}m</span>`:''}</button>`).join('')}</div><div class="row" style="margin-top:14px"><input type="text" id="onbtask" placeholder="Or write your own" maxlength="60"><button class="btn" id="onbadd">Add</button></div><div class="actions"><button class="btn primary block" data-n>${picks.size?`Start with ${picks.size}`:'Start with none for now'}</button></div>`;
    g.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{ if(step===0) line=(g.querySelector('#onbwhy')?.value||'').trim(); haptic(); if(step<1){step++;draw();} else finish(); });
    g.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{const v=b.dataset.p;if(picks.has(v))picks.delete(v);else{if(picks.size>=MAX_TASKS)return;picks.add(v);targets[v]=Number(b.dataset.mt)||null;}draw();});
    const oa=g.querySelector('#onbadd'); if(oa){ const add=()=>{const v=g.querySelector('#onbtask').value.trim();if(v){if(picks.size>=MAX_TASKS)return;picks.add(v);targets[v]=null;draw();}}; oa.onclick=add; g.querySelector('#onbtask').onkeydown=e=>{if(e.key==='Enter')add();}; }
    const sk=g.querySelector('[data-skip0]'); if(sk) sk.onclick=()=>{ line=''; haptic(); step=1; draw(); };
    const ta=g.querySelector('#onbwhy'); if(ta){ const go=g.querySelector('[data-n]'); ta.oninput=()=>{ go.disabled=!ta.value.trim(); }; setTimeout(()=>ta.focus(),50); }
  };
  const finish=()=>{ if(line) S.whys=[{id:uid(),text:line}]; [...picks].forEach((n,i)=>S.tasks.push({id:uid(),name:n,createdAt:today(),order:i,archived:false,target:targets[n]||null})); S.flags.onboarded=true; save(); g.remove(); next(); };
  draw();
}

/* ---------- Spotlight tour ---------- */
const TOURS={
  today:[['ring','Coins earned today. Each task pays 10, boosted by its habit strength.'],['tasks','Tap to pick, confirm at the bottom. The thin bar is strength — it grows when you show up and only dents when you don’t.'],['week','Clear 6 of 7 days and a chest lands Monday.'],['coins','Your coin balance. Tap it to jump to the shop.']],
  plan:[['listadd','Add anything, dated whenever you like — today, a date, or someday.']],
  progress:[['hero','One number: how consistent you have been lately, and which way it is moving.'],['stats','Every figure is compared with the period before it.'],['pattern','Where you actually fall over. Thursdays are rarely a coincidence.']],
  shop:[['balance','Coins to spend. XP fills the level bar and is never spent.'],['gate','Spending unlocks when average habit strength is 70%+.'],['freeze','Cheap insurance: one missed day, streak intact.'],['locker','What you buy lands here. Mark it used when you’ve enjoyed it.']],
  settings:[['tasks','Add, rename or remove tasks.'],['look','Make it yours — theme, font colour, designs, type.']],
  friends:[['crews','Chats. Fixed phrases and emotes only — no typing, nothing to moderate. Challenges get started inside a chat.'],['code','Swap codes to pair up — adding one pairs you both ways. Only totals sync, never task names or notes.'],['friend','Invite someone to a challenge and pick the tier — that sets how hard it is and how big the chest. One legendary, one rare and two commons can run at once.']],
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
    : b.level==='tight' ? `That is just about everything you earn. No slack for streak freezes or a chest.`
    : `That fits, with room for freezes and challenges.`;
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
  const after=plan.reduce((a,x)=>a+x.to*freqOf(x.freq).per,0)
    + b.active.filter(r=>!plan.some(x=>x.r.id===r.id)).reduce((a,r)=>a+monthlyCostOf(r),0);
  const warn=plan.filter(x=>x.raises&&x.halfway);
  const o=overlay(`<div class="sheet"><div class="grab"></div><h2>Rebalance your rewards?</h2>
    <p class="muted small" style="margin-bottom:12px">Frequencies stay exactly as you set them. Only the prices move.</p>
    <ul class="list">${plan.map(x=>`<li><div><div>${esc(x.r.name)}</div><div class="tiny muted">${freqOf(x.freq).label.toLowerCase()}</div></div>
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

function chatView(crewId){
  const c=crewOf(crewId); if(!c) return;
  markCrewSeen(c);
  const g=document.createElement('div'); g.className='gate chat'; document.body.appendChild(g);
  let mode='phrase';
  const nameOf=id=>id==='me'?'You':(S.friends[id]?.name||'Them');
  const draw=()=>{
    const ms=msgsOf(crewId);
    const ch=chalList().find(x=>x.crewId===crewId);
    g.innerHTML=`
    <div class="chat-bar">
      <button class="btn ghost sm" data-back>‹ Back</button>
      <div class="chat-title"><b>${esc(crewName(c))}</b><span class="tiny muted">${crewSize(c)} people</span></div>
      <button class="iconbtn" data-cinfo aria-label="Chat settings">⋯</button>
    </div>
    <div class="chat-scroll" id="scroll">
      ${ch?chalCardInChat(ch):`<div class="card chatchal"><b class="small">No challenge running here</b>
        <p class="tiny muted" style="margin:4px 0 10px">Pick a tier — harder tier, harder goal, bigger chest. With ${crewSize(c)} of you the pot is ×${crewMultiplier(crewSize(c)).toFixed(2).replace(/0$/,'')}.</p>
        <button class="btn primary sm block" data-startchal>Start a challenge</button></div>`}
      ${ms.length?ms.map((m,i)=>{
        const mine=m.from==='me';
        const showName=!mine && (i===0 || ms[i-1].from!==m.from);
        if(m.kind==='system') return `<p class="msgsys">${esc(m.code)}</p>`;
        return `<div class="msgrow ${mine?'mine':''}">${showName?`<span class="msgwho">${esc(nameOf(m.from))}</span>`:''}
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
    const cb=g.querySelector('[data-chest]'); if(cb) cb.onclick=()=>{ const win=claimChest(cb.dataset.chest); if(win){ g.remove(); render(); chestScene(win); } else toast('Not ready yet'); };
    const db=g.querySelector('[data-dropchal]'); if(db) db.onclick=()=>modal('<h2>Drop this challenge?</h2><p class="muted">The slot frees up, but progress starts again if you retry.</p>','Drop',()=>{ dropChallenge(db.dataset.dropchal); draw(); },true);
  };
  draw();
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
  if(S.settings.motion) burst(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#2dd4bf');
  haptic('success');
  g.querySelector('#swclaim').onclick=()=>{ g.remove(); render(); };
}

/* ---------- Stuck-task advice ----------
   Fires after a run of misses. Suggestions are the ones with actual evidence behind
   them: shrink it, anchor it to something you already do, pin down when and where,
   pair it with something you enjoy, cut the friction. */
function consecutiveMisses(t){
  let n=0,k=addDays(today(),-1);
  while(k>=t.createdAt){ const st=statusOf(k,t.id); if(st==='missed'){n++;k=addDays(k,-1);} else break; }
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
  if(!S.settings.motion){ hint.remove(); prize.classList.add('show'); finish(); }
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
  claim.onclick=()=>{ g.remove(); render(); toast(`+${amount} coins`); };
}
function burst(colour){
  if(!S.settings.motion) return;
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
      <p class="muted">${r.shown} day${r.shown===1?'':'s'} of showing up.</p></div>

    ${card(`${r.rate}%`,'of everything you set yourself','Across '+r.expected+' chances.')}
    ${card(r.cleared,`day${r.cleared===1?'':'s'} cleared completely`,'Every task done.')}
    ${card(r.coins.toLocaleString(),'coins earned',`Level ${r.level} · ${esc(r.title)}`)}
    ${card(r.bestStreak,'day best streak','Longest run of opening the app.')}
    ${r.minutes?card(hrs,'logged on timed tasks',''):''}
    ${r.chests?card(r.chests,`weekly chest${r.chests===1?'':'es'} won`,''):''}

    ${r.strongest?`<div class="rcard soft"><span class="eyebrow">Most solid</span><b class="mid">${esc(r.strongest.name)}</b><p class="small muted">${r.strongest.s}% strength. This is the one that stuck.</p></div>`:''}
    ${r.weakest&&r.weakest.s<r.strongest?.s?`<div class="rcard soft"><span class="eyebrow">Hardest going</span><b class="mid">${esc(r.weakest.name)}</b><p class="small muted">${r.weakest.s}% strength. Worth asking whether it is the right habit, or just the wrong time of day.</p></div>`:''}

    ${r.topReason||r.worstDay?`<div class="rcard soft"><span class="eyebrow">When you slipped</span>
      ${r.topReason?`<b class="mid">${esc(r.topReason[0])}</b><p class="small muted">Your most common reason — ${r.topReason[1]} time${r.topReason[1]===1?'':'s'}.</p>`:''}
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
  Sync.pull().then(()=>Sync.pullMessages()).then(()=>{ if(tab==='friends') render(); }).catch(()=>{});
  Sync.push().catch(()=>{});
}
function maybeGates(){ if(S.flags.pendingToast){ toast(S.flags.pendingToast); S.flags.pendingToast=null; save(); }
  if(missGate()) return;                 // reasons first, then advice, then recap
  const st=stuckTask(); if(st){ adviceSheet(st); return; }
  if(maybeRecap()) return;
  tour(tab); }
let _booted=false;
export function bootSteady(){
  $app=document.getElementById('app');
  try{ migratePairChallenges(S); }catch(e){ console.error(e); }
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
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden && S.flags.lastOpen!==today()){ rollover(); render(); maybeGates(); } });
    Sync.session().catch(()=>{}).then(()=>{ if(tab==='friends') render(); });
  }
}

