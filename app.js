// 喬時間：多人喬時間。LINE 登入確認身分，發起人自訂日期與時段，可以同時進行很多活動。
// 每個人的時間是一串字元，第 d 天第 s 格在 d * nslot + s：0=不行 1=只能線上 2=線下可（也代表線上可）
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const MODE_LABEL = { both: '線下優先，湊不齊改線上', offline: '只有線下', online: '只有線上' };
// 還沒設定好，或在自己電腦上（localhost）打開，都用示範模式
const DEMO = !(CONFIG.API_URL && CONFIG.LIFF_ID) || ['localhost', '127.0.0.1'].includes(location.hostname);
const DEMO_USERS = [['u-dan', 'Dan'], ['u-ming', '阿明'], ['u-hua', '小華'], ['u-kai', '阿凱'], ['u-mei', '美美']];
const MAX_DAYS = 14;

const $app = document.getElementById('app');
const auth = { token: null, me: null };
let demoCall = null;

const store = {
  get(k, d) { try { const v = localStorage.getItem('ms2:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ms2:' + k, JSON.stringify(v)); } catch {} },
};

// ---------- 登入與資料 ----------
async function boot() {
  if (DEMO) {
    demoCall = await loadDemoBackend();
    const u = store.get('demoUser', DEMO_USERS[0]);
    auth.token = `demo|${u[0]}|${u[1]}`;
    return true;
  }
  await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
  await liff.init({ liffId: CONFIG.LIFF_ID });
  if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return false; }
  auth.token = liff.getIDToken();
  if (!auth.token) throw new Error('拿不到 LINE 身分，請確認 LIFF 有勾選 openid');
  return true;
}

function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('LINE 登入元件載入失敗'));
    document.head.appendChild(s);
  });
}

async function call(action, data = {}) {
  const payload = { action, idToken: auth.token, ...data };
  let j;
  if (DEMO) j = await demoCall(payload);
  else {
    const r = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // 避免 CORS 預檢
      body: JSON.stringify(payload),
      keepalive: true,  // 頁面關掉的瞬間送出的儲存也能送到
    });
    j = await r.json();
  }
  if (!j.ok) {
    if (j.code === 'AUTH' && !DEMO) { liff.logout(); liff.login({ redirectUri: location.href }); }
    throw new Error(j.error || '伺服器錯誤');
  }
  if (j.me) { auth.me = j.me; renderTop(); }
  return j;
}

// ---------- 小工具 ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function hm(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
function dur(min) { return min < 60 ? `${min} 分鐘` : `${min / 60} 小時`; }
function shortDate(s) { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`; }
function avatar(u) {
  return u.picture ? `<img class="avatar" src="${esc(u.picture)}" alt="">` : `<span class="avatar">${esc((u.name || '?').slice(0, 1))}</span>`;
}
function appUrl() {
  return DEMO ? `${location.origin}${location.pathname}` : `https://liff.line.me/${CONFIG.LIFF_ID}`;
}
function inviteUrl(id) { return `${appUrl()}?e=${id}`; }
function canShareLine() {
  try { return !DEMO && window.liff && liff.isApiAvailable('shareTargetPicker'); } catch { return false; }
}
// 分享這個工具本身：在 LINE 裡用分享選單，其他瀏覽器用系統分享，都沒有就複製
async function shareApp() {
  const text = [
    '【喬時間】揪團排時間的小工具 🙌',
    '・用 LINE 登入就能用，不用下載\n・每個人畫出自己可以的時間\n・自動找出大家都行的時段',
    `👉 點連結開始用\n${appUrl()}`,
  ].join('\n\n');
  if (canShareLine()) { liff.shareTargetPicker([{ type: 'text', text }]).catch(() => {}); return; }
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('已複製，貼給朋友吧'); }
  catch { prompt('複製這段文字傳給朋友', text); }
}
// 地點：網址就做成連結，一般文字附上 Google 地圖搜尋
function placeHtml(place) {
  if (/^https?:\/\/\S+$/i.test(place)) return `<a href="${esc(place)}" target="_blank" rel="noopener">${esc(place)}</a>`;
  return `${esc(place)} <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}" target="_blank" rel="noopener">地圖</a>`;
}
function linkBox(url) {
  return `<div class="link-box"><input readonly value="${esc(url)}"><button type="button" data-copy="${esc(url)}">複製</button></div>`;
}
function bindCopy(root) {
  root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('已複製'); }
    catch { b.previousElementSibling.select(); toast('請長按複製'); }
  }));
}

// ---------- 時間格的幾何 ----------
function geom(c) {
  const nslot = (c.endMin - c.startMin) / c.slotMin;
  return { days: c.dates.length, nslot, total: c.dates.length * nslot, need: Math.ceil(c.minMin / c.slotMin) };
}
function slotTime(c, s) { return hm(c.startMin + s * c.slotMin); }
function dayLabel(c, d) { return shortDate(c.dates[d]); }
function windowLabel(c, w) { return `${dayLabel(c, w.day)} ${slotTime(c, w.start)}–${slotTime(c, w.end)}`; }
function datesSummary(c) {
  const n = c.dates.length;
  if (n === 1) return dayLabel(c, 0);
  const contiguous = c.dates.every((d, i) => i === 0 || addDays(c.dates[i - 1], 1) === d);
  return `${dayLabel(c, 0)} – ${dayLabel(c, n - 1)}${contiguous ? '' : `（挑 ${n} 天）`}`;
}
// 實際要連續幾分鐘：活動長度湊成整格（每格 1 小時、活動 1.5 小時＝要連續 2 小時）
function effMin(c) { return Math.ceil(c.minMin / c.slotMin) * c.slotMin; }
function configSummary(c) {
  return `${datesSummary(c)}・每天 ${hm(c.startMin)}–${hm(c.endMin)}・至少 ${dur(effMin(c))}・${MODE_LABEL[c.mode]}`;
}

// ---------- 找交集 ----------
function runs(ok, g) {
  const out = [];
  for (let d = 0; d < g.days; d++) {
    let s = null;
    for (let i = 0; i <= g.nslot; i++) {
      const good = i < g.nslot && ok[d * g.nslot + i];
      if (good && s === null) s = i;
      if (!good && s !== null) { if (i - s >= g.need) out.push({ day: d, start: s, end: i }); s = null; }
    }
  }
  return out;
}

