-- 喬時間的 D1 資料表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,          -- LINE 的使用者 id
  name TEXT NOT NULL,
  picture TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '', -- 地點（選填）
  config TEXT NOT NULL,         -- JSON：日期、每天時段、每格長度、活動長度、形式
  status TEXT NOT NULL DEFAULT 'open',
  decided TEXT,                 -- JSON：定案的時段，沒定案是 NULL
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_owner ON events (owner_id);

CREATE TABLE IF NOT EXISTS members (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  slots TEXT NOT NULL DEFAULT '', -- 每格一個字：0 不行、1 只能線上、2 線下可；空字串＝還沒填
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_user ON members (user_id);
