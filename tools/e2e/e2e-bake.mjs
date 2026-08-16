/* 굽기(RenderTexture) 도입이 건드린 위험 경로 회귀 테스트.
   기존 스위트가 훑지 않는 흐름만 골랐다. 사용: node e2e-bake.mjs [--touch] */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';

const TOUCH = process.argv.includes('--touch');
const BASE = ENV_BASE;
let page, cdp;
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = [];
function step(name, ok, extra) {
  steps.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}
async function waitFor(fn, desc, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await page.evaluate(fn)) return true; await sleep(120); }
  throw new Error('시간 초과: ' + desc);
}
const active = k => waitFor(key => window.__game && window.__game.scene.isActive(key)
  && !window.__game.scene.getScene(key)._switching, k + ' 활성').catch(() => false)
  || page.waitForFunction(k2 => window.__game.scene.isActive(k2), k, { timeout: 15000 });
async function sceneActive(key) {
  await page.waitForFunction(k => window.__game && window.__game.scene.isActive(k)
    && !window.__game.scene.getScene(k)._switching, key, { timeout: 20000 });
}
let lastPath = [];
async function drag(pts) {
  lastPath = pts;
  if (TOUCH) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
    for (const p of pts.slice(1)) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p[0], y: p[1] }] });
      await sleep(9);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down();
    for (const p of pts.slice(1)) { await page.mouse.move(p[0], p[1]); await sleep(9); }
    await page.mouse.up();
  }
  await sleep(220);
}
const goScene = async key => {
  // 축하·도감 오버레이가 떠 있으면 캔버스 드래그가 전부 막힌다 (하네스 함정)
  await page.evaluate(() => {
    document.querySelectorAll('#celebrate.show, #book.show, #gallery.show, #parent.show')
      .forEach(e => e.classList.remove('show'));
  });
  await page.evaluate(k => {
    const g = window.__game;
    const cur = ['Village', 'Draw', 'Aqua', 'Egg', 'Feed', 'Sort', 'Road']
      .map(x => g.scene.getScene(x)).find(s => s && g.scene.isActive(s.scene.key));
    cur.scene.start(k);
  }, key);
  await sceneActive(key);
  await sleep(1400);
};
/* 구운 판(RenderTexture)에서 좌표를 직접 표본한다 — 눈 대신 픽셀로 확인 */
const inkAt = async (sceneKey, pts) => page.evaluate(([k, ps]) => new Promise(res => {
  const s = window.__game.scene.getScene(k);
  const rt = s.art;
  if (!rt || !ps.length) return res(-1);
  const tex = rt.texture || rt;
  let hit = 0, done = 0;
  for (const p of ps) {
    tex.snapshotPixel(Math.round(p[0]), Math.round(p[1]), col => {
      if (col && col.alpha > 40) hit++;
      if (++done === ps.length) res(hit);
    });
  }
}), [sceneKey, pts]);

