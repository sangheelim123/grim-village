/* 부모 코너·도감 나가기 4경로 + 뒤로가기 E2E. 사용: node e2e-overlay.mjs [--touch] */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';
const TOUCH = process.argv.includes('--touch');
let page, cdp;
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = [];
function step(name, ok, extra) {
  steps.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}
async function waitFor(expr, desc, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(expr)) return true;
    await sleep(120);
  }
  throw new Error('시간 초과: ' + desc);
}
async function domTap(sel) {
  await page.waitForSelector(sel, { state: 'visible', timeout: 8000 });
  if (TOUCH) await page.tap(sel); else await page.click(sel);
  await sleep(350);
}
async function openParent() {
  const gear = await page.$('#btn-gear');
  const box = await gear.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (TOUCH) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await sleep(3300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await sleep(3300);
    await page.mouse.up();
  }
  await sleep(400);
}
const parentShown = () => page.evaluate(() => document.getElementById('parent').classList.contains('show'));
const gameAlive = () => page.evaluate(() => !!(window.__game && window.__game.scene.isActive('Village')));

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(TOUCH
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
    : { viewport: { width: 1024, height: 700 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (TOUCH) cdp = await ctx.newCDPSession(page);

  await page.goto('http://127.0.0.1:8331/index.html');
  await waitFor(`window.__game && window.__game.scene.isActive('Profile')`, '부팅');
  await sleep(400);
  const card = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  if (TOUCH) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: card[0], y: card[1] }] }); await sleep(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else await page.mouse.click(card[0], card[1]);
  await waitFor(`window.__game.scene.isActive('Village')`, '마을');
  await sleep(500);

  // 1. ✕ 버튼
  await openParent();
  step('부모 코너 열림', await parentShown());
  await domTap('#parent-x');
  step('✕ 로 닫힘', !(await parentShown()) && (await gameAlive()));

  // 2. ✅ 확인 버튼 (난이도 설정 후)
  await openParent();
  await domTap('.preset-btn[data-preset="4"]');
  await domTap('#parent-close-btn');
  const lvlSet = await page.evaluate(() => JSON.parse(localStorage.getItem('village-v4-p0')).lvl.feed);
  step('난이도 숲 설정 + ✅ 확인으로 닫힘', !(await parentShown()) && lvlSet === 4 && (await gameAlive()), `feed lvl=${lvlSet}`);

  // 3. 바깥(어두운 영역) 탭
  await openParent();
  if (TOUCH) await page.tap('#parent', { position: { x: 10, y: 60 } });
  else await page.click('#parent', { position: { x: 10, y: 60 } });
  await sleep(350);
  step('바깥 탭으로 닫힘', !(await parentShown()) && (await gameAlive()));

  // 4. 뒤로가기 → 오버레이만 닫히고 앱은 산다
  await openParent();
  await page.goBack().catch(() => {});
  await sleep(500);
  step('뒤로가기 → 설정만 닫히고 앱 유지', !(await parentShown()) && (await gameAlive()));

  // 5. 도감도 동일 (✕ + 뒤로가기)
  await domTap('#btn-book');
  step('도감 열림', await page.evaluate(() => document.getElementById('book').classList.contains('show')));
  await domTap('#book-x');
  step('도감 ✕ 닫힘', !(await page.evaluate(() => document.getElementById('book').classList.contains('show'))));
  await domTap('#btn-book');
  await page.goBack().catch(() => {});
  await sleep(500);
  step('도감 뒤로가기 닫힘 + 앱 유지',
    !(await page.evaluate(() => document.getElementById('book').classList.contains('show'))) && (await gameAlive()));

  const realErrors = errors.filter(e => !/AudioContext|Web Audio|autoplay|speechSynthesis|the user didn't interact/i.test(e));
  step('콘솔/페이지 오류 없음', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${TOUCH ? '[터치]' : '[마우스]'} ${steps.filter(Boolean).length}/${steps.length} 통과`);
}
main().catch(e => { console.error('💥', e); process.exit(1); });
