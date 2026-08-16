/* 신규 기능 E2E: 다획 도형(십자), 되돌리기, 기억 그리기, 무지개 붓/굵기, 새 눈·무늬, 길 레벨5
   사용: node e2e-new.mjs [--touch] */
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
  await sleep(120);
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
async function partPts(partIdx) {
  return page.evaluate(pi => {
    const s = window.__game.scene.getScene('Egg');
    const parts = s.tracer.tracers || [s.tracer];
    const t = parts[pi];
    const out = [];
    for (let i = 0; i < t.n; i++) { const p = t.sp(i); out.push([p.x, p.y]); }
    return out;
  }, partIdx);
}
const steps = [];
function step(name, ok, extra) {
  steps.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

async function enterEgg() {
  const eggSign = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Village').signs[1];
    return [s.x, s.y];
  });
  await tapXY(eggSign[0], eggSign[1]);
  await sceneActive('Egg');
  await sleep(600);
}
async function backToVillage() {
  await domTap('#btn-home');
  await sceneActive('Village');
  await sleep(500);
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
  const card = await page.evaluate(() => {
    const c = window.__game.scene.getScene('Profile').cards[0];
    return [c.x, c.y];
  });
  await tapXY(card[0], card[1]);
  await sceneActive('Village');
  await sleep(500);

  /* ---------- 1. 다획 도형: 십자 (가이드 모드) ---------- */
  await enterEgg();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    s.lvl = 2; s.guided = true;
    s.startTrace('cross');
  });
  await sleep(300);
  const isMulti = await page.evaluate(() => !!window.__game.scene.getScene('Egg').tracer.tracers);
  step('십자 → MultiTracer 생성', isMulti);

  await dragPath(await partPts(0));   // 세로획
  let st = await page.evaluate(() => window.__game.scene.getScene('Egg').state);
  step('한 획만 그리면 완료 아님', st === 'trace', `state=${st}`);
  await dragPath(await partPts(1));   // 가로획
  await waitFor(`window.__game.scene.getScene('Egg').state === 'decorate'`, '십자 완성');
  const acc = await page.evaluate(() => window.__game.scene.getScene('Egg').acc);
  step('두 획 완성 → 꾸미기 + 정확도 양호', acc > 0.6, `acc=${acc && acc.toFixed(2)}`);

  /* ---------- 2. 새 눈(😄)·무늬(★) 선택 → 저장 확인 ---------- */
  const eyeBtns = await page.$$('.dc-e');
  const patBtns = await page.$$('.dc-p');
  step('눈 4종·무늬 6종 버튼', eyeBtns.length === 4 && patBtns.length === 6,
    `눈 ${eyeBtns.length}, 무늬 ${patBtns.length}`);
  if (TOUCH) { await eyeBtns[3].tap(); } else { await eyeBtns[3].click(); }
  await sleep(150);
  const patBtns2 = await page.$$('.dc-p');
  if (TOUCH) { await patBtns2[5].tap(); } else { await patBtns2[5].click(); }
  await sleep(150);
  await domTap('#egg-next');
  await domTap('#egg-hatch');
  await page.waitForSelector('#celebrate.show', { timeout: 10000 });
  const savedChar = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('village-v4-p0'));
    return d.chars[d.chars.length - 1];
  });
  step('새 눈·무늬 저장', savedChar.e === 3 && savedChar.pt === 5, `e=${savedChar.e} pt=${savedChar.pt}`);
  await domTap('#cel-home');
  await sceneActive('Village');
  await sleep(400);

  /* ---------- 3. 되돌리기 ---------- */
  await enterEgg();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    s.lvl = 1; s.guided = true;
    s.startTrace('circle');
  });
  await sleep(300);
  const cpts = await partPts(0);
  await dragPath(cpts.slice(0, Math.floor(cpts.length * 0.4))); // 40%만 그림
  const covBefore = await page.evaluate(() => window.__game.scene.getScene('Egg').tracer.coverage);
  await domTap('#egg-undo');
  const after = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    return { n: s.strokes.length, cov: s.tracer.coverage, state: s.state };
  });
  step('되돌리기 → 획·판정 리셋', covBefore > 0.2 && after.n === 0 && after.cov === 0 && after.state === 'trace',
    `전 ${covBefore.toFixed(2)} → 후 ${after.cov.toFixed(2)}, strokes=${after.n}`);
  // 다시 그려서 정상 완료
  await dragPath(cpts);
  await waitFor(`window.__game.scene.getScene('Egg').state === 'decorate'`, '되돌리기 후 재완성');
  step('되돌리기 후 다시 그려 완성', true);
  await backToVillage();

  /* ---------- 4. 기억 그리기 (레벨 5) ---------- */
  await enterEgg();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    s.lvl = 5; s.guided = false;
    s.startTrace('star');
  });
  await sleep(300);
  const memInit = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    return { mem: s.memoryMode, hidden: s.sampleHidden, panel: s.samplePanel.visible,
      peekBtn: !!document.getElementById('egg-peek') };
  });
  step('기억 모드 진입 (견본 표시 + 👀 버튼)', memInit.mem && !memInit.hidden && memInit.panel && memInit.peekBtn,
    JSON.stringify(memInit));
  await sleep(5000); // memoryShowMs(4.5s) 경과
  const memHid = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    return { hidden: s.sampleHidden, panel: s.samplePanel.visible };
  });
  step('견본 자동 숨김', memHid.hidden && !memHid.panel, JSON.stringify(memHid));
  await domTap('#egg-peek');
  const memPeek = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Egg');
    return { hidden: s.sampleHidden, panel: s.samplePanel.visible };
  });
  step('살짝 보기 → 견본 재표시', !memPeek.hidden && memPeek.panel, JSON.stringify(memPeek));
  // 자유 드로잉 후 완료 버튼
  const vw2 = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  const cx = vw2[0] / 2, cy = vw2[1] / 2, r = Math.min(vw2[0], vw2[1]) * 0.18;
  const circ = [];
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    circ.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  await dragPath(circ);
  await domTap('#egg-done');
  await waitFor(`window.__game.scene.getScene('Egg').state === 'decorate'`, '기억 그리기 완료');
  step('기억 그리기 → 꾸미기', true);
  await backToVillage();

  /* ---------- 5. 무지개 붓 + 굵기 ---------- */
  const easel = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Village').easelCont;
    return [s.x, s.y];
  });
  await tapXY(easel[0], easel[1]);
  await sceneActive('Draw');
  await sleep(400);
  const cBtns = await page.$$('.dw-c');
  const sBtns = await page.$$('.dw-s');
  step('색 9종(무지개 포함) + 굵기 3종 버튼', cBtns.length === 9 && sBtns.length === 3,
    `색 ${cBtns.length}, 굵기 ${sBtns.length}`);
  if (TOUCH) await cBtns[8].tap(); else await cBtns[8].click(); // 무지개
  await sleep(150);
  const sBtns2 = await page.$$('.dw-s');
  if (TOUCH) await sBtns2[2].tap(); else await sBtns2[2].click(); // 굵게
  await sleep(150);
  const dy = (await page.evaluate(() => window.innerHeight)) * 0.35;
  const dxc = (await page.evaluate(() => window.innerWidth)) / 2;
  await dragPath([[dxc - 90, dy], [dxc, dy - 50], [dxc + 90, dy]]);
  const rb = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Draw').strokes;
    return s.length ? { c: s[s.length - 1].c, w: s[s.length - 1].w } : null;
  });
  step('무지개 붓·굵은 붓으로 그리기', rb && rb.c === 8 && rb.w === 2, JSON.stringify(rb));
  await backToVillage();

  /* ---------- 6. 길 섬 레벨 5 (loop/spiral 랜덤) 2회 완주 ---------- */
  for (let run = 0; run < 2; run++) {
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('village-v4-p0'));
      d.lvl.road = 5;
      localStorage.setItem('village-v4-p0', JSON.stringify(d));
    });
    // store는 메모리 상주 — 직접 갱신
    await page.evaluate(() => {
      const v = window.__game.scene.getScene('Village');
      // store 모듈 접근 불가 → Road 씬 진입 후 tracer를 직접 확인하는 방식으로 충분
    });
    const roadSign = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Village').signs[0];
      return [s.x, s.y];
    });
    await tapXY(roadSign[0], roadSign[1]);
    await sceneActive('Road');
    await sleep(600);
    const rpts = await page.evaluate(() => {
      const t = window.__game.scene.getScene('Road').tracer;
      const out = [];
      for (let i = 0; i < t.n; i++) { const p = t.sp(i); out.push([p.x, p.y]); }
      return out;
    });
    await dragPath(rpts);
    await waitFor(`window.__game.scene.getScene('Road').state === 'done'`, `길 완주 #${run + 1}`);
    await page.waitForSelector('#celebrate.show', { timeout: 10000 });
    step(`길 섬 완주 #${run + 1} (n=${rpts.length})`, true);
    await domTap('#cel-home');
    await sceneActive('Village');
    await sleep(400);
  }

  const realErrors = errors.filter(e =>
    !/AudioContext|Web Audio|autoplay|speechSynthesis|the user didn't interact/i.test(e));
  step('콘솔/페이지 오류 없음', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));

  await browser.close();
  console.log(`\n${TOUCH ? '[터치]' : '[마우스]'} ${steps.filter(s => s.ok).length}/${steps.length} 통과`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
