/* 장시간 사용 누수 점검: 섬을 여러 번 오가고 화면을 여러 번 돌린 뒤
   텍스처 수·GPU 텍스처·JS 힙이 계속 늘어나는지 본다. */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from '../e2e/_env.mjs';
const BASE = ENV_BASE;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function seed() {
  const ring = (k, r) => Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2;
    return [Math.round(50 + Math.cos(a) * r), Math.round(50 + Math.sin(a) * r)];
  });
  const chars = Array.from({ length: 8 }, (_, i) => ({
    s: [ring(24, 34)], c: i % 6, e: i % 4, pt: i % 3, p: i % 3,
    g: 0, f: 0, n: '친구' + i, sc: 'egg', b: 1700000000000 + i,
  }));
  return {
    v: 1, chars, trails: [{ hue: 30, pts: ring(24, 40) }],
    aqua: Array.from({ length: 8 }, (_, i) => ({ s: [ring(20, 30)], c: [i % 8] })),
    arts: [{ b: 1, s: [{ p: ring(20, 30), c: 1, w: 1 }] }],
    kid: { name: '', call: 1 }, flowers: 20,
    stars: { road: 20, egg: 20, feed: 20, sort: 20 },
    lvl: { road: 2, egg: 2, feed: 2, sort: 2 },
    hist: { road: [], egg: [], feed: [], sort: [] },
    decor: ['garden', 'fountain', 'rainbow', 'firefly'],
    stats: { d: '2000-1-1', sec: 0, plays: 0 }, intro: true,
  };
}

const STAT = () => {
  const g = window.__game;
  const list = g.textures.list;
  let px = 0, n = 0;
  for (const k in list) {
    const s = list[k].source && list[k].source[0];
    if (s && s.width) { px += s.width * s.height; n++; }
  }
  const m = performance.memory || {};
  return {
    tex: n, texMB: +(px * 4 / 1048576).toFixed(1),
    heapMB: m.usedJSHeapSize ? +(m.usedJSHeapSize / 1048576).toFixed(1) : -1,
    // 씬별 표시목록 크기 (오브젝트가 쌓이는지)
    objs: ['Village', 'Draw', 'Aqua', 'Egg'].map(k => {
      const s = g.scene.getScene(k);
      return s && s.children ? s.children.list.length : 0;
    }),
  };
};

const main = async () => {
  const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {} }, seed());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Profile'));
  await sleep(700);
  const c = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await page.mouse.click(c[0], c[1]);
  await page.waitForFunction(() => window.__game.scene.isActive('Village'));
  await sleep(2000);

  const goto = async key => {
    await page.evaluate(k => {
      const g = window.__game;
      const cur = ['Village', 'Draw', 'Aqua', 'Egg', 'Feed', 'Sort', 'Road']
        .map(x => g.scene.getScene(x)).find(s => s && g.scene.isActive(s.scene.key));
      cur.scene.start(k, k === 'Feed' ? { forceMode: 'count' } : {});
    }, key);
    await page.waitForFunction(k => window.__game.scene.isActive(k), key, { timeout: 20000 });
    await sleep(800);
  };

  const base = await page.evaluate(STAT);
  console.log('시작            ', JSON.stringify(base));

  // 1) 섬 왕복 12회
  for (let r = 0; r < 12; r++) {
    for (const k of ['Draw', 'Aqua', 'Egg', 'Village']) await goto(k);
  }
  await sleep(1500);
  const afterNav = await page.evaluate(STAT);
  console.log('섬 왕복 48회 후 ', JSON.stringify(afterNav));

  // 2) 화면 회전 20회 (그리는 중 포함 — RenderTexture 재생성 경로)
  await goto('Draw');
  await page.evaluate(() => {
    const d = window.__game.scene.getScene('Draw');
    d.strokes = Array.from({ length: 8 }, (_, k) => ({
      pts: Array.from({ length: 60 }, (_, i) => [120 + k * 40 + i * 3, 150 + Math.sin(i / 5) * 60]),
      c: k % 8, w: k % 3, h0: k * 40,
    }));
    d.redraw();
  });
  for (let r = 0; r < 20; r++) {
    await page.setViewportSize(r % 2 ? { width: 1024, height: 700 } : { width: 700, height: 1000 });
    await sleep(220);
  }
  await sleep(1200);
  const afterRot = await page.evaluate(STAT);
  console.log('회전 20회 후    ', JSON.stringify(afterRot));

  // 3) 마을에서 날씨를 여러 번 돌린다 (파티클·이모트 누적 확인)
  await goto('Village');
  await page.evaluate(() => { const v = window.__game.scene.getScene('Village'); v.autoQuality = false; });
  for (let r = 0; r < 10; r++) {
    await page.evaluate(k => window.__game.scene.getScene('Village').forceWeather(k, 300, true),
      ['rain', 'snow', 'wind', 'clear'][r % 4]);
    await sleep(700);
  }
  await sleep(2500);
  const afterWx = await page.evaluate(STAT);
  console.log('날씨 40회 후    ', JSON.stringify(afterWx));

  const grow = (a, b2) => `텍스처 ${b2.tex - a.tex}개 / ${(b2.texMB - a.texMB).toFixed(1)}MB, 힙 ${(b2.heapMB - a.heapMB).toFixed(1)}MB`;
  console.log('\n증가량');
  console.log('  섬 왕복 :', grow(base, afterNav));
  console.log('  회전    :', grow(afterNav, afterRot));
  console.log('  날씨    :', grow(afterRot, afterWx));
  console.log('  전체    :', grow(base, afterWx));
  if (errs.length) console.log('오류:', errs.slice(0, 4));
  await browser.close();
};
main().catch(e => { console.error(e); process.exit(1); });
