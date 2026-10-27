// 週末喬時間：每週一個活動，成員畫出線下／線上可以的時間，系統找交集。
const START_HOUR = 6;          // 06:00 開始
const END_HOUR = 24;           // 24:00 結束
const NSLOT = END_HOUR - START_HOUR;  // 每天 18 格，每格 1 小時
const DAYS = 3;                // 週五、六、日
const MIN_MEETING_MIN = 90;    // 至少要連續 1.5 小時
const NEED = Math.ceil(MIN_MEETING_MIN / 60);  // 換成格數：2 格
const DAY_NAMES = ['五', '六', '日'];
const EMPTY = '0'.repeat(DAYS * NSLOT);  // 每格 0=不行 1=只能線上 2=線下可（線下可也代表線上可）

const $app = document.getElementById('app');
const params = new URLSearchParams(location.search);

// ---------- 資料存取 ----------
const remoteApi = async (payload) => {
  const r = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // 避免 CORS 預檢
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || '伺服器錯誤');
  return j;
};

// 示範模式：沒有設定 API_URL 時，資料存在這台電腦的瀏覽器
const localApi = async (p) => {
  const db = store.get('demoDb', { events: {}, responses: {} });
  const ev = db.events[p.id];
  let out;
  if (p.action === 'create') {
    const id = randId(10), key = randId(16);
    db.events[id] = { id, key, title: p.title, friday: p.friday, members: p.members };
    out = { id, key };
  } else if (p.action === 'get') {
    if (!ev) throw new Error('找不到這個活動');
    const { key, ...pub } = ev;
    out = { event: pub, responses: Object.values(db.responses[p.id] || {}) };
  } else if (p.action === 'save') {
    if (!ev) throw new Error('找不到這個活動');
    if (!ev.members.includes(p.name)) throw new Error('名單裡沒有這個名字');
    (db.responses[p.id] ||= {})[p.name] = { name: p.name, slots: p.slots, updatedAt: Date.now() };
    out = {};
  } else if (p.action === 'members') {
    if (!ev || ev.key !== p.key) throw new Error('管理連結不正確');
    ev.members = p.members; ev.title = p.title || ev.title;
    out = {};
  }
  store.set('demoDb', db);
  return { ok: true, ...out };
};

const api = CONFIG.API_URL ? remoteApi : localApi;

const store = {
  get(k, d) { try { const v = localStorage.getItem('ms:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ms:' + k, JSON.stringify(v)); } catch {} },
};

// ---------- 小工具 ----------
function randId(n) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => a[x % a.length]).join('');
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}
function parseNames(text) {
  const names = text.split(/[\n,，、;；]+/).map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 20));
  return [...new Set(names)];
}
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
// 回傳這週末的週五（今天是週五～週日就回傳這個週五）
function snapFriday(date) {
  const d = new Date(date); const wd = d.getDay();  // 0 日 … 5 五 6 六
  const back = { 5: 0, 6: 1, 0: 2 }[wd];
  d.setDate(d.getDate() + (back !== undefined ? -back : 5 - wd));
  return d;
}
function dayDate(friday, i) { const d = parseYmd(friday); d.setDate(d.getDate() + i); return d; }
function dayLabel(friday, i) { const d = dayDate(friday, i); return `${d.getMonth() + 1}/${d.getDate()}（${DAY_NAMES[i]}）`; }
function rangeLabel(friday) { return `${dayLabel(friday, 0)} – ${dayLabel(friday, 2)}`; }
function hourLabel(s) { return `${pad(START_HOUR + s)}:00`; }
function windowLabel(friday, w) { return `${dayLabel(friday, w.day)} ${hourLabel(w.start)}–${hourLabel(w.end)}`; }
function eventUrl(id, key) {
  const u = new URL(location.href); u.search = '';
  u.searchParams.set('e', id); if (key) u.searchParams.set('k', key);
  return u.toString();
}

// ---------- 找交集 ----------
// 連續 ok 的格子組成時段，長度 >= NEED 才算
function runs(ok) {
  const out = [];
  for (let d = 0; d < DAYS; d++) {
    let s = null;
    for (let i = 0; i <= NSLOT; i++) {
      const good = i < NSLOT && ok[d * NSLOT + i];
      if (good && s === null) s = i;
      if (!good && s !== null) { if (i - s >= NEED) out.push({ day: d, start: s, end: i }); s = null; }
    }
  }
  return out;
}

