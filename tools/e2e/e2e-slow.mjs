/* 느린 네트워크 / 완전 오프라인 극단 시나리오 */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = REPO;
const PORT = 8397;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = [];
function step(n, ok, x){ steps.push(ok); console.log(`${ok?'✅':'❌'} ${n}${x?' — '+x:''}`); if(!ok) process.exitCode=1; }
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.wav':'audio/wav','.ttf':'font/ttf','.png':'image/png' };
let mode = 'ok'; // ok | slow | dead
const server = http.createServer((req, res) => {
  const serve = () => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
      res.end(data);
    });
  };
  if (mode === 'dead') { res.socket.destroy(); return; }
  if (mode === 'slow' && /\.(html|js)$|\/$/.test(req.url.split('?')[0])) { setTimeout(serve, 30000); return; } // 응답이 오지 않는 상태
  serve();
});
await new Promise(r => server.listen(PORT, r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
const page = await ctx.newPage();
const base = `http://localhost:${PORT}/index.html`;
await page.goto(base);
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')", { timeout: 25000 });
await page.evaluate(() => navigator.serviceWorker.ready);
await sleep(2500);
step('정상 네트워크 부팅 + 프리캐시', true);

// 느린 네트워크 (앱 셸 응답 30초 지연) — 4초 타임아웃 후 캐시로 떠야 한다
mode = 'slow';
const t0 = Date.now();
await page.goto(base, { timeout: 30000 }).catch(()=>{});
const booted = await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')", { timeout: 22000 }).then(()=>true).catch(()=>false);
step('느린 네트워크에서도 앱이 뜬다', booted, `${((Date.now()-t0)/1000).toFixed(1)}초`);

// 완전 오프라인
mode = 'dead';
await page.goto(base).catch(()=>{});
const off = await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')", { timeout: 20000 }).then(()=>true).catch(()=>false);
step('완전 오프라인에서 앱이 뜬다', off);
// 오프라인에서 놀이까지 되는지
const played = await page.evaluate(async () => {
  const c = window.__game.scene.getScene('Profile').cards[0];
  return [c.x, c.y];
});
await page.mouse.click(played[0], played[1]);
const village = await page.waitForFunction("window.__game.scene.isActive('Village')", { timeout: 15000 }).then(()=>true).catch(()=>false);
step('오프라인에서 마을 진입', village);
await browser.close(); server.close();
console.log(`\n[네트워크] ${steps.filter(Boolean).length}/${steps.length} 통과`);
