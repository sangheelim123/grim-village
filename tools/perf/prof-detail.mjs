/* 드로우콜·오버드로우·JS 시간 직접 계측 (소프트웨어 래스터라이저 영향 배제) */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from '../e2e/_env.mjs';
const BASE = ENV_BASE;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function seedProfile(n) {
  const ring = (k, r) => Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2;
    return [Math.round(50 + Math.cos(a) * r), Math.round(50 + Math.sin(a) * r)];
  });
  const chars = Array.from({ length: n }, (_, i) => ({
    s: [ring(24, 34), ring(10, 12)], c: i % 6, e: i % 4, pt: i % 3, p: i % 3,
    g: 0, f: 0, n: '친구' + i, sc: 'egg', b: 1700000000000 + i,
  }));
  return {
    v: 1, chars,
    trails: Array.from({ length: 5 }, (_, i) => ({ hue: i * 60, pts: ring(24, 40) })),
    aqua: [], arts: [{ b: 1, s: Array.from({ length: 6 }, (_, i) => ({ p: ring(20, 12 + i * 6), c: i % 8, w: i % 3 })) }],
    kid: { name: '', call: 1 }, flowers: 40,
    stars: { road: 40, egg: 40, feed: 40, sort: 40 },
    lvl: { road: 3, egg: 3, feed: 3, sort: 3 },
    hist: { road: [], egg: [], feed: [], sort: [] },
    decor: ['garden', 'fountain', 'rainbow', 'firefly', 'garden2', 'rainbow2'],
    stats: { d: '2000-1-1', sec: 0, plays: 0 }, intro: true,
  };
}

/* 페이지 안에 계측기 심기: WebGL 드로우콜 + 픽셀 면적(오버드로우) + JS 시간 */
const INSTRUMENT = () => {
  const g = window.__game;
  const gl = g.renderer.gl;
  if (!gl || gl.__hooked) return;
  gl.__hooked = true;
  window.__stat = { calls: 0, verts: 0, frames: 0, upd: 0, ren: 0 };
  const de = gl.drawElements.bind(gl), da = gl.drawArrays.bind(gl);
  gl.drawElements = function (m, c, t, o) { window.__stat.calls++; window.__stat.verts += c; return de(m, c, t, o); };
  gl.drawArrays = function (m, f, c) { window.__stat.calls++; window.__stat.verts += c; return da(m, f, c); };
  // 씬 update / 렌더 시간 분리
  const scene = g.scene.getScene('Village');
  const origUpdate = scene.update.bind(scene);
  scene.update = function (t, d) {
    const a = performance.now();
    const r = origUpdate(t, d);
    window.__stat.upd += performance.now() - a;
    return r;
  };
  const origRender = g.renderer.render.bind(g.renderer);
  g.renderer.render = function (s, c, ca) {
    const a = performance.now();
    const r = origRender(s, c, ca);
    window.__stat.ren += performance.now() - a;
    window.__stat.frames++;
    return r;
  };
};

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {} }, seedProfile(8));
  const page = await ctx.newPage();

  const tBoot = Date.now();
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Profile'));
  console.log(`부팅(첫 화면까지): ${((Date.now() - tBoot) / 1000).toFixed(2)}초`);
  await sleep(600);
  const c = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await page.mouse.click(c[0], c[1]);
  await page.waitForFunction(() => window.__game.scene.isActive('Village'));
  await sleep(2000);
  await page.evaluate(() => { const v = window.__game.scene.getScene('Village'); v.cycleOffset = 50 - (v.time.now / 1000) % 240; });
  await page.evaluate(INSTRUMENT);

  const measure = async (label, setup) => {
    if (setup) await page.evaluate(setup);
    await sleep(2200);
    await page.evaluate(() => { const s = window.__stat; s.calls = s.verts = s.frames = s.upd = s.ren = 0; });
    await sleep(4000);
    const s = await page.evaluate(() => ({ ...window.__stat }));
    const f = Math.max(1, s.frames);
    console.log(`${label.padEnd(16)} 드로우콜 ${(s.calls / f).toFixed(1).padStart(6)}/프레임  ` +
      `정점 ${(s.verts / f).toFixed(0).padStart(6)}  ` +
      `update ${(s.upd / f).toFixed(2).padStart(5)}ms  render(JS) ${(s.ren / f).toFixed(1).padStart(5)}ms  ` +
      `${(s.frames / 4).toFixed(1)}fps`);
    return s;
  };

  const objInfo = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    const byType = {};
    for (const o of v.children.list) byType[o.type] = (byType[o.type] || 0) + 1;
    return { total: v.children.list.length, byType, textures: Object.keys(window.__game.textures.list).length };
  });
  console.log('마을 오브젝트:', JSON.stringify(objInfo));
  console.log('');

  await measure('맑음', () => window.__game.scene.getScene('Village').forceWeather('clear', 300, true));
  await measure('비', () => window.__game.scene.getScene('Village').forceWeather('rain', 300, true));
  await measure('눈', () => window.__game.scene.getScene('Village').forceWeather('snow', 300, true));
  await measure('바람', () => window.__game.scene.getScene('Village').forceWeather('wind', 300, true));
  await measure('밤+눈', () => {
    const v = window.__game.scene.getScene('Village');
    v.cycleOffset = 170 - (v.time.now / 1000) % 240;
    v.forceWeather('snow', 300, true); v.wx.snow = 1;
  });
  await browser.close();
};
main().catch(e => { console.error(e); process.exit(1); });
