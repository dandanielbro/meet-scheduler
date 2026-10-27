// 喬時間：Cloudflare Worker 入口。向 LINE 驗證身分，資料存在 D1。
import { handle } from './core.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method === 'GET') return json({ ok: true, msg: '喬時間後端運作中' });
    if (req.method !== 'POST') return json({ ok: false, error: '只接受 POST' }, 405);
    let p;
    try { p = await req.json(); } catch { return json({ ok: false, error: '資料格式不對' }, 400); }
    return json(await handle(p, { store: d1Store(env.DB), verify: (t) => verifyLine(t, env) }));
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
}

// ---------- LINE 登入驗證 ----------
// 同一個 token 在一小時內不重複向 LINE 查（記在這個 Worker 執行個體的記憶體裡）
const tokenCache = new Map();

async function verifyLine(token, env) {
  if (typeof token !== 'string' || !token || token.length > 4096) return null;
  // 本機測試（wrangler dev 讀 .dev.vars）才接受假 token；線上環境沒有這個設定
  if (env.ALLOW_DEMO_TOKENS === '1' && token.startsWith('demo|')) {
    const [, id, name] = token.split('|');
    return id ? { id, name: name || id, picture: '', fresh: true } : null;
  }
  const key = token.slice(-100);  // token 尾段是簽章，夠唯一
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now()) return { ...hit.me, fresh: false };
  const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: env.LINE_CHANNEL_ID }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const me = { id: j.sub, name: String(j.name || '').slice(0, 40) || 'LINE 使用者', picture: j.picture || '' };
  if (tokenCache.size > 1000) tokenCache.clear();
  tokenCache.set(key, { me, exp: Math.min(j.exp * 1000, Date.now() + 3600e3) });
  return { ...me, fresh: true };
}

// ---------- D1 資料存取 ----------
function d1Store(db) {
  const now = () => Date.now();
  const toEvent = (r) => r && {
    id: r.id, ownerId: r.owner_id, title: r.title, config: JSON.parse(r.config),
    status: r.status, decided: r.decided ? JSON.parse(r.decided) : null,
  };
  return {
    upsertUser: (u) => db.prepare(
      'INSERT INTO users (id, name, picture, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
      'ON CONFLICT(id) DO UPDATE SET name = ?2, picture = ?3, updated_at = ?4',
    ).bind(u.id, u.name, u.picture, now()).run(),

    async eventsFor(userId) {
      const { results } = await db.prepare(
        'SELECT * FROM events WHERE owner_id = ?1 OR id IN (SELECT event_id FROM members WHERE user_id = ?1)',
      ).bind(userId).all();
      return results.map(toEvent);
    },

    async getEvent(id) {
      return toEvent(await db.prepare('SELECT * FROM events WHERE id = ?1').bind(id).first());
    },

    async membersOf(ids) {
      const out = [];
      // D1 一次最多 100 個參數，分批查
      for (let i = 0; i < ids.length; i += 90) {
        const chunk = ids.slice(i, i + 90);
        const { results } = await db.prepare(
          'SELECT m.event_id, m.user_id, m.slots, u.name, u.picture FROM members m ' +
          `LEFT JOIN users u ON u.id = m.user_id WHERE m.event_id IN (${chunk.map(() => '?').join(',')}) ` +
          'ORDER BY m.joined_at, m.rowid',
        ).bind(...chunk).all();
        results.forEach((r) => out.push({ eventId: r.event_id, userId: r.user_id, slots: r.slots, name: r.name, picture: r.picture }));
      }
      return out;
    },

    insertEvent: (e) => db.prepare(
      'INSERT INTO events (id, owner_id, title, config, status, decided, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, \'open\', NULL, ?5, ?5)',
    ).bind(e.id, e.ownerId, e.title, JSON.stringify(e.config), now()).run(),

    updateEvent: (id, e) => db.prepare(
      'UPDATE events SET title = ?2, status = ?3, decided = ?4, updated_at = ?5 WHERE id = ?1',
    ).bind(id, e.title, e.status, e.decided ? JSON.stringify(e.decided) : null, now()).run(),

    addMember: (eventId, userId) => db.prepare(
      'INSERT OR IGNORE INTO members (event_id, user_id, slots, joined_at, updated_at) VALUES (?1, ?2, \'\', ?3, ?3)',
    ).bind(eventId, userId, now()).run(),

    async setSlots(eventId, userId, slots) {
      const r = await db.prepare('UPDATE members SET slots = ?3, updated_at = ?4 WHERE event_id = ?1 AND user_id = ?2')
        .bind(eventId, userId, slots, now()).run();
      return r.meta.changes > 0;
    },

    removeMember: (eventId, userId) => db.prepare('DELETE FROM members WHERE event_id = ?1 AND user_id = ?2')
      .bind(eventId, userId).run(),
  };
}
