/* 그림 놀이터: 획 수에 따른 프레임 비용 측정 */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from '../e2e/_env.mjs';
const BASE = ENV_BASE;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const seed = () => ({
  v: 1, chars: [], trails: [], aqua: [], arts: [], kid: { name: '', call: 1 }, flowers: 0,
  stars: { road: 0, egg: 0, feed: 0, sort: 0 }, lvl: { road: 1, egg: 1, feed: 1, sort: 1 },
  hist: { road: [], egg: [], feed: [], sort: [] }, decor: [],
  stats: { d: '2000-1-1', sec: 0, plays: 0 }, intro: true,
});

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {} }, seed());
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Profile'));
  await sleep(600);
  const c = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await page.mouse.click(c[0], c[1]);
  await page.waitForFunction(() => window.__game.scene.isActive('Village'));
  await sleep(1500);
  await page.evaluate(() => window.__game.scene.getScene('Village').scene.start('Draw'));
  await page.waitForFunction(() => window.__game.scene.isActive('Draw') && !!window.__game.scene.getScene('Draw').strokeG);
  await sleep(1200);

  // 렌더 시간 계측기
  await page.evaluate(() => {
    const g = window.__game;
    window.__st = { ren: 0, frames: 0, calls: 0 };
    const gl = g.renderer.gl;
    if (gl && !gl.__hooked) {
      gl.__hooked = true;
      const de = gl.drawElements.bind(gl), da = gl.drawArrays.bind(gl);
      gl.drawElements = function (m, cn, t, o) { window.__st.calls++; return de(m, cn, t, o); };
      gl.drawArrays = function (m, f, cn) { window.__st.calls++; return da(m, f, cn); };
    }
    const orig = g.renderer.render.bind(g.renderer);
    g.renderer.render = function (s, ch, ca) {
      const a = performance.now(); const r = orig(s, ch, ca);
      window.__st.ren += performance.now() - a; window.__st.frames++; return r;
    };
  });

  const measure = async n => {
    const t = await page.evaluate(N => {
      const d = window.__game.scene.getScene('Draw');
      const w = d.scale.width, h = d.scale.height;
      d.strokes = [];
      for (let s = 0; s < N; s++) {
        const pts = [];
        // 아이가 그리는 획 = 대략 60~120점
        const n2 = 90, x0 = 80 + (s * 37) % (w - 200), y0 = 90 + (s * 53) % (h - 250);
        for (let i = 0; i < n2; i++) pts.push([x0 + Math.sin(i / 7 + s) * 70 + i, y0 + Math.cos(i / 5 + s) * 55]);
        d.strokes.push({ pts, c: s % 8, w: s % 3, h0: (s * 40) % 360 });
      }
      const a = performance.now();
      d.redraw();
      const redrawMs = performance.now() - a;
      const cmds = d.strokeG.commandBuffer ? d.strokeG.commandBuffer.length : -1;
      return { redrawMs, cmds, pts: d.strokes.reduce((x, s2) => x + s2.pts.length, 0) };
    }, n);
    await sleep(1200);
    await page.evaluate(() => { const s = window.__st; s.ren = 0; s.frames = 0; s.calls = 0; });
    await sleep(4000);
    const st = await page.evaluate(() => ({ ...window.__st }));
    const f = Math.max(1, st.frames);
    console.log(`획 ${String(n).padStart(3)}개 (${String(t.pts).padStart(5)}점)  ` +
      `redraw ${t.redrawMs.toFixed(1).padStart(6)}ms  커맨드 ${String(t.cmds).padStart(6)}  ` +
      `render(JS) ${(st.ren / f).toFixed(1).padStart(6)}ms/프레임  드로우콜 ${(st.calls / f).toFixed(0).padStart(4)}  ${(f / 4).toFixed(1)}fps`);
  };

  for (const n of [0, 5, 15, 30, 60]) await measure(n);
  await browser.close();
};
main().catch(e => { console.error(e); process.exit(1); });
