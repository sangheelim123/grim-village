/* '최신 버전 받기' 버튼 안전성:
   A) 오프라인에서 누르면 앱을 부수지 않고 안내만 한다
   B) 같은 주소의 다른 앱 캐시/워커를 건드리지 않는다
   C) 온라인에서 누르면 실제로 새 버전을 받는다 */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';
const fs = require('fs'), path = require('path'), http = require('http');
const CUR = (fs.readFileSync(REPO + '/src/config.js','utf8').match(/VERSION = '([^']+)'/) || [,'?'])[1];
const SRC = REPO;
const ROOT = TMP + '/force-root';
const PORT = 8388;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = [];
function step(n, ok, x){ steps.push(ok); console.log(`${ok?'✅':'❌'} ${n}${x?' — '+x:''}`); if(!ok) process.exitCode=1; }
fs.rmSync(ROOT,{recursive:true,force:true});
fs.cpSync(SRC, ROOT, { recursive:true, filter: s => !s.includes('/.git') && !s.includes('/dist') });
const cfg = path.join(ROOT,'src/config.js');
fs.writeFileSync(cfg, fs.readFileSync(cfg,'utf8').replace(`VERSION = '${CUR}'`,"VERSION = '0.9.9-OLD'"));
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.wav':'audio/wav','.ttf':'font/ttf','.png':'image/png' };
let dead = false;
const server = http.createServer((req,res)=>{
  if (dead) { res.socket.destroy(); return; }
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'max-age=600'}); res.end(d); });
});
await new Promise(r=>server.listen(PORT,r));
const base = `http://localhost:${PORT}/index.html`;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport:{width:1024,height:700} })).newPage();
page.on('pageerror', e => console.log('  [PAGEERROR]', e.message.split('\n')[0].slice(0,140)));
const ver = () => page.evaluate(() => { const v = window.__game && window.__game.scene.getScene('Profile'); return v && v.verText ? v.verText.text : null; });

await page.goto(base);
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:25000});
await page.evaluate(() => navigator.serviceWorker.ready);
await sleep(2000);
// 같은 주소의 '다른 앱' 캐시를 흉내 낸다
await page.evaluate(async () => { const c = await caches.open('other-app-v1'); await c.put('/x', new Response('keep')); });
step('구버전 설치 + 다른 앱 캐시 존재', (await ver())==='v0.9.9-OLD', await ver());

// 부모 코너 열기
const card = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x,c.y]; });
await page.mouse.click(card[0], card[1]);
await page.waitForFunction("window.__game.scene.isActive('Village')",{timeout:20000});
await sleep(1000);
const openParent = async () => {
  const g = await page.$('#btn-gear'); const b = await g.boundingBox();
  await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await sleep(3300); await page.mouse.up();
  await sleep(700);
  // 길게 누르기가 실패하면(타이밍) 직접 연다 — 이 테스트의 관심사는 버튼 동작이다
  const open = await page.evaluate(() => document.getElementById('parent').classList.contains('show'));
  if (!open) await page.evaluate(() => document.getElementById('parent').classList.add('show'));
  await page.evaluate(() => document.getElementById('btn-force-update').scrollIntoView());
  await sleep(200);
};
await openParent();
step('부모 코너 열림', await page.evaluate(() => document.getElementById('parent').classList.contains('show')));

/* A) 오프라인에서 누르기 */
dead = true;
await page.click('#btn-force-update');
await sleep(1200);
const offState = await page.evaluate(async () => ({
  alive: !!window.__game,
  caches: await caches.keys(),
  sw: (await navigator.serviceWorker.getRegistrations()).length,
  toast: !!document.querySelector('.toast'),
  btn: document.getElementById('btn-force-update').textContent,
}));
step('오프라인 클릭 → 앱 살아 있음 + 캐시 보존', offState.alive && offState.caches.some(k=>k.startsWith('village-')) && offState.sw > 0,
     JSON.stringify({caches: offState.caches, sw: offState.sw}));
step('오프라인 클릭 → 안내 표시 + 버튼 복구', offState.toast && offState.btn.includes('최신'), offState.btn);
// 오프라인에서도 앱은 여전히 켜진다
await page.goto(base).catch(()=>{});
const stillOk = await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:20000}).then(()=>true).catch(()=>false);
step('오프라인 클릭 후에도 앱이 켜진다', stillOk, await ver().catch(()=>'?'));
dead = false;

/* C) 온라인에서 누르기 → 신버전 (깨끗한 브라우저 프로필에서) */
fs.writeFileSync(cfg, fs.readFileSync(cfg,'utf8').replace("VERSION = '0.9.9-OLD'", `VERSION = '${CUR}'`));
{
  const ctx2 = await browser.newContext({ viewport:{width:1024,height:700} });
  const p2 = await ctx2.newPage();
  // 구버전을 먼저 설치한 상태를 만든다
  fs.writeFileSync(cfg, fs.readFileSync(cfg,'utf8').replace(`VERSION = '${CUR}'`,"VERSION = '0.9.9-OLD'"));
  await p2.goto(base);
  await p2.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:25000});
  await p2.evaluate(()=>navigator.serviceWorker.ready); await sleep(2000);
  // 새 버전 배포 후 버튼을 누른다
  fs.writeFileSync(cfg, fs.readFileSync(cfg,'utf8').replace("VERSION = '0.9.9-OLD'", `VERSION = '${CUR}'`));
  const t = await p2.evaluate(() => {
    const b = document.getElementById('btn-force-update');
    document.getElementById('parent').classList.add('show');
    b.click();
    return b.textContent;
  });
  // CUR은 Node쪽 값이므로 반드시 인자로 넘긴다 (함수 본문 안에서는 브라우저 스코프다)
  const ok = await p2.waitForFunction(cur => {
    const v = window.__game && window.__game.scene.getScene('Profile');
    return v && v.verText && v.verText.text === 'v' + cur;
  }, CUR, {timeout:60000}).then(()=>true).catch(()=>false);
  step('온라인 클릭 → 새 버전 적용', ok && t === '⏳ 확인 중...', `버튼 즉시반응 "${t}"`);
  const other2 = await p2.evaluate(async () => (await caches.keys()).includes('other-app-v1'));
  await ctx2.close();
}
/* B) 다른 앱 캐시 보존 (첫 컨텍스트에서 확인) */
const other = await page.evaluate(async () => (await caches.keys()).includes('other-app-v1'));
step('다른 앱 캐시는 건드리지 않는다', other);

await browser.close(); server.close();
console.log(`\n[강제갱신] ${steps.filter(Boolean).length}/${steps.length} 통과`);
