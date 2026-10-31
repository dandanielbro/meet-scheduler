-- 預計人數（選填）：0 代表沒設定，舊活動照原本的方式算
ALTER TABLE events ADD COLUMN expect INTEGER NOT NULL DEFAULT 0;
