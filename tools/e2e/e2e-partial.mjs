/* 프리캐시가 일부 실패할 때: 새 버전 설치가 실패하고, 앱은 구버전으로 계속 살아야 한다 */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = TMP + '/part-root';
const CUR = (fs.readFileSync(REPO + '/src/config.js','utf8').match(/VERSION = '([^']+)'/) || [,'?'])[1];
const SRC = REPO;
const PORT = 8396;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = [];
function step(n, ok, x){ steps.push(ok); console.log(`${ok?'✅':'❌'} ${n}${x?' — '+x:''}`); if(!ok) process.exitCode=1; }
fs.rmSync(ROOT, { recursive: true, force: true });
fs.cpSync(SRC, ROOT, { recursive: true, filter: s => !s.includes('/.git') && !s.includes('/dist') });
const cfg = path.join(ROOT, 'src/config.js'), swf = path.join(ROOT, 'sw.js');
fs.writeFileSync(cfg, fs.readFileSync(cfg,'utf8').replace(`VERSION = '${CUR}'`,"VERSION = '0.9.9-OLD'"));
fs.writeFileSync(swf, fs.readFileSync(swf,'utf8').replace(/village-v4-[0-9]+/, "village-OLD"));
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.wav':'audio/wav','.ttf':'font/ttf','.png':'image/png' };
let breakOne = false;
const server = http.createServer((req,res)=>{
  const u = decodeURIComponent(req.url.split('?')[0]);
  // 새 설치 때 그림 하나만 실패시킨다
  if (breakOne && u.endsWith('/assets/img/tree.svg')) { res.writeHead(500); res.end('boom'); return; }
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'max-age=600'}); res.end(d); });
});
await new Promise(r=>server.listen(PORT,r));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport:{width:1024,height:700} })).newPage();
const base = `http://localhost:${PORT}/index.html`;
const ver = () => page.evaluate(() => { const v = window.__game && window.__game.scene.getScene('Profile'); return v && v.verText ? v.verText.text : null; });
await page.goto(base);
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:25000});
await page.evaluate(() => navigator.serviceWorker.ready);
await sleep(2000);
step('구버전 설치 완료', (await ver())==='v0.9.9-OLD', await ver());

// 신버전 배포하되 파일 하나가 깨진 상태
fs.writeFileSync(cfg, fs.readFileSync(cfg,'utf8').replace("VERSION = '0.9.9-OLD'", `VERSION = '${CUR}'`));
fs.writeFileSync(swf, fs.readFileSync(swf,'utf8').replace("village-OLD", "village-v4-NEW"));
breakOne = true;
await page.goto(base);
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:25000});
await sleep(4000);
const st = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  const keys = await caches.keys();
  return { caches: keys, active: regs[0] && regs[0].active ? 'yes' : 'no' };
});
step('설치 실패 → 옛 캐시 보존', st.caches.includes('village-OLD'), JSON.stringify(st.caches));

// 서버가 완전히 죽어도 앱은 살아 있어야 한다
server.close();
await new Promise(r => setTimeout(r, 300));
await page.goto(base).catch(()=>{});
const alive = await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:20000}).then(()=>true).catch(()=>false);
step('배포가 깨져도 오프라인 앱은 살아 있다', alive, await ver().catch(()=>'?'));
await browser.close();
console.log(`\n[부분실패] ${steps.filter(Boolean).length}/${steps.length} 통과`);