function analyze(ev) {
  const c = ev.config, g = geom(c);
  const filled = ev.members.filter((m) => m.slots.length === g.total);
  const pending = ev.members.filter((m) => m.slots.length !== g.total);
  const can = c.mode === 'offline' ? (v) => v === '2' : (v) => v !== '0';
  const offAll = [], canAll = [];
  for (let i = 0; i < g.total; i++) {
    offAll[i] = filled.length > 0 && filled.every((m) => m.slots[i] === '2');
    canAll[i] = filled.length > 0 && filled.every((m) => can(m.slots[i]));
  }
  // 線下優先；只有「線下線上都可」的活動才會退回找線上
  let kind = c.mode === 'online' ? 'online' : 'offline';
  let windows = runs(kind === 'online' ? canAll : offAll, g);
  if (!windows.length && c.mode === 'both') { kind = 'online'; windows = runs(canAll, g); }

  // 找不到全員交集時，列出最接近的時段（最多人可以），讓大家知道要喬誰
  const closest = [];
  if (!windows.length && filled.length) {
    const cands = [];
    for (let d = 0; d < g.days; d++) {
      for (let s = 0; s + g.need <= g.nslot; s++) {
        const idx = Array.from({ length: g.need }, (_, k) => d * g.nslot + s + k);
        const ok = filled.filter((m) => idx.every((i) => can(m.slots[i])));
        cands.push({ day: d, start: s, end: s + g.need, can: ok.length,
          missing: filled.filter((m) => !ok.includes(m)).map((m) => m.name) });
      }
    }
    cands.sort((a, b) => b.can - a.can || a.day - b.day || a.start - b.start);
    for (const x of cands) {
      if (x.can === 0 || closest.length >= 3) break;
      const dup = closest.some((y) => y.day === x.day && Math.abs(y.start - x.start) < g.need && y.missing.join() === x.missing.join());
      if (!dup) closest.push(x);
    }
  }
  return { g, filled, pending, windows: windows.length ? windows : [], kind: windows.length ? kind : null, closest, can };
}

function statusOf(ev) {
  const c = ev.config;
  if (ev.decided) return `📌 已定案：${windowLabel(c, ev.decided)}（${ev.decided.mode === 'online' ? '線上' : '線下'}）`;
  const a = analyze(ev);
  const wait = a.pending.length ? `，還在等 ${a.pending.length} 人` : '';
  if (!a.filled.length) return '⏳ 還沒有人填';
  if (a.kind) return `${a.kind === 'offline' ? '✅ 線下' : '💻 線上'}：${windowLabel(c, a.windows[0])}${a.windows.length > 1 ? ` 等 ${a.windows.length} 個時段` : ''}${wait}`;
  return a.pending.length ? `⏳ 還在等 ${a.pending.length} 人填` : '⚠️ 大家都填了，但找不到時間';
}

// ---------- 頁面切換 ----------
let dirty = false;
let routeId = 0;        // 每次換頁加一；資料回來時頁面已經換掉，就不要畫
let refresher = null;   // 目前這頁的「重新整理」要做的事

async function refreshNow(manual) {
  if (!refresher || refreshNow.busy) return;
  refreshNow.busy = true; renderTop();
  try { await refresher(); if (manual) toast('已更新'); }
  catch (err) { if (manual) toast(err.message); }
  refreshNow.busy = false; renderTop();
}
// 每 20 秒自動更新；從別的 App 切回來時也馬上更新
setInterval(() => { if (document.visibilityState === 'visible') refreshNow(false); }, 20000);
// 切到別的 App 或關掉 LINE 視窗前，還沒存的先存（fetch 有 keepalive，頁面關了也會送出）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { checkVersion(); refreshNow(false); }
  else if (dirty) save(true);
});

