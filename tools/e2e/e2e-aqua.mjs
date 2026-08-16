/* 수족관 + 회전 재매핑 E2E. 사용: node e2e-aqua.mjs [--touch] */
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
  if (TOUCH) await page.tap(sel); else await page.click(sel);
  await sleep(200);
}
const steps = [];
function step(name, ok, extra) {
  steps.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}
function fishShape(cx, cy, r) {
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    pts.push([cx + r * 1.3 * Math.cos(a), cy + r * 0.8 * Math.sin(a)]);
  }
  pts.push([cx + r * 1.3, cy], [cx + r * 1.9, cy - r * 0.5], [cx + r * 1.9, cy + r * 0.5], [cx + r * 1.3, cy]);
  return pts;
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
  await sleep(500);

  /* ---------- 1. 수족관 진입 (간판 index 2) ---------- */
  const aquaSign = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Village').signs[2];
    return [s.x, s.y, s.islData.key];
  });
  step('마을에 수족관 간판', aquaSign[2] === 'Aqua');
  await tapXY(aquaSign[0], aquaSign[1]);
  await sceneActive('Aqua');
  await sleep(500);
  const st0 = await page.evaluate(() => window.__game.scene.getScene('Aqua').state);
  step('첫 방문 → 그리기 모드', st0 === 'draw', `state=${st0}`);
  const btnN = await page.evaluate(() => [document.querySelectorAll('.aq-c').length, document.querySelectorAll('.aq-s').length]);
  step('색 9종 + 굵기 3종', btnN[0] === 9 && btnN[1] === 3, JSON.stringify(btnN));

  /* ---------- 2. 물고기 그리기 → 살아나라 ---------- */
  const vw = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  await dragPath(fishShape(vw[0] / 2, vw[1] * 0.38, Math.min(...vw) * 0.14));
  await domTap('#aq-alive');
  await waitFor(`window.__game.scene.getScene('Aqua').state === 'swim'`, '헤엄 모드');
  await sleep(1200); // 입장 연출
  const after = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Aqua');
    const d = JSON.parse(localStorage.getItem('village-v4-p0'));
    return { fish: s.fishObjs.length, saved: d.aqua.length, strokes: d.aqua[0].s.length };
  });
  step('물고기 탄생 + 저장', after.fish === 1 && after.saved === 1 && after.strokes >= 1, JSON.stringify(after));

  // 헤엄치는지 (위치 변화)
  const x1 = await page.evaluate(() => window.__game.scene.getScene('Aqua').fishObjs[0].x);
  await sleep(1000);
  const x2 = await page.evaluate(() => window.__game.scene.getScene('Aqua').fishObjs[0].x);
  step('물고기가 헤엄침', Math.abs(x2 - x1) > 5, `Δx=${(x2 - x1).toFixed(1)}`);

  /* ---------- 3. 먹이 주기 ---------- */
  const fishPos = await page.evaluate(() => {
    const f = window.__game.scene.getScene('Aqua').fishObjs[0];
    return [f.x, f.y, f.fishSize];
  });
  // 물고기에서 떨어진 빈 물을 탭
  let tapX = fishPos[0] < vw[0] / 2 ? vw[0] * 0.8 : vw[0] * 0.2;
  await tapXY(tapX, vw[1] * 0.3);
  const foodN = await page.evaluate(() => window.__game.scene.getScene('Aqua').foods.length);
  step('물 탭 → 먹이 퐁당', foodN >= 3, `먹이 ${foodN}개`);
  await sleep(4500);
  const foodAfter = await page.evaluate(() => window.__game.scene.getScene('Aqua').foods.length);
  step('먹이 먹기/정리', foodAfter < foodN, `${foodN} → ${foodAfter}`);

  /* ---------- 4. 물고기 쓰다듬기 ---------- */
  const fp = await page.evaluate(() => {
    const f = window.__game.scene.getScene('Aqua').fishObjs[0];
    return [f.x, f.y];
  });
  await tapXY(fp[0], fp[1]);
  await sleep(300);
  step('물고기 탭 (하트·빙글) 무오류', true);

  /* ---------- 5. 두 번째 물고기 ---------- */
  await domTap('#aq-draw');
  await waitFor(`window.__game.scene.getScene('Aqua').state === 'draw'`, '다시 그리기 모드');
  await dragPath(fishShape(vw[0] / 2, vw[1] * 0.42, Math.min(...vw) * 0.1));
  await domTap('#aq-alive');
  await sleep(1200);
  const two = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Aqua');
    return { fish: s.fishObjs.length, saved: JSON.parse(localStorage.getItem('village-v4-p0')).aqua.length };
  });
  step('두 번째 물고기', two.fish === 2 && two.saved === 2, JSON.stringify(two));

  /* ---------- 6. 재접속 후 물고기 유지 ---------- */
  await page.goto(BASE + '/index.html');
  await sceneActive('Profile');
  await sleep(400);
  const card2 = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await tapXY(card2[0], card2[1]);
  await sceneActive('Village');
  await sleep(400);
  const sign2 = await page.evaluate(() => { const s = window.__game.scene.getScene('Village').signs[2]; return [s.x, s.y]; });
  await tapXY(sign2[0], sign2[1]);
  await sceneActive('Aqua');
  await sleep(800);
  const revisit = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Aqua');
    return { state: s.state, fish: s.fishObjs.length };
  });
  step('재방문 → 물고기 2마리 유지 + 헤엄 모드', revisit.state === 'swim' && revisit.fish === 2, JSON.stringify(revisit));

  /* ---------- 7. 회전: 알 섬 트레이스 중 획 재매핑 ---------- */
  await domTap('#btn-home');
  await sceneActive('Village');
  await sleep(400);
  const eggSign = await page.evaluate(() => { const s = window.__game.scene.getScene('Village').signs[1]; return [s.x, s.y]; });
  await tapXY(eggSign[0], eggSign[1]);
  await sceneActive('Egg');
  await sleep(500);
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    for (const c of s.pickCards) c.destroy(); s.pickCards = [];
    s.lvl = 1; s.guided = true; s.startTrace('circle');
  });
  await sleep(300);
  const cpts = await page.evaluate(() => {
    const t = window.__game.scene.getScene('Egg').tracer;
    const out = [];
    for (let i = 0; i < t.n; i++) { const p = t.sp(i); out.push([p.x, p.y]); }
    return out;
  });
  await dragPath(cpts.slice(0, Math.floor(cpts.length * 0.45)));
  // 회전 (뷰포트 교체)
  await page.setViewportSize(TOUCH ? { width: 844, height: 390 } : { width: 700, height: 1000 });
  await sleep(700);
  const rot = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    const t = s.tracer;
    let worst = 0;
    for (const st of s.strokes) {
      for (const q of st) {
        let best = 1e9;
        for (let i = 0; i < t.n; i++) {
          const p = t.sp(i);
          const d = Math.hypot(p.x - q[0], p.y - q[1]);
          if (d < best) best = d;
        }
        if (best > worst) worst = best;
      }
    }
    return { worst: Math.round(worst), R: Math.round(t.R), cov: t.coverage.toFixed(2) };
  });
  step('회전 후 획이 가이드를 따라 이동', rot.worst <= rot.R * 1.6, JSON.stringify(rot));
  // 회전 후에도 이어 그려서 완성 가능
  const cpts2 = await page.evaluate(() => {
    const t = window.__game.scene.getScene('Egg').tracer;
    const out = [];
    for (let i = 0; i < t.n; i++) { const p = t.sp(i); out.push([p.x, p.y]); }
    return out;
  });
  await dragPath(cpts2);
  await waitFor(`window.__game.scene.getScene('Egg').state === 'decorate'`, '회전 후 완성');
  step('회전 후 이어 그려 완성', true);

  const realErrors = errors.filter(e =>
    !/AudioContext|Web Audio|autoplay|speechSynthesis|the user didn't interact/i.test(e));
  step('콘솔/페이지 오류 없음', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));

  await browser.close();
  console.log(`\n${TOUCH ? '[터치]' : '[마우스]'} ${steps.filter(s => s.ok).length}/${steps.length} 통과`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