function analyze(ev, responses) {
  const map = {};
  responses.forEach((r) => { if (ev.members.includes(r.name)) map[r.name] = r.slots; });
  const filled = ev.members.filter((m) => map[m]);
  const pending = ev.members.filter((m) => !map[m]);
  const n = DAYS * NSLOT;
  const offAll = [], onAll = [];
  for (let i = 0; i < n; i++) {
    offAll[i] = filled.length > 0 && filled.every((m) => map[m][i] === '2');
    onAll[i] = filled.length > 0 && filled.every((m) => map[m][i] !== '0');
  }
  const offline = runs(offAll);
  const online = offline.length ? [] : runs(onAll);

  // 找不到全員交集時，列出最接近的時段（最多人可以），讓大家知道要喬誰
  let closest = [];
  if (!offline.length && !online.length && filled.length) {
    const cands = [];
    for (let d = 0; d < DAYS; d++) {
      for (let s = 0; s + NEED <= NSLOT; s++) {
        const idx = Array.from({ length: NEED }, (_, k) => d * NSLOT + s + k);
        const can = filled.filter((m) => idx.every((i) => map[m][i] !== '0'));
        const off = filled.filter((m) => idx.every((i) => map[m][i] === '2'));
        cands.push({ day: d, start: s, end: s + NEED, can: can.length, off: off.length,
          missing: filled.filter((m) => !can.includes(m)) });
      }
    }
    cands.sort((a, b) => b.can - a.can || b.off - a.off || a.day - b.day || a.start - b.start);
    for (const c of cands) {
      if (c.can === 0 || closest.length >= 3) break;
      const dup = closest.some((x) => x.day === c.day && Math.abs(x.start - c.start) < NEED && x.missing.join() === c.missing.join());
      if (!dup) closest.push(c);
    }
  }
  return { map, filled, pending, offline, online, closest };
}

// ---------- 首頁：發起活動 ----------
function renderHome() {
  const friday = ymd(snapFriday(new Date()));
  const mine = store.get('myEvents', []);
  $app.innerHTML = `
    ${demoBanner()}
    <h1>週末喬時間</h1>
    <p class="muted">每週由一個人發起，邀請這週的成員。大家畫出週五到週日可以線下或線上的時間，系統先找線下交集，沒有再找線上。</p>
    <form class="card" id="createForm">
      <h2>發起這週的聚會</h2>
      <label for="title">活動名稱</label>
      <input id="title" required maxlength="40" placeholder="例如：讀書會 A 組">
      <label for="friday">哪個週末</label>
      <input id="friday" type="date" value="${friday}" required>
      <p class="muted" id="rangeHint">${rangeLabel(friday)}</p>
      <label for="creator">你的名字</label>
      <input id="creator" required maxlength="20" value="${esc(store.get('lastName', ''))}">
      <label for="members">這週還有誰（一行一個名字，或用逗號分開）</label>
      <textarea id="members" placeholder="小明&#10;小華&#10;阿凱"></textarea>
      <p style="margin-top:14px"><button class="primary" type="submit" id="createBtn">建立並取得邀請連結</button></p>
    </form>
    <div id="created"></div>
    ${mine.length ? `<div class="card"><h2>我發起過的</h2>${mine.slice(0, 8).map((e) => `
      <p><a href="${esc(eventUrl(e.id, e.key))}">${esc(e.title)}</a> <span class="muted">${esc(rangeLabel(e.friday))}</span></p>`).join('')}</div>` : ''}
  `;
  const $f = document.getElementById('friday');
  $f.addEventListener('change', () => {
    if (!$f.value) return;
    $f.value = ymd(snapFriday(parseYmd($f.value)));
    document.getElementById('rangeHint').textContent = rangeLabel($f.value);
  });
  document.getElementById('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value.trim();
    const creator = document.getElementById('creator').value.trim().slice(0, 20);
    const members = parseNames(creator + '\n' + document.getElementById('members').value);
    if (members.length < 2) return toast('至少要邀請一位成員');
    const btn = document.getElementById('createBtn'); btn.disabled = true; btn.textContent = '建立中…';
    try {
      const { id, key } = await api({ action: 'create', title, friday: $f.value, members });
      store.set('lastName', creator);
      store.set('me:' + id, creator);
      store.set('myEvents', [{ id, key, title, friday: $f.value }, ...mine].slice(0, 20));
      document.getElementById('createForm').remove();
      document.getElementById('created').innerHTML = `
        <div class="card">
          <h2>建好了！</h2>
          <p><b>邀請連結</b>：貼到群組給這週的成員</p>
          ${linkBox(eventUrl(id))}
          <p><b>管理連結</b>：自己留著，之後要加人、換人用</p>
          ${linkBox(eventUrl(id, key))}
          <p><a href="${esc(eventUrl(id, key))}">→ 進去填我的時間</a></p>
        </div>`;
      bindCopy();
    } catch (err) {
      toast(err.message); btn.disabled = false; btn.textContent = '建立並取得邀請連結';
    }
  });
}

