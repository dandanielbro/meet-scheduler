// 喬時間：後端核心邏輯。Cloudflare Worker（D1 資料庫）和瀏覽器示範模式共用這一份。
// store 負責存取資料，verify 負責確認 LINE 身分；這裡只管規則。
const MAX_DAYS = 14;
const MAX_MEMBERS = 50;
const MODES = ['both', 'offline', 'online'];  // 線下線上都可／只有線下／只有線上

export async function handle(p, { store, verify }) {
  try {
    const fn = { mine, get, create, join, save, remove, update, delete: del }[p && p.action];
    if (!fn) throw new Error('未知的動作');
    const me = await verify(p.idToken);
    if (!me) throw err('登入已過期，請重新打開', 'AUTH');
    if (me.fresh) await store.upsertUser(me);
    return { ok: true, ...(await fn(p, { id: me.id, name: me.name, picture: me.picture }, store)) };
  } catch (e) {
    return { ok: false, error: String(e.message || e), code: e.code || '' };
  }
}

// ---------- 動作 ----------
async function mine(p, me, store) {
  const events = await store.eventsFor(me.id);
  const members = await store.membersOf(events.map((e) => e.id));
  return { me, events: events.map((e) => view(e, members.filter((m) => m.eventId === e.id), me)) };
}

async function get(p, me, store) {
  const ev = await mustEvent(store, p.id);
  return { me, event: view(ev, await store.membersOf([ev.id]), me) };
}

async function create(p, me, store) {
  const title = str(p.title, 40, '活動名稱');
  const place = optStr(p.place, 100);
  const config = checkConfig(p.config);
  const id = rand(10);
  await store.insertEvent({ id, ownerId: me.id, title, place, config });
  await store.addMember(id, me.id);
  // 複製舊活動時，把原本的成員一起帶進來（只有原發起人能這樣做）
  if (p.copyFrom && p.copyMembers) {
    const src = await store.getEvent(String(p.copyFrom));
    if (src && src.ownerId === me.id) {
      for (const m of await store.membersOf([src.id])) if (m.userId !== me.id) await store.addMember(id, m.userId);
    }
  }
  return { id };
}

async function join(p, me, store) {
  const ev = await mustEvent(store, p.id);
  const members = await store.membersOf([ev.id]);
  if (members.some((m) => m.userId === me.id)) return {};
  if (ev.status !== 'open') throw new Error('發起人已關閉加入');
  if (members.length >= MAX_MEMBERS) throw new Error('人數已滿');
  await store.addMember(ev.id, me.id);
  return {};
}

async function save(p, me, store) {
  const ev = await mustEvent(store, p.id);
  const g = geom(ev.config);
  const slots = String(p.slots || '');
  if (slots.length !== g.days * g.nslot || !/^[012]+$/.test(slots)) throw new Error('時間資料格式不對');
  if (!(await store.setSlots(ev.id, me.id, slots))) throw new Error('你還沒加入這個活動');
  return {};
}

async function remove(p, me, store) {
  const ev = await mustEvent(store, p.id);
  const target = String(p.userId || '');
  if (target !== me.id && ev.ownerId !== me.id) throw new Error('只有發起人可以移除別人');
  if (target === ev.ownerId) throw new Error('發起人不能退出自己的活動');
  await store.removeMember(ev.id, target);
  return {};
}

async function update(p, me, store) {
  const ev = await mustEvent(store, p.id);
  if (ev.ownerId !== me.id) throw new Error('只有發起人可以修改');
  const title = p.title !== undefined ? str(p.title, 40, '活動名稱') : ev.title;
  const place = p.place !== undefined ? optStr(p.place, 100) : ev.place;
  const status = p.status !== undefined ? (p.status === 'closed' ? 'closed' : 'open') : ev.status;
  let decided = ev.decided;
  if (p.decided !== undefined) decided = p.decided ? checkDecided(p.decided, ev.config) : null;
  await store.updateEvent(ev.id, { title, place, status, decided });
  return {};
}

async function del(p, me, store) {
  const ev = await mustEvent(store, p.id);
  if (ev.ownerId !== me.id) throw new Error('只有發起人可以刪除活動');
  await store.deleteEvent(ev.id);
  return {};
}

// ---------- 共用 ----------
async function mustEvent(store, id) {
  const ev = await store.getEvent(String(id || ''));
  if (!ev) throw new Error('找不到這個活動');
  return ev;
}

function view(ev, members, me) {
  const list = members.map((m) => ({ id: m.userId, name: m.name || '（未知）', picture: m.picture || '', slots: m.slots || '' }));
  return {
    id: ev.id, title: ev.title, place: ev.place || '', config: ev.config, status: ev.status, decided: ev.decided,
    ownerId: ev.ownerId, isOwner: ev.ownerId === me.id, joined: list.some((m) => m.id === me.id), members: list,
  };
}

function checkConfig(c) {
  c = c || {};
  const dates = Array.isArray(c.dates) ? c.dates.map(String) : [];
  const uniq = dates.filter((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d) && dates.indexOf(d) === i).sort();
  if (!uniq.length) throw new Error('至少要選一天');
  if (uniq.length > MAX_DAYS) throw new Error(`最多選 ${MAX_DAYS} 天`);
  const slotMin = Number(c.slotMin);
  if (![30, 60].includes(slotMin)) throw new Error('每格只能是 30 或 60 分鐘');
  const startMin = Number(c.startMin), endMin = Number(c.endMin);
  if (!(startMin >= 0 && endMin <= 1440 && startMin < endMin && startMin % slotMin === 0 && endMin % slotMin === 0)) {
    throw new Error('每天的時段不對');
  }
  const minMin = Number(c.minMin);
  if (!(minMin >= 30 && minMin <= endMin - startMin && minMin % 30 === 0)) throw new Error('活動長度不對');
  const mode = MODES.includes(c.mode) ? c.mode : 'both';
  return { dates: uniq, startMin, endMin, slotMin, minMin, mode };
}

function checkDecided(d, config) {
  const g = geom(config);
  const out = { day: Number(d.day), start: Number(d.start), end: Number(d.end), mode: d.mode === 'online' ? 'online' : 'offline' };
  if (!(out.day >= 0 && out.day < g.days && out.start >= 0 && out.start < out.end && out.end <= g.nslot)) {
    throw new Error('定案時間不對');
  }
  return out;
}

function geom(c) {
  return { days: c.dates.length, nslot: (c.endMin - c.startMin) / c.slotMin };
}

function err(msg, code) {
  const e = new Error(msg); e.code = code; return e;
}

// 選填的文字，可以是空字串
function optStr(v, max) {
  return String(v || '').trim().slice(0, max);
}

function str(v, max, label) {
  const s = String(v || '').trim();
  if (!s) throw new Error(`${label}不能空白`);
  return s.slice(0, max);
}

function rand(n) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => a[x % a.length]).join('');
}
