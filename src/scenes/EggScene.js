import { addSky, sparkleBurst, confettiBurst, textStyle, pressify } from './common.js';
import { Tracer, MultiTracer, tracerParts, resamplePath, accToStars } from '../tracer.js';
import { store, newCreature, normalizeStrokes, nameCandidates } from '../store.js';
import { makeCreatureSprite } from '../creature.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { TUNING, CHAR_COLORS, PERSONALITIES, TRACE_PRAISE, MID_CHEER, eulRl, iGa, pickVary, rand, pick, clamp } from '../config.js';

/* 바운딩 박스를 0.08~0.92 상자에 맞춘다 (도형 생성 헬퍼) */
function normPts(pts) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const s = 0.84 / Math.max(maxX - minX, maxY - minY);
  const ox = 0.5 - (minX + maxX) / 2 * s, oy = 0.5 - (minY + maxY) / 2 * s;
  return pts.map(p => ({ x: p.x * s + ox, y: p.y * s + oy }));
}

const SHAPES = {
  circle: { name: '동그라미', voice: '동글동글 동그라미', gen: () => {
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = -Math.PI / 2 + (i / 72) * Math.PI * 2;
      pts.push({ x: 0.5 + 0.42 * Math.cos(a), y: 0.5 + 0.42 * Math.sin(a) });
    }
    return pts;
  } },
  oval: { name: '타원', voice: '길쭉길쭉 타원', gen: () => {
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = -Math.PI / 2 + (i / 72) * Math.PI * 2;
      pts.push({ x: 0.5 + 0.34 * Math.cos(a), y: 0.5 + 0.44 * Math.sin(a) });
    }
    return pts;
  } },
  tri: { name: '세모', voice: '뾰족뾰족 세모', gen: () =>
    [[0.5, 0.08], [0.92, 0.88], [0.08, 0.88], [0.5, 0.08]].map(p => ({ x: p[0], y: p[1] })) },
  square: { name: '네모', voice: '반듯반듯 네모', gen: () =>
    [[0.12, 0.12], [0.88, 0.12], [0.88, 0.88], [0.12, 0.88], [0.12, 0.12]].map(p => ({ x: p[0], y: p[1] })) },
  drop: { name: '물방울', voice: '똑똑 물방울', gen: () => {
    const pts = [{ x: 0.5, y: 0.08 }];
    for (let i = 0; i <= 10; i++) { // 오른쪽 곡선
      const t = i / 10;
      const x = (1 - t) * (1 - t) * 0.5 + 2 * (1 - t) * t * 0.8 + t * t * 0.78;
      const y = (1 - t) * (1 - t) * 0.08 + 2 * (1 - t) * t * 0.36 + t * t * 0.62;
      pts.push({ x, y });
    }
    for (let i = 0; i <= 24; i++) { // 아래 반원
      const a = (i / 24) * Math.PI;
      pts.push({ x: 0.5 + 0.28 * Math.cos(a), y: 0.62 + 0.28 * Math.sin(a) });
    }
    for (let i = 0; i <= 10; i++) { // 왼쪽 곡선
      const t = i / 10;
      const x = (1 - t) * (1 - t) * 0.22 + 2 * (1 - t) * t * 0.2 + t * t * 0.5;
      const y = (1 - t) * (1 - t) * 0.62 + 2 * (1 - t) * t * 0.36 + t * t * 0.08;
      pts.push({ x, y });
    }
    return pts;
  } },
  heart: { name: '하트', voice: '사랑사랑 하트', gen: () => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * Math.PI * 2;
      pts.push({
        x: 16 * Math.pow(Math.sin(t), 3),
        y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
      });
    }
    return normPts(pts);
  } },
  diamond: { name: '다이아몬드', voice: '반짝반짝 다이아몬드', gen: () =>
    [[0.5, 0.06], [0.88, 0.5], [0.5, 0.94], [0.12, 0.5], [0.5, 0.06]].map(p => ({ x: p[0], y: p[1] })) },
  semi: { name: '반원', voice: '둥근 반원', gen: () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI - (i / 40) * Math.PI;
      pts.push({ x: 0.5 + 0.42 * Math.cos(a), y: 0.72 - 0.42 * Math.sin(a) });
    }
    pts.push({ x: 0.08, y: 0.72 });
    return pts;
  } },
  star: { name: '별', voice: '반짝반짝 별', gen: () => {
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 4 / 5);
      pts.push({ x: 0.5 + 0.44 * Math.cos(a), y: 0.5 + 0.44 * Math.sin(a) });
    }
    return pts;
  } },
  /* 다획 도형 — gen()이 획 배열을 돌려준다 (multi: true). 획 순서·방향 자유 */
  cross: { name: '십자', voice: '반듯반듯 십자', multi: true, gen: () => [
    [{ x: 0.5, y: 0.08 }, { x: 0.5, y: 0.92 }],
    [{ x: 0.08, y: 0.5 }, { x: 0.92, y: 0.5 }],
  ] },
  x: { name: '엑스', voice: '쓱싹쓱싹 엑스', multi: true, gen: () => [
    [{ x: 0.14, y: 0.12 }, { x: 0.86, y: 0.88 }],
    [{ x: 0.86, y: 0.12 }, { x: 0.14, y: 0.88 }],
  ] },
  house: { name: '집', voice: '뾰족 지붕 집', multi: true, gen: () => [
    [[0.16, 0.48], [0.84, 0.48], [0.84, 0.94], [0.16, 0.94], [0.16, 0.48]].map(p => ({ x: p[0], y: p[1] })),
    [[0.16, 0.48], [0.5, 0.08], [0.84, 0.48]].map(p => ({ x: p[0], y: p[1] })),
  ] },
  moon: { name: '초승달', voice: '스르르 초승달', gen: () => {
    const pts = [];
    for (let i = 0; i <= 50; i++) { // 바깥 호: 아래 뿔(65°) → 왼쪽 → 위 뿔(295°)
      const a = (65 + (i / 50) * 230) * Math.PI / 180;
      pts.push({ x: 0.5 + 0.44 * Math.cos(a), y: 0.5 + 0.44 * Math.sin(a) });
    }
    const A = pts[pts.length - 1], B = pts[0];
    for (let i = 1; i <= 24; i++) { // 안쪽 파인 곡선: 위 뿔 → 아래 뿔
      const t = i / 24;
      pts.push({
        x: (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * 0.22 + t * t * B.x,
        y: (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * 0.5 + t * t * B.y,
      });
    }
    return normPts(pts);
  } },
  flower: { name: '꽃', voice: '활짝활짝 꽃', gen: () => {
    const pts = [];
    for (let i = 0; i <= 120; i++) { // 꽃잎 6장: 바깥으로만 볼록한 스캘럽 (데이지 꽃머리)
      const a = -Math.PI / 2 + (i / 120) * Math.PI * 2;
      const r = 0.3 + 0.12 * Math.abs(Math.sin(a * 3));
      pts.push({ x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) });
    }
    return pts;
  } },
};
/* 레벨별 후보 풀 — 그리기 발달 순서(원3세→십자4세→네모4.5세→엑스5세→세모5.5세→마름모6~7세)를
   따르되, 최종 선택은 아이가 한다. 다획 도형(십자·엑스)은 가이드 레벨(1~3)에서 획마다 점선을 준다 */
