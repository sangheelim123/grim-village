import { audio } from '../audio.js';

export const FONT = 'Jua, "Apple SD Gothic Neo", sans-serif';

export function textStyle(size, color, strokeColor, strokeW) {
  const st = { fontFamily: FONT, fontSize: `${size}px`, color: color || '#4a3f35' };
  if (strokeColor) { st.stroke = strokeColor; st.strokeThickness = strokeW || 6; }
  return st;
}

/* 누르는 맛: 눌리면 쪼그라들었다 튀어오르는 버튼 트윈.
   주의 (모바일 실기기 버그 이력):
   - 복원 스케일은 '누른 순간'의 값을 기억한다 — 생성 시점 값을 쓰면
     레이아웃이 적용한 축소가 풀려 히트 영역이 이웃 버튼과 겹친다.
   - 탭 확정은 이 객체에서 down이 시작됐는지로만 판단한다 —
     getBounds 재검사는 관대한 히트 영역 가장자리 탭을 조용히 무시해
     "눌리는데 반응이 없는" 최악의 체감을 만든다. */
export function pressify(scene, obj, onTap) {
  if (obj instanceof Phaser.GameObjects.Container) {
    // 컨테이너 히트 판정은 로컬 좌표에 displayOrigin(w/2,h/2)이 더해진 값으로 온다.
    // 따라서 히트 영역은 (0,0,w,h) 좌상단 규약이어야 전체가 반응한다 —
    // 중심 기준(-w/2..) 사각형을 쓰면 활성 영역이 왼쪽 위 반쪽으로 밀린다 (실기기 격자 프로브로 확인).
    obj.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, obj.width, obj.height),
      Phaser.Geom.Rectangle.Contains
    );
  } else {
    obj.setInteractive({ useHandCursor: true });
  }
  obj.on('pointerdown', () => {
    // 등장 연출 중이면 원래 크기를 기준으로 (중간값을 기억하면 버튼이 영구히 작아진다)
    if (!obj._pressBase) obj._pressBase = obj._baseScale || { x: obj.scaleX, y: obj.scaleY };
    scene.tweens.add({ targets: obj, scaleX: obj._pressBase.x * 0.9, scaleY: obj._pressBase.y * 0.9, duration: 70 });
  });
  const restore = fire => () => {
    if (!obj._pressBase) return;
    const b = obj._pressBase;
    obj._pressBase = null;
    scene.tweens.add({ targets: obj, scaleX: b.x, scaleY: b.y, duration: 260, ease: 'Back.easeOut' });
    if (fire && onTap) onTap();
  };
  obj.on('pointerup', restore(true));
  obj.on('pointerout', restore(false));
  return obj;
}

/* 하늘 + 떠다니는 구름 배경.
   opts.key로 섬마다 다른 하늘을 쓴다 — setTint는 곱하기라 파란 하늘을
   분홍으로 만들 수 없다(어떤 틴트를 곱해도 파랑에 갇힌다).
   구름은 트윈 대신 수동 스크롤: Phaser의 onRepeat은 시작값을 되돌려 놓아
   "왼쪽에서 들어오기"가 무시되고 제자리로 순간이동해 버린다. */
export function addSky(scene, opts) {
  const { width: w, height: h } = scene.scale;
  const skyKey = (opts && opts.night) ? 'sky_night' : ((opts && opts.key) || 'sky_day');
  const sky = scene.add.image(0, 0, skyKey).setOrigin(0).setDisplaySize(w, h).setDepth(-100);
  const clouds = [];
  const n = (opts && opts.clouds != null) ? opts.clouds : 3;
  // 3층 시차: 먼 구름은 작고 흐리고 느리다
  const LAYER = [{ d: -96, s: 0.42, a: 0.55, v: 5 }, { d: -93, s: 0.72, a: 0.78, v: 11 }, { d: -90, s: 1.05, a: 0.95, v: 20 }];
  for (let i = 0; i < n + 2; i++) {
    const L = LAYER[i % 3];
    const c = scene.add.image(Math.random() * w, h * (0.05 + Math.random() * 0.22), i % 2 ? 'cloud2' : 'cloud1')
      .setDepth(L.d).setAlpha(L.a).setScale(L.s * (0.85 + Math.random() * 0.3));
    c.vx = L.v * (0.85 + Math.random() * 0.3);
    c.fy = c.y / h;
    clouds.push(c);
  }
  return {
    sky, clouds,
    step(dt, vw) {
      for (const c of clouds) {
        c.x += c.vx * dt;
        if (c.x - c.displayWidth / 2 > vw) c.x = -c.displayWidth / 2;
      }
    },
    fit(vw, vh) { sky.setDisplaySize(vw, vh); for (const c of clouds) c.y = c.fy * vh; },
  };
}

