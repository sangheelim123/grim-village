import { addSky, addGround, addFlyers, textStyle, confettiBurst } from './common.js';
import { Tracer, accToStars } from '../tracer.js';
import { store } from '../store.js';
import { makeCreatureSprite } from '../creature.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { switchScene } from '../main.js';
import { TUNING, MID_CHEER, iGa, pickVary, rand, pick, clamp } from '../config.js';

/* 레벨별 길 모양 — 획 발달 순서(직선→대각선→꺾임→곡선→복합)를 따라 다양하게.
   같은 레벨 안에서는 무작위 선택이라 다시 해도 새 길이 나온다 */
const LEVELS = [
  [{ aspect: { w: 1, h: 1.4 }, pts: [[0.5, 0.05], [0.5, 1.35]] },
   { aspect: { w: 2, h: 1 }, pts: [[0.05, 0.5], [1.95, 0.5]] },
   { aspect: { w: 2, h: 1 }, arc: true }],
  [{ aspect: { w: 1.6, h: 1 }, pts: [[0.1, 0.1], [1.5, 0.9]] },
   { aspect: { w: 1.6, h: 1 }, pts: [[0.1, 0.9], [1.5, 0.1]] },
   { aspect: { w: 1.6, h: 1 }, pts: [[0.15, 0.1], [0.15, 0.85], [1.45, 0.85]] }],
  /* 곡선(물결·언덕)이 각진 획(지그재그·계단)보다 먼저 — 작업치료 선긋기 위계 */
  [{ aspect: { w: 2, h: 1 }, wave: true },
   { aspect: { w: 2, h: 1 }, hills: true }],
  [{ aspect: { w: 2, h: 1 }, pts: [[0, 0.85], [0.5, 0.15], [1, 0.85], [1.5, 0.15], [2, 0.85]] },
   { aspect: { w: 2, h: 1 }, pts: [[0.05, 0.9], [0.7, 0.9], [0.7, 0.5], [1.35, 0.5], [1.35, 0.1], [1.95, 0.1]] }],
  [{ aspect: { w: 2, h: 1.1 }, loop: true },
   { aspect: { w: 2, h: 1.1 }, spiral: true }],
];
function roadPath(lvl) {
  const def = pick(LEVELS[lvl - 1]);
  const sampled = (n, fn) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(fn(i / n));
    return { raw: pts, aspect: def.aspect };
  };
  if (def.arc) { // 완만한 무지개 호
    return sampled(40, t => ({
      x: (1 - t) * (1 - t) * 0.1 + 2 * (1 - t) * t * 1.0 + t * t * 1.9,
      y: (1 - t) * (1 - t) * 0.8 + 2 * (1 - t) * t * 0.1 + t * t * 0.8,
    }));
  }
  if (def.wave) return sampled(60, t => ({ x: t * 2, y: 0.5 - 0.36 * Math.sin(t * Math.PI * 2) }));
  if (def.hills) return sampled(60, t => ({ x: 0.05 + t * 1.9, y: 0.88 - 0.68 * Math.abs(Math.sin(t * Math.PI * 2)) }));
  if (def.loop) return sampled(80, t => ({ x: t * 2, y: 0.55 - 0.3 * Math.sin(t * Math.PI * 4) * (t < 0.5 ? 1 : 0.7) }));
  if (def.spiral) { // 소용돌이: 바깥에서 가운데로 빙글빙글
    return sampled(90, t => {
      const a = t * Math.PI * 3.5;
      const r = 0.52 - 0.4 * t;
      return { x: 1.0 + r * 1.6 * Math.cos(a), y: 0.55 + r * 0.85 * Math.sin(a) };
    });
  }
  return { raw: def.pts.map(p => ({ x: p[0], y: p[1] })), aspect: def.aspect };
}

export class RoadScene extends Phaser.Scene {
  constructor() { super('Road'); }