function linkBox(url) {
  return `<div class="link-box"><input readonly value="${esc(url)}"><button type="button" data-copy="${esc(url)}">複製</button></div>`;
}
function bindCopy() {
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('已複製'); }
    catch { b.previousElementSibling.select(); toast('請長按複製'); }
  }));
}
function demoBanner() {
  return CONFIG.API_URL ? '' : '<div class="banner">示範模式：還沒接上試算表，資料只存在這台電腦。</div>';
}

// ---------- 活動頁 ----------
const state = { id: params.get('e'), key: params.get('k'), ev: null, responses: [], me: null, draft: null, dirty: false, brush: '2', sel: null };

async function loadEvent() {
  const j = await api({ action: 'get', id: state.id });
  state.ev = j.event; state.responses = j.responses;
  const saved = store.get('me:' + state.id, null);
  if (!state.me && saved && state.ev.members.includes(saved)) state.me = saved;
  if (state.me && !state.ev.members.includes(state.me)) state.me = null;
}

async function renderEvent() {
  try { await loadEvent(); }
  catch (err) {
    $app.innerHTML = `${demoBanner()}<div class="card"><h2>打不開這個活動</h2><p class="muted">${esc(err.message)}</p><p><a href="${esc(location.pathname)}">回首頁發起新的</a></p></div>`;
    return;
  }
  const ev = state.ev;
  document.title = `${ev.title}｜週末喬時間`;
  $app.innerHTML = `
    ${demoBanner()}
    <h1>${esc(ev.title)}</h1>
    <div class="row"><span class="muted grow">${esc(rangeLabel(ev.friday))}・至少連續 ${MIN_MEETING_MIN / 60} 小時</span>
      <button id="refreshBtn" type="button">重新整理</button></div>
    <div class="card" id="result"></div>
    <div class="card">
      <h2>我是誰？</h2>
      <div class="chips" id="whoami"></div>
      <div id="editorWrap"></div>
    </div>
    <div class="card">
      <h2>大家的時間</h2>
      <p class="muted">綠色＝全部已填的人都能線下；藍色＝都能線上；數字是「可以的人數／已填人數」。點格子看是誰。</p>
      <div class="grid heat" id="heat"></div>
      <div class="detail" id="detail"></div>
    </div>
    ${state.key ? adminCard() : ''}
    <p class="muted"><a href="${esc(location.pathname)}">發起另一個活動</a></p>
  `;
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  if (state.key) bindAdmin();
  renderResult(); renderWho(); renderEditor(); renderHeat();
}

async function refresh() {
  try { await loadEvent(); } catch (err) { return toast(err.message); }
  renderResult(); renderHeat();
  if (!state.dirty) { renderWho(); renderEditor(); }
}

function renderResult() {
  const ev = state.ev;
  const a = analyze(ev, state.responses);
  const list = (ws) => `<ul>${ws.map((w) => `<li>${esc(windowLabel(ev.friday, w))}</li>`).join('')}</ul>`;
  const waitNote = a.pending.length
    ? `<p class="muted">已填 ${a.filled.length}/${ev.members.length} 人，還在等：${esc(a.pending.join('、'))}。結果可能還會變。</p>` : '';
  let html;
  if (!a.filled.length) {
    html = `<div class="status wait"><h2>還沒有人填</h2><p>選下面的名字，畫出你週末可以的時間。</p></div>`;
  } else if (a.offline.length) {
    html = `<div class="status ok-off"><h2>✅ 可以線下見面</h2><p>這些時間大家都能到場：</p>${list(a.offline)}${waitNote}</div>`;
  } else if (a.online.length) {
    html = `<div class="status ok-on"><h2>💻 線下湊不齊，改線上</h2><p>這些時間大家都能上線：</p>${list(a.online)}${waitNote}</div>`;
  } else {
    const close = a.closest.length ? `<p>最接近的時段：</p><ul>${a.closest.map((c) =>
      `<li>${esc(windowLabel(ev.friday, c))}：${c.can}/${a.filled.length} 人可以${c.missing.length ? `，差 ${esc(c.missing.join('、'))}` : ''}</li>`).join('')}</ul>` : '';
    html = a.pending.length
      ? `<div class="status wait"><h2>目前還找不到共同時間</h2>${waitNote}${close}</div>`
      : `<div class="status warn"><h2>⚠️ 大家都填完了，但找不到時間</h2><p>線下、線上都沒有連續 ${MIN_MEETING_MIN / 60} 小時全員都可以的時段。請大家看看能不能調整一下，改完重新儲存就會更新。</p>${close}</div>`;
  }
  document.getElementById('result').innerHTML = html;
}