const POOLS = [
  ['circle', 'oval', 'square'],
  ['circle', 'oval', 'square', 'cross', 'tri', 'drop'],
  ['square', 'cross', 'tri', 'drop', 'x', 'heart', 'moon'],
  ['tri', 'drop', 'x', 'heart', 'moon', 'diamond', 'flower', 'semi'],
  ['heart', 'moon', 'diamond', 'flower', 'semi', 'star', 'house'],
];

export class EggScene extends Phaser.Scene {
  constructor() { super('Egg'); }

  init(data) { this.fromDraw = data && data.strokes ? data : null; }

  create() {
    ui.topButtons('play');
    this.cameras.main.fadeIn(250, 255, 255, 255);
    this.bg = addSky(this, { clouds: 2 });
    this.bg.sky.setTint(0xffe8f0);

    this.nestImg = this.add.image(0, 0, 'nest').setDepth(4);
    this.eggImg = this.add.image(0, 0, 'egg_big').setDepth(5);
    this.guideG = this.add.graphics().setDepth(10);
    this.strokeG = this.add.graphics().setDepth(12);
    this.sampleG = this.add.graphics().setDepth(10);
    this.samplePanel = this.add.image(0, 0, 'panel').setDepth(9).setVisible(false);
    this.hintHand = this.add.image(0, 0, 'hand').setDepth(30).setAlpha(0).setAngle(-15).setScale(0.75);

    this.previewObj = null;
    this.strokes = [];
    this.stroke = null;
    this.mile = 0;
    this.pickCards = [];

    if (this.fromDraw) {
      // 그림 놀이터에서 온 자유 그림 → 바로 꾸미기 (평가 없음)
      this.shape = { name: '그림', voice: '멋진 그림' };
      this.origin = 'draw';
      this.tracer = null; this.sampleTracer = null;
      this.strokes = this.fromDraw.strokes;
      this.acc = null;
      this.state = 'none';
      this.enterDecorate(this.fromDraw.color || 0);
    } else {
      this.origin = 'egg';
      this.lvl = store.lvlOf('egg');
      this.guided = this.lvl <= 3;
      this.enterPick();
    }

    this.drawId = null; // 그리는 손가락 하나만 따라간다 (손바닥·둘째 손가락 무시)
    this.input.on('pointerdown', p => this.onDown(p));
    this.input.on('pointermove', p => this.onMove(p));
    this.input.on('pointerup', p => this.onUp(p));
    this.input.on('pointerupoutside', p => this.onUp(p));

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      if (this.previewObj && this.previewObj.destroyTexture) this.previewObj.destroyTexture();
    });
  }

  repeatVoice() {
    if (this.state === 'pick') audio.speak('그리고 싶은 도형을 골라 주세요!');
    else if (this.state === 'decorate') audio.speak('색과 눈과 무늬를 골라 주세요!');
    else if (this.state === 'soul') audio.speak('성격과 이름을 골라 주세요!');
    else if (this.shape) audio.speak(`${eulRl(this.shape.voice)} 알 위에 그려 주세요!`);
  }

  /* ---------- 1단계: 도형 선택 — 무엇을 그릴지는 아이가 정한다 ---------- */
  enterPick() {
    this.state = 'pick';
    const pool = POOLS[this.lvl - 1];
    const cand = Phaser.Utils.Array.Shuffle(pool.slice()).slice(0, 3);
    this.pickCards = cand.map(key => {
      const shape = SHAPES[key];
      const cont = this.add.container(0, 0).setDepth(20);
      const panel = this.add.image(0, 0, 'panel').setDisplaySize(180, 210);
      const g = this.add.graphics();
      const strokes = shape.multi ? shape.gen() : [shape.gen()];
      g.lineStyle(7, 0xff6b9a, 1);
      for (const pts of strokes) {
        g.beginPath();
        pts.forEach((p, i) => {
          const x = (p.x - 0.5) * 120, y = (p.y - 0.5) * 120 - 14;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        });
        g.strokePath();
      }
      const label = this.add.text(0, 74, shape.name, textStyle(23)).setOrigin(0.5);
      cont.add([panel, g, label]);
      cont.setSize(180, 210);
      cont.shapeKey = key;
      pressify(this, cont, () => this.startTrace(key));
      this.tweens.add({
        targets: cont, y: '+=7', duration: rand(1500, 2100), yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return cont;
    });
    ui.setPill('무엇을 그려 볼까요?');
    audio.speak('오늘은 무엇을 그려 볼까요? 그리고 싶은 도형을 골라 주세요!');
    this.layoutPick();
  }
  layoutPick() {
    const { width: w, height: h } = this.scale;
    const sc = clamp(Math.min(w / 640, h / 480), 0.62, 1.15);
    this.pickCards.forEach((c, i) => {
      c.setScale(sc).setPosition(w / 2 + (i - 1) * (200 * sc), h * 0.52);
    });
  }

  /* ---------- 2단계: 그리기 ---------- */
  makeTracer() {
    const { width: w, height: h } = this.scale;
    const g = this.shape.gen();
    const raw = this.shape.multi ? g : [g];
    // 획 하나면 기존 Tracer 그대로 (방향·시작점 자유), 여러 획이면 MultiTracer
    return raw.length > 1
      ? new MultiTracer(raw, { w: 1, h: 1 }, this.lvl, true, w, h)
      : new Tracer(raw[0], { w: 1, h: 1 }, this.lvl, true, w, h);
  }
  startTrace(key) {
    for (const c of this.pickCards) c.destroy();
    this.pickCards = [];
    this.shape = SHAPES[key];
    this.state = 'trace';
    this.strokes = [];
    this.stroke = null;
    this.mile = 0;
    this.halfCheered = false;
    // 기억 그리기(레벨 5 견본 모드): 견본을 잠깐 보여 주고 살짝 숨긴다 — 언제든 다시 볼 수 있다
    this.memoryMode = !this.guided && this.lvl >= 5;
    this.sampleHidden = false;
    if (this.guided) {
      this.tracer = this.makeTracer();
      this.sampleTracer = null;
    } else {
      this.tracer = null;
      this.sampleTracer = this.makeTracer();
      if (this.memoryMode) {
        this.time.delayedCall(TUNING.memoryShowMs, () => this.hideSample());
      }
    }
    audio.pop(3);
    ui.setPill(`${eulRl(this.shape.name)} 그려 봐요!`);
    audio.speak(this.guided
      ? `${this.shape.voice}! 점선을 따라 알 위에 그려 주세요!`
      : this.memoryMode
        ? `${this.shape.voice}! 견본을 잘 기억해 두세요! 조금 있다가 숨을 거예요!`
        : `${this.shape.voice}! 견본을 보고 알 위에 그려 주세요!`);
    this.showDoneBtn();
    this.layout();
  }

  /* 기억 그리기: 견본 숨기기 / 살짝 보기 */
  hideSample() {
    if (this.state !== 'trace' || !this.memoryMode || this.sampleHidden) return;
    this.sampleHidden = true;
    this.layout();
    audio.pop(2);
    audio.speak('이제 기억해서 그려 봐요! 궁금하면 눈 버튼을 눌러요!', { pri: 1 });
  }
  peekSample() {
    if (this.state !== 'trace' || !this.memoryMode || !this.sampleHidden) return;
    this.sampleHidden = false;
    this.layout();
    audio.pop(3);
    this.time.delayedCall(TUNING.memoryPeekMs, () => this.hideSample());
  }

  layout() {
    const { width: w, height: h } = this.scale;
    this.bg.sky.setDisplaySize(w, h);
    const m = Math.min(w, h);
    this.eggImg.setPosition(w / 2, h / 2 + 8).setScale(m * 0.0021);
    this.nestImg.setPosition(w / 2, h / 2 + this.eggImg.displayHeight * 0.44).setScale(m * 0.0019);
    if (this.tracer) {
      // 회전·리사이즈 시 그리던 획을 가이드의 새 위치·크기로 함께 옮긴다
      // (안 그러면 점선만 이동하고 아이의 선은 옛 자리에 남는다)
      const ref = tracerParts(this.tracer)[0];
      const old = { s: ref.scale, ox: ref.ox, oy: ref.oy };
      this.tracer.fit(w, h);
      if (this.state === 'trace' && old.s > 0 &&
          (old.s !== ref.scale || old.ox !== ref.ox || old.oy !== ref.oy)) {
        const map = q => [
          (q[0] - old.ox) / old.s * ref.scale + ref.ox,
          (q[1] - old.oy) / old.s * ref.scale + ref.oy,
        ];
        this.strokes = this.strokes.map(st => st.map(map));
        if (this.stroke) this.stroke = this.stroke.map(map);
      }
    } else if (this.state === 'trace' && this._lastW && (this._lastW !== w || this._lastH !== h)) {
      // 견본 모드(가이드 없음): 비율 유지로 화면에 맞춘다
      const sc = Math.min(w / this._lastW, h / this._lastH);
      const ox = (w - this._lastW * sc) / 2, oy = (h - this._lastH * sc) / 2;
      const map = q => [q[0] * sc + ox, q[1] * sc + oy];
      this.strokes = this.strokes.map(st => st.map(map));
      if (this.stroke) this.stroke = this.stroke.map(map);
    }
    this._lastW = w; this._lastH = h;
    if (this.sampleTracer && this.state === 'trace') {
      this.sampleTracer.fit(w, h);
      const ss = m * 0.19;
      this.sampleG.clear();
      if (this.sampleHidden) {
        this.samplePanel.setVisible(false);
      } else {
        this.samplePanel.setVisible(true).setPosition(ss * 0.62 + 18, ss * 0.62 + 84).setDisplaySize(ss + 44, ss + 44);
        this.sampleG.lineStyle(5, 0xff9fb8, 1);
        for (const part of tracerParts(this.sampleTracer)) {
          this.sampleG.beginPath();
          part.samples.forEach((p, i) => {
            const x = 18 + 8 + (p.x / part.aspect.w) * ss;
            const y = 84 + 8 + (p.y / part.aspect.h) * ss;
            if (i === 0) this.sampleG.moveTo(x, y); else this.sampleG.lineTo(x, y);
          });
          this.sampleG.strokePath();
        }
      }
    }
    if (this.state === 'pick') this.layoutPick();
    this.redrawStrokes();
  }

  showDoneBtn() {
    const peek = this.memoryMode ? '<button class="act-btn small blue" id="egg-peek">👀</button>' : '';
    ui.setActionBar(`<button class="act-btn small blue" id="egg-undo">↩️</button>${peek}
      <button class="act-btn" id="egg-done">✅ 다 그렸어요!</button>`);
    document.getElementById('egg-undo').addEventListener('click', () => this.undoStroke());
    if (this.memoryMode) document.getElementById('egg-peek').addEventListener('click', () => this.peekSample());
    document.getElementById('egg-done').addEventListener('click', () => {
      const drawn = this.strokes.length > 0 || (this.stroke && this.stroke.length > 1);
      if (!drawn) { ui.guide('알 위에 그려 주세요!'); return; }
      this.finishTrace();
    });
  }

  /* 마지막 획 되돌리기 — 실수해도 처음부터 다시 그릴 필요가 없다.
     판정은 남은 획을 새 트레이서에 다시 먹여 정직하게 재계산한다. */
  undoStroke() {
    if (this.state !== 'trace') return;
    if (this.stroke) { this.stroke = null; this.drawId = null; }
    else if (this.strokes.length) this.strokes.pop();
    else { audio.boing(); return; }
    if (this.tracer) {
      this.tracer = this.makeTracer();
      for (const st of this.strokes) {
        this.tracer.feed(st[0][0], st[0][1]);
        for (let i = 1; i < st.length; i++) this.tracer.feedSegment(st[i - 1][0], st[i - 1][1], st[i][0], st[i][1]);
      }
      const step = Math.ceil(this.tracer.n / 8);
      this.mile = Math.floor(this.tracer.coveredCount / step);
      this.halfCheered = this.tracer.coverage >= 0.5;
    }
    this.redrawStrokes();
    audio.whoosh();
  }

  brushW() { return Math.max(6, Math.min(this.scale.width, this.scale.height) * 0.015); }

  onDown(p) {
    if (this.state !== 'trace' || this.stroke) return; // 이미 그리는 중이면 다른 손가락 무시
    this.drawId = p.id;
    this.stroke = [[p.x, p.y]];
    this.strokeG.fillStyle(0xe06a9a, 1);
    this.strokeG.fillCircle(p.x, p.y, this.brushW() / 2);
    if (this.tracer) this.tracer.feed(p.x, p.y);
  }
  onMove(p) {
    if (this.state !== 'trace' || !this.stroke || p.id !== this.drawId) return;
    const prev = this.stroke[this.stroke.length - 1];
    this.stroke.push([p.x, p.y]);
    const bw = this.brushW();
    this.strokeG.lineStyle(bw, 0xe06a9a, 1);
    this.strokeG.lineBetween(prev[0], prev[1], p.x, p.y);
    // 꺾이는 자리마다 동그란 마디를 채워 두꺼운 선의 각짐을 없앤다
    this.strokeG.fillStyle(0xe06a9a, 1);
    this.strokeG.fillCircle(p.x, p.y, bw / 2);
    if (this.tracer) {
      this.tracer.feedSegment(prev[0], prev[1], p.x, p.y); // 빠른 스와이프 보간
      const step = Math.ceil(this.tracer.n / 8);
      const mile = Math.floor(this.tracer.coveredCount / step);
      if (mile > this.mile) {
        this.mile = mile;
        audio.pop(mile);
        sparkleBurst(this, p.x, p.y, 4); // 손끝에서 반짝 — 진행이 눈에 보인다
      }
      if (!this.halfCheered && this.tracer.coverage >= 0.5) {
        this.halfCheered = true;
        audio.speak(pickVary(MID_CHEER), { pri: 2 }); // 다른 소리 중이면 조용히 스킵
      }
      // 드래그 중에는 절대 완료를 선언하지 않는다 — 아이의 손이 먼저다
    }
  }
  onUp(p) {
    if (!this.stroke || (p && p.id !== this.drawId)) return;
    this.drawId = null;
    if (this.stroke.length > 1) this.strokes.push(this.stroke);
    else {
      const q = this.stroke[0];
      this.strokes.push([q, [q[0] + 2, q[1] + 2]]);
    }
    this.stroke = null;
    // 완료 판정은 손을 뗀 순간에만 — "다 그렸다"는 감각과 일치
    if (this.state === 'trace' && this.tracer && this.tracer.coverage >= TUNING.eggAutoFinish) {
      this.finishTrace();
    }
  }

  redrawStrokes() {
    this.strokeG.clear();
    if (this.state !== 'trace') return;
    const bw = this.brushW();
    this.strokeG.lineStyle(bw, 0xe06a9a, 1);
    this.strokeG.fillStyle(0xe06a9a, 1);
    for (const st of this.strokes) {
      this.strokeG.fillCircle(st[0][0], st[0][1], bw / 2);
      for (let i = 1; i < st.length; i++) {
        this.strokeG.lineBetween(st[i - 1][0], st[i - 1][1], st[i][0], st[i][1]);
        this.strokeG.fillCircle(st[i][0], st[i][1], bw / 2);
      }
    }
  }

  finishTrace() {
    if (this.stroke && this.stroke.length > 1) this.strokes.push(this.stroke);
    this.stroke = null;
    if (this.tracer) this.acc = this.tracer.accuracy;
    else this.acc = this.shape.multi ? this.sampleFitAcc() : this.freehandAcc();
    // 점만 찍었으면 가이드 도형을 몸통으로 (유령 캐릭터 방지)
    const totalPts = this.strokes.reduce((s, st) => s + st.length, 0);
    if (totalPts < 6) {
      const src = this.tracer || this.sampleTracer;
      if (src) {
        for (const part of tracerParts(src)) {
          const shapeStroke = [];
          for (let i = 0; i < part.n; i += 2) {
            const p = part.sp(i);
            shapeStroke.push([p.x, p.y]);
          }
          this.strokes.push(shapeStroke);
        }
      }
    }
    audio.success();
    this.enterDecorate(Math.floor(rand(0, CHAR_COLORS.length)));
    // 정확도에 따라 표현만 다른 칭찬 — 낮아도 "끝까지 해냈다"를 칭찬한다 (실패 없음)
    const pool = this.acc == null ? TRACE_PRAISE.mid
      : this.acc >= TUNING.starAcc[1] ? TRACE_PRAISE.hi
        : this.acc >= TUNING.starAcc[0] ? TRACE_PRAISE.mid : TRACE_PRAISE.low;
    // 효과음과 겹치지 않게 살짝 늦게 발화
    setTimeout(() => audio.speak(`멋진 ${this.shape.name}! ${pickVary(pool)} 이제 색과 눈과 무늬를 골라요!`, { pri: 1 }), 350);
  }

  /* 견본 모드의 다획 도형(엑스·집): 시작-끝 닫힘 휴리스틱은 열린 획을 부당하게
     벌점 주므로, 모델을 아이 그림의 바운딩 박스에 얹어 '닮음'만 관대하게 본다 */
  sampleFitAcc() {
    const all = this.strokes.flat();
    if (all.length < 6) return 0.5;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of all) {
      minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
    }
    const bw = Math.max(8, maxX - minX), bh = Math.max(8, maxY - minY);
    const R = Math.max(bw, bh) * 0.18;
    const raw = this.shape.multi ? this.shape.gen() : [this.shape.gen()];
    let mnX = 1e9, mnY = 1e9, mxX = -1e9, mxY = -1e9;
    for (const st of raw) for (const p of st) {
      mnX = Math.min(mnX, p.x); mnY = Math.min(mnY, p.y);
      mxX = Math.max(mxX, p.x); mxY = Math.max(mxY, p.y);
    }
    const mw = mxX - mnX || 1, mh = mxY - mnY || 1;
    let hit = 0, total = 0;
    for (const st of raw) {
      for (const mp of resamplePath(st, 24)) {
        const x = minX + (mp.x - mnX) / mw * bw;
        const y = minY + (mp.y - mnY) / mh * bh;
        total++;
        let best = Infinity;
        for (const p of all) {
          const d = Math.hypot(p[0] - x, p[1] - y);
          if (d < best) best = d;
        }
        if (best <= R) hit++;
      }
    }
    return clamp(0.4 + 0.6 * (hit / total), 0.4, 1);
  }

  freehandAcc() {
    const all = this.strokes.flat();
    if (all.length < 6) return 0.5;
    const st = all[0], en = all[all.length - 1];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of all) {
      minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
    }
    const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
    const closed = Math.hypot(en[0] - st[0], en[1] - st[1]) / diag;
    return clamp(1 - closed * 0.8, 0.4, 1);
  }

  /* ---------- 3단계: 꾸미기 (모습) ---------- */
  enterDecorate(colorIdx) {
    this.state = 'decorate';
    this.decorSel = { c: colorIdx % CHAR_COLORS.length, e: 0, pt: 0, p: 0 };
    this.nameOptions = nameCandidates();
    this.nameSel = 0;
    this.guideG.clear();
    this.strokeG.clear();
    this.sampleG.clear();
    this.samplePanel.setVisible(false);
    this.hintHand.setAlpha(0);
    ui.setPill('어떤 모습일까요?');
    if (this.fromDraw) audio.speak('색과 눈과 무늬를 골라 주세요!');
    this.refreshPreview();
    this.showLookBar();
  }

  refreshPreview() {
    if (this.previewObj) { this.previewObj.destroyTexture && this.previewObj.destroyTexture(); this.previewObj.destroy(); }
    const pv = {
      s: normalizeStrokes(this.strokes),
      c: this.decorSel.c, e: this.decorSel.e, pt: this.decorSel.pt, g: 1, b: Date.now(),
    };
    const size = this.eggImg.displayHeight * 0.5;
    this.previewObj = makeCreatureSprite(this, pv, size);
    this.previewObj.setPosition(this.eggImg.x, this.eggImg.y - 6).setDepth(15);
    this.tweens.add({ targets: this.previewObj, angle: 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  showLookBar() {
    const colors = CHAR_COLORS.map((col, i) =>
      `<button class="pick-btn dc-c ${i === this.decorSel.c ? 'sel' : ''}" data-i="${i}" style="background:${col}"></button>`).join('');
    const eyes = ['🙂', '🤩', '😌', '😄'].map((e, i) =>
      `<button class="pick-btn dc-e ${i === this.decorSel.e ? 'sel' : ''}" data-i="${i}">${e}</button>`).join('');
    const pats = ['—', '점', '볼', '줄', '♥', '★'].map((t, i) =>
      `<button class="pick-btn dc-p ${i === this.decorSel.pt ? 'sel' : ''}" data-i="${i}">${t}</button>`).join('');
    ui.setActionBar(`${colors}<span style="width:8px"></span>${eyes}<span style="width:8px"></span>${pats}
      <button class="act-btn" id="egg-next">다음 ➡</button>`);
    document.querySelectorAll('.dc-c').forEach(b => b.addEventListener('click', () => {
      this.decorSel.c = +b.dataset.i; this.showLookBar(); this.refreshPreview(); audio.pop(2);
    }));
    document.querySelectorAll('.dc-e').forEach(b => b.addEventListener('click', () => {
      this.decorSel.e = +b.dataset.i; this.showLookBar(); this.refreshPreview(); audio.pop(3);
    }));
    document.querySelectorAll('.dc-p').forEach(b => b.addEventListener('click', () => {
      this.decorSel.pt = +b.dataset.i; this.showLookBar(); this.refreshPreview(); audio.pop(4);
    }));
    document.getElementById('egg-next').addEventListener('click', () => this.enterSoul());
  }

  /* ---------- 4단계: 마음 (성격 + 이름 — 영혼도 아이가 정한다) ---------- */
  enterSoul() {
    this.state = 'soul';
    ui.setPill('어떤 친구일까요?');
    audio.speak('성격과 이름을 골라 주세요!');
    audio.pop(5);
    this.showSoulBar();
  }
  showSoulBar() {
    const pers = PERSONALITIES.map((p, i) =>
      `<button class="soul-btn dc-pp ${i === this.decorSel.p ? 'sel' : ''}" data-i="${i}">${p.emoji} ${p.name}</button>`).join('');
    const names = this.nameOptions.map((n, i) =>
      `<button class="soul-btn dc-n ${i === this.nameSel ? 'sel' : ''}" data-i="${i}">${n}</button>`).join('');
    ui.setActionBar(`${pers}<span style="width:10px"></span>${names}
      <button class="act-btn" id="egg-hatch">🐣 태어나라!</button>`);
    document.querySelectorAll('.dc-pp').forEach(b => b.addEventListener('click', () => {
      this.decorSel.p = +b.dataset.i;
      this.showSoulBar();
      const p = PERSONALITIES[this.decorSel.p];
      audio.speak(`${p.name}! ${p.desc}`, { pri: 1 });
      audio.pop(3);
    }));
    document.querySelectorAll('.dc-n').forEach(b => b.addEventListener('click', () => {
      this.nameSel = +b.dataset.i;
      this.showSoulBar();
      audio.speak(this.nameOptions[this.nameSel], { pri: 1 });
      audio.pop(4);
    }));
    document.getElementById('egg-hatch').addEventListener('click', () => this.hatch());
  }

  hatch() {
    if (this.state !== 'soul') return;
    this.state = 'hatch';
    ui.setActionBar('');
    ui.setPill('');
    const char = newCreature(this.strokes, this.decorSel.c, this.decorSel.e, this.decorSel.pt,
      this.origin, this.nameOptions[this.nameSel], this.decorSel.p);
    this.newChar = char;
    // 버튼을 누른 순간 즉시 저장 — 연출 중 나가도 캐릭터는 절대 사라지지 않는다
    store.addCreature(char);
    if (this.origin === 'draw' || this.acc == null) {
      this.pendingStars = null;
    } else {
      this.pendingStars = accToStars(this.acc);
      store.P.stars.egg += this.pendingStars;
      store.adapt('egg', this.acc);
    }
    store.flush();

    if (this.previewObj) this.previewObj.setVisible(false);
    // 탄생 리플레이: 아이가 그린 순서 그대로 금빛 선이 되살아난다 —
    // "이 친구는 네 손에서 나왔다"를 말없이 보여 주는 1초
    const total = this.strokes.reduce((s, st) => s + st.length, 0);
    const rg = this.add.graphics().setDepth(20);
    const prog = { t: 0 };
    audio.whoosh();
    this.tweens.add({
      targets: prog, t: 1, duration: 1100, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const upto = Math.max(1, Math.floor(total * prog.t));
        rg.clear();
        rg.lineStyle(7, 0xffd76a, 0.95);
        rg.fillStyle(0xffd76a, 0.95);
        let n = 0, head = null;
        for (const st of this.strokes) {
          if (n >= upto) break;
          rg.fillCircle(st[0][0], st[0][1], 3.5);
          head = st[0];
          for (let i = 1; i < st.length && n + i < upto; i++) {
            rg.lineBetween(st[i - 1][0], st[i - 1][1], st[i][0], st[i][1]);
            rg.fillCircle(st[i][0], st[i][1], 3.5);
            head = st[i];
          }
          n += st.length;
        }
        if (head) { // 선두의 빛 방울
          rg.fillStyle(0xfff2b0, 0.9);
          rg.fillCircle(head[0], head[1], 10);
        }
      },
      onComplete: () => {
        sparkleBurst(this, this.eggImg.x, this.eggImg.y, 10);
        this.tweens.add({ targets: rg, alpha: 0, duration: 450, onComplete: () => rg.destroy() });
        audio.hatch();
        this.startHatchShake();
      },
    });
  }

  startHatchShake() {
    this.tweens.add({
      targets: this.eggImg, angle: { from: -5, to: 5 }, duration: 90, yoyo: true, repeat: 7,
      onComplete: () => {
        this.eggImg.setAngle(0);
        sparkleBurst(this, this.eggImg.x, this.eggImg.y, 16);
        this.tweens.add({ targets: this.eggImg, scaleY: this.eggImg.scaleY * 0.75, alpha: 0.3, duration: 260, ease: 'Quad.easeIn' });
        const born = makeCreatureSprite(this, this.newChar, this.eggImg.displayHeight * 0.55);
        born.setPosition(this.eggImg.x, this.eggImg.y + 20).setDepth(16).setScale(0.3);
        this.bornObj = born;
        this.tweens.add({
          targets: born, scale: 1, y: this.eggImg.y - 16, duration: 520, ease: 'Back.easeOut',
          onComplete: () => {
            confettiBurst(this, this.scale.width / 2, this.scale.height * 0.3);
            const p = PERSONALITIES[this.newChar.p % 3];
            this.time.delayedCall(500, () => {
              if (this._switching) return; // 홈 전환 중이면 축하 생략 (캐릭터는 이미 저장됨)
              ui.celebrate({
                stars: this.pendingStars,
                char: this.newChar,
                msg: `${p.emoji} ${p.name} ${iGa(this.newChar.n)} 태어났어요! 마을에서 만나요!`,
                speakMsg: `${p.name} ${iGa(this.newChar.n)} 태어났어요!`,
                onAgain: () => this.scene.restart({}),
              });
            });
          },
        });
      },
    });
  }

  update(now) {
    if (this.state !== 'trace' || !this.tracer) {
      if (this.hintHand) this.hintHand.setAlpha(0);
      return;
    }
    const tr = this.tracer;
    const g = this.guideG;
    g.clear();
    const dotR = clamp(tr.R * 0.2, 5, 10);
    const gap = Math.max(1, Math.round(tr.n / 46));
    for (const part of tracerParts(tr)) {
      for (let i = 0; i < part.n; i += gap) {
        const p = part.sp(i);
        if (part.covered[i]) {
          g.fillStyle(0xff6b9a, 1);
          g.fillCircle(p.x, p.y, dotR * 1.2);
        } else {
          g.fillStyle(0xffffff, 0.95);
          g.fillCircle(p.x, p.y, dotR);
          g.lineStyle(2, 0x000000, 0.13);
          g.strokeCircle(p.x, p.y, dotR);
        }
      }
    }
    // 펄스·힌트는 아직 덜 채운 첫 획 기준
    const act = tr.activePart || tr;
    const pulseIdx = act.firstUncovered();
    const startP = act.sp(pulseIdx);
    const pulse = 1 + Math.sin(now * 0.006) * 0.18;
    g.fillStyle(0x3cc864, 0.92);
    g.fillCircle(startP.x, startP.y, tr.R * 0.5 * pulse);
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(startP.x, startP.y, tr.R * 0.5 * pulse);
    if (now - tr.lastProgress > 5000) {
      const t = ((now - tr.lastProgress - 5000) % 2000) / 2000;
      const from = pulseIdx;
      const to = Math.min(act.n - 1, from + Math.floor(act.n * 0.22));
      const hp = act.sp(Math.round(from + (to - from) * t));
      this.hintHand.setAlpha(0.9).setPosition(hp.x + 10, hp.y + tr.R);
    } else this.hintHand.setAlpha(0);
  }
}
