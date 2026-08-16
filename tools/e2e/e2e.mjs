/* 무럭무럭 그림 마을 E2E 하네스
   사용: node e2e.mjs [--touch]
   --touch: hasTouch 모바일 에뮬레이션(390x844) + CDP 터치 드래그 */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';

const TOUCH = process.argv.includes('--touch');
const BASE = ENV_BASE;
let page, cdp;
const errors = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, desc, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await sleep(120);
  }
  throw new Error(`시간 초과: ${desc}`);
}

async function sceneActive(key) {
  return waitFor(`window.__game && window.__game.scene.isActive('${key}')
    && !window.__game.scene.getScene('${key}')._switching`, `${key} 씬 활성`);
}

/* 월드 좌표 탭 (RESIZE 모드 → 월드좌표 == 클라이언트좌표) */
async function tapXY(x, y) {
  if (TOUCH) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.click(x, y);
  }
  await sleep(120);
}

/* 점 배열을 따라 드래그 */
async function dragPath(pts) {
  if (TOUCH) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
    for (let i = 1; i < pts.length; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[i][0], y: pts[i][1] }] });
      if (i % 8 === 0) await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    for (let i = 1; i < pts.length; i++) {
      await page.mouse.move(pts[i][0], pts[i][1]);
      if (i % 8 === 0) await sleep(16);
    }
    await page.mouse.up();
  }
  await sleep(250);
}

async function domTap(sel) {
  await page.waitForSelector(sel, { state: 'visible', timeout: 8000 });
  // DOM 버튼은 터치 모드에서도 tap 지원
  if (TOUCH) await page.tap(sel);
  else await page.click(sel);
  await sleep(200);
}

/* 현재 활성 트레이서의 화면 좌표 샘플 얻기 */
async function tracerPts(sceneKey, tracerProp = 'tracer') {
  return page.evaluate(([k, tp]) => {
    const s = window.__game.scene.getScene(k);
    const tr = s[tp];
    const out = [];
    for (let i = 0; i < tr.n; i++) { const p = tr.sp(i); out.push([p.x, p.y]); }
    return out;
  }, [sceneKey, tracerProp]);
}

