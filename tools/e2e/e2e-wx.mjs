/* v1.5.0 E2E: 날씨(비·눈·바람) + 캐릭터 반응. 사용: node e2e-wx.mjs [--touch] */
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
  await sleep(150);
}
const steps = [];
function step(name, ok, extra) {
  steps.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
}

/* 마을 상태 스냅샷 */
const snap = () => page.evaluate(() => {
  const v = window.__game.scene.getScene('Village');
  const w = v.scale.width, h = v.scale.height;
  const homes = v.props.filter(p => p.d.win).map(p => p.x);
  const band = v.wanderBand();
  return {
    kind: v.wx.kind, want: v.wx.want, i: v.wx.i, wet: v.wx.wet, snow: v.wx.snow, dir: v.wx.dir,
    rain: !!(v.rainEm && v.rainEm.emitting),
    splash: !!(v.splashEm && v.splashEm.emitting),
    snowEm: !!(v.snowEm && v.snowEm.emitting),
    leaf: !!(v.leafEm && v.leafEm.emitting),
    capA: v.snowCaps[0].alpha,
    sunA: v.sun.alpha, moonA: v.moon.alpha, rainbowA: v.rainbowImg.alpha,
    skyTint: v.bg.sky.tintTopLeft,
    modes: v.walkers.map(c => c.mode),
    angles: v.walkers.map(c => Math.round(c.angle * 10) / 10),
    treeAng: v.props.filter(p => p.d.key === 'tree').map(p => Math.round(p.angle * 10) / 10),
    nearHome: v.walkers.map(c => Math.min(...homes.map(hx => Math.abs(c.x - hx))) / w),
    inBand: v.walkers.map(c => c.x >= band.x0 - 1 && c.x <= band.x1 + 1),
    n: v.walkers.length,
  };
});
const force = (kind, secs, instant) => page.evaluate(
  a => window.__game.scene.getScene('Village').forceWeather(a[0], a[1], a[2]), [kind, secs, instant]);
const setDay = sec => page.evaluate(s => {
  const v = window.__game.scene.getScene('Village');
  v.cycleOffset = s - (v.time.now / 1000) % 240;
}, sec);

/* 트윈에서 '거리당 소요 시간(ms/px)'을 표집 — 걸음이 실제로 느려졌는지 본다 */
const walkSpeed = ms => page.evaluate(t => new Promise(res => {
  const v = window.__game.scene.getScene('Village');
  const out = [];
  const seen = new Set();
  const grab = () => {
    for (const c of v.walkers) {
      const tw = v.tweens.getTweensOf(c).find(x => x.data
        && x.data.some(d => d.key === 'x') && x.data.some(d => d.key === 'y'));
      if (!tw || seen.has(tw)) continue;   // 같은 트윈을 여러 번 세면 통계가 왜곡된다
      seen.add(tw);
      const dx = tw.data.find(d => d.key === 'x'), dy = tw.data.find(d => d.key === 'y');
      const dist = Math.hypot(dx.end - dx.start, dy.end - dy.start);
      if (dist > 25) out.push(tw.duration / dist);
    }
  };
  const iv = setInterval(grab, 150);
  setTimeout(() => { clearInterval(iv); res(out.length ? out.reduce((a, b) => a + b, 0) / out.length : null); }, t);
}), ms);

