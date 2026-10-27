// 週末喬時間：後端（Google Apps Script，資料存在綁定的試算表）
// 部署：擴充功能 → Apps Script → 貼上本檔 → 部署 → 新增部署作業 → 網頁應用程式
//       執行身分：我　｜　誰可以存取：所有人

const NSLOT_TOTAL = 3 * 18;   // 週五～週日 × 06–24 每小時一格
const MAX_MEMBERS = 30;

function doGet() {
  return json_({ ok: true, msg: '週末喬時間後端運作中' });
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const fn = { create: create_, get: get_, save: save_, members: members_ }[p.action];
    if (!fn) throw new Error('未知的動作');
    return json_(Object.assign({ ok: true }, fn(p)));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function create_(p) {
  const title = str_(p.title, 40, '活動名稱');
  const friday = String(p.friday || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(friday)) throw new Error('日期格式不對');
  const members = names_(p.members);
  const id = rand_(10), key = rand_(16);
  withLock_(() => sheet_('events').appendRow([id, key, safe_(title), friday, JSON.stringify(members), new Date()]));
  return { id: id, key: key };
}

function get_(p) {
  const ev = findEvent_(p.id);
  const rows = sheet_('responses').getDataRange().getValues();
  const responses = rows.filter((r) => r[0] === ev.id)
    .map((r) => ({ name: r[1], slots: r[2], updatedAt: r[3] instanceof Date ? r[3].getTime() : r[3] }));
  return { event: { id: ev.id, title: ev.title, friday: ev.friday, members: ev.members }, responses: responses };
}

function save_(p) {
  const ev = findEvent_(p.id);
  const name = String(p.name || '');
  if (ev.members.indexOf(name) < 0) throw new Error('名單裡沒有這個名字');
  const slots = String(p.slots || '');
  if (slots.length !== NSLOT_TOTAL || !/^[012]+$/.test(slots)) throw new Error('時間資料格式不對');
  withLock_(() => {
    const sh = sheet_('responses');
    const rows = sh.getDataRange().getValues();
    const i = rows.findIndex((r) => r[0] === ev.id && r[1] === name);
    // 前面加 ' 讓試算表把它當文字，不會變成數字
    if (i >= 0) sh.getRange(i + 1, 3, 1, 2).setValues([["'" + slots, new Date()]]);
    else sh.appendRow([ev.id, safe_(name), "'" + slots, new Date()]);
  });
  return {};
}

function members_(p) {
  const ev = findEvent_(p.id);
  if (String(p.key || '') !== ev.key) throw new Error('管理連結不正確');
  const members = names_(p.members);
  const title = p.title ? str_(p.title, 40, '活動名稱') : ev.title;
  withLock_(() => sheet_('events').getRange(ev.row, 3, 1, 3).setValues([[safe_(title), ev.friday, JSON.stringify(members)]]));
  return {};
}

// ---------- 工具 ----------
function findEvent_(id) {
  const rows = sheet_('events').getDataRange().getValues();
  const i = rows.findIndex((r) => r[0] === String(id || ''));
  if (i < 1) throw new Error('找不到這個活動');
  const r = rows[i];
  const friday = r[3] instanceof Date
    ? Utilities.formatDate(r[3], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[3]);
  return { row: i + 1, id: r[0], key: r[1], title: r[2], friday: friday, members: JSON.parse(r[4]) };
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(name === 'events'
      ? ['id', 'key', 'title', 'friday', 'members', 'createdAt']
      : ['eventId', 'name', 'slots', 'updatedAt']);
    if (name === 'events') sh.getRange('D:D').setNumberFormat('@');  // friday 欄存成文字
  }
  return sh;
}

function names_(list) {
  if (!Array.isArray(list)) throw new Error('名單格式不對');
  const out = [];
  list.forEach((n) => { const s = String(n).trim().slice(0, 20); if (s && out.indexOf(s) < 0) out.push(s); });
  if (out.length < 2) throw new Error('名單至少要兩個人');
  if (out.length > MAX_MEMBERS) throw new Error('名單最多 ' + MAX_MEMBERS + ' 人');
  return out;
}

function str_(v, max, label) {
  const s = String(v || '').trim();
  if (!s) throw new Error(label + '不能空白');
  return s.slice(0, max);
}

// 避免 = + - @ 開頭的文字被試算表當成公式
function safe_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function rand_(n) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
