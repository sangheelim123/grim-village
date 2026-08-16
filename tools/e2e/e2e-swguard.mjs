/* 리뷰가 재현한 두 치명 결함의 회귀 테스트
   A) 저장 전 그림이 있는데 자동 새로고침이 걸려 창작물이 증발하는가
   B) 새 HTML + 옛 JS 혼합으로 앱이 아예 안 뜨는가 */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';
const fs = require('fs'), path = require('path'), http = require('http');
const SRC = REPO;
const ROOT = TMP + '/guard-root';
const PORT = 8395;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = [];
function step(n, ok, x){ steps.push(ok); console.log(`${ok?'✅':'❌'} ${n}${x?' — '+x:''}`); if(!ok) process.exitCode=1; }

fs.rmSync(ROOT, { recursive:true, force:true });
fs.cpSync(SRC, ROOT, { recursive:true, filter: s => !s.includes('/.git') && !s.includes('/dist') });
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.wav':'audio/wav','.ttf':'font/ttf','.png':'image/png' };
let slowWav = false;
const server = http.createServer((req,res)=>{
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  const send = () => fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'max-age=600'}); res.end(d); });
  if (slowWav && u.endsWith('.wav')) { setTimeout(send, 6000); return; } // 설치 창을 넓힌다
  send();
});
await new Promise(r=>server.listen(PORT,r));
const base = `http://localhost:${PORT}/index.html`;
const browser = await chromium.launch();

/* ---------- A) 저장 전 그림 보호 ---------- */
{
  const page = await (await browser.newContext({ viewport:{width:1024,height:700} })).newPage();
  await page.goto(base);
  await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:25000});
  await page.evaluate(() => navigator.serviceWorker.ready);
  await sleep(1500);
  await page.reload(); // hadController = true 상태 만들기
  await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:25000});
  await sleep(800);
  // 프로필 선택 → 그림 놀이터 → 획 20개 (손은 뗀 상태)
  const card = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x,c.y]; });
  await page.mouse.click(card[0], card[1]);
  await page.waitForFunction("window.__game.scene.isActive('Village')",{timeout:20000});
  await sleep(1200);
  await page.evaluate(() => window.__game.scene.getScene('Village').scene.start('Draw'));
  await page.waitForFunction("window.__game.scene.isActive('Draw') && !!window.__game.scene.getScene('Draw').strokeG",{timeout:20000});
  await sleep(900);
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Draw');
    for (let i=0;i<20;i++) s.strokes.push({ pts:[[100+i,200],[120+i,230]], c:1, w:1, h0:0 });
    s.stroke = null; s.redraw();
    window.__marker = 'alive';
  });
  const before = await page.evaluate(() => ({ strokes: window.__game.scene.getScene('Draw').strokes.length }));
  // controllerchange 강제 발화 (실제 업데이트와 동일 경로)
  await page.evaluate(() => {
    const ev = new Event('controllerchange');
    navigator.serviceWorker.dispatchEvent(ev);
  });
  await sleep(6000);
  const after = await page.evaluate(() => ({
    marker: window.__marker || 'GONE',
    strokes: (window.__game && window.__game.scene.isActive('Draw')) ? window.__game.scene.getScene('Draw').strokes.length : -1,
  }));
  step('저장 전 그림이 있으면 자동 새로고침을 미룬다', after.marker === 'alive' && after.strokes === 20,
       `전 ${before.strokes}획 → 후 ${after.strokes}획, 문서 ${after.marker}`);
  // 그림을 걸고 나면(저장 완료) 새로고침이 진행되어야 한다
  await page.evaluate(() => { const s = window.__game.scene.getScene('Draw'); s.strokes = []; s.redraw(); });
  await sleep(4000);
  const later = await page.evaluate(() => window.__marker || 'GONE');
  step('저장이 끝나면 조용히 새로고침된다', later === 'GONE', `문서 ${later}`);
  await page.context().close();
}

/* ---------- B) 세대 혼합 방지 ---------- */
{
  const page = await (await browser.newContext({ viewport:{width:1024,height:700} })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  // GEN1 표식
  const idx = path.join(ROOT,'index.html'), mainjs = path.join(ROOT,'src/main.js'), swf = path.join(ROOT,'sw.js');
  fs.writeFileSync(idx, fs.readFileSync(idx,'utf8').replace('<div id="pill"></div>','<div id="pill"></div><div id="gen-mark">GEN1</div>'));
  fs.writeFileSync(mainjs, fs.readFileSync(mainjs,'utf8') + "\nwindow.__gen = 'GEN1';\n");
  await page.goto(base);
  await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')",{timeout:25000});
  await page.evaluate(() => navigator.serviceWorker.ready);
  await sleep(1500);
  // GEN2 배포: HTML의 id를 바꾸고(옛 JS가 참조하면 깨지는 상황) main.js·CACHE도 올린다
  fs.writeFileSync(idx, fs.readFileSync(idx,'utf8').replace('<div id="gen-mark">GEN1</div>','<div id="gen-mark">GEN2</div>'));
  fs.writeFileSync(mainjs, fs.readFileSync(mainjs,'utf8').replace("window.__gen = 'GEN1';","window.__gen = 'GEN2';"));
  fs.writeFileSync(swf, fs.readFileSync(swf,'utf8').replace(/village-v4-[0-9]+/, "village-v4-99-GEN2"));
  slowWav = true; // 새 설치가 느리게 끝나도록 → 혼합 창이 있으면 반드시 드러난다
  await page.goto(base);
  await page.waitForFunction("document.getElementById('gen-mark')",{timeout:25000});
  await sleep(1500);
  const mix = await page.evaluate(() => ({
    html: document.getElementById('gen-mark').textContent,
    js: window.__gen || 'none',
    game: !!window.__game,
  }));
  step('세대 혼합 없음 (HTML/JS 같은 세대)', mix.html === mix.js && mix.game, JSON.stringify(mix));
  step('혼합으로 인한 스크립트 오류 없음', errs.length === 0, errs.slice(0,2).join(' | '));
  slowWav = false;
  // 새 SW 설치가 끝나면 자동으로 GEN2로 넘어간다
  const upgraded = await page.waitForFunction("window.__gen === 'GEN2' && document.getElementById('gen-mark').textContent === 'GEN2'",{timeout:60000}).then(()=>true).catch(()=>false);
  step('설치 완료 후 GEN2로 통째 전환', upgraded);
  await page.context().close();
}
await browser.close(); server.close();
console.log(`\n[SW 가드] ${steps.filter(Boolean).length}/${steps.length} 통과`);