// 有新版上線時，開著的舊頁面（例如 LINE 縮小後又叫回來）自動重新載入。正在畫、還沒存的時候不動
async function checkVersion() {
  if (DEMO || dirty || savingP || !window.APP_VERSION) return;
  try {
    const j = await (await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    if (!j.v || j.v === window.APP_VERSION || dirty) return;
    // 重新載入後如果拿到的還是舊頁面（瀏覽器快取），就不要一直重來
    if (sessionStorage.getItem('ms2:reloadedFor') === j.v) return;
    sessionStorage.setItem('ms2:reloadedFor', j.v);
    location.reload();
  } catch {}
}

// 換頁前先把還沒存的時間存好，存不成功才問要不要離開
async function go(url) {
  if (dirty || savingP) {
    while (savingP) await savingP;
    if (dirty) await save(true);
    if (dirty && !confirm('你的時間沒有儲存成功，確定要離開嗎？')) return;
  }
  setDirty(false);
  history.pushState(null, '', url);
  route();
}
function route() {
  routeId++; refresher = null; renderTop(); checkVersion();
  window.scrollTo(0, 0);
  const q = new URLSearchParams(location.search);
  if (q.get('e')) renderEvent(q.get('e'), q.has('created'));
  else if (q.has('new')) renderNew(q.get('copy'));
  else renderHome();
}
function home() { return location.pathname; }
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
window.addEventListener('popstate', () => { if (dirty) save(true); setDirty(false); route(); });
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

function renderTop() {
  const me = auth.me;
  document.getElementById('top').innerHTML = `
    <a class="brand" href="${home()}" data-nav>喬時間</a><span class="grow"></span>
    ${refresher ? `<button type="button" class="small" id="refreshBtn" ${refreshNow.busy ? 'disabled' : ''}>${refreshNow.busy ? '更新中…' : '↻ 重新整理'}</button>` : ''}
    ${me ? `<span class="who">${avatar(me)}${esc(me.name)}</span>` : ''}`;
  const b = document.getElementById('refreshBtn');
  if (b) b.addEventListener('click', () => refreshNow(true));
}
function demoBanner() {
  if (!DEMO) return '';
  const cur = store.get('demoUser', DEMO_USERS[0])[0];
  return `<div class="banner">示範模式：資料只存在這台電腦。切換身分試試看
    <select id="demoUser">${DEMO_USERS.map(([id, n]) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
}
function bindDemo() {
  const sel = document.getElementById('demoUser');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const u = DEMO_USERS.find((x) => x[0] === sel.value);
    store.set('demoUser', u); auth.token = `demo|${u[0]}|${u[1]}`;
    setDirty(false); route();
  });
}
function showError(err) {
  $app.innerHTML = `${demoBanner()}<div class="card"><h2>出了點問題</h2><p class="muted">${esc(err.message)}</p>
    <p><a href="${home()}" data-nav>回我的活動</a></p></div>`;
  bindDemo();
}

// ---------- 我的活動 ----------
async function renderHome() {
  document.title = '喬時間';
  const rid = routeId;
  let j;
  try { j = await call('mine'); } catch (err) { return rid === routeId && showError(err); }
  if (rid !== routeId) return;
  const pastOpen = document.querySelector('details.past')?.open;
  const today = ymd(new Date());
  const evs = j.events.slice().sort((a, b) => a.config.dates[0].localeCompare(b.config.dates[0]));
  const active = evs.filter((e) => e.config.dates[e.config.dates.length - 1] >= today);
  const past = evs.filter((e) => !active.includes(e)).reverse();
  $app.innerHTML = `
    ${demoBanner()}
    <div class="row"><h1 class="grow">我的活動</h1><a class="btn primary" href="?new" data-nav>＋ 發起</a></div>
    ${active.length ? active.map(eventCard).join('') : `<div class="card"><p>目前沒有進行中的活動。</p>
      <p class="muted">按「＋ 發起」建立一個，再把邀請連結貼到 LINE 群組。別人發起的活動，點邀請連結加入後也會出現在這裡。</p></div>`}
    ${past.length ? `<details class="past" ${pastOpen ? 'open' : ''}><summary>已結束（${past.length}）</summary>${past.map(eventCard).join('')}</details>` : ''}`;
  bindDemo();
  if (!refresher) { refresher = renderHome; renderTop(); }
}

function eventCard(ev) {
  const g = geom(ev.config);
  const mine = ev.members.find((m) => m.id === auth.me.id);
  const todo = mine && mine.slots.length !== g.total && !ev.decided;
  return `<a class="card ev" href="?e=${ev.id}" data-nav>
    <div class="row"><b class="grow">${esc(ev.title)}</b>${ev.isOwner ? '<span class="tag">發起人</span>' : ''}${todo ? '<span class="tag warn">你還沒填</span>' : ''}</div>
    <div class="muted">${esc(datesSummary(ev.config))}・${ev.members.length} 人${ev.place ? `・📍 ${esc(ev.place.length > 20 ? ev.place.slice(0, 20) + '…' : ev.place)}` : ''}</div>
    <div class="st">${esc(statusOf(ev))}</div></a>`;
}

// ---------- 發起活動 ----------
async function renderNew(copyId) {
  document.title = '發起活動｜喬時間';
  let src = null;
  if (copyId) { try { src = (await call('get', { id: copyId })).event; } catch (err) { toast(err.message); } }
  const today = ymd(new Date());
  const last = store.get('lastConfig', { startMin: 540, endMin: 1320, slotMin: 60, minMin: 90, mode: 'both' });
  const base = src ? src.config : last;
  const f = { startMin: base.startMin, endMin: base.endMin, slotMin: base.slotMin, minMin: base.minMin, mode: base.mode, dates: new Set() };
  if (src) {
    // 複製成下一輪：日期往後推整週，推到今天以後（至少推一週）
    const behind = Math.ceil((parseYmd(today) - parseYmd(src.config.dates[0])) / 864e5 / 7);
    const weeks = Math.max(1, behind);
    src.config.dates.forEach((d) => f.dates.add(addDays(d, weeks * 7)));
  } else {
    weekend(0).forEach((d) => f.dates.add(d));
  }

  $app.innerHTML = `
    ${demoBanner()}
    <h1>${src ? '複製成新活動' : '發起活動'}</h1>
    <form class="card" id="newForm">
      <label for="title">活動名稱</label>
      <input id="title" required maxlength="40" placeholder="例如：讀書會 A 組" value="${esc(src ? src.title : '')}">
      <label for="place">地點（選填）</label>
      <input id="place" maxlength="100" placeholder="例如：板橋車站附近的咖啡廳，或線上會議連結" value="${esc(src ? src.place : '')}">
      <span class="label">哪幾天（點日期選取，最多 ${MAX_DAYS} 天）</span>
      <div class="seg" style="margin-bottom:8px">
        <button type="button" data-quick="0">這週末</button>
        <button type="button" data-quick="1">下週末</button>
        <button type="button" data-quick="clear">清除</button>
      </div>
      <div class="cal" id="cal"></div>
      <p class="muted" id="dateHint"></p>
      <span class="label">每天的時段</span>
      <div class="two">
        <select id="startMin">${hourOptions(0, 23, f.startMin)}</select><span>到</span>
        <select id="endMin">${hourOptions(1, 24, f.endMin)}</select>
      </div>
      <span class="label">每格多久</span>
      <div class="seg" id="slotSeg">
        <button type="button" data-v="60">1 小時</button><button type="button" data-v="30">30 分鐘</button>
      </div>
      <label for="minMin">活動要多久（會找大家都能連續待這麼久的時段）</label>
      <select id="minMin"></select>
      <p class="muted" id="minHint"></p>
      <span class="label">形式</span>
      <div class="seg" id="modeSeg">
        <button type="button" data-v="both">線下優先，湊不齊改線上</button>
        <button type="button" data-v="offline">只有線下</button>
        <button type="button" data-v="online">只有線上</button>
      </div>
      ${src && src.isOwner && src.members.length > 1 ? `<label class="row" style="font-weight:400">
        <input type="checkbox" id="copyMembers" checked style="width:auto"> 帶入原本的 ${src.members.length - 1} 位成員（之後可以移除）</label>` : ''}
      <p style="margin-top:18px"><button class="primary" type="submit" id="createBtn">建立活動</button></p>
    </form>`;
  bindDemo();

  const drawCal = () => {
    document.getElementById('cal').innerHTML = calendarHtml(f.dates);
    const sorted = [...f.dates].sort();
    document.getElementById('dateHint').textContent = sorted.length
      ? `已選 ${sorted.length} 天：${sorted.map(shortDate).join('、')}` : '還沒選日期';
  };
  const drawSeg = (id, val) => document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(val)));
  // 活動長度只能選整格的倍數：每格 1 小時就只有整點長度，要 1.5 小時請改每格 30 分鐘
  const drawMin = () => {
    const sel = document.getElementById('minMin');
    if (sel.value) f.minMin = +sel.value;
    const opts = [30, 60, 90, 120, 150, 180, 240].filter((m) => m % f.slotMin === 0);
    f.minMin = opts.find((m) => m >= f.minMin) || opts[opts.length - 1];
    sel.innerHTML = opts.map((m) => `<option value="${m}" ${m === f.minMin ? 'selected' : ''}>${dur(m)}</option>`).join('');
    document.getElementById('minHint').textContent = f.slotMin === 60 ? '每格 1 小時只能選整點長度；想要 1.5 小時，每格改選 30 分鐘。' : '';
  };
  drawCal(); drawSeg('slotSeg', f.slotMin); drawSeg('modeSeg', f.mode); drawMin();

  document.getElementById('cal').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (!b || b.classList.contains('past')) return;
    const d = b.dataset.d;
    if (f.dates.has(d)) f.dates.delete(d);
    else if (f.dates.size >= MAX_DAYS) return toast(`最多 ${MAX_DAYS} 天`);
    else f.dates.add(d);
    drawCal();
  });
  document.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    f.dates.clear();
    if (b.dataset.quick !== 'clear') weekend(+b.dataset.quick).forEach((d) => f.dates.add(d));
    drawCal();
  }));
  document.querySelectorAll('#slotSeg button').forEach((b) => b.addEventListener('click', () => { f.slotMin = +b.dataset.v; drawSeg('slotSeg', f.slotMin); drawMin(); }));
  document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => { f.mode = b.dataset.v; drawSeg('modeSeg', f.mode); }));

  document.getElementById('newForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const config = {
      dates: [...f.dates].sort(), slotMin: f.slotMin, mode: f.mode,
      startMin: +document.getElementById('startMin').value, endMin: +document.getElementById('endMin').value,
      minMin: +document.getElementById('minMin').value,
    };
    if (!config.dates.length) return toast('請至少選一天');
    if (config.startMin >= config.endMin) return toast('結束時間要比開始晚');
    if (config.minMin > config.endMin - config.startMin) return toast('活動長度比每天的時段還長');
    const btn = document.getElementById('createBtn'); btn.disabled = true; btn.textContent = '建立中…';
    try {
      const cm = document.getElementById('copyMembers');
      const { id } = await call('create', { title: document.getElementById('title').value, place: document.getElementById('place').value, config,
        copyFrom: src ? src.id : '', copyMembers: !!(cm && cm.checked) });
      const { dates, ...rest } = config;
      store.set('lastConfig', rest);
      go(`?e=${id}&created=1`);
    } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = '建立活動'; }
  });
}

function hourOptions(from, to, sel) {
  let h = '';
  for (let x = from; x <= to; x++) h += `<option value="${x * 60}" ${x * 60 === sel ? 'selected' : ''}>${pad(x)}:00</option>`;
  return h;
}

// 這週末（offset=0）或下週末的週五～週日，已經過去的日子不算
function weekend(offset) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const back = { 5: 0, 6: 1, 0: 2 }[d.getDay()];
  d.setDate(d.getDate() + (back !== undefined ? -back : 5 - d.getDay()) + offset * 7);
  const today = ymd(new Date());
  return [0, 1, 2].map((i) => addDays(ymd(d), i)).filter((x) => x >= today);
}

function calendarHtml(sel) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));  // 這週一
  const last = [...sel].sort().pop();
  const span = last ? Math.round((parseYmd(last) - start) / 864e5) + 1 : 0;
  const weeks = Math.min(12, Math.max(6, Math.ceil(span / 7)));
  let h = ['一', '二', '三', '四', '五', '六', '日'].map((w) => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = ymd(d), first = i === 0 || d.getDate() === 1;
    h += `<button type="button" data-d="${key}" class="${sel.has(key) ? 'sel' : ''} ${d < today ? 'past' : ''} ${first ? 'm1' : ''}">${first ? `${d.getMonth() + 1}/${d.getDate()}` : d.getDate()}</button>`;
  }
  return h;
}

// ---------- 活動頁 ----------
const ui = { ev: null, page: 0, draft: null, brush: '2', sel: null, seen: new Set() };

function perPage() { return window.innerWidth >= 640 ? 7 : 3; }
function pageDays() {
  const n = ui.ev.config.dates.length, pp = perPage();
  ui.page = Math.min(ui.page, Math.ceil(n / pp) - 1);
  return Array.from({ length: Math.min(pp, n - ui.page * pp) }, (_, k) => ui.page * pp + k);
}

async function loadEv(id) { ui.ev = (await call('get', { id })).event; }

async function renderEvent(id, created) {
  const rid = routeId;
  try { await loadEv(id); } catch (err) { return rid === routeId && showError(err); }
  if (rid !== routeId) return;
  ui.sel = null; ui.draft = null; ui.focus = null; ui.seen = new Set();
  // 預設翻到還沒過去的第一天
  const today = ymd(new Date());
  const first = ui.ev.config.dates.findIndex((d) => d >= today);
  ui.page = first > 0 ? Math.floor(first / perPage()) : 0;
  drawEvent(created);
  // 重新整理：更新結果、成員和大家的時間；自己正在畫、還沒儲存的格子不動
  refresher = async () => {
    await loadEv(id);
    if (rid !== routeId) return;
    drawResult(); drawMembers(); drawHeat();
    if (!dirty) drawEditor();
  };
  renderTop();
}

function drawEvent(created) {
  const ev = ui.ev, c = ev.config;
  document.title = `${ev.title}｜喬時間`;
  const share = canShareLine();
  // 版面依「這個人下一步該做什麼」排：還沒加入→加入卡在最上面；還沒填→「我的時間」排在結果前面
  const needFill = ev.joined && !ev.decided && !myFilled(ev);
  const remind = `<h2>提醒大家</h2>
      <p class="muted">複製這段文字貼到 LINE 群組，會照目前的狀況自動更新，貼之前也可以先改。</p>
      <textarea id="remindText" rows="7"></textarea>
      <div class="row" style="margin-top:8px"><button type="button" class="primary" id="remindCopy">複製提醒文字</button>
        ${share ? '<button type="button" id="remindShare">分享到 LINE</button>' : ''}</div>`;
  const editor = ev.joined ? `<div class="card" id="editorCard"><h2>${needFill ? '👇 先畫你可以的時間' : '我的時間'}</h2><div id="editorWrap"></div></div>` : '';
  $app.innerHTML = `
    ${demoBanner()}
    <h1>${esc(ev.title)}</h1>
    <p class="muted">${esc(configSummary(c))}</p>
    ${ev.place ? `<p>📍 ${placeHtml(ev.place)}</p>` : ''}
    ${ev.isOwner && (created || ev.members.length < 2) ? `<div class="card"><h2>${created ? '建好了！' : ''}邀請大家加入</h2>
      <p>把邀請連結貼到 LINE 群組，大家用 LINE 登入後按「加入」就能填時間。</p>
      ${linkBox(inviteUrl(ev.id))}${share ? '<button type="button" id="shareBtn">分享到 LINE</button>' : ''}</div>` : ''}
    ${ev.joined ? '' : `<div class="card">${ev.status === 'open'
      ? `<h2>你還沒加入</h2><p>加入後就能畫出你可以的時間。</p><p><button class="primary" id="joinBtn">加入這個活動</button></p>`
      : '<h2>發起人已關閉加入</h2><p class="muted">需要加入的話，請發起人重新開放。</p>'}</div>`}
    ${needFill ? editor : ''}
    <div class="card" id="result"></div>
    ${ev.isOwner ? `<div class="card">${remind}</div>` : ''}
    ${needFill ? '' : editor}
    <div class="card" id="heatCard"><h2>大家的時間</h2>
      <div id="heatWrap"></div><div class="detail" id="detail"></div></div>
    <div class="card"><h2 id="memberTitle">成員</h2><div class="chips" id="members"></div></div>
    ${ev.joined && !ev.isOwner ? `<details class="card"><summary><b>想提醒大家？複製一段文字貼到群組</b></summary>${remind}</details>` : ''}
    ${ev.isOwner ? ownerCard() : ''}
    ${ev.joined && !ev.isOwner ? '<p><button class="link" id="leaveBtn">退出這個活動</button></p>' : ''}`;
  bindDemo(); bindCopy($app);
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('shareBtn', () => liff.shareTargetPicker([{ type: 'text', text: `來喬「${ev.title}」的時間：${inviteUrl(ev.id)}` }]).catch(() => {}));
  on('remindCopy', async () => {
    const t = document.getElementById('remindText');
    try { await navigator.clipboard.writeText(t.value); toast('已複製，貼到群組吧'); }
    catch { t.select(); toast(document.execCommand('copy') ? '已複製，貼到群組吧' : '請長按文字複製'); }
  });
  on('remindShare', () => liff.shareTargetPicker([{ type: 'text', text: document.getElementById('remindText').value }]).catch(() => {}));
  const $rt = document.getElementById('remindText');
  if ($rt) $rt.addEventListener('input', () => { $rt.dataset.edited = '1'; });
  // 加入後直接捲到畫時間的地方
  on('joinBtn', async () => {
    await act(() => call('join', { id: ev.id }), '已加入，畫出你可以的時間吧', true);
    scrollToEditor();
  });
  on('leaveBtn', async () => {
    if (!confirm('確定要退出嗎？你填的時間會一起刪掉。')) return;
    try { await call('remove', { id: ev.id, userId: auth.me.id }); toast('已退出'); go(home()); } catch (err) { toast(err.message); }
  });
  if (ev.isOwner) bindOwner();
  drawResult(); drawMembers(); drawEditor(); drawHeat();
}

function myFilled(ev) {
  const mine = ev.members.find((m) => m.id === auth.me.id);
  return !!mine && mine.slots.length === geom(ev.config).total;
}
function scrollToEditor() {
  const el = document.getElementById('editorCard');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 執行一個動作後重新載入活動頁
async function act(fn, msg, full) {
  try { await fn(); } catch (err) { return toast(err.message); }
  if (msg) toast(msg);
  await loadEv(ui.ev.id);
  if (full) drawEvent(); else { drawResult(); drawMembers(); drawHeat(); }
}

// 貼到群組的提醒文字，依目前狀況寫。一段一件事、段落之間空一行，連結自己一行（LINE 才會變成可以點）
function reminderText(ev) {
  const c = ev.config, a = analyze(ev);
  const modeOf = (k) => (k === 'online' ? '線上' : '線下');
  const names = (list) => list.map((m) => m.name).join('、');
  const head = [`【${ev.title}】`, `🗓 ${datesSummary(c)}`];
  if (ev.place) head.push(`📍 ${ev.place}`);
  const parts = [head.join('\n')];
  let cta = '👉 點連結填時間';
  if (ev.decided) {
    const d = ev.decided, long = d.end - d.start > a.g.need;
    parts.push(`📌 時間定好了！\n${windowLabel(c, d)}（${modeOf(d.mode)}）${long ? `\n這段時間內挑 ${dur(effMin(c))}就好` : ''}`);
    cta = '👉 詳情看這裡';
  } else if (!a.filled.length) {
    parts.push(`來喬時間囉！\n點連結用 LINE 登入，畫出你可以的時間 🙏${ev.status === 'open' ? '\n還沒加入的人點進去就能加入' : ''}`);
  } else if (a.kind) {
    const ws = a.windows.slice(0, 3).map((w) => `・${windowLabel(c, w)}`).join('\n');
    parts.push(`✅ 目前大家都可以（${modeOf(a.kind)}）\n${ws}${a.windows.length > 3 ? '\n・…還有其他時段' : ''}`);
    if (a.pending.length) parts.push(`⏳ 還沒填：${names(a.pending)}\n麻煩填一下，結果可能還會變 🙏`);
    else cta = '👉 點連結看結果';
  } else if (a.pending.length) {
    parts.push(`⏳ 還沒填：${names(a.pending)}\n麻煩點連結畫一下你可以的時間 🙏`);
  } else {
    const close = a.closest.slice(0, 2).map((x) => `・${windowLabel(c, x)}\n　差 ${x.missing.join('、')}`).join('\n');
    parts.push(`😵 大家都填完了，但找不到 ${dur(effMin(c))}所有人都可以的時間`);
    if (close) parts.push(`最接近的時段：\n${close}`);
    parts.push('可以調整的人再改一下 🙏');
    cta = '👉 點連結改時間';
  }
  parts.push(`${cta}\n${inviteUrl(ev.id)}`);
  return parts.join('\n\n');
}

function drawRemind() {
  const $t = document.getElementById('remindText');
  // 使用者正在改的時候不要蓋掉
  if ($t && !$t.dataset.edited && document.activeElement !== $t) {
    $t.value = reminderText(ui.ev);
    // 高度跟著內容長，整段一眼看完不用捲
    $t.style.height = 'auto'; $t.style.height = `${$t.scrollHeight + 2}px`;
  }
}

function drawResult() {
  const ev = ui.ev, c = ev.config;
  const $r = document.getElementById('result');
  drawRemind();
  if (ev.decided) {
    const d = ev.decided, g = geom(c), long = d.end - d.start > g.need;
    $r.innerHTML = `<div class="status decided"><h2>📌 已定案</h2>
      <p><b>${esc(windowLabel(c, d))}</b>・${d.mode === 'online' ? '線上' : '線下'}</p>
      ${long ? `<p class="muted">這段時間內挑 ${dur(effMin(c))}就好。</p>` : ''}
      ${ev.isOwner ? '<p><button class="small" id="undecide">取消定案</button></p>' : ''}</div>`;
    const u = document.getElementById('undecide');
    if (u) u.addEventListener('click', () => act(() => call('update', { id: ev.id, decided: null }), '已取消定案'));
    return;
  }
  const a = analyze(ev);
  const total = ev.members.length;
  // 自己還沒算進去的時候說清楚，免得以為時間已經定好、不用填
  const notMe = a.filled.length && !myFilled(ev)
    ? `<p class="mine-note">${ev.joined ? '你還沒填，下面是' : '你還沒加入，下面是'}已填的 ${a.filled.length} 人的結果。
      ${ev.joined ? '<button type="button" class="small primary" id="goFill">去畫我的時間</button>' : ''}</p>` : '';
  const who = a.pending.length ? `已填的 ${a.filled.length} 人` : '大家';
  const decideBtn = (w) => ev.isOwner ? ` <button class="small" data-decide="${w.day},${w.start},${w.end}">定這個</button>` : '';
  const list = (ws) => `<ul>${ws.map((w) => `<li>${esc(windowLabel(c, w))}${decideBtn(w)}</li>`).join('')}</ul>`;
  const waitNote = a.pending.length
    ? `<p class="muted">已填 ${a.filled.length}/${total} 人，還在等：${esc(a.pending.map((m) => m.name).join('、'))}。結果可能還會變。</p>` : '';
  let html;
  if (!a.filled.length) {
    html = `<div class="status wait"><h2>還沒有人填</h2><p>${ev.joined ? '在「我的時間」畫出你可以的時間。' : '加入後就能填時間。'}</p></div>`;
  } else if (a.kind === 'offline') {
    html = `<div class="status ok-off"><h2>✅ ${c.mode === 'both' ? '可以線下見面' : '找到時間了'}</h2><p>這些時間${who}都能到場：</p>${list(a.windows)}${waitNote}</div>`;
  } else if (a.kind === 'online') {
    html = `<div class="status ok-on"><h2>💻 ${c.mode === 'both' ? '線下湊不齊，改線上' : '找到時間了'}</h2><p>這些時間${who}都能上線：</p>${list(a.windows)}${waitNote}</div>`;
  } else {
    const close = a.closest.length ? `<p>最接近的時段：</p><ul>${a.closest.map((x) =>
      `<li>${esc(windowLabel(c, x))}：${x.can}/${a.filled.length} 人可以${x.missing.length ? `，差 ${esc(x.missing.join('、'))}` : ''}</li>`).join('')}</ul>` : '';
    html = a.pending.length
      ? `<div class="status wait"><h2>目前還找不到共同時間</h2>${waitNote}${close}</div>`
      : `<div class="status warn"><h2>⚠️ 大家都填完了，但找不到時間</h2><p>沒有連續 ${dur(effMin(c))}所有人都可以的時段。請大家看看能不能調整，改完會自動更新。</p>${close}</div>`;
  }
  $r.innerHTML = notMe + html;
  const gf = document.getElementById('goFill');
  if (gf) gf.addEventListener('click', scrollToEditor);
  $r.querySelectorAll('[data-decide]').forEach((b) => b.addEventListener('click', () => {
    const [day, start, end] = b.dataset.decide.split(',').map(Number);
    act(() => call('update', { id: ev.id, decided: { day, start, end, mode: a.kind } }), '已定案');
  }));
}

function drawMembers() {
  const ev = ui.ev, g = geom(ev.config);
  document.getElementById('memberTitle').textContent = `成員（${ev.members.length}）`;
  const $m = document.getElementById('members');
  const label = (m) => `${esc(m.name)}${m.id === ev.ownerId ? '（發起人）' : ''}`;
  // 發起人看到的是一列一人、每人旁邊有「移出」；其他人看到名字小卡
  $m.className = ev.isOwner ? 'mlist' : 'chips';
  $m.innerHTML = ev.members.map((m) => {
    const done = m.slots.length === g.total;
    if (!ev.isOwner) return `<span class="chip ${done ? 'done' : ''}">${avatar(m)}${label(m)}${done ? ' ✓' : ''}</span>`;
    return `<div class="mrow">${avatar(m)}<span class="grow">${label(m)}</span>
      ${done ? `<button type="button" class="small" data-look="${esc(m.id)}">看時間</button>` : '<span class="muted">未填</span>'}
      ${m.id !== ev.ownerId ? `<button type="button" class="small danger" data-rm="${esc(m.id)}">移出</button>` : ''}</div>`;
  }).join('');
  $m.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    const m = ev.members.find((x) => x.id === b.dataset.rm);
    if (!confirm(`要把 ${m.name} 移出這個活動嗎？他填的時間會一起刪掉。`)) return;
    act(() => call('remove', { id: ev.id, userId: m.id }), '已移除');
  }));
  $m.querySelectorAll('[data-look]').forEach((b) => b.addEventListener('click', () => {
    ui.focus = b.dataset.look; drawHeat();
    document.getElementById('heatCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function gridHtml(cell, editable) {
  const c = ui.ev.config, g = geom(c), days = pageDays();
  let h = `<div class="grid ${editable ? 'editor' : 'heat'}" style="grid-template-columns: 52px repeat(${days.length}, 1fr); --rowh: ${c.slotMin === 30 ? 22 : 28}px">`;
  h += '<div></div>' + days.map((d) => `<div class="head ${editable ? 'tap' : ''}" data-day="${d}">${esc(dayLabel(c, d))}</div>`).join('');
  for (let s = 0; s < g.nslot; s++) {
    const t = c.startMin + s * c.slotMin;
    h += `<div class="time">${t % 60 ? '' : hm(t)}</div>`;
    days.forEach((d) => { h += cell(d * g.nslot + s); });
  }
  return h + '</div>';
}

function pagerHtml() {
  const c = ui.ev.config, n = c.dates.length, pp = perPage();
  if (n <= pp) return '';
  const days = pageDays();
  return `<div class="pager"><button type="button" data-pg="-1" ${ui.page === 0 ? 'disabled' : ''}>◀</button>
    <span>${esc(dayLabel(c, days[0]))}${days.length > 1 ? ` – ${esc(dayLabel(c, days[days.length - 1]))}` : ''}</span>
    <button type="button" data-pg="1" ${(ui.page + 1) * pp >= n ? 'disabled' : ''}>▶</button></div>`;
}
function bindPager(root) {
  root.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => {
    ui.page += +b.dataset.pg; drawEditor(); drawHeat();
  }));
}

function drawEditor() {
  const $wrap = document.getElementById('editorWrap');
  if (!$wrap) return;
  const ev = ui.ev, c = ev.config, g = geom(c);
  if (!dirty || !ui.draft) {
    const mine = ev.members.find((m) => m.id === auth.me.id);
    ui.draft = (mine && mine.slots.length === g.total ? mine.slots : '0'.repeat(g.total)).split('');
  }
  const brushes = c.mode === 'both'
    ? [['2', 'off', '線下可'], ['1', 'on', '只能線上'], ['0', 'no', '不行']]
    : [['2', 'off', '可以'], ['0', 'no', '不行']];
  if (!brushes.some((b) => b[0] === ui.brush)) ui.brush = '2';
  pageDays().forEach((d) => ui.seen.add(d));
  $wrap.innerHTML = `
    <p class="muted">選一種顏色，在格子上點或滑。點日期可以整天填滿。沒畫到的格子算「不行」。</p>
    <div class="toolbar">${brushes.map(([v, cls, t]) => `<button type="button" class="brush ${v === ui.brush ? 'active' : ''}" data-brush="${v}"><span class="dot ${cls}"></span>${t}</button>`).join('')}</div>
    ${pagerHtml()}${gridHtml((i) => `<div class="cell v${ui.draft[i]}" data-i="${i}"></div>`, true)}
    <div class="save-inline" id="saveInline"></div>`;
  drawSaveInline();
  $wrap.querySelectorAll('.brush').forEach((b) => b.addEventListener('click', () => {
    ui.brush = b.dataset.brush;
    $wrap.querySelectorAll('.brush').forEach((x) => x.classList.toggle('active', x === b));
  }));
  bindPager($wrap);
  bindPaint($wrap.querySelector('.grid'), g);
}

function bindPaint($g, g) {
  let paintVal = null, last = null;
  const setOne = (i) => {
    if (ui.draft[i] === paintVal) return;
    ui.draft[i] = paintVal;
    $g.querySelector(`[data-i="${i}"]`).className = 'cell v' + paintVal;
    setDirty(true);
  };
  // 手指滑太快會跳過格子：同一天就把中間的格子一起補上
  const setCell = (el) => {
    const i = +el.dataset.i;
    if (last !== null && Math.floor(last / g.nslot) === Math.floor(i / g.nslot)) {
      for (let k = Math.min(last, i); k <= Math.max(last, i); k++) setOne(k);
    } else setOne(i);
    last = i;
  };
  const cellAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el.dataset && el.dataset.i !== undefined && $g.contains(el) ? el : null;
  };
  // LINE 會把往下滑當成「縮小視窗」：在格子上畫的時候，觸控交給網頁處理，不讓 LINE 接走
  const hold = (e) => { if (e.cancelable && e.target.closest('.cell')) e.preventDefault(); };
  $g.addEventListener('touchstart', hold, { passive: false });
  $g.addEventListener('touchmove', hold, { passive: false });
  $g.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.cell'); if (!el) return;
    e.preventDefault();
    // 在已經是同色的格子上按下＝改成清除
    paintVal = ui.draft[+el.dataset.i] === ui.brush ? '0' : ui.brush;
    $g.setPointerCapture(e.pointerId);
    setCell(el);
  });
  $g.addEventListener('pointermove', (e) => { if (paintVal === null) return; const el = cellAt(e); if (el) setCell(el); });
  const end = () => { paintVal = null; last = null; };
  $g.addEventListener('pointerup', end); $g.addEventListener('pointercancel', end);
  $g.querySelectorAll('.head.tap').forEach((h) => h.addEventListener('click', () => {
    const d = +h.dataset.day, idx = Array.from({ length: g.nslot }, (_, s) => d * g.nslot + s);
    const v = idx.every((i) => ui.draft[i] === ui.brush) ? '0' : ui.brush;
    idx.forEach((i) => { ui.draft[i] = v; });
    $g.querySelectorAll('.cell').forEach((x) => { x.className = 'cell v' + ui.draft[+x.dataset.i]; });
    setDirty(true);
  }));
}

// 自動儲存：最後一次改格子後停 2 秒就存。editVer 記第幾次修改，存的途中又畫了就不算存完
const AUTO_SAVE_MS = 2000;
let editVer = 0, autoTimer = null, autoDue = 0, savingP = null, saveAgain = false;

function setSaveMsg(html) { const el = document.getElementById('saveMsg'); if (el) el.innerHTML = html; }

// 自動儲存的倒數長條：從滿的慢慢縮到空，空了就存。每次重畫都依剩下的時間接續，不會從頭跑
function countdownHtml() {
  const left = autoDue - Date.now();
  if (left <= 0) return '';
  return `<div class="countdown"><i style="animation-duration:${AUTO_SAVE_MS}ms;animation-delay:${left - AUTO_SAVE_MS}ms"></i></div>`;
}
function drawCountdown() {
  const el = document.getElementById('saveCd');
  if (el) el.innerHTML = countdownHtml();
}

function setDirty(v) {
  dirty = v;
  clearTimeout(autoTimer);
  if (v) {
    editVer++;
    autoTimer = setTimeout(() => save(true), AUTO_SAVE_MS);
    autoDue = Date.now() + AUTO_SAVE_MS;
    setSaveMsg('停手 2 秒會自動儲存<br>也可以直接按');
  }
  if (!v) autoDue = 0;
  document.getElementById('savebar').classList.toggle('show', v);
  drawCountdown(); drawSaveInline();
}

// 時間格正下方的儲存狀態：有改就是大按鈕，存好了打勾
function drawSaveInline() {
  const $s = document.getElementById('saveInline');
  if (!$s || !ui.ev) return;
  const mine = ui.ev.members.find((m) => m.id === auth.me.id);
  if (dirty) $s.innerHTML = '<button type="button" class="save-cta" data-save>儲存我的時間</button><span class="muted">停手 2 秒會自動儲存</span>' + countdownHtml();
  else if (mine && mine.slots.length === geom(ui.ev.config).total) $s.innerHTML = '<span class="saved">✓ 已儲存</span><span class="muted">要改的話直接畫，會自動儲存</span>';
  else $s.innerHTML = '<span class="muted">畫好後會自動儲存</span>';
  $s.insertAdjacentHTML('beforeend', unseenHtml());
}

// 手機一頁只看得到幾天：還沒翻到、也還沒畫的日子提醒一下，免得整天被當成「不行」
function unseenHtml() {
  const c = ui.ev.config, g = geom(c);
  const days = c.dates.map((_, d) => d).filter((d) =>
    !ui.seen.has(d) && ui.draft.slice(d * g.nslot, (d + 1) * g.nslot).every((v) => v === '0'));
  if (!days.length) return '';
  const names = days.slice(0, 3).map((d) => dayLabel(c, d)).join('、') + (days.length > 3 ? ` 等 ${days.length} 天` : '');
  return `<div class="unseen"><span class="grow">⚠️ 還有 ${esc(names)} 沒看到，沒畫的會算「不行」</span>
    <button type="button" class="small" data-unseen="${days[0]}">去看 ▶</button></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-unseen]');
  if (!b) return;
  ui.page = Math.floor(+b.dataset.unseen / perPage());
  drawEditor(); drawHeat(); scrollToEditor();
});

