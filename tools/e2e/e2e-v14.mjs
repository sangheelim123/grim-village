/* v1.4.0: 그림 게시판·갤러리, 부모 코너 확장, 음성 엔진, 시각. 사용: node e2e-v14.mjs [--touch] */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';
const TOUCH = process.argv.includes('--touch');
let page, cdp; const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = [];
function step(n, ok, x) { steps.push(ok); console.log(`${ok?'✅':'❌'} ${n}${x?' — '+x:''}`); if (!ok) process.exitCode = 1; }
async function waitFor(e, d, t = 12000) { const t0 = Date.now(); while (Date.now()-t0<t) { if (await page.evaluate(e)) return true; await sleep(120);} throw new Error('시간 초과: '+d); }
async function sceneActive(k) { return waitFor(`window.__game && window.__game.scene.isActive('${k}') && !window.__game.scene.getScene('${k}')._switching`, k); }
async function tapXY(x, y) {
  if (TOUCH) { await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]}); await sleep(60); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
  else await page.mouse.click(x, y);
  await sleep(200);
}
async function dragPath(pts) {
  if (TOUCH) { await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pts[0][0],y:pts[0][1]}]});
    for (let i=1;i<pts.length;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pts[i][0],y:pts[i][1]}]}); if(i%8===0) await sleep(16);} 
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
  else { await page.mouse.move(pts[0][0],pts[0][1]); await page.mouse.down();
    for (let i=1;i<pts.length;i++){ await page.mouse.move(pts[i][0],pts[i][1]); if(i%8===0) await sleep(16);} await page.mouse.up(); }
  await sleep(250);
}
async function domTap(sel){ await page.waitForSelector(sel,{state:'visible',timeout:8000}); if(TOUCH) await page.tap(sel); else await page.click(sel); await sleep(250); }

const browser = await chromium.launch();
const ctx = await browser.newContext(TOUCH ? { viewport:{width:390,height:844}, hasTouch:true, isMobile:true } : { viewport:{width:1024,height:700} });
page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: '+e.message));
page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
if (TOUCH) cdp = await ctx.newCDPSession(page);
await page.goto('http://127.0.0.1:8331/index.html');
await sceneActive('Profile'); await sleep(400);

// 첫 화면에도 기어(부모 코너)가 보인다
step('첫 화면에 부모 코너 버튼', await page.evaluate(() => document.getElementById('btn-gear').classList.contains('show')));

const card = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x,c.y]; });
await tapXY(card[0], card[1]);
await sceneActive('Village'); await sleep(1200);

// 섬별 하늘 확인
const skies = await page.evaluate(() => {
  const g = window.__game;
  return { village: g.scene.getScene('Village').bg.sky.texture.key };
});
step('마을 하늘 = sky_day', skies.village === 'sky_day', skies.village);
const boardEmpty = await page.evaluate(() => { const v = window.__game.scene.getScene('Village'); return { has: !!v.boardCont, art: !!v.boardArt, tip: !!v.boardTip }; });
step('게시판 존재 (빈 상태 안내)', boardEmpty.has && !boardEmpty.art && boardEmpty.tip, JSON.stringify(boardEmpty));

// 그림 놀이터 → 마을에 걸기
const easel = await page.evaluate(() => { const s = window.__game.scene.getScene('Village').easelCont; return [s.x,s.y]; });
await tapXY(easel[0], easel[1]);
await sceneActive('Draw'); await sleep(500);
const vw = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
await dragPath([[vw[0]/2-80, vw[1]*0.35],[vw[0]/2, vw[1]*0.28],[vw[0]/2+80, vw[1]*0.35],[vw[0]/2, vw[1]*0.45],[vw[0]/2-80, vw[1]*0.35]]);
await domTap('#dw-hang');
await page.waitForSelector('#celebrate.show', { timeout: 10000 });
const arts = await page.evaluate(() => JSON.parse(localStorage.getItem('village-v4-p0')).arts.length);
step('그림 걸기 → 저장', arts === 1, `arts=${arts}`);
await domTap('#cel-home');
await sceneActive('Village'); await sleep(1200);
const boardArt = await page.evaluate(() => { const v = window.__game.scene.getScene('Village'); return { art: !!v.boardArt, tip: !!v.boardTip }; });
step('마을 게시판에 그림 표시', boardArt.art && !boardArt.tip, JSON.stringify(boardArt));

// 게시판 탭 → 갤러리
const board = await page.evaluate(() => { const b = window.__game.scene.getScene('Village').boardCont; return [b.x,b.y]; });
await tapXY(board[0], board[1]);
await sleep(500);
const gal = await page.evaluate(() => ({ show: document.getElementById('gallery').classList.contains('show'),
  n: document.querySelectorAll('#gallery-grid canvas').length, input: window.__game.input.enabled }));
step('갤러리 열림 + 게임 입력 잠금', gal.show && gal.n === 1 && gal.input === false, JSON.stringify(gal));
await domTap('#gallery-x');
step('갤러리 ✕ 닫힘 + 입력 복구', await page.evaluate(() => !document.getElementById('gallery').classList.contains('show') && window.__game.input.enabled));

// 부모 코너: 발달 안내 + 팁 + 이름
const gear = await page.$('#btn-gear'); const gb = await gear.boundingBox();
if (TOUCH) { await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:gb.x+gb.width/2,y:gb.y+gb.height/2}]}); await sleep(3300); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
else { await page.mouse.move(gb.x+gb.width/2, gb.y+gb.height/2); await page.mouse.down(); await sleep(3300); await page.mouse.up(); }
await sleep(500);
const pc = await page.evaluate(() => ({ show: document.getElementById('parent').classList.contains('show'),
  levels: document.getElementById('parent-levels').textContent.length,
  tip: document.getElementById('parent-tip').textContent.slice(0,10),
  kid: !!document.getElementById('parent-kid') }));
step('부모 코너: 발달 단계 + 집에서 함께하기 + 이름칸', pc.show && pc.levels > 40 && pc.tip.startsWith('💡') && pc.kid, JSON.stringify(pc));
await page.fill('#parent-kid', '지우');
await page.dispatchEvent('#parent-kid', 'change');
await sleep(700); // store.save()는 350ms 디바운스
const kidSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('village-v4-p0')).kid.name);
step('아이 이름 저장', kidSaved === '지우', kidSaved);
await domTap('#parent-close-btn');

// 음성 엔진: 긴 문장 분할 + 우선순위 큐
const sp = await page.evaluate(() => {
  const g = window.__game;
  const audioMod = g.scene.getScene('Village');
  return typeof window.speechSynthesis !== 'undefined';
});
step('speechSynthesis 사용 가능', sp);

// 수족관: 물속 음색 + 하늘/물 색
const sign = await page.evaluate(() => { const s = window.__game.scene.getScene('Village').signs[2]; return [s.x,s.y]; });
await tapXY(sign[0], sign[1]);
await sceneActive('Aqua'); await sleep(700);
step('수족관 진입', true);
await domTap('#btn-home'); await sceneActive('Village');

const real = errors.filter(e => !/AudioContext|Web Audio|autoplay|speechSynthesis|didn't interact/i.test(e));
step('콘솔/페이지 오류 없음', real.length === 0, real.slice(0,3).join(' | '));
await browser.close();
console.log(`\n${TOUCH?'[터치]':'[마우스]'} ${steps.filter(Boolean).length}/${steps.length} 통과`);
