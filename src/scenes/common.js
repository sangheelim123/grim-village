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
    if (!obj._pressBase) obj._pressBase = { x: obj.scaleX, y: obj.scaleY };
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

/* 하늘 + 떠다니는 구름 배경 */
export function addSky(scene, opts) {
  const { width: w, height: h } = scene.scale;
  const sky = scene.add.image(0, 0, (opts && opts.night) ? 'sky_night' : 'sky_day')
    .setOrigin(0).setDisplaySize(w, h).setDepth(-100);
  const clouds = [];
  const n = (opts && opts.clouds != null) ? opts.clouds : 3;
  for (let i = 0; i < n; i++) {
    const c = scene.add.image(
      Math.random() * w, h * (0.06 + Math.random() * 0.2),
      i % 2 ? 'cloud2' : 'cloud1'
    ).setDepth(-90).setAlpha(0.9).setScale(0.7 + Math.random() * 0.5);
    scene.tweens.add({
      targets: c, x: c.x + w * 1.4, duration: 60000 + Math.random() * 60000, repeat: -1,
      onRepeat: () => { c.x = -160; },
    });
    clouds.push(c);
  }
  return { sky, clouds };
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
