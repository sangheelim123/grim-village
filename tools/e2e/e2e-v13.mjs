/* v1.3.0 E2E: 해·달 낮밤 사이클 + 냠냠 덧셈·뺄셈. 사용: node e2e-v13.mjs [--touch] */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';

const TOUCH = process.argv.includes('--touch');
const BASE = ENV_BASE;
let page, cdp;
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(expr, desc, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await page.evaluate(expr);
    if (v) return v;
    await sleep(120);
  }
  throw new Error(`시간 초과: ${desc}`);
}
async function sceneActive(key) {
  return waitFor(`window.__game && window.__game.scene.isActive('${key}')
    && !window.__game.scene.getScene('${key}')._switching`, `${key} 씬 활성`);
}
async function tapXY(x, y) {
  if (TOUCH) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.mouse.click(x, y);
  await sleep(150);
}
async function domTap(sel) {
  await page.waitForSelector(sel, { state: 'visible', timeout: 8000 });
  if (TOUCH) await page.tap(sel); else await page.click(sel);
  await sleep(200);
}
const steps = [];
function step(name, ok, extra) {
  steps.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

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
  await sleep(400);
  const card = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await tapXY(card[0], card[1]);
  await sceneActive('Village');
  await sleep(600);

  /* ---------- 1. 낮: 해가 호를 따라 이동 ---------- */
  const setPhase = async sec => {
    await page.evaluate(s => {
      const v = window.__game.scene.getScene('Village');
      v.cycleOffset = s - (v.time.now / 1000) % 240;
    }, sec);
    await sleep(400);
  };
  await setPhase(20); // 아침
  const morning = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    return { sx: v.sun.x / v.scale.width, sy: v.sun.y / v.scale.height, sa: v.sun.alpha, ma: v.moon.alpha, nf: v.nightSky.alpha };
  });
  await setPhase(56); // 한낮 (정점)
  const noon = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    return { sx: v.sun.x / v.scale.width, sy: v.sun.y / v.scale.height };
  });
  step('아침: 해가 왼쪽 낮게', morning.sx < 0.35 && morning.sa === 1 && morning.nf < 0.05,
    `x=${morning.sx.toFixed(2)} y=${morning.sy.toFixed(2)}`);
  step('한낮: 해가 중앙 꼭대기', Math.abs(noon.sx - 0.5) < 0.08 && noon.sy < 0.2,
    `x=${noon.sx.toFixed(2)} y=${noon.sy.toFixed(2)}`);

  /* ---------- 2. 석양 ---------- */
  await setPhase(107);
  const dusk = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    return { sx: v.sun.x / v.scale.width, sy: v.sun.y / v.scale.height, glow: v._lastGlow };
  });
  step('석양: 해가 우측 하단 + 노을', dusk.sx > 0.8 && dusk.sy > 0.5 && dusk.glow > 0.5,
    `x=${dusk.sx.toFixed(2)} y=${dusk.sy.toFixed(2)} glow=${dusk.glow.toFixed(2)}`);

  /* ---------- 3. 밤: 달 + 별 ---------- */
  await setPhase(170);
  const night = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    const starA = Math.max(...v.stars.map(s => s.alpha));
    return { sa: v.sun.alpha, ma: v.moon.alpha, mx: v.moon.x / v.scale.width, nf: v.nightSky.alpha, starA };
  });
  step('밤: 해 지고 달·별 반짝', night.sa === 0 && night.ma === 1 && night.nf > 0.95 && night.starA > 0.3,
    JSON.stringify({ mx: night.mx.toFixed(2), starA: night.starA.toFixed(2) }));

  // 해 탭 반응 (낮으로 되돌리고)
  await setPhase(56);
  const sunPos = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    return [v.sun.x, v.sun.y];
  });
  await tapXY(sunPos[0], sunPos[1]);
  step('해님 탭 무오류', true);

  /* ---------- 4. 냠냠 덧셈 (2 + 3) ---------- */
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.scene.start('Feed', { forceMode: 'add', a: 2, b: 3 });
  });
  await sceneActive('Feed');
  await sleep(700);
  const addInfo = await page.evaluate(() => {
    const f = window.__game.scene.getScene('Feed');
    return { mode: f.mode, req: f.request[0].count, parts: f.addParts, dots: f.showDots };
  });
  step('덧셈 모드: 2+3 요청', addInfo.mode === 'add' && addInfo.req === 5 && addInfo.dots,
    JSON.stringify(addInfo));
  // 요청 과일 5개를 나무에서 접시로
  for (let k = 0; k < 5; k++) {
    const pos = await page.evaluate(() => {
      const f = window.__game.scene.getScene('Feed');
      const img = f.treeFruits.find(t => !t.plated && !t.inFlight && t.fruitKey === f.request[0].fruit.key);
      return img ? [img.x, img.y] : null;
    });
    if (!pos) break;
    await tapXY(pos[0], pos[1]);
    await sleep(420);
  }
  await domTap('#feed-done');
  await page.waitForSelector('#celebrate.show', { timeout: 12000 });
  const addMsg = await page.evaluate(() => document.getElementById('cel-msg').textContent);
  step('덧셈 완료: 2 + 3 = 5 표시', addMsg.includes('2 + 3 = 5'), addMsg);
  await domTap('#cel-home');
  await sceneActive('Village');
  await sleep(400);

  /* ---------- 5. 냠냠 뺄셈 (5 − 2) ---------- */
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.scene.start('Feed', { forceMode: 'sub', n: 5, k: 2 });
  });
  await sceneActive('Feed');
  await sleep(700);
  const subInfo = await page.evaluate(() => {
    const f = window.__game.scene.getScene('Feed');
    return { mode: f.mode, plate: f.plate.length, req: f.request[0].count, taker: !!f.takerObj, tree: f.treeFruits.length };
  });
  step('뺄셈 모드: 접시 5개 미리 + 나눔 친구', subInfo.mode === 'sub' && subInfo.plate === 5 && subInfo.req === 3 && subInfo.taker,
    JSON.stringify(subInfo));
  // 접시 과일 2개를 탭 → 친구에게
  for (let k = 0; k < 2; k++) {
    const pos = await page.evaluate(() => {
      const f = window.__game.scene.getScene('Feed');
      const img = f.plate[f.plate.length - 1];
      return [img.x, img.y];
    });
    await tapXY(pos[0], pos[1]);
    await sleep(500);
  }
  const taken = await page.evaluate(() => {
    const f = window.__game.scene.getScene('Feed');
    return { taken: f.takerTaken, plate: f.plate.length };
  });
  step('2개 나눠 줌 → 접시 3개', taken.taken === 2 && taken.plate === 3, JSON.stringify(taken));
  // 초과 탭 → 상냥한 거절 (개수 유지)
  const pos3 = await page.evaluate(() => {
    const f = window.__game.scene.getScene('Feed');
    const img = f.plate[f.plate.length - 1];
    return [img.x, img.y];
  });
  await tapXY(pos3[0], pos3[1]);
  await sleep(400);
  const refuse = await page.evaluate(() => {
    const f = window.__game.scene.getScene('Feed');
    return { taken: f.takerTaken, plate: f.plate.length };
  });
  step('더 주려 하면 사양 (그대로 3개)', refuse.taken === 2 && refuse.plate === 3, JSON.stringify(refuse));
  await domTap('#feed-done');
  await page.waitForSelector('#celebrate.show', { timeout: 12000 });
  const subMsg = await page.evaluate(() => document.getElementById('cel-msg').textContent);
  step('뺄셈 완료: 5 − 2 = 3 표시', subMsg.includes('5 − 2 = 3'), subMsg);
  await domTap('#cel-home');
  await sceneActive('Village');

  /* ---------- 6. 저레벨 세기 회귀 (기존 흐름) ---------- */
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.scene.start('Feed', { forceMode: 'count' });
  });
  await sceneActive('Feed');
  await sleep(700);
  const cInfo = await page.evaluate(() => {
    const f = window.__game.scene.getScene('Feed');
    return { mode: f.mode, count: f.request[0].count, key: f.request[0].fruit.key };
  });
  // 과일이 무작위 배치라 좌표 탭이 겹친 이웃을 집을 수 있다 — 정확한 과일을 직접 집는다
  for (let k = 0; k < cInfo.count; k++) {
    await page.evaluate(() => {
      const f = window.__game.scene.getScene('Feed');
      const img = f.treeFruits.find(t => !t.plated && !t.inFlight && t.fruitKey === f.request[0].fruit.key);
      if (img) f.pickFruit(img);
    });
    await sleep(450);
  }
  await domTap('#feed-done');
  await page.waitForSelector('#celebrate.show', { timeout: 12000 });
  step(`세기 모드 회귀 (${cInfo.count}개)`, true);
  await domTap('#cel-home');

  const realErrors = errors.filter(e =>
    !/AudioContext|Web Audio|autoplay|speechSynthesis|the user didn't interact/i.test(e));
  step('콘솔/페이지 오류 없음', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));

  await browser.close();
  console.log(`\n${TOUCH ? '[터치]' : '[마우스]'} ${steps.filter(s => s.ok).length}/${steps.length} 통과`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
