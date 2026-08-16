/* 텍스처 크기 vs 실제 화면 표시 크기 — 낭비를 찾는다.
   큰 태블릿(가로·세로 양쪽)에서 재야 "필요한 최대 크기"가 나온다. */
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
    aqua: Array.from({ length: 4 }, (_, i) => ({ s: [ring(20, 30)], c: [i % 8] })),
    arts: [{ b: 1, s: Array.from({ length: 4 }, (_, i) => ({ p: ring(20, 12 + i * 8), c: i % 8, w: i % 3 })) }],
    kid: { name: '', call: 1 }, flowers: 30,
    stars: { road: 30, egg: 30, feed: 30, sort: 30 },
    lvl: { road: 3, egg: 3, feed: 3, sort: 3 },
    hist: { road: [], egg: [], feed: [], sort: [] },
    decor: ['garden', 'fountain', 'rainbow', 'firefly', 'garden2', 'rainbow2'],
    stats: { d: '2000-1-1', sec: 0, plays: 0 }, intro: true,
  };
}

/* 현재 씬의 모든 이미지: 텍스처키 → 최대 표시 픽셀 */
const USAGE = key => {
  const s = window.__game.scene.getScene(key);
  const out = {};
  const dpr = window.devicePixelRatio || 1;
  const walk = list => {
    for (const o of list) {
      if (o.type === 'Container' && o.list) { walk(o.list); continue; }
      if ((o.type === 'Image' || o.type === 'Sprite') && o.texture && o.texture.key) {
        const w = Math.abs(o.displayWidth) * dpr, h = Math.abs(o.displayHeight) * dpr;
        const k = o.texture.key;
        if (!out[k] || w * h > out[k][0] * out[k][1]) out[k] = [Math.round(w), Math.round(h)];
      }
    }
  };
  walk(s.children.list);
  return out;
};

const SCENES = ['Draw', 'Aqua', 'Egg', 'Feed', 'Sort', 'Road'];

const collect = async (page, vp) => {
  await page.setViewportSize(vp);
  await sleep(900);
  const acc = {};
  const merge = m => { for (const k in m) { if (!acc[k] || m[k][0] * m[k][1] > acc[k][0] * acc[k][1]) acc[k] = m[k]; } };
  merge(await page.evaluate(USAGE, 'Profile'));
  merge(await page.evaluate(USAGE, 'Village'));
  for (const key of SCENES) {
    await page.evaluate(k => {
      const g = window.__game;
      const cur = ['Village', 'Draw', 'Aqua', 'Egg', 'Feed', 'Sort', 'Road']
        .map(x => g.scene.getScene(x)).find(s => s && g.scene.isActive(s.scene.key));
      cur.scene.start(k, k === 'Feed' ? { forceMode: 'count' } : {});
    }, key);
    await page.waitForFunction(k => window.__game.scene.isActive(k), key, { timeout: 20000 });
    await sleep(2200);
    merge(await page.evaluate(USAGE, key));
    await page.evaluate(k => window.__game.scene.getScene(k).scene.start('Village'), key);
    await page.waitForFunction(() => window.__game.scene.isActive('Village'));
    await sleep(1200);
  }
  return acc;
};

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {} }, seed());
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Profile'));
  await sleep(800);
  const usedProfile = await page.evaluate(USAGE, 'Profile');
  const c = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await page.mouse.click(c[0], c[1]);
  await page.waitForFunction(() => window.__game.scene.isActive('Village'));
  await sleep(2000);

  const land = await collect(page, { width: 1280, height: 800 });
  const port = await collect(page, { width: 800, height: 1280 });
  const used = {};
  for (const m of [usedProfile, land, port]) {
    for (const k in m) { if (!used[k] || m[k][0] * m[k][1] > used[k][0] * used[k][1]) used[k] = m[k]; }
  }

  const tex = await page.evaluate(() => {
    const list = window.__game.textures.list, out = {};
    for (const k in list) {
      const s = list[k].source && list[k].source[0];
      if (s && s.width) out[k] = [s.width, s.height];
    }
    return out;
  });

  const rows = [];
  let totMB = 0, wasteMB = 0;
  for (const k in tex) {
    const [tw, th] = tex[k];
    const mb = tw * th * 4 / 1048576;
    totMB += mb;
    const u = used[k];
    if (!u) { rows.push({ k, tw, th, uw: 0, uh: 0, mb, ratio: null }); continue; }
    // 표시 대비 텍스처가 몇 배로 큰가 (선형 배율)
    const ratio = Math.max(tw / Math.max(1, u[0]), th / Math.max(1, u[1]));
    if (ratio > 1.35) wasteMB += mb * (1 - 1 / (ratio * ratio));
    rows.push({ k, tw, th, uw: u[0], uh: u[1], mb, ratio });
  }
  rows.sort((a, b) => (b.ratio || 0) * b.mb - (a.ratio || 0) * a.mb);
  console.log(`텍스처 총 ${totMB.toFixed(1)}MB — 과대분 추정 ${wasteMB.toFixed(1)}MB\n`);
  console.log('키'.padEnd(18) + '텍스처'.padEnd(13) + '실사용(최대)'.padEnd(15) + '배율   메모리');
  for (const r of rows) {
    if (r.ratio !== null && r.ratio <= 1.35 && r.mb < 0.25) continue;
    const flag = r.ratio === null ? '   미사용' : (r.ratio > 1.6 ? ' ⚠' : (r.ratio < 0.9 ? ' ↑부족' : '   '));
    console.log(`${r.k.padEnd(18)}${(r.tw + '×' + r.th).padEnd(13)}${(r.uw ? r.uw + '×' + r.uh : '-').padEnd(15)}` +
      `${(r.ratio === null ? '-' : r.ratio.toFixed(2) + '배').padEnd(7)}${r.mb.toFixed(2)}MB${flag}`);
  }
  await browser.close();
};
main().catch(e => { console.error(e); process.exit(1); });