function renderWho() {
  const a = analyze(state.ev, state.responses);
  const $w = document.getElementById('whoami');
  $w.innerHTML = state.ev.members.map((m) =>
    `<button type="button" class="chip ${m === state.me ? 'me' : a.map[m] ? 'done' : ''}" data-name="${esc(m)}">${esc(m)}${a.map[m] ? ' ✓' : ''}</button>`).join('');
  $w.querySelectorAll('[data-name]').forEach((b) => b.addEventListener('click', () => {
    if (state.dirty && !confirm('你的時間還沒儲存，確定要換人嗎？')) return;
    state.me = b.dataset.name; store.set('me:' + state.id, state.me); store.set('lastName', state.me);
    setDirty(false); renderWho(); renderEditor();
  }));
}

function renderEditor() {
  const $wrap = document.getElementById('editorWrap');
  if (!state.me) { $wrap.innerHTML = '<p class="muted">點你的名字開始填。名單沒有你？請發起人用管理連結加你。</p>'; return; }
  if (!state.dirty) {
    const mine = state.responses.find((r) => r.name === state.me);
    state.draft = (mine ? mine.slots : EMPTY).split('');
  }
  $wrap.innerHTML = `
    <p class="muted" style="margin-top:12px">選一種顏色，在格子上點或拖曳。點星期可以整天填滿。</p>
    <div class="toolbar">
      <button type="button" class="brush" data-brush="2"><span class="dot off"></span>線下可</button>
      <button type="button" class="brush" data-brush="1"><span class="dot on"></span>只能線上</button>
      <button type="button" class="brush" data-brush="0"><span class="dot no"></span>不行</button>
    </div>
    <div class="grid editor" id="editor"></div>`;
  $wrap.querySelectorAll('.brush').forEach((b) => b.addEventListener('click', () => { state.brush = b.dataset.brush; markBrush(); }));
  markBrush();
  const $g = document.getElementById('editor');
  $g.innerHTML = gridHtml((i) => `<div class="cell v${state.draft[i]}" data-i="${i}"></div>`, true);
  bindPaint($g);
}

function markBrush() {
  document.querySelectorAll('.brush').forEach((b) => b.classList.toggle('active', b.dataset.brush === state.brush));
}

function gridHtml(cell, tapHeads) {
  let h = '<div></div>';
  for (let d = 0; d < DAYS; d++) h += `<div class="head ${tapHeads ? 'tap' : ''}" data-day="${d}">${esc(dayLabel(state.ev.friday, d))}</div>`;
  for (let s = 0; s < NSLOT; s++) {
    h += `<div class="time">${hourLabel(s)}</div>`;
    for (let d = 0; d < DAYS; d++) h += cell(d * NSLOT + s);
  }
  return h;
}

function bindPaint($g) {
  let paintVal = null, last = null;
  const setOne = (i) => {
    if (state.draft[i] === paintVal) return;
    state.draft[i] = paintVal; $g.querySelector(`[data-i="${i}"]`).className = 'cell v' + paintVal; setDirty(true);
  };
  // 手指滑太快會跳過格子：同一天就把中間的格子一起補上
  const setCell = (el) => {
    const i = +el.dataset.i;
    if (last !== null && Math.floor(last / NSLOT) === Math.floor(i / NSLOT)) {
      for (let k = Math.min(last, i); k <= Math.max(last, i); k++) setOne(k);
    } else setOne(i);
    last = i;
  };
  const cellAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el.dataset && el.dataset.i !== undefined && $g.contains(el) ? el : null;
  };
  $g.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.cell'); if (!el) return;
    e.preventDefault();
    // 在已經是同色的格子上按下＝改成清除
    paintVal = state.draft[+el.dataset.i] === state.brush ? '0' : state.brush;
    $g.setPointerCapture(e.pointerId);
    setCell(el);
  });
  $g.addEventListener('pointermove', (e) => { if (paintVal === null) return; const el = cellAt(e); if (el) setCell(el); });
  const end = () => { paintVal = null; last = null; };
  $g.addEventListener('pointerup', end); $g.addEventListener('pointercancel', end);
  $g.querySelectorAll('.head.tap').forEach((h) => h.addEventListener('click', () => {
    const d = +h.dataset.day; const idx = Array.from({ length: NSLOT }, (_, s) => d * NSLOT + s);
    const v = idx.every((i) => state.draft[i] === state.brush) ? '0' : state.brush;
    idx.forEach((i) => { state.draft[i] = v; });
    $g.querySelectorAll('.cell').forEach((c) => { c.className = 'cell v' + state.draft[+c.dataset.i]; });
    setDirty(true);
  }));
}

