// 兩個都填好才會正式上線；任一個留空，或在 localhost 打開 = 示範模式（資料只存在這台電腦的瀏覽器，用假的身分登入）。
window.CONFIG = {
  API_URL: 'https://meet-scheduler-api.tun-tun-dan.workers.dev',  // Cloudflare Worker 的網址（npm run deploy 後會印出來）
  LIFF_ID: '2012248168-2WFKdkTB',  // LINE Developers 裡 LIFF 分頁的 LIFF ID，長得像 1234567890-AbcdEfgh
};
