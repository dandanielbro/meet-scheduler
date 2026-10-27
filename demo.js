// 示範模式：在瀏覽器裡直接執行後端核心（worker/core.js），用假的 LINE 身分，
// 資料存在這台電腦的瀏覽器，方便還沒部署或在本機時先試玩。
window.loadDemoBackend = async function () {
  const { handle } = await import('./worker/core.js');
  const KEY = 'ms3:demoDb';
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch {}
  db = db || { users: {}, events: [], members: [] };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // 跟 worker/index.js 的 d1Store 同樣的介面
  const store = {
    async upsertUser(u) { db.users[u.id] = { name: u.name, picture: u.picture }; },
    async eventsFor(uid) {
      const mine = new Set(db.members.filter((m) => m.userId === uid).map((m) => m.eventId));
      return clone(db.events.filter((e) => e.ownerId === uid || mine.has(e.id)));
    },
    async getEvent(id) { return clone(db.events.find((e) => e.id === id) || null); },
    async membersOf(ids) {
      return db.members.filter((m) => ids.includes(m.eventId))
        .map((m) => ({ ...m, ...(db.users[m.userId] || {}) }));
    },
    async insertEvent(e) { db.events.push({ ...clone(e), status: 'open', decided: null }); },
    async updateEvent(id, e) { Object.assign(db.events.find((x) => x.id === id), clone(e)); },
    async addMember(eventId, userId) {
      if (!db.members.some((m) => m.eventId === eventId && m.userId === userId)) db.members.push({ eventId, userId, slots: '' });
    },
    async setSlots(eventId, userId, slots) {
      const m = db.members.find((x) => x.eventId === eventId && x.userId === userId);
      if (m) m.slots = slots;
      return !!m;
    },
    async removeMember(eventId, userId) {
      db.members = db.members.filter((m) => !(m.eventId === eventId && m.userId === userId));
    },
  };
  // 示範 token 長這樣：demo|使用者id|名字
  const verify = async (t) => {
    const [tag, id, name] = String(t || '').split('|');
    return tag === 'demo' && id ? { id, name, picture: '', fresh: true } : null;
  };

  return async (payload) => {
    const out = await handle(payload, { store, verify });
    persist();
    return out;
  };
};