const steps = [];
function step(name, ok, extra) {
  steps.push({ name, ok, extra });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

async function gotoVillageFromCelebrate() {
  await page.waitForSelector('#celebrate.show', { timeout, timeout: 10000 });
  await domTap('#cel-home');
  await sceneActive('Village');
  await sleep(400);
}

const timeout = 10000;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(TOUCH
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
    : { viewport: { width: 1024, height: 700 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (TOUCH) cdp = await ctx.newCDPSession(page);

  await page.goto(BASE + '/index.html');
  await sceneActive('Profile');
  await sleep(500);
  step('부팅 → 프로필 화면', true);

  // 프로필 0 (토끼) 선택
  const card = await page.evaluate(() => {
    const c = window.__game.scene.getScene('Profile').cards[0];
    return [c.x, c.y];
  });
  await tapXY(card[0], card[1]);
  await sceneActive('Village');
  await sleep(600);
  step('프로필 선택 → 마을', true);

  /* ---------- 알 섬: 따라 그리기 → 탄생 ---------- */
  const eggSign = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Village').signs[1];
    return [s.x, s.y];
  });
  await tapXY(eggSign[0], eggSign[1]);
  await sceneActive('Egg');
  await sleep(600);

  const st1 = await page.evaluate(() => window.__game.scene.getScene('Egg').state);
  step('알 섬 진입 → 도형 선택 화면', st1 === 'pick', `state=${st1}`);

  // 첫 번째 도형 카드 선택
  const pc = await page.evaluate(() => {
    const c = window.__game.scene.getScene('Egg').pickCards[0];
    return [c.x, c.y, c.shapeKey];
  });
  await tapXY(pc[0], pc[1]);
  await waitFor(`window.__game.scene.getScene('Egg').state === 'trace'`, '트레이스 상태');
  step(`도형 선택(${pc[2]}) → 그리기 상태`, true);

  // 가이드 점을 따라 드래그 (한 번에)
  const pts = await tracerPts('Egg', 'tracer').catch(() => null);
  if (pts) {
    await dragPath(pts);
    const stateNow = await page.evaluate(() => window.__game.scene.getScene('Egg').state);
    if (stateNow === 'trace') await domTap('#egg-done'); // 자동 완료 안 됐으면 버튼
    await waitFor(`window.__game.scene.getScene('Egg').state === 'decorate'`, '꾸미기 상태');
    step('따라 그리기 → 꾸미기 진입', true);
  } else {
    // lvl>=4: 견본 모드 — 자유 드로잉 후 완료 버튼
    const box = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Egg');
      return [s.scale.width, s.scale.height];
    });
    const cx = box[0] / 2, cy = box[1] / 2, r = Math.min(box[0], box[1]) * 0.2;
    const circle = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      circle.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    await dragPath(circle);
    await domTap('#egg-done');
    await waitFor(`window.__game.scene.getScene('Egg').state === 'decorate'`, '꾸미기 상태');
    step('견본 그리기 → 꾸미기 진입', true);
  }

  await domTap('#egg-next');
  await waitFor(`window.__game.scene.getScene('Egg').state === 'soul'`, '마음 상태');
  await domTap('#egg-hatch');
  await page.waitForSelector('#celebrate.show', { timeout });
  const chars1 = await page.evaluate(() => JSON.parse(localStorage.getItem('village-v4-p0')).chars.length);
  step('탄생 → 축하 + 저장', chars1 >= 1, `친구 ${chars1}명`);
  await domTap('#cel-home');
  await sceneActive('Village');
  await sleep(500);

  /* ---------- 그림 놀이터 ---------- */
  const easel = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Village').easelCont;
    return [s.x, s.y];
  });
  await tapXY(easel[0], easel[1]);
  await sceneActive('Draw');
  await sleep(500);

  const vw = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  const dx = vw[0] / 2, dy = vw[1] * 0.4;
  await dragPath([[dx - 80, dy], [dx, dy - 60], [dx + 80, dy], [dx + 40, dy + 60], [dx - 40, dy + 60], [dx - 80, dy]]);
  // 색 바꿔 한 획 더
  const colorBtns = await page.$$('.dw-c');
  if (colorBtns[3]) { if (TOUCH) await colorBtns[3].tap(); else await colorBtns[3].click(); }
  await sleep(150);
  await dragPath([[dx - 50, dy + 90], [dx + 50, dy + 90]]);
  const strokeN = await page.evaluate(() => window.__game.scene.getScene('Draw').strokes.length);
  step('자유 그리기 2획', strokeN === 2, `strokes=${strokeN}`);

  await domTap('#dw-hatch');
  await waitFor(`window.__game.scene.isActive('Egg') && window.__game.scene.getScene('Egg').state === 'decorate'`, '그림→꾸미기');
  await domTap('#egg-next');
  await domTap('#egg-hatch');
  await page.waitForSelector('#celebrate.show', { timeout });
  step('그림 놀이터 → 탄생', true);
  await domTap('#cel-home');
  await sceneActive('Village');
  await sleep(500);

  /* ---------- 길 섬 ---------- */
  const roadSign = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Village').signs[0];
    return [s.x, s.y];
  });
  await tapXY(roadSign[0], roadSign[1]);
  await sceneActive('Road');
  await sleep(600);
  const rpts = await tracerPts('Road');
  await dragPath(rpts);
  await waitFor(`window.__game.scene.getScene('Road').state === 'done'`, '길 완주');
  await page.waitForSelector('#celebrate.show', { timeout });
  step('길 섬 완주 → 축하', true);
  await domTap('#cel-home');
  await sceneActive('Village');

  /* ---------- 도감 ---------- */
  await domTap('#btn-book');
  const bookN = await page.evaluate(() => document.querySelectorAll('.book-card').length);
  step('도감에 친구 표시', bookN >= 2, `카드 ${bookN}개`);
  await domTap('#book-close');

  const realErrors = errors.filter(e =>
    !/AudioContext|Web Audio|autoplay|speechSynthesis|the user didn't interact/i.test(e));
  step('콘솔/페이지 오류 없음', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));

  await browser.close();
  console.log(`\n${TOUCH ? '[터치]' : '[마우스]'} ${steps.filter(s => s.ok).length}/${steps.length} 통과`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