/* 지평선 세트: 먼 언덕 + 땅 + 잔디 술. 소품이 하늘에 떠 있지 않게 바닥을 준다.
   (4세면 이미 획득하는 '기저선' 개념 — 바닥이 없으면 아이가 세계로 읽지 못한다) */
export function addGround(scene, opts) {
  const o = Object.assign({ horizon: 0.72, far: true, tufts: 7, depth: -60, tint: null }, opts);
  const far = o.far ? scene.add.image(0, 0, 'hills_far').setOrigin(0.5, 1).setDepth(o.depth - 10).setAlpha(0.85) : null;
  const gnd = scene.add.image(0, 0, 'ground').setOrigin(0.5, 0).setDepth(o.depth);
  const tufts = [];
  for (let i = 0; i < o.tufts; i++) {
    const t = scene.add.image(0, 0, 'grass').setOrigin(0.5, 1).setDepth(o.depth + 1);
    if (o.tint) t.setTint(o.tint);
    t.fx = (i + 0.5) / o.tufts + Math.sin(i * 77.7) * 0.06; // 결정적 배치 (리사이즈해도 안 튄다)
    t.fs = 0.7 + (Math.sin(i * 31.3) * 0.5 + 0.5) * 0.6;
    scene.tweens.add({
      targets: t, angle: (i % 2 ? 4 : -4), duration: 1800 + i * 130,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    tufts.push(t);
  }
  const api = {
    far, gnd, tufts,
    setHorizon(frac) { o.horizon = frac; },
    fit(w, h) {
      const y = h * o.horizon;
      if (far) far.setPosition(w / 2, y + 2).setDisplaySize(Math.max(w * 1.05, 800), h * 0.18);
      gnd.setPosition(w / 2, y).setDisplaySize(Math.max(w * 1.05, 800), h * (1 - o.horizon) + 4);
      for (const t of tufts) t.setPosition(t.fx * w, y + 6).setScale(Math.min(w, h) * 0.0009 * t.fs);
    },
  };
  api.fit(scene.scale.width, scene.scale.height);
  return api;
}

/* 주인공 소품이 순서대로 통통 들어온다 — 아이의 시선을 순서대로 끈다 */
export function popIn(scene, objs, opts) {
  const o = Object.assign({ delay: 55, dur: 300, from: 0.62 }, opts);
  objs.filter(Boolean).forEach((obj, i) => {
    const base = { x: obj.scaleX, y: obj.scaleY };
    // 애니메이션 중에 아이가 눌러도 크기가 망가지지 않게 '원래 크기'를 명시해 둔다
    // (pressify는 누른 순간의 값을 기억하는데, 그 값이 등장 중간값이면 영구히 쪼그라든다)
    obj._baseScale = base;
    obj.setScale(base.x * o.from, base.y * o.from).setAlpha(0);
    scene.tweens.add({
      targets: obj, scaleX: base.x, scaleY: base.y, alpha: 1,
      duration: o.dur, delay: 80 + i * o.delay, ease: 'Back.easeOut',
    });
  });
}

/* 화면을 가로지르는 생명 — 정지한 세계에 "살아 있다"를 더한다.
   파티클이 아니라 이미지 트윈이라 저사양에서 훨씬 유리하다 (마리 수는 꼭 제한할 것) */
export function addFlyers(scene, n, band) {
  const out = [];
  const key = band.key || 'butterfly';
  for (let i = 0; i < n; i++) {
    const b = scene.add.image(-999, -999, key).setDepth(band.depth != null ? band.depth : 25)
      .setScale(band.scale || 0.42);
    if (band.tint) b.setTint(band.tint);
    else if (key === 'butterfly') b.setTint([0xffffff, 0xd8f0ff, 0xffe6a8][i % 3]);
    if (key === 'butterfly') {
      scene.tweens.add({ targets: b, scaleX: (band.scale || 0.42) * 0.32, duration: 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const fly = () => {
      if (!b.active || !scene.scene.isActive()) return;
      const w = scene.scale.width, h = scene.scale.height;
      const y0 = h * (band.y0 + Math.random() * (band.y1 - band.y0));
      const dir = Math.random() < 0.5 ? 1 : -1;
      b.setPosition(dir > 0 ? -40 : w + 40, y0).setFlipX(dir < 0);
      scene.tweens.add({
        targets: b, x: dir > 0 ? w + 40 : -40, duration: 9000 + Math.random() * 7000, ease: 'Linear',
        onUpdate: tw => { b.y = y0 + Math.sin(tw.progress * Math.PI * 5) * h * 0.05; },
        onComplete: () => scene.time.delayedCall(1200 + Math.random() * 4000, fly),
      });
    };
    scene.time.delayedCall(Math.random() * 3000, fly);
    out.push(b);
  }
  return out;
}

export function fitBg(scene, sky) {
  const { width: w, height: h } = scene.scale;
  sky.setDisplaySize(w, h);
}

/* 별점 → 문자열 */
export function starText(n) { return '⭐'.repeat(n); }

/* 축하 파티클: 콘페티 + 반짝이 */
export function confettiBurst(scene, x, y) {
  const colors = [0xff6b6b, 0xffa94d, 0xffd21e, 0x69d16b, 0x5aa9ff, 0xb28bfa, 0xff7db0];
  const em = scene.add.particles(x, y, 'dot', {
    speed: { min: 180, max: 420 },
    angle: { min: 220, max: 320 },
    gravityY: 700,
    lifespan: { min: 900, max: 1600 },
    scale: { start: 0.28, end: 0.1 },
    quantity: 60,
    emitting: false,
    tint: colors,
    rotate: { start: 0, end: 360 },
  }).setDepth(500);
  em.explode(60);
  const sp = scene.add.particles(x, y, 'sparkle', {
    speed: { min: 60, max: 220 },
    lifespan: { min: 500, max: 1000 },
    scale: { start: 0.5, end: 0 },
    quantity: 14,
    emitting: false,
  }).setDepth(500);
  sp.explode(14);
  scene.time.delayedCall(2000, () => { em.destroy(); sp.destroy(); });
}

export function sparkleBurst(scene, x, y, n) {
  const sp = scene.add.particles(x, y, 'sparkle', {
    speed: { min: 60, max: 240 },
    lifespan: { min: 400, max: 900 },
    scale: { start: 0.6, end: 0 },
    emitting: false,
  }).setDepth(400);
  sp.explode(n || 12);
  scene.time.delayedCall(1200, () => sp.destroy());
}

export function heartBurst(scene, x, y) {
  const em = scene.add.particles(x, y, 'heart', {
    speedY: { min: -120, max: -60 },
    speedX: { min: -40, max: 40 },
    lifespan: 1100,
    scale: { start: 0.4, end: 0.15 },
    alpha: { start: 1, end: 0 },
    emitting: false,
  }).setDepth(400);
  em.explode(3);
  scene.time.delayedCall(1300, () => em.destroy());
}

/* 진행이 멈춘 아이를 위한 손가락 힌트 스프라이트 */
export function makeHintHand(scene) {
  const hand = scene.add.image(0, 0, 'hand').setDepth(300).setAlpha(0).setScale(0.7).setAngle(-20);
  hand.showAt = (x, y) => { hand.setPosition(x, y + 26).setAlpha(0.9); };
  hand.hide = () => hand.setAlpha(0);
  return hand;
}
