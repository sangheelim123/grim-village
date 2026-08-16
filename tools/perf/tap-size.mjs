/* 버튼 크기 감사: 유아 손가락 기준.
   성인 가이드(iOS 44pt)보다 유아는 더 커야 한다 — 여기서는 48px를 최소선으로 본다.
   화면에 실제로 보이는 모든 버튼을 폰·태블릿 두 크기에서 잰다. */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from '../e2e/_env.mjs';
const BASE = ENV_BASE;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIN = 48;

function seed() {
  const ring = (k, r) => Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2;
    return [Math.round(50 + Math.cos(a) * r), Math.round(50 + Math.sin(a) * r)];
  });
  const chars = Array.from({ length: 4 }, (_, i) => ({
    s: [ring(24, 34)], c: i % 6, e: i % 4, pt: i % 3, p: i % 3,
    g: 0, f: 0, n: '친구' + i, sc: 'egg', b: 1700000000000 + i,
  }));
  return {
    v: 1, chars, trails: [], aqua: [], arts: [], kid: { name: '', call: 1 }, flowers: 10,
    stars: { road: 10, egg: 10, feed: 10, sort: 10 }, lvl: { road: 2, egg: 2, feed: 2, sort: 2 },
    hist: { road: [], egg: [], feed: [], sort: [] }, decor: ['garden'],
    stats: { d: '2000-1-1', sec: 0, plays: 0 }, intro: true,
  };
}

const SIZES = () => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('button, .pick-btn, .act-btn, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;             // 안 보이는 것은 제외
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    // 화면 밖(닫힌 오버레이 안)도 제외
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const id = el.id || (el.className + '|' + (el.textContent || '').trim().slice(0, 8));
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
};

const main = async () => {
  const browser = await chromium.launch();
  for (const vp of [{ width: 390, height: 844, name: '폰(390×844)' }, { width: 1024, height: 700, name: '태블릿(1024×700)' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(p => { try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {} }, seed());
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const tap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(300);
    };
    await page.goto(BASE + '/index.html');
    await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Profile'));
    await sleep(700);
    const all = new Map();
    const grab = async where => {
      for (const b of await page.evaluate(SIZES)) {
        const k = where + ' / ' + b.id;
        if (!all.has(k)) all.set(k, b);
      }
    };
    await grab('프로필');
    const c = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
    await tap(c[0], c[1]);
    await page.waitForFunction(() => window.__game.scene.isActive('Village'));
    await sleep(1800);
    await grab('마을');
    for (const [key, label] of [['Draw', '그림 놀이터'], ['Aqua', '수족관'], ['Egg', '모양 알'], ['Feed', '냠냠'], ['Sort', '반짝'], ['Road', '길']]) {
      await page.evaluate(k => {
        const g = window.__game;
        const cur = ['Village', 'Draw', 'Aqua', 'Egg', 'Feed', 'Sort', 'Road']
          .map(x => g.scene.getScene(x)).find(s => s && g.scene.isActive(s.scene.key));
        cur.scene.start(k, k === 'Feed' ? { forceMode: 'count' } : {});
      }, key);
      await page.waitForFunction(k => window.__game.scene.isActive(k), key, { timeout: 20000 });
      await sleep(2000);
      if (key === 'Egg') { // 도형 고르면 액션바가 바뀐다
        await grab(label + '(고르기)');
        await page.evaluate(() => window.__game.scene.getScene('Egg').startTrace('circle'));
        await sleep(1200);
      }
      await grab(label);
      await page.evaluate(k => window.__game.scene.getScene(k).scene.start('Village'), key);
      await page.waitForFunction(() => window.__game.scene.isActive('Village'));
      await sleep(1000);
    }
    // 도감 · 부모 코너
    await page.evaluate(() => document.getElementById('btn-book').click());
    await sleep(900); await grab('도감');
    await page.evaluate(() => document.getElementById('book-x').click());
    await sleep(600);
    await page.evaluate(() => { document.getElementById('parent').classList.add('show'); });
    await sleep(700); await grab('부모 코너');

    const rows = [...all.entries()].map(([k, v]) => ({ k, ...v }));
    const small = rows.filter(r => Math.min(r.w, r.h) < MIN).sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));
    console.log(`\n■ ${vp.name} — 버튼 ${rows.length}개, ${MIN}px 미만 ${small.length}개`);
    for (const r of small) console.log(`   ⚠ ${String(Math.min(r.w, r.h)).padStart(3)}px  ${r.w}×${r.h}  ${r.k}`);
    if (!small.length) console.log('   ✅ 전부 48px 이상');
    await ctx.close();
  }
  await browser.close();
};
main().catch(e => { console.error(e); process.exit(1); });
