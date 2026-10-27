# 喬時間

幫一群人喬時間的小網站。用 LINE 登入，發起人自訂日期、每天的時段和活動長度，可以同時進行很多活動。

- 大家畫出可以「線下」或「只能線上」的時間
- 系統先找全員都能線下、連續夠長的時段；沒有的話找線上；全部的人都填完還是沒有，就跳警示並列出「最接近的時段、差誰」
- 發起人可以按「定這個」把時間定案、移除成員、關閉加入、複製成下一輪
- 「我的活動」列出自己發起和參加的所有活動

## 架構

| 部分 | 放在哪 | 檔案 |
|---|---|---|
| 網頁 | GitHub Pages | `index.html`、`app.js`、`config.js` |
| 後端 | Cloudflare Worker `meet-scheduler-api` | `worker/index.js`（入口、LINE 驗證、D1 存取） |
| 規則 | 後端和示範模式共用 | `worker/core.js` |
| 資料 | Cloudflare D1 `meet-scheduler` | `worker/schema.sql` |
| 身分 | LINE Login channel `2012248168` 的 LIFF | `config.js`、`wrangler.jsonc` |

後端網址：https://meet-scheduler-api.tun-tun-dan.workers.dev

**示範模式**：在 localhost 打開，或 `config.js` 任一個值留空時，網頁在瀏覽器裡直接執行 `worker/core.js`，用假的身分登入（頁面上方可以切換），資料只存在這台電腦。

## 常用指令

```bash
npm run deploy        # 改了 worker/ 之後重新部署後端
npm run dev           # 在本機跑後端（用本機的 D1，.dev.vars 允許假身分）
npx wrangler d1 execute meet-scheduler --remote --command "SELECT * FROM events"   # 查線上資料
```

改網頁（`index.html`、`app.js`）只要 commit、push 到 GitHub，Pages 會自動更新。

## 費用

全部用免費方案，不會自動扣款：

- **Cloudflare Workers 免費方案**：每天 10 萬次請求。超過時當天的請求會失敗，不會收費。
- **D1 免費方案**：5GB、每天 500 萬列讀取、10 萬列寫入。超過一樣是失敗，不收費。
- **LINE Login / LIFF**：免費。
- **GitHub Pages**：公開 repo 免費。

要確認帳號是免費方案：Cloudflare 後台 → Workers & Pages，方案顯示 Free；Billing → Subscriptions 沒有付費項目。只要不主動升級到 Workers Paid，就不會有帳單。

## LINE 設定（已完成）

- LINE Login channel：`2012248168`，狀態必須是 **Published**，否則只有開發者能登入
- LIFF ID：`2012248168-2WFKdkTB`，Size Full，Scopes 勾 openid + profile
- Endpoint URL：`https://dandanielbro.github.io/meet-scheduler/`

LIFF ID 的前半段就是它所屬 channel 的 Channel ID，`wrangler.jsonc` 的 `LINE_CHANNEL_ID` 必須跟它一樣，不然登入驗證會失敗。

## 每次怎麼用

1. 發起人打開網站 →「＋ 發起」→ 填名稱、點選日期、每天時段、每格多久、至少多久、形式。
2. 把邀請連結（`https://liff.line.me/...`）貼到 LINE 群組。
3. 大家點連結、按「加入」、在格子上畫自己的時間、按「儲存我的時間」。
4. 有結果後，發起人按「定這個」定案。下一輪用「複製成新活動」：日期往後推一週，可以帶入原本的成員再增減。

## 限制

- 一個活動最多 14 天、50 人；每格 30 或 60 分鐘。
- 建立後不能改日期和時段（改了大家填的格子會對不上），要改就用「複製成新活動」。
- 「全部的人都填完」指的是已加入的成員，還沒點連結加入的人系統不知道。
