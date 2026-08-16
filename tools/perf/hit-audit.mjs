/* 전 씬 탭 히트 영역 감사.
   각 인터랙티브 오브젝트의 '보이는 영역'에 격자를 뿌려 실제 반응 영역과 비교한다.
   - 중심 무반응 / 반응 중심이 크게 어긋남 = 아이가 "눌렀는데 안 돼요"를 겪는 자리
   오브젝트 하나만 넣고 hitTest 하므로 겹침(topOnly)과 무관하게 '기하'만 본다. */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from '../e2e/_env.mjs';
const BASE = ENV_BASE;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function seed() {
  const ring = (k, r) => Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2;
    return [Math.round(50 + Math.cos(a) * r), Math.round(50 + Math.sin(a) * r)];
  });
  const chars = Array.from({ length: 6 }, (_, i) => ({
    s: [ring(24, 34)], c: i % 6, e: i % 4, pt: i % 3, p: i % 3,
    g: 0, f: 0, n: '친구' + i, sc: 'egg', b: 1700000000000 + i,
  }));
  return {
    v: 1, chars,
    trails: [{ hue: 30, pts: ring(24, 40) }],
    aqua: Array.from({ length: 6 }, (_, i) => ({ s: [ring(20, 30)], c: [i % 8] })),
    arts: [{ b: 1, s: Array.from({ length: 4 }, (_, i) => ({ p: ring(20, 12 + i * 8), c: i % 8, w: i % 3 })) }],
    kid: { name: '', call: 1 }, flowers: 20,
    stars: { road: 20, egg: 20, feed: 20, sort: 20 },
    lvl: { road: 3, egg: 3, feed: 3, sort: 3 },
    hist: { road: [], egg: [], feed: [], sort: [] },
    decor: ['garden', 'fountain', 'rainbow', 'firefly'],
    stats: { d: '2000-1-1', sec: 0, plays: 0 }, intro: true,
  };
}

/* 브라우저 안에서 실행: 현재 씬의 인터랙티브 오브젝트를 전부 감사 */
const AUDIT = key => {
  const g = window.__game, s = g.scene.getScene(key);
  const ip = s.input, cam = s.cameras.main;
  const objs = [];
  const walk = list => {
    for (const o of list) {
      if (o.input && o.input.enabled) objs.push(o);
      if (o.type === 'Container' && o.list) walk(o.list);
    }
  };
  walk(s.children.list);
  const out = [];
  for (const o of objs) {
    let b;
    try { b = o.getBounds(); } catch (e) { continue; }
    if (!b || b.width < 4 || b.height < 4) continue;
    const N = 9;
    let hits = 0, sx = 0, sy = 0, centerHit = false;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = b.x + b.width * (i + 0.5) / N;
        const y = b.y + b.height * (j + 0.5) / N;
        const r = ip.manager.hitTest({ x, y, worldX: x, worldY: y }, [o], cam);
        if (r && r.length) { hits++; sx += x; sy += y; }
      }
    }
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const rc = ip.manager.hitTest({ x: cx, y: cy, worldX: cx, worldY: cy }, [o], cam);
    centerHit = !!(rc && rc.length);
    const label = (o.name || '') + o.type + (o.texture && o.texture.key ? `(${o.texture.key})` : '');
    const cov = hits / (N * N);
    // 반응 영역의 무게중심이 보이는 영역 중심에서 얼마나 벗어났나 (짧은 변 기준 비율)
    const off = hits ? Math.hypot(sx / hits - cx, sy / hits - cy) / Math.min(b.width, b.height) : 1;
    out.push({ label, cov: +cov.toFixed(2), off: +off.toFixed(2), centerHit,
      w: Math.round(b.width), h: Math.round(b.height) });
  }
  return out;
};

const SCENES = [
  ['Village', null], ['Draw', null], ['Aqua', null], ['Egg', null],
  ['Feed', { forceMode: 'count' }], ['Sort', null], ['Road', null],
];

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  await ctx.addInitScript(p => { try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {} }, seed());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Profile'));
  await sleep(700);

  // 프로필 화면 먼저 감사
  const report = [];
  report.push(['Profile', await page.evaluate(AUDIT, 'Profile')]);
  const c = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await page.mouse.click(c[0], c[1]);
  await page.waitForFunction(() => window.__game.scene.isActive('Village'));
  await sleep(2000);

  for (const [key, data] of SCENES) {
    if (key !== 'Village') {
      await page.evaluate(a => {
        const g = window.__game;
        const cur = ['Village', 'Draw', 'Aqua', 'Egg', 'Feed', 'Sort', 'Road']
          .map(k => g.scene.getScene(k)).find(s => s && g.scene.isActive(s.scene.key));
        cur.scene.start(a[0], a[1] || {});
      }, [key, data]);
      await page.waitForFunction(k => window.__game.scene.isActive(k), key, { timeout: 20000 });
      await sleep(2200);
    }
    report.push([key, await page.evaluate(AUDIT, key)]);
    if (key !== 'Village') {
      await page.evaluate(k => window.__game.scene.getScene(k).scene.start('Village'), key);
      await page.waitForFunction(() => window.__game.scene.isActive('Village'));
      await sleep(1200);
    }
  }

  let bad = 0;
  for (const [key, rows] of report) {
    const flagged = rows.filter(r => !r.centerHit || r.off > 0.18 || r.cov < 0.25);
    console.log(`\n■ ${key} — 인터랙티브 ${rows.length}개, 의심 ${flagged.length}개`);
    for (const r of flagged) {
      bad++;
      console.log(`   ⚠ ${r.label.padEnd(28)} 중심반응 ${r.centerHit ? 'O' : 'X'}  덮음 ${(r.cov * 100).toFixed(0).padStart(3)}%  중심이탈 ${(r.off * 100).toFixed(0)}%  (${r.w}x${r.h})`);
    }
    if (!flagged.length) console.log('   ✅ 전부 정상 (중심 반응 + 어긋남 없음)');
  }
  console.log(`\n총 의심 ${bad}건`);
  if (errs.length) console.log('페이지 오류:', errs.slice(0, 3));
  await browser.close();
};
main().catch(e => { console.error(e); process.exit(1); });
