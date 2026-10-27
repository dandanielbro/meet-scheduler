-- 2026-10-28：活動加上選填的地點（已經建好的資料庫執行這一次就好）
ALTER TABLE events ADD COLUMN place TEXT NOT NULL DEFAULT '';