// 同一時間只存一次；存的途中又要存，就等這次結束再存一次
function save(auto) {
  if (savingP) { saveAgain = true; return savingP; }
  if (!dirty || !ui.ev) return Promise.resolve();
  savingP = doSave(auto).finally(() => {
    savingP = null;
    if (saveAgain) { saveAgain = false; if (dirty) save(true); }
  });
  return savingP;
}

async function doSave(auto) {
  // 先把要存的東西記下來：存的途中可能換頁，或又畫了新的格子
  const rid = routeId, ver = editVer, id = ui.ev.id, slots = ui.draft.join('');
  const busy = (on) => document.querySelectorAll('[data-save], #saveBtn').forEach((b) => { b.disabled = on; b.textContent = on ? '儲存中…' : '儲存我的時間'; });
  clearTimeout(autoTimer); autoDue = 0; drawCountdown();
  busy(true);
  try {
    await call('save', { id, slots });
    if (ver === editVer) setDirty(false);
    toast(auto ? '✓ 已自動儲存' : '已儲存，大家看得到你的時間了');
    if (rid === routeId) {
      await loadEv(id);
      if (rid === routeId) { drawResult(); drawMembers(); drawHeat(); drawSaveInline(); }
    }
  } catch (err) {
    toast(err.message);
    setSaveMsg('⚠️ 儲存失敗<br>請按儲存再試一次');
  }
  busy(false);
}