  create() {
    ui.topButtons('play');
    this.cameras.main.fadeIn(250, 234, 250, 255);
    this.bg = addSky(this, { clouds: 2, key: 'sky_road' });
    this.ground = addGround(this, { horizon: 0.86, tufts: 10 });
    this.birds = addFlyers(this, 2, { key: 'bird', y0: 0.1, y1: 0.26, depth: -85, scale: 0.7, tint: 0xa8c0d8 });
    this.roadG = this.add.graphics().setDepth(4); // 흙길 바닥 (점선·아이의 선보다 뒤)
    audio.setMood('play');

    const lvl = store.lvlOf('road');
    const { raw, aspect } = roadPath(lvl);
    const { width: w, height: h } = this.scale;
    this.tracer = new Tracer(raw, aspect, lvl, false, w, h);
    this.hue = rand(0, 360);
    this.mile = 0;
    this.halfCheered = false;
    this.state = 'trace';
    this.drawing = false;

    this.guideG = this.add.graphics().setDepth(10);
    this.strokeG = this.add.graphics().setDepth(12);

    this.walkerChar = store.pickPlaymate();
    const end = this.tracer.sp(this.tracer.n - 1);
    this.houseImg = this.add.image(end.x + this.tracer.R * 1.9, end.y - this.tracer.R * 0.9, 'house')
      .setScale(clamp(this.tracer.R / 60, 0.6, 1.2)).setDepth(5);
    this.flagImg = this.add.image(end.x, end.y - this.tracer.R * 0.7, 'flag')
      .setScale(clamp(this.tracer.R / 70, 0.5, 1)).setDepth(9);
    this.tweens.add({ targets: this.flagImg, angle: 6, duration: 900, yoyo: true, repeat: -1 });

    if (this.walkerChar) {
      this.walkerObj = makeCreatureSprite(this, this.walkerChar, this.tracer.R * 1.8);
    } else {
      this.walkerObj = this.add.image(0, 0, 'star').setDisplaySize(this.tracer.R * 1.6, this.tracer.R * 1.55);
    }
    this.walkerObj.setDepth(20);
    this.hintHand = this.add.image(0, 0, 'hand').setDepth(30).setAlpha(0).setAngle(-15).setScale(0.75);

    this.drawId = null;
    this.input.on('pointerdown', p => this.onDown(p));
    this.input.on('pointermove', p => this.onMove(p));
    this.input.on('pointerup', p => this.onUpEnd(p));
    this.input.on('pointerupoutside', p => this.onUpEnd(p));

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      if (this.walkerObj && this.walkerObj.destroyTexture) this.walkerObj.destroyTexture();
    });

    this.drawRoadBed();
    ui.setPill('길을 따라 쭉~ 그어 주세요!');
    audio.speak(this.walkerChar
      ? `${iGa(this.walkerChar.n)} 집에 가고 싶대요! 반짝이는 점부터 깃발까지 선을 그어 주세요!`
      : '반짝이는 점부터 깃발까지 선을 그어 주세요!');
  }

  repeatVoice() { audio.speak('초록 점에서 시작해서 깃발까지 쭉 그어 주세요!'); }

  /* 흙길 리본: 가이드 점선 아래에 실제 '길'을 깐다.
     리사이즈 때만 다시 그린다 (매 프레임 아님) */
  drawRoadBed() {
    const tr = this.tracer, g = this.roadG;
    // 지평선을 길의 가장 낮은 점 바로 아래로 — 길이 공중에 떠 있지 않게
    let lowest = 0;
    for (let i = 0; i < tr.n; i++) lowest = Math.max(lowest, tr.sp(i).y);
    const h = this.scale.height;
    this.ground.setHorizon(clamp((lowest + tr.R * 1.15) / h, 0.5, 0.94));
    this.ground.fit(this.scale.width, h);
    g.clear();
    for (const [wMul, col] of [[1.75, 0xe6d3a8], [1.15, 0xf3e6c6]]) {
      g.lineStyle(tr.R * wMul, col, 1);
      g.beginPath();
      g.moveTo(tr.sp(0).x, tr.sp(0).y);
      for (let i = 1; i < tr.n; i++) g.lineTo(tr.sp(i).x, tr.sp(i).y);
      g.strokePath();
    }
    g.fillStyle(0xd6c49a, 0.9); // 길가 조약돌
    const step = Math.max(4, Math.round(tr.n / 14));
    for (let i = step; i < tr.n - 2; i += step) {
      const a = tr.sp(i), b = tr.sp(i + 2);
      const nx = -(b.y - a.y), ny = b.x - a.x;
      const L = Math.hypot(nx, ny) || 1, side = (i / step) % 2 ? 1 : -1;
      g.fillCircle(a.x + nx / L * tr.R * side, a.y + ny / L * tr.R * side, tr.R * 0.16);
    }
  }

  onResize() {
    const { width: w, height: h } = this.scale;
    this.bg.fit(w, h);
    this.ground.fit(w, h);
    this.tracer.fit(w, h);
    const end = this.tracer.sp(this.tracer.n - 1);
    this.houseImg.setPosition(end.x + this.tracer.R * 1.9, end.y - this.tracer.R * 0.9);
    this.flagImg.setPosition(end.x, end.y - this.tracer.R * 0.7);
    this.strokeG.clear();
    this.drawRoadBed();
  }

  onDown(p) {
    if (this.state !== 'trace' || this.drawing) return; // 그리는 손가락 하나만
    this.drawing = true;
    this.drawId = p.id;
    this.tracer.reverseIfCloser(p.x, p.y); // 깃발 쪽에서 시작해도 괜찮아요
    this.lastPt = { x: p.x, y: p.y };
    this.tracer.feed(p.x, p.y);
    this.strokeG.fillStyle(Phaser.Display.Color.HSLToColor(this.hue / 360, 0.75, 0.55).color, 0.55);
    this.strokeG.fillCircle(p.x, p.y, this.tracer.R * 0.2);
    this.checkDone();
  }
  onMove(p) {
    if (this.state !== 'trace' || !this.drawing || p.id !== this.drawId) return;
    this.strokeG.lineStyle(this.tracer.R * 0.4, Phaser.Display.Color.HSLToColor(this.hue / 360, 0.75, 0.55).color, 0.55);
    this.strokeG.lineBetween(this.lastPt.x, this.lastPt.y, p.x, p.y);
    this.tracer.feedSegment(this.lastPt.x, this.lastPt.y, p.x, p.y); // 빠른 스와이프 보간
    this.lastPt = { x: p.x, y: p.y };
    const step = Math.ceil(this.tracer.n / 8);
    const mile = Math.floor(this.tracer.coveredCount / step);
    if (mile > this.mile) { this.mile = mile; audio.pop(mile); }
    if (!this.halfCheered && this.tracer.coverage >= 0.5) {
      this.halfCheered = true;
      audio.speak(pickVary(MID_CHEER), { pri: 2 }); // 다른 소리 중이면 조용히 스킵
    }
    this.checkDone();
  }
  onUpEnd(p) {
    if (p && this.drawId !== null && p.id !== this.drawId) return;
    this.drawing = false;
    this.drawId = null;
  }

  checkDone() {
    // 깃발(끝점)에 '손가락이 실제로' 도달해야 완료 — 판정 반경의 선행 커버에
    // 기대지 않고 포인터 위치로 판정해 "깃발을 찍어야 끝난다"는 체감과 일치시킨다.
    // 중간에 놓친 점은 관용 커버리지로 구제.
    const t = this.tracer;
    if (!this.lastPt || t.coverage < TUNING.roadEndCoverage) return;
    const end = t.sp(t.n - 1);
    if (Math.hypot(this.lastPt.x - end.x, this.lastPt.y - end.y) > t.R * 0.65) return;
    this.state = 'done';
    this.drawing = false;
    ui.setPill('');
    audio.success();

    const acc = this.tracer.accuracy;
    const stars = accToStars(acc);
    store.P.stars.road += stars;
    store.adapt('road', acc);
    const tr = this.tracer;
    const pts = [];
    for (let i = 0; i < tr.n; i += Math.max(1, Math.floor(tr.n / 20))) {
      const p = tr.samples[i];
      pts.push([Math.round(p.x / tr.aspect.w * 100), Math.round(p.y / tr.aspect.h * 100)]);
    }
    store.P.trails.push({ pts, hue: this.hue });
    if (store.P.trails.length > 5) store.P.trails.shift();
    store.save();

    // 무지개 길 + 친구가 폴짝폴짝 달려간다
    this.guideG.clear();
    this.strokeG.clear();
    this.roadG.clear();
    const rg = this.add.graphics().setDepth(11);
    for (let i = 1; i < tr.n; i++) {
      const a = tr.sp(i - 1), b = tr.sp(i);
      rg.lineStyle(tr.R * 0.5, Phaser.Display.Color.HSLToColor((i / tr.n) * 0.83, 0.85, 0.6).color, 1);
      rg.lineBetween(a.x, a.y, b.x, b.y);
    }
    const prog = { t: 0 };
    this.tweens.add({
      targets: prog, t: 1, duration: 2000, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const fi = prog.t * (tr.n - 1);
        const i0 = Math.floor(fi), i1 = Math.min(tr.n - 1, i0 + 1);
        const a = tr.sp(i0), b = tr.sp(i1);
        const f = fi - i0;
        this.walkerObj.setPosition(
          a.x + (b.x - a.x) * f,
          a.y + (b.y - a.y) * f - tr.R * 0.9 - Math.abs(Math.sin(prog.t * Math.PI * 7)) * tr.R * 0.5
        );
      },
      onComplete: () => {
        confettiBurst(this, this.scale.width / 2, this.scale.height * 0.3);
        this.time.delayedCall(350, () => {
          if (this._switching) return; // 홈 전환 중이면 축하 생략 (보상은 이미 저장됨)
          ui.celebrate({
            stars,
            msg: '내가 만든 길이 마을에 생겼어요!',
            speakMsg: '길이 마을에 생겼어요!',
            onAgain: () => this.scene.restart(),
          });
        });
      },
    });
  }

  update(now, delta) {
    this.bg.step(Math.min(0.05, (delta || 16) / 1000), this.scale.width);
    if (this.state !== 'trace') return;
    const tr = this.tracer;
    const g = this.guideG;
    g.clear();
    const dotR = clamp(tr.R * 0.2, 5, 10);
    const gap = Math.max(1, Math.round(tr.n / 46));
    const covColor = Phaser.Display.Color.HSLToColor(this.hue / 360, 0.8, 0.55).color;
    for (let i = 0; i < tr.n; i += gap) {
      const p = tr.sp(i);
      if (tr.covered[i]) {
        g.fillStyle(covColor, 1);
        g.fillCircle(p.x, p.y, dotR * 1.2);
      } else {
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(p.x, p.y, dotR);
        g.lineStyle(2, 0x000000, 0.13);
        g.strokeCircle(p.x, p.y, dotR);
      }
    }
    // 방향 화살표
    const arrowEvery = Math.max(6, Math.floor(tr.n / 6));
    g.fillStyle(0x2a7ab0, 0.32);
    for (let i = arrowEvery; i < tr.n - 4; i += arrowEvery) {
      if (tr.covered[i]) continue;
      const a = tr.sp(i), b = tr.sp(Math.min(tr.n - 1, i + 3));
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const s = dotR;
      g.save(); g.translateCanvas(a.x, a.y); g.rotateCanvas(ang);
      g.fillTriangle(s * 2.1, 0, -s, -s * 1.3, -s, s * 1.3);
      g.restore();
    }
    // 진행 지점 초록 펄스
    const startP = tr.sp(Math.min(tr.frontier, tr.n - 1));
    const pulse = 1 + Math.sin(now * 0.006) * 0.18;
    g.fillStyle(0x3cc864, 0.92);
    g.fillCircle(startP.x, startP.y, tr.R * 0.5 * pulse);
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(startP.x, startP.y, tr.R * 0.5 * pulse);
    // 친구가 진행 지점을 졸졸 따라온다
    this.walkerObj.setPosition(startP.x, startP.y - tr.R * 1.3);
    // 손가락 힌트
    if (now - tr.lastProgress > 5000) {
      const t = ((now - tr.lastProgress - 5000) % 2000) / 2000;
      const from = Math.min(tr.frontier, tr.n - 1);
      const to = Math.min(tr.n - 1, from + Math.floor(tr.n * 0.22));
      const hp = tr.sp(Math.round(from + (to - from) * t));
      this.hintHand.setAlpha(0.9).setPosition(hp.x + 10, hp.y + tr.R);
    } else this.hintHand.setAlpha(0);
  }
}
