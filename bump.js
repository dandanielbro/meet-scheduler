// 推上線前跑一次：npm run bump
// 把 index.html 裡的版本號和 version.json 一起換成現在時間，
// 開著舊頁面的人（例如 LINE 縮小後又叫回來）會偵測到新版並自動重新載入。
import { readFileSync, writeFileSync } from 'node:fs';

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const v = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;

const html = readFileSync('index.html', 'utf8')
  .replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${v}'`)
  .replace(/\.js\?v=[^"]*"/g, `.js?v=${v}"`);
writeFileSync('index.html', html);
writeFileSync('version.json', JSON.stringify({ v }) + '\n');
console.log('版本', v);