/* 마을에 친구가 있어야 반응을 볼 수 있다 — 저장소에 6명을 미리 심는다 */
function seedProfile() {
  const ring = (n, r) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round(50 + Math.cos(a) * r), Math.round(50 + Math.sin(a) * r)];
  });
  const chars = Array.from({ length: 6 }, (_, i) => ({
    s: [ring(20, 34 + i * 2)], c: i % 6, e: i % 4, pt: i % 3, p: i % 3,
    g: 0, f: 0, n: ['모리', '뽀동', '까미', '비쭈', '유타', '코나'][i], sc: 'egg', b: 1700000000000 + i,
  }));
  return {
    v: 1, chars, trails: [], aqua: [], arts: [], kid: { name: '', call: 1 }, flowers: 4,
    stars: { road: 0, egg: 0, feed: 0, sort: 0 }, lvl: { road: 1, egg: 1, feed: 1, sort: 1 },
    hist: { road: [], egg: [], feed: [], sort: [] }, decor: [],
    stats: { d: '2000-1-1', sec: 0, plays: 0 }, intro: true,
  };
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(TOUCH
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
    : { viewport: { width: 1024, height: 700 } });
  await ctx.addInitScript(p => {
    try { localStorage.setItem('village-v4-p0', JSON.stringify(p)); } catch (e) {}
  }, seedProfile());
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (TOUCH) cdp = await ctx.newCDPSession(page);

  await page.goto(BASE + '/index.html');
  await sceneActive('Profile');
  await sleep(400);
  const card = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await tapXY(card[0], card[1]);
  await sceneActive('Village');
  await sleep(700);
  await setDay(50); // 한낮 고정 (무지개·해 판정을 안정화)
  // 저사양 자동 감쇠는 여기서 끈다 — 헤드리스는 늘 저프레임이라 모든 판정이 감쇠된 값이 된다.
  // (감쇠 기능 자체는 아래 전용 테스트에서 따로 검증한다)
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.autoQuality = false; v.quality.q = 1; v.syncWeatherEmitters();
  });
  await sleep(300);

  const base = await snap();
  step('시작은 맑음 (파티클 전부 꺼짐)',
    base.kind === 'clear' && !base.rain && !base.snowEm && !base.leaf && base.n === 6,
    JSON.stringify({ kind: base.kind, n: base.n }));
  const clearSpeed = await walkSpeed(4000); // 맑은 날 걸음 기준선

  /* ---------- 0. 자동 전환 (강제 호출 없이 일정표대로) ---------- */
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.wx.until = v.time.now / 1000 + 1.5; // 일정표를 앞당기기만 한다
  });
  await sleep(3500);
  const auto = await snap();
  const toastTxt = await page.evaluate(() => {
    const t = document.querySelector('.toast');
    return t ? t.textContent : '';
  });
  step('자동으로 날씨가 찾아온다 (안내 문구 포함)',
    auto.want !== 'clear' && /비|눈|바람/.test(toastTxt), `${auto.want} / "${toastTxt}"`);
  await force('clear', 300, true);
  await sleep(600);

  /* ---------- 1. 비 ---------- */
  await force('rain', 60, true);
  await sleep(500);
  const r1 = await snap();
  step('비: 빗줄기·물튀김 방출 + 해가 구름에 가림',
    r1.kind === 'rain' && r1.rain && r1.splash && r1.sunA < 0.25 && r1.skyTint !== 0xffffff,
    JSON.stringify({ sunA: r1.sunA.toFixed(2), sky: r1.skyTint.toString(16) }));

  // 친구들이 집으로 모여든다
  await waitFor(() => {
    const v = window.__game.scene.getScene('Village');
    return v.walkers.every(c => c.mode === 'shelter');
  }, '모두 대피 모드', 8000);
  await sleep(3800);
  const r2 = await snap();
  const allNear = r2.nearHome.every(d => d < 0.13);
  step('비: 모든 친구가 집 앞으로 모임',
    r2.modes.every(m => m === 'shelter') && allNear,
    `집과의 거리(화면비) 최대 ${Math.max(...r2.nearHome).toFixed(3)}`);
  step('비: 아무도 자고 있지 않음 (비가 깨운다)',
    await page.evaluate(() => window.__game.scene.getScene('Village').walkers.every(c => !c.sleeping)), '');
  step('비: 땅이 젖어 웅덩이가 생김', r2.wet > 0.15, `wet=${r2.wet.toFixed(2)}`);

  // 대피 중에도 탭 보상은 그대로 (설계 원칙)
  const wpos = await page.evaluate(() => {
    const c = window.__game.scene.getScene('Village').walkers[0];
    return [c.x, c.y];
  });
  await tapXY(wpos[0], wpos[1]);
  await sleep(300);
  step('비: 대피 중에도 친구를 만질 수 있음 (오류 없음)', true);

  // 회전(리사이즈)해도 대피 자리를 지킨다
  await page.setViewportSize(TOUCH ? { width: 844, height: 390 } : { width: 700, height: 1000 });
  await sleep(700);
  const r3 = await snap();
  step('비: 화면 회전 뒤에도 집 앞을 지킴',
    r3.modes.every(m => m === 'shelter') && r3.nearHome.every(d => d < 0.16),
    `최대 ${Math.max(...r3.nearHome).toFixed(3)}`);
  await page.setViewportSize(TOUCH ? { width: 390, height: 844 } : { width: 1024, height: 700 });
  await sleep(600);

  // 비 오는 동안 섬을 다녀와도 친구들은 여전히 집에 모여 있다
  await page.evaluate(() => window.__game.scene.getScene('Village').scene.start('Egg'));
  await sceneActive('Egg');
  await sleep(700);
  await page.evaluate(() => window.__game.scene.getScene('Egg').scene.start('Village'));
  await sceneActive('Village');
  await sleep(1200);
  const r4 = await snap();
  step('비: 섬을 다녀와도 집 앞에 그대로 모여 있다',
    r4.kind === 'rain' && r4.modes.every(m => m === 'shelter') && r4.nearHome.every(d => d < 0.13),
    `최대 ${Math.max(...r4.nearHome).toFixed(3)}`);

  /* ---------- 2. 비 그침 → 무지개 ---------- */
  await force('clear', 60, false);
  await sleep(2500);
  const midFade = await snap();
  step('비 그침: 아직 비가 남아 있을 땐 무지개도 안내도 미룬다',
    midFade.rainbowA < 0.05 && midFade.i > 0.4, `i=${midFade.i.toFixed(2)} 무지개=${midFade.rainbowA.toFixed(2)}`);
  await sleep(4500);
  const c1 = await snap();
  step('비 그침: 잦아든 뒤 무지개가 뜬다', c1.rainbowA > 0.3, `alpha=${c1.rainbowA.toFixed(2)}`);
  await waitFor(() => {
    const v = window.__game.scene.getScene('Village');
    return v.walkers.every(c => c.mode === 'wander');
  }, '모두 마당으로 복귀', 8000);
  await sleep(2500);
  const c2 = await snap();
  step('비 그침: 친구들이 다시 마당으로', c2.modes.every(m => m === 'wander'), '');
  step('비 그침: 비가 서서히 잦아든다 (i 감소)', c2.i < 0.75, `i=${c2.i.toFixed(2)}`);

  /* ---------- 3. 눈 ---------- */
  await force('snow', 60, true);
  await sleep(4000);
  const s1 = await snap();
  step('눈: 눈송이 방출 + 비는 멈춤', s1.kind === 'snow' && s1.snowEm && !s1.rain, JSON.stringify({ kind: s1.kind }));
  // 쌓이는 속도는 프레임에 비례하므로(헤드리스는 저프레임) 절대값 대신 '늘어난다'를 본다
  await sleep(5000);
  const s1b = await snap();
  step('눈: 언덕에 눈이 점점 쌓인다',
    s1b.capA > s1.capA && s1b.capA > 0.05, `${s1.capA.toFixed(3)} → ${s1b.capA.toFixed(3)}`);
  step('눈: 친구들은 집에 가지 않고 계속 논다', s1.modes.every(m => m === 'wander'), s1.modes.join(','));

  /* ---------- 4. 바람 ---------- */
  await force('wind', 60, true);
  await sleep(1200);
  const w1 = await snap();
  const leaning = w1.angles.filter(a => Math.abs(a) > 1).length;
  step('바람: 나뭇잎이 날린다', w1.kind === 'wind' && w1.leaf, JSON.stringify({ kind: w1.kind }));
  step('바람: 친구들이 바람에 기운다', leaning === w1.n, `기운 친구 ${leaning}/${w1.n} (${w1.angles.join(',')})`);
  step('바람: 나무도 함께 흔들린다', w1.treeAng.some(a => Math.abs(a) > 0.3), w1.treeAng.join(','));

  // 걸음이 실제로 느려지는지 (맑은 날 대비 거리당 소요 시간)
  const windSpeed = await walkSpeed(5000);
  const ratio = clearSpeed && windSpeed ? windSpeed / clearSpeed : null;
  step('바람: 걸음이 눈에 띄게 힘겨워진다', ratio !== null && ratio > 1.7,
    `맑음 ${clearSpeed && clearSpeed.toFixed(1)} → 바람 ${windSpeed && windSpeed.toFixed(1)} ms/px (×${ratio && ratio.toFixed(2)})`);

  /* ---------- 4b. 바람에 간판이 기울어도 눌러서 들어갈 수 있어야 한다 ---------- */
  const signXY = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Village').signs.find(c => c.islData.key === 'Sort');
    return [s.x, s.y];
  });
  await tapXY(signXY[0], signXY[1]);
  const wentSort = await sceneActive('Sort').then(() => true).catch(() => false);
  step('바람: 기울어진 간판도 눌러서 들어간다', wentSort);
  await page.evaluate(() => window.__game.scene.getScene('Sort').scene.start('Village'));
  await sceneActive('Village');
  await sleep(800);

  /* 성능: 헤드리스 소프트웨어 렌더링은 시간이 갈수록 느려지므로 절대값은 의미가 없다.
     '맑음 → 날씨 → 맑음' 샌드위치로 드리프트를 상쇄하고 상대 비용만 본다.
     함께 살아 있는 파티클 수(진짜 통제 대상)도 상한을 확인한다. */
  const fpsOf = async k => {
    await force(k, 120, true);
    await sleep(2500);
    return page.evaluate(() => new Promise(r =>
      setTimeout(() => r(Math.round(window.__game.loop.actualFps)), 2500)));
  };
  const fA = await fpsOf('clear');
  const fRain = await fpsOf('rain');
  const alive = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    const n = em => (em && em.alive ? em.alive.length : 0);
    return { rain: n(v.rainEm), splash: n(v.splashEm) };
  });
  const fSnow = await fpsOf('snow');
  const aliveSnow = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    const n = em => (em && em.alive ? em.alive.length : 0);
    return n(v.snowEm) + n(v.snowBackEm);
  });
  const fB = await fpsOf('clear');
  const baseline = (fA + fB) / 2;
  step('성능: 날씨의 프레임 비용이 맑음 대비 25% 이내',
    fRain >= baseline * 0.75 && fSnow >= baseline * 0.75,
    `맑음 ${fA}/${fB} → 비 ${fRain}, 눈 ${fSnow} fps`);
  step('성능: 동시 파티클 수 상한 (비 ≤120, 눈 ≤200)',
    alive.rain + alive.splash <= 120 && aliveSnow <= 200,
    `비 ${alive.rain}+${alive.splash}, 눈 ${aliveSnow}`);
  await force('wind', 60, true);
  await sleep(300);

  /* ---------- 5. 섬을 다녀와도 날씨가 이어진다 ---------- */
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.scene.start('Draw');
  });
  await sceneActive('Draw');
  await sleep(600);
  await page.evaluate(() => {
    const d = window.__game.scene.getScene('Draw');
    d.scene.start('Village');
  });
  await sceneActive('Village');
  await sleep(900);
  const w2 = await snap();
  step('섬을 다녀와도 날씨가 이어진다', w2.kind === 'wind' && w2.leaf, JSON.stringify({ kind: w2.kind, leaf: w2.leaf }));

  /* ---------- 6. 맑음 복귀: 잔재가 남지 않는다 ---------- */
  await force('clear', 90, true);
  await sleep(900);
  const c3 = await snap();
  step('맑음 복귀: 파티클 모두 정지 + 기울기 0',
    !c3.rain && !c3.snowEm && !c3.leaf && c3.angles.every(a => a === 0) && c3.treeAng.every(a => a === 0),
    JSON.stringify({ rain: c3.rain, snow: c3.snowEm, leaf: c3.leaf }));
  step('맑음 복귀: 해가 다시 보인다', c3.sunA > 0.9, `sunA=${c3.sunA.toFixed(2)}`);

  /* ---------- 7. 밤 + 눈 ---------- */
  await setDay(170);
  await force('snow', 60, true);
  await sleep(900);
  const n1 = await snap();
  step('밤+눈: 달이 구름에 가리고 눈은 계속 내린다',
    n1.snowEm && n1.moonA < 0.75 && n1.moonA > 0, `moonA=${n1.moonA.toFixed(2)}`);

  /* ---------- 7b. 저사양 기기 자동 배려 ---------- */
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.autoQuality = true; v.quality.q = 1; v._qAt = 0;
    v.forceWeather('rain', 300, true);
  });
  await sleep(11000); // 헤드리스는 늘 40fps 미만 → 감쇠가 걸려야 한다
  const adapt = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    return { q: v.quality.q, freq: v.rainEm.frequency, alive: v.rainEm.alive.length,
      fps: Math.round(window.__game.loop.actualFps) };
  });
  step('저사양: 프레임이 낮으면 파티클을 조용히 줄인다',
    adapt.q < 1 && adapt.q >= 0.4 && adapt.freq > 30,
    `${adapt.fps}fps → q=${adapt.q.toFixed(2)}, 방출간격 30→${adapt.freq}ms, 빗방울 ${adapt.alive}개`);
  step('저사양: 바닥(0.4) 아래로는 내려가지 않는다', adapt.q >= 0.4, `q=${adapt.q.toFixed(2)}`);
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.autoQuality = false; v.quality.q = 1; v.syncWeatherEmitters();
  });

  /* ---------- 7c. 밤에는 낮 하늘을 그리지 않는다 (오버드로우 절감) ---------- */
  await setDay(170);
  await sleep(600);
  const nightSky = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    return { day: v.bg.sky.visible, night: v.nightSky.alpha };
  });
  await setDay(50);
  await sleep(600);
  const daySky = await page.evaluate(() => window.__game.scene.getScene('Village').bg.sky.visible);
  step('오버드로우: 한밤엔 낮 하늘을 끄고, 낮엔 다시 켠다',
    nightSky.day === false && nightSky.night > 0.98 && daySky === true,
    JSON.stringify(nightSky));

  /* ---------- 7d. 친구를 '얼굴 한가운데'서 눌러도 반응해야 한다 ----------
     컨테이너 히트 영역은 로컬좌표에 displayOrigin(w/2,h/2)이 더해져 들어온다.
     중심을 (0,0)으로 두면 반응 영역이 통째로 왼쪽 위로 밀려, 아이가 친구 몸을
     눌러도 아무 일이 없었다 (격자 프로브로 확인한 실제 증상). */
  await force('clear', 300, true);
  await sleep(400);
  const tapSpots = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    const c = v.walkers[0];
    v.moveStop(c);
    // 이젤·간판에서 떨어진 자리에 세운다 (다른 것이 탭을 가져가지 않도록)
    c.setPosition(v.scale.width * 0.3, v.scale.height * 0.64);
    c.on('pointerdown', () => { window.__tapped = true; });
    v.time.paused = true; // 측정 중에는 예약된 배회 재시작이 끼어들지 않게 시계를 멈춘다
    // 다른 친구가 같은 자리에 서 있으면 그 친구가 탭을 가져간다(정상 동작) — 잠시 비켜 세운다
    v.walkers.slice(1).forEach(o => { v.moveStop(o); o.setPosition(-400, -400); });
    const r = c.baseSize * 0.45;
    return { x: c.x, y: c.y, r: Math.round(r), size: c.baseSize };
  });
  const hits = [];
  for (const [dx, dy] of [[0, 0], [tapSpots.r, 0], [-tapSpots.r, 0], [0, tapSpots.r], [0, -tapSpots.r]]) {
    /* 헤드리스는 ~10fps라 탭 이벤트가 프레임 사이에 삼켜지는 일이 있다.
       히트 영역을 보는 테스트이므로 이벤트 유실은 재시도로 걸러낸다. */
    let got = false;
    for (let try_ = 0; try_ < 3 && !got; try_++) {
      await page.evaluate(() => {
        window.__tapped = false;
        const v = window.__game.scene.getScene('Village'); const c = v.walkers[0];
        v.moveStop(c); c.setScale(1);
        c.setPosition(v.scale.width * 0.3, v.scale.height * 0.64);
      });
      await sleep(200);
      await tapXY(tapSpots.x + dx, tapSpots.y + dy);
      await sleep(150);
      got = await page.evaluate(() => !!window.__tapped);
    }
    if (process.env.WXDBG) console.log('    표본', JSON.stringify({ dx, dy, got }));
    hits.push(got);
  }
  const spotName = ['가운데', '오른쪽', '왼쪽', '아래', '위'];
  await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    v.time.paused = false;
    v.walkers.forEach((c, i) => v.restartWander(c, 60 + i * 90)); // 비켜 세운 친구들을 마당으로
  });
  await sleep(1200);
  step('친구 몸 어디를 눌러도 반응한다 (가운데·상하좌우)',
    hits.every(Boolean),
    `크기 ${tapSpots.size}px, 반경 ${tapSpots.r}px — 무반응: ${hits.map((h, i) => h ? null : spotName[i]).filter(Boolean).join(',') || '없음'}`);

  // 친구들이 이젤을 목적지로 삼지 않는다 (지나가는 건 괜찮다)
  const parked = await page.evaluate(() => new Promise(res => {
    const v = window.__game.scene.getScene('Village');
    const e = v.easelCont;
    const hw = e.easelImg.displayWidth * 0.8, hh = e.easelImg.displayHeight * 0.7;
    let bad = 0, n = 0;
    const iv = setInterval(() => {
      n++;
      for (const c of v.walkers) {
        const moving = v.tweens.getTweensOf(c).some(t => t.data && t.data.some(d => d.key === 'x'));
        if (!moving && Math.abs(c.x - e.x) < hw && Math.abs(c.y - e.y) < hh) bad++;
      }
    }, 250);
    setTimeout(() => { clearInterval(iv); res({ bad, n }); }, 9000);
  }));
  step('친구들이 이젤 앞에 멈춰 서지 않는다', parked.bad === 0, `${parked.n}회 표집 중 ${parked.bad}회`);

  /* ---------- 8. 일정표가 정말 무작위인가 (400회 표집) ---------- */
  const stats = await page.evaluate(() => {
    const v = window.__game.scene.getScene('Village');
    const wxs = v.wx;
    const S = v.onWeatherStart, E = v.onWeatherEnd;
    v.onWeatherStart = () => {}; v.onWeatherEnd = () => {}; // 연출은 빼고 일정만 본다
    const save = { ...wxs };
    wxs.want = 'clear'; wxs.kind = 'clear'; wxs.lastKind = null;
    const seq = [], durs = [], clears = [];
    let t = 0;
    for (let n = 0; n < 400; n++) {
      const before = wxs.want;
      v.rollWeather(t);
      const d = wxs.until - t;
      if (wxs.want === 'clear') clears.push(d);
      else { seq.push(wxs.want); durs.push(d); if (before !== 'clear') seq.chain = (seq.chain || 0) + 1; }
      t = wxs.until;
    }
    Object.assign(wxs, save);
    v.onWeatherStart = S; v.onWeatherEnd = E;
    const count = k => seq.filter(x => x === k).length;
    let repeats = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) repeats++;
    const sd = a => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return { mean: m, cv: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m };
    };
    return {
      n: seq.length, rain: count('rain'), wind: count('wind'), snow: count('snow'),
      repeatPct: repeats / (seq.length - 1), chainPct: (seq.chain || 0) / seq.length,
      spell: sd(durs), clear: sd(clears), uniq: new Set(durs.map(x => Math.round(x))).size,
    };
  });
  const share = k => stats[k] / stats.n;
  step('무작위: 세 날씨가 고르게 섞인다 (각 20% 이상)',
    ['rain', 'wind', 'snow'].every(k => share(k) > 0.2),
    `비 ${(share('rain') * 100) | 0}% 바람 ${(share('wind') * 100) | 0}% 눈 ${(share('snow') * 100) | 0}%`);
  step('무작위: 같은 날씨 연속은 줄이되 막지는 않는다 (0~25%)',
    stats.repeatPct > 0.02 && stats.repeatPct < 0.25, `${(stats.repeatPct * 100).toFixed(1)}%`);
  step('무작위: 맑음↔궂음 교대를 가끔 건너뛴다 (5~30%)',
    stats.chainPct > 0.05 && stats.chainPct < 0.3, `${(stats.chainPct * 100).toFixed(1)}%`);
  step('무작위: 지속 시간이 제각각 (변동계수 20% 이상, 고정 주기 아님)',
    stats.spell.cv > 0.2 && stats.clear.cv > 0.2 && stats.uniq > 30,
    `날씨 ${stats.spell.mean.toFixed(0)}초±${(stats.spell.cv * 100) | 0}%, 맑음 ${stats.clear.mean.toFixed(0)}초±${(stats.clear.cv * 100) | 0}%, 서로 다른 길이 ${stats.uniq}종`);

  /* ---------- 9. 앱을 껐다 켜도(리로드) 날씨가 이어진다 ---------- */
  await setDay(50);
  await force('rain', 90, true);
  await sleep(5000); // 저장 스로틀(4초)이 한 번은 돌도록
  await page.reload();
  await sceneActive('Profile');
  await sleep(400);
  const card2 = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await tapXY(card2[0], card2[1]);
  await sceneActive('Village');
  await sleep(1500);
  const re = await snap();
  step('앱을 다시 켜도 비가 그대로 내린다',
    re.kind === 'rain' && re.rain && re.modes.every(m => m === 'shelter'),
    JSON.stringify({ kind: re.kind, i: re.i.toFixed(2), 대피: re.modes.filter(m => m === 'shelter').length }));

  /* 오래 자리를 비웠다면 새 하루처럼 맑음부터.
     저장 시각 조작은 반드시 리로드 '후' 프로필 화면에서 한다 —
     마을이 떠 있는 동안에는 앱이 4초마다 계속 덮어써서 조작이 무효가 된다
     (실제로 앱을 끈 상황을 흉내내려면 저장하는 주체가 멈춰 있어야 한다). */
  await page.reload();
  await sceneActive('Profile');
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('village-v4-wx'));
    d.at = Date.now() - 600000;
    localStorage.setItem('village-v4-wx', JSON.stringify(d));
  });
  await sleep(400);
  const card3 = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x, c.y]; });
  await tapXY(card3[0], card3[1]);
  await sceneActive('Village');
  await sleep(1200);
  const fresh = await snap();
  step('오래 지난 뒤에는 맑음부터 새로 시작한다',
    fresh.kind === 'clear' && !fresh.rain && fresh.modes.every(m => m === 'wander'),
    JSON.stringify({ kind: fresh.kind, i: fresh.i }));

  const realErrors = errors.filter(e =>
    !/AudioContext|Web Audio|autoplay|speechSynthesis|the user didn't interact/i.test(e));
  step('콘솔/페이지 오류 없음', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));

  await browser.close();
  console.log(`\n${TOUCH ? '[터치]' : '[마우스]'} ${steps.filter(s => s.ok).length}/${steps.length} 통과`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