function drawHeat() {
  const ev = ui.ev, a = analyze(ev), total = a.filled.length, c = ev.config;
  const $h = document.getElementById('heatWrap');
  // 發起人可以單獨看某一個人的時間
  const focus = ev.isOwner ? ev.members.find((m) => m.id === ui.focus) : null;
  if (!focus) ui.focus = null;
  const picker = ev.isOwner ? `<div class="row" style="margin-bottom:6px"><span>顯示</span>
    <select id="focusSel" class="grow"><option value="">全部的人</option>${ev.members.map((m) =>
      `<option value="${esc(m.id)}" ${focus === m ? 'selected' : ''}>只看 ${esc(m.name)}${m.slots.length === a.g.total ? '' : '（未填）'}</option>`).join('')}</select></div>` : '';
  if (focus) {
    const filled = focus.slots.length === a.g.total;
    const legend = c.mode === 'both'
      ? '<span class="dot off"></span> 線下可　<span class="dot on"></span> 只能線上　<span class="dot no"></span> 不行'
      : '<span class="dot off"></span> 可以　<span class="dot no"></span> 不行';
    $h.innerHTML = picker + `<p class="muted">${esc(focus.name)} 的時間：${legend}</p>` + pagerHtml() +
      gridHtml((i) => `<div class="cell ${filled ? 'v' + focus.slots[i] : ''}"></div>`, false);
    bindPager($h); bindFocus($h);
    document.getElementById('detail').innerHTML = personSummary(focus);
    return;
  }
  const note = `<p class="muted">${c.mode === 'both' ? '<span class="dot off"></span> 全部已填的人都能線下　<span class="dot on"></span> 都能線上' : '<span class="dot off"></span> 全部已填的人都可以'}。數字是「可以的人數／已填人數」，點格子看是誰。</p>`;
  $h.innerHTML = picker + note + pagerHtml() + gridHtml((i) => {
    const can = a.filled.filter((m) => a.can(m.slots[i])).length;
    const off = a.filled.filter((m) => m.slots[i] === '2').length;
    let cls = '', style = '';
    if (total && ev.config.mode !== 'online' && off === total) cls = 'all-off';
    else if (total && can === total) cls = ev.config.mode === 'online' ? 'all-off' : 'all-on';
    else if (can) style = `style="background: color-mix(in srgb, var(--on) ${Math.round(can / total * 45)}%, var(--cell))"`;
    return `<div class="cell ${cls} ${ui.sel === i ? 'sel' : ''}" data-i="${i}" ${style}>${total ? `${can}/${total}` : ''}</div>`;
  }, false);
  bindPager($h); bindFocus($h);
  $h.querySelectorAll('.cell').forEach((x) => x.addEventListener('click', () => { ui.sel = +x.dataset.i; drawHeat(); }));
  drawDetail(a);
}