function seed() {
  const ring = (k, r) => Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2;
    return [Math.round(50 + Math.cos(a) * r), Math.round(50 + Math.sin(a) * r)];
  });
  return {
    v: 1, chars: [{ s: [ring(24, 34)], c: 0, e: 0, pt: 0, p: 0, g: 0, f: 0, n: '모리', sc: 'egg', b: 1 }],
    trails: [], aqua: [], arts: [], kid: { name: '', call: 1 }, flowers: 6,
    stars: { road: 6, egg: 6, feed: 6, sort: 6 }, lvl: { road: 1, egg: 1, feed: 1, sort: 1 },
    hist: { road: [], egg: [], feed: [], sort: [] }, decor: ['garden'],
    stats: { d: '2000-1-1', sec: 0, plays: 0 }, intro: true,
  };
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(TOUCH
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
    : { viewport: { width: 1024, height: 700 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {} }, seed());
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (TOUCH) cdp = await ctx.newCDPSession(page);

  await page.goto(BASE + '/index.html');
  await sceneActive('Profile');
  await sleep(500);
  const card = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  if (TOUCH) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: card[0], y: card[1] }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.mouse.click(card[0], card[1]);
  await sceneActive('Village');
  await sleep(1500);

  const vp = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  const wave = (y, n) => Array.from({ length: n }, (_, i) => [vp[0] * 0.2 + i * (vp[0] * 0.5 / n), y + Math.sin(i / 3) * 28]);

  /* ---------- 1. 그림 놀이터: 그리기 → 되돌리기 → 비우기 ---------- */
  await goScene('Draw');
  for (let k = 0; k < 4; k++) {
    await page.evaluate(i => { const d = window.__game.scene.getScene('Draw'); d.color = i + 1; d.size = 1; }, k);
    await drag(wave(vp[1] * 0.22 + k * 46, 16));
  }
  const lastWave = lastPath.slice();
  const ink4 = await inkAt('Draw', lastWave);
  const n4 = await page.evaluate(() => window.__game.scene.getScene('Draw').strokes.length);
  step('그림: 4획이 판에 구워진다', n4 === 4 && ink4 >= lastWave.length - 2,
    `획 ${n4}, 표본 ${ink4}/${lastWave.length}점에 잉크`);

  await page.evaluate(() => document.getElementById('dw-undo').click());
  await sleep(600);
  const ink3 = await inkAt('Draw', lastWave);
  const n3 = await page.evaluate(() => window.__game.scene.getScene('Draw').strokes.length);
  step('그림: 되돌리기 → 마지막 획이 판에서도 지워진다', n3 === 3 && ink3 <= 2,
    `획 ${n3}, 그 자리 잉크 ${ink4} → ${ink3}`);

  await page.evaluate(() => document.getElementById('dw-clear').click());
  await sleep(700);
  const firstWave = Array.from({ length: 16 }, (_, i) => [vp[0] * 0.2 + i * (vp[0] * 0.5 / 16), vp[1] * 0.22 + Math.sin(i / 3) * 28]);
  const ink0 = await inkAt('Draw', firstWave);
  step('그림: 비우기 → 판이 완전히 비워진다', ink0 === 0, `남은 잉크 표본 ${ink0}`);

  /* ---------- 2. 그리는 도중 회전 ---------- */
  await drag(wave(vp[1] * 0.3, 16));
  const rotWave = lastPath.slice();
  const before = await inkAt('Draw', rotWave);
  await page.setViewportSize(TOUCH ? { width: 844, height: 390 } : { width: 700, height: 1000 });
  await sleep(1200);
  const mapped = await page.evaluate(() => window.__game.scene.getScene('Draw').strokes[0].pts.filter((_, i) => i % 3 === 0));
  const after = await inkAt('Draw', mapped);
  const rotOK = await page.evaluate(() => {
    const d = window.__game.scene.getScene('Draw');
    return { n: d.strokes.length, aw: d.art.width, ah: d.art.height, vw: Math.ceil(d.scale.width), vh: Math.ceil(d.scale.height) };
  });
  step('그림: 회전해도 그림이 남고 판 크기가 맞는다',
    rotOK.n === 1 && after >= mapped.length - 2 && rotOK.aw === rotOK.vw && rotOK.ah === rotOK.vh,
    `회전 전 ${before}/${rotWave.length} → 후 ${after}/${mapped.length}, 판 ${rotOK.aw}×${rotOK.ah} / 화면 ${rotOK.vw}×${rotOK.vh}`);
  await page.setViewportSize(TOUCH ? { width: 390, height: 844 } : { width: 1024, height: 700 });
  await sleep(900);

  /* ---------- 3. 마을에 걸기 → 또 하기 → 판이 비워지고 다시 그려진다 ---------- */
  await drag(wave(vp[1] * 0.36, 14));
  const hangWave = lastPath.slice();
  await page.evaluate(() => document.getElementById('dw-hang').click());
  await sleep(1500);
  const hung = await page.evaluate(() => ({
    arts: (JSON.parse(localStorage.getItem('village-v4-p0')).arts || []).length,
    cel: document.getElementById('celebrate').classList.contains('show'),
  }));
  step('그림: 마을에 걸기 → 저장 + 축하', hung.arts >= 1 && hung.cel, JSON.stringify(hung));

  await page.evaluate(() => document.getElementById('cel-again').click());
  await sleep(900);
  const againInk = await inkAt('Draw', hangWave);
  const againN = await page.evaluate(() => window.__game.scene.getScene('Draw').strokes.length);
  step('그림: 또 하기 → 판이 깨끗이 비워진다', againN === 0 && againInk === 0,
    `획 ${againN}, 남은 잉크 ${againInk}/${hangWave.length}`);

  await drag(wave(vp[1] * 0.5, 14));
  const inkAgain = await inkAt('Draw', lastPath);
  step('그림: 또 하기 뒤에도 계속 그려진다', inkAgain >= lastPath.length - 2,
    `표본 ${inkAgain}/${lastPath.length}`);

  /* ---------- 4. 씬을 나갔다 다시 와도 그림판이 살아 있다 ---------- */
  await goScene('Village');
  await goScene('Draw');
  await drag(wave(vp[1] * 0.28, 16));
  const reInk = await inkAt('Draw', lastPath);
  const reState = await page.evaluate(() => {
    const d = window.__game.scene.getScene('Draw');
    return { n: d.strokes.length, hasArt: !!d.art, destroyed: d.art ? !d.art.scene : true };
  });
  step('그림: 씬 재방문 후에도 그림판이 정상', reState.n === 1 && !reState.destroyed && reInk >= lastPath.length - 2,
    `획 ${reState.n}, 표본 ${reInk}/${lastPath.length}`);

  /* ---------- 5. 수족관: 그리기 → 살아나라 → 새 물고기 ---------- */
  await goScene('Aqua');
  await page.evaluate(() => { const a = window.__game.scene.getScene('Aqua'); if (a.state !== 'draw') a.enterDraw(); });
  await sleep(700);
  for (let k = 0; k < 3; k++) {
    await page.evaluate(i => { const a = window.__game.scene.getScene('Aqua'); a.color = i + 1; a.size = 1; }, k);
    await drag(wave(vp[1] * 0.3 + k * 40, 14));
  }
  const aqInk = await inkAt('Aqua', lastPath);
  step('수족관: 물고기 획이 판에 구워진다', aqInk >= lastPath.length - 2, `표본 ${aqInk}/${lastPath.length}`);
  await page.evaluate(() => { const b = document.getElementById('aq-alive'); if (b) b.click(); });
  await sleep(2600);
  const swimState = await page.evaluate(() => {
    const a = window.__game.scene.getScene('Aqua');
    return { state: a.state, fish: a.fishObjs.length, strokes: a.strokes.length };
  });
  step('수족관: 살아나라 → 헤엄 상태 + 물고기 생김',
    swimState.state === 'swim' && swimState.fish >= 1, JSON.stringify(swimState));
  await page.evaluate(() => { const b = document.getElementById('aq-draw'); if (b) b.click(); });
  await sleep(1200);
  const redrawState = await page.evaluate(() => {
    const a = window.__game.scene.getScene('Aqua');
    return { state: a.state, strokes: a.strokes.length };
  });
  step('수족관: 새 물고기 그리기 → 종이가 비어 있다',
    redrawState.state === 'draw' && redrawState.strokes === 0, JSON.stringify(redrawState));
  await drag(wave(vp[1] * 0.32, 14));
  const aq2 = await page.evaluate(() => window.__game.scene.getScene('Aqua').strokes.length);
  step('수족관: 새 물고기도 그려진다', aq2 === 1, `획 ${aq2}`);

  /* ---------- 6. 알 섬: 따라 그리기 → 되돌리기 → 판정 유지 ---------- */
  await goScene('Egg');
  await page.evaluate(() => window.__game.scene.getScene('Egg').startTrace('circle'));
  await sleep(1300);
  const gpts = await page.evaluate(() => {
    const e = window.__game.scene.getScene('Egg'), tr = e.tracer;
    if (!tr) return [];
    const out = []; for (let i = 0; i < tr.n; i++) { const q = tr.sp(i); out.push([q.x, q.y]); }
    return out;
  });
  await drag(gpts.slice(0, Math.floor(gpts.length * 0.45)).filter((_, i) => i % 2 === 0));
  const cov1 = await page.evaluate(() => {
    const e = window.__game.scene.getScene('Egg');
    return { cov: e.tracer ? +e.tracer.coverage.toFixed(2) : -1, n: e.strokes.length };
  });
  const eggPath = lastPath.slice();
  const eggInk1 = await inkAt('Egg', eggPath);
  step('알: 따라 그린 선이 판에 구워지고 커버리지가 오른다',
    cov1.n === 1 && cov1.cov > 0.2 && eggInk1 >= eggPath.length - 2,
    `커버리지 ${cov1.cov}, 표본 ${eggInk1}/${eggPath.length}`);
  await page.evaluate(() => { const b = document.getElementById('egg-undo'); if (b) b.click(); });
  await sleep(700);
  const cov2 = await page.evaluate(() => {
    const e = window.__game.scene.getScene('Egg');
    return { cov: e.tracer ? +e.tracer.coverage.toFixed(2) : -1, n: e.strokes.length };
  });
  const eggInk2 = await inkAt('Egg', eggPath);
  step('알: 되돌리기 → 선도 판정도 함께 되돌아간다',
    cov2.n === 0 && cov2.cov < 0.05 && eggInk2 === 0,
    `커버리지 ${cov1.cov} → ${cov2.cov}, 표본 잉크 ${eggInk1} → ${eggInk2}`);

  const real = errors.filter(e => !/AudioContext|Web Audio|autoplay|speechSynthesis|the user didn't interact/i.test(e));
  step('콘솔/페이지 오류 없음', real.length === 0, real.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${TOUCH ? '[터치]' : '[마우스]'} ${steps.filter(s => s.ok).length}/${steps.length} 통과`);
}
main().catch(e => { console.error('💥', e); process.exit(1); });
