/* 오버드로우(화면 몇 겹을 칠하는가) + 텍스처 메모리 실측 */
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

/* 화면에 실제로 칠해지는 면적 합 / 화면 면적 = 오버드로우 배수 */
const OVERDRAW = () => {
  const g = window.__game, v = g.scene.getScene('Village');
  const W = v.scale.width, H = v.scale.height, area = W * H;
  let sum = 0;
  const rows = [];
  const walk = (list, mulAlpha) => {
    for (const o of list) {
      if (!o.willRender || !o.willRender(v.cameras.main)) continue;
      if (o.type === 'Container') { walk(o.list, mulAlpha * (o.alpha == null ? 1 : o.alpha)); continue; }
      let a = 0;
      if (o.type === 'Image' || o.type === 'Sprite') a = Math.abs(o.displayWidth * o.displayHeight);
      else if (o.type === 'ParticleEmitter') {
        for (const p of (o.alive || [])) a += Math.abs((p.scaleX * (p.frame ? p.frame.width : 0)) * (p.scaleY * (p.frame ? p.frame.height : 0)));
      } else if (o.type === 'Text') a = o.width * o.height;
      else if (o.type === 'Graphics') a = area * 0.4; // 대략치
      if (!a) continue;
      // 화면 밖은 세지 않는다 (대략적으로 화면 면적으로 상한)
      a = Math.min(a, area * 1.2);
      sum += a;
      if (a > area * 0.12) rows.push([o.texture && o.texture.key || o.type, +(a / area).toFixed(2), +(o.alpha).toFixed(2), o.depth]);
    }
  };
  walk(v.children.list, 1);
  rows.sort((x, y) => y[1] - x[1]);
  return { overdraw: +(sum / area).toFixed(2), big: rows.slice(0, 12) };
};

const TEXMEM = () => {
  const list = window.__game.textures.list;
  let px = 0; const rows = [];
  for (const k in list) {
    const t = list[k];
    const s = t.source && t.source[0];
    if (!s) continue;
    const p = (s.width || 0) * (s.height || 0);
    px += p;
    rows.push([k, s.width, s.height, +(p * 4 / 1048576).toFixed(2)]);
  }
  rows.sort((a, b) => b[3] - a[3]);
  return { totalMB: +(px * 4 / 1048576).toFixed(1), count: rows.length, top: rows.slice(0, 12) };
};

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {} }, seedProfile(8));
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Profile'));
  await sleep(600);
  const c = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await page.mouse.click(c[0], c[1]);
  await page.waitForFunction(() => window.__game.scene.isActive('Village'));
  await sleep(2500);

  const tm = await page.evaluate(TEXMEM);
  console.log(`텍스처: ${tm.count}개, ${tm.totalMB}MB (RGBA 기준)`);
  for (const [k, w, h, mb] of tm.top) console.log(`   ${String(mb).padStart(5)}MB  ${w}×${h}  ${k}`);
  console.log('');

  for (const [label, setup] of [
    ['맑음 낮', s => { s.cycleOffset = 50 - (s.time.now / 1000) % 240; s.forceWeather('clear', 300, true); }],
    ['비 낮', s => { s.cycleOffset = 50 - (s.time.now / 1000) % 240; s.forceWeather('rain', 300, true); }],
    ['눈 낮(쌓임)', s => { s.cycleOffset = 50 - (s.time.now / 1000) % 240; s.forceWeather('snow', 300, true); s.wx.snow = 1; }],
    ['밤 맑음', s => { s.cycleOffset = 170 - (s.time.now / 1000) % 240; s.forceWeather('clear', 300, true); s.wx.snow = 0; }],
    ['밤+눈', s => { s.cycleOffset = 170 - (s.time.now / 1000) % 240; s.forceWeather('snow', 300, true); s.wx.snow = 1; }],
    ['노을', s => { s.cycleOffset = 107 - (s.time.now / 1000) % 240; s.forceWeather('clear', 300, true); s.wx.snow = 0; }],
  ]) {
    await page.evaluate(`(${setup})(window.__game.scene.getScene('Village'))`);
    await sleep(2500);
    const r = await page.evaluate(OVERDRAW);
    console.log(`${label.padEnd(12)} 오버드로우 ×${r.overdraw}`);
    for (const [k, a, al, d] of r.big) console.log(`      ${String(a).padStart(5)}배  alpha ${al}  depth ${d}  ${k}`);
  }
  await browser.close();
};
main().catch(e => { console.error(e); process.exit(1); });