function bindFocus(root) {
  const sel = root.querySelector('#focusSel');
  if (sel) sel.addEventListener('change', () => { ui.focus = sel.value || null; drawHeat(); });
}

// 一個人每天可以的時段，用文字列出來（手機一次只看得到幾天，文字比較好掃）
function personSummary(m) {
  const c = ui.ev.config, g = geom(c);
  if (m.slots.length !== g.total) return `<span class="muted">${esc(m.name)} 還沒填時間。</span>`;
  const kind = { 2: c.mode === 'both' ? '線下 ' : '', 1: '只能線上 ' };
  const lines = [];
  for (let d = 0; d < g.days; d++) {
    const parts = [];
    for (let s = 0; s < g.nslot;) {
      const v = m.slots[d * g.nslot + s];
      let e = s + 1;
      while (e < g.nslot && m.slots[d * g.nslot + e] === v) e++;
      if (v !== '0') parts.push(`${kind[v]}${slotTime(c, s)}–${slotTime(c, e)}`);
      s = e;
    }
    if (parts.length) lines.push(`${esc(dayLabel(c, d))}：${esc(parts.join('、'))}`);
  }
  return `<b>${esc(m.name)} 可以的時間</b><br>${lines.length ? lines.join('<br>') : '每個時段都不行'}`;
}