function setDirty(v) {
  state.dirty = v;
  document.getElementById('savebar').classList.toggle('show', v);
}

async function save() {
  const btn = document.getElementById('saveBtn'); btn.disabled = true; btn.textContent = '儲存中…';
  try {
    await api({ action: 'save', id: state.id, name: state.me, slots: state.draft.join('') });
    setDirty(false); toast('已儲存');
    await loadEvent(); renderResult(); renderWho(); renderHeat();
  } catch (err) { toast(err.message); }
  btn.disabled = false; btn.textContent = '儲存我的時間';
}

function renderHeat() {
  const a = analyze(state.ev, state.responses);
  const total = a.filled.length;
  const $h = document.getElementById('heat');
  $h.innerHTML = gridHtml((i) => {
    const can = a.filled.filter((m) => a.map[m][i] !== '0').length;
    const off = a.filled.filter((m) => a.map[m][i] === '2').length;
    let cls = '', style = '';
    if (total && off === total) cls = 'all-off';
    else if (total && can === total) cls = 'all-on';
    else if (can) style = `style="background: color-mix(in srgb, var(--on) ${Math.round(can / total * 45)}%, var(--cell))"`;
    return `<div class="cell ${cls} ${state.sel === i ? 'sel' : ''}" data-i="${i}" ${style}>${total ? `${can}/${total}` : ''}</div>`;
  }, false);
  $h.querySelectorAll('.cell').forEach((c) => c.addEventListener('click', () => { state.sel = +c.dataset.i; renderHeat(); }));
  renderDetail(a);
}

function renderDetail(a) {
  const $d = document.getElementById('detail');
  if (state.sel === null || !a.filled.length) { $d.innerHTML = ''; return; }
  const i = state.sel, d = Math.floor(i / NSLOT), s = i % NSLOT;
  const pick = (v) => a.filled.filter((m) => a.map[m][i] === v).join('、') || '—';
  $d.innerHTML = `<b>${esc(dayLabel(state.ev.friday, d))} ${hourLabel(s)}–${hourLabel(s + 1)}</b><br>
    <span class="dot off"></span> 線下：${esc(pick('2'))}<br>
    <span class="dot on"></span> 只能線上：${esc(pick('1'))}<br>
    <span class="dot no"></span> 不行：${esc(pick('0'))}${a.pending.length ? `<br><span class="muted">未填：${esc(a.pending.join('、'))}</span>` : ''}`;
}

// ---------- 管理：調整名單 ----------
function adminCard() {
  return `<div class="card" id="admin">
    <h2>管理（只有你看得到）</h2>
    <p><b>邀請連結</b>：貼到群組</p>
    ${linkBox(eventUrl(state.id))}
    <label for="adminTitle">活動名稱</label>
    <input id="adminTitle" maxlength="40" value="${esc(state.ev.title)}">
    <label for="adminMembers">這週名單（一行一個）</label>
    <textarea id="adminMembers">${esc(state.ev.members.join('\n'))}</textarea>
    <p class="muted">移除的人，他填過的時間不會算進結果。</p>
    <p><button class="primary" type="button" id="adminSave">更新名單</button></p>
  </div>`;
}
function bindAdmin() {
  bindCopy();
  document.getElementById('adminSave').addEventListener('click', async () => {
    const members = parseNames(document.getElementById('adminMembers').value);
    if (members.length < 2) return toast('名單至少要兩個人');
    try {
      await api({ action: 'members', id: state.id, key: state.key, members, title: document.getElementById('adminTitle').value.trim() });
      toast('名單已更新'); renderEvent();
    } catch (err) { toast(err.message); }
  });
}

// ---------- 啟動 ----------
document.getElementById('saveBtn').addEventListener('click', save);
window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
if (state.id) {
  renderEvent();
  setInterval(() => { if (document.visibilityState === 'visible' && state.ev) refresh(); }, 30000);
} else {
  renderHome();
}
