/* 부팅 시간: CPU 성능별 (저사양 태블릿 흉내) */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from '../e2e/_env.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
for (const rate of [1, 4, 8]) {
  const ctx = await b.newContext({ viewport:{width:800,height:1280} });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:8331/index.html');
  await page.waitForFunction("window.__game && window.__game.scene.getScene('Boot')", {timeout:60000});
  const tBoot = Date.now() - t0;
  await page.waitForFunction("window.__game.scene.isActive('Profile')", {timeout:120000});
  const tReady = Date.now() - t0;
  const detail = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource');
    const sum = f => res.filter(f).reduce((a, r) => a + r.duration, 0);
    return {
      dom: Math.round(nav.domContentLoadedEventEnd || 0),
      svg: Math.round(sum(r => r.name.endsWith('.svg'))),
      wav: Math.round(sum(r => r.name.endsWith('.wav'))),
      phaser: Math.round(sum(r => r.name.includes('phaser'))),
      tex: Object.keys(window.__game.textures.list).length,
    };
  });
  console.log(`CPU ${rate}배 느리게 → 엔진 ${tBoot}ms, 첫 화면 ${tReady}ms ` +
    `(DOM ${detail.dom}ms, phaser ${detail.phaser}ms, svg합 ${detail.svg}ms, wav합 ${detail.wav}ms, 텍스처 ${detail.tex}개)`);
  await ctx.close();
}
await b.close();