function drawDetail(a) {
  const $d = document.getElementById('detail'), c = ui.ev.config;
  if (ui.sel === null || !a.filled.length) { $d.innerHTML = ''; return; }
  const i = ui.sel, d = Math.floor(i / a.g.nslot), s = i % a.g.nslot;
  const pick = (v) => a.filled.filter((m) => m.slots[i] === v).map((m) => m.name).join('、') || '—';
  const rows = c.mode === 'both'
    ? `<span class="dot off"></span> 線下：${esc(pick('2'))}<br><span class="dot on"></span> 只能線上：${esc(pick('1'))}<br>`
    : `<span class="dot off"></span> 可以：${esc(pick('2'))}<br>`;
  $d.innerHTML = `<b>${esc(dayLabel(c, d))} ${slotTime(c, s)}–${slotTime(c, s + 1)}</b><br>${rows}
    <span class="dot no"></span> 不行：${esc(pick('0'))}${a.pending.length ? `<br><span class="muted">未填：${esc(a.pending.map((m) => m.name).join('、'))}</span>` : ''}`;
}

// ---------- 發起人設定 ----------
function ownerCard() {
  const ev = ui.ev;
  return `<div class="card">
    <h2>發起人設定</h2>
    <p><b>邀請連結</b></p>${linkBox(inviteUrl(ev.id))}
    <label for="ownTitle">活動名稱</label>
    <div class="row"><input id="ownTitle" class="grow" maxlength="40" value="${esc(ev.title)}"><button type="button" id="ownTitleBtn">改名</button></div>
    <label for="ownPlace">地點（選填，留空就是不顯示）</label>
    <div class="row"><input id="ownPlace" class="grow" maxlength="100" value="${esc(ev.place)}" placeholder="地點或線上會議連結"><button type="button" id="ownPlaceBtn">儲存地點</button></div>
    <span class="label">加入</span>
    <div class="row"><span class="grow">${ev.status === 'open' ? '開放中：拿到連結的人都能加入' : '已關閉：只有現有成員'}</span>
      <button type="button" id="ownStatus">${ev.status === 'open' ? '關閉加入' : '重新開放'}</button></div>
    <span class="label">下一輪</span>
    <p><a class="btn" href="?new&copy=${ev.id}" data-nav>複製成新活動</a></p>
    <p class="muted">日期往後推一週、沿用時段設定，可以帶入原本的成員再增減。</p>
    <span class="label">刪除</span>
    <p><button type="button" class="danger" id="ownDelete">刪除這個活動</button></p>
    <p class="muted">所有人填的時間會一起刪掉，無法復原。</p>
  </div>`;
}
function bindOwner() {
  const ev = ui.ev;
  document.getElementById('ownPlaceBtn').addEventListener('click', () =>
    act(() => call('update', { id: ev.id, place: document.getElementById('ownPlace').value }), '地點已更新', true));
  document.getElementById('ownTitleBtn').addEventListener('click', () =>
    act(() => call('update', { id: ev.id, title: document.getElementById('ownTitle').value }), '已改名', true));
  document.getElementById('ownStatus').addEventListener('click', () =>
    act(() => call('update', { id: ev.id, status: ev.status === 'open' ? 'closed' : 'open' }), '已更新', true));
  document.getElementById('ownDelete').addEventListener('click', async () => {
    if (!confirm(`確定要刪除「${ev.title}」嗎？所有人填的時間都會一起刪掉，無法復原。`)) return;
    try { await call('delete', { id: ev.id }); } catch (err) { return toast(err.message); }
    setDirty(false); toast('已刪除'); go(home());
  });
}

// ---------- 啟動 ----------
// 舊版網頁（快取）的按鈕沒有 data-save、也沒有分享鈕，一起照顧到
document.addEventListener('click', (e) => { if (e.target.closest('[data-save], #saveBtn')) save(); });
document.getElementById('shareApp')?.addEventListener('click', shareApp);
let lastPP = perPage();
window.addEventListener('resize', () => {
  if (perPage() === lastPP || !ui.ev || !document.getElementById('heatWrap')) return;
  lastPP = perPage(); drawEditor(); drawHeat();
});
renderTop();
boot().then((ok) => { if (ok) route(); }).catch(showError);
