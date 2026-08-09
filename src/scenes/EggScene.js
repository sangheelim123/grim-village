import { addSky, sparkleBurst, confettiBurst, textStyle, pressify } from './common.js';
import { Tracer, accToStars } from '../tracer.js';
import { store, newCreature, normalizeStrokes, nameCandidates } from '../store.js';
import { makeCreatureSprite } from '../creature.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { TUNING, CHAR_COLORS, PERSONALITIES, eulRl, rand, pick, clamp } from '../config.js';

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
};
/* 레벨별 후보 풀 — 발달 순서 유지, 최종 선택은 아이가 한다 */
const POOLS = [
  ['circle', 'oval', 'tri'],
  ['circle', 'oval', 'tri', 'square', 'drop'],
  ['circle', 'oval', 'tri', 'square', 'drop', 'heart', 'diamond'],
  ['oval', 'square', 'drop', 'heart', 'diamond', 'semi', 'star'],
  ['drop', 'heart', 'diamond', 'semi', 'star', 'circle', 'tri'],
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
      const pts = shape.gen();
      g.lineStyle(7, 0xff6b9a, 1);
      g.beginPath();
      pts.forEach((p, i) => {
        const x = (p.x - 0.5) * 120, y = (p.y - 0.5) * 120 - 14;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.strokePath();
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
  startTrace(key) {
    for (const c of this.pickCards) c.destroy();
    this.pickCards = [];
    this.shape = SHAPES[key];
    this.state = 'trace';
    this.strokes = [];
    this.stroke = null;
    this.mile = 0;
    const { width: w, height: h } = this.scale;
    if (this.guided) {
      // 닫힌 도형 — 방향·시작점 자유
      this.tracer = new Tracer(this.shape.gen(), { w: 1, h: 1 }, this.lvl, true, w, h);
      this.sampleTracer = null;
    } else {
      this.tracer = null;
      this.sampleTracer = new Tracer(this.shape.gen(), { w: 1, h: 1 }, this.lvl, false, w, h);
    }
    audio.pop(3);
    ui.setPill(`${eulRl(this.shape.name)} 그려 봐요!`);
    audio.speak(this.guided
      ? `${this.shape.voice}! 점선을 따라 알 위에 그려 주세요!`
      : `${this.shape.voice}! 견본을 보고 알 위에 그려 주세요!`);
    this.showDoneBtn();
    this.layout();
  }

  layout() {
    const { width: w, height: h } = this.scale;
    this.bg.sky.setDisplaySize(w, h);
    const m = Math.min(w, h);
    this.eggImg.setPosition(w / 2, h / 2 + 8).setScale(m * 0.0021);
    this.nestImg.setPosition(w / 2, h / 2 + this.eggImg.displayHeight * 0.44).setScale(m * 0.0019);
    if (this.tracer) this.tracer.fit(w, h);
    if (this.sampleTracer && this.state === 'trace') {
      this.sampleTracer.fit(w, h);
      const ss = m * 0.19;
      this.samplePanel.setVisible(true).setPosition(ss * 0.62 + 18, ss * 0.62 + 84).setDisplaySize(ss + 44, ss + 44);
      this.sampleG.clear();
      this.sampleG.lineStyle(5, 0xff9fb8, 1);
      const st = this.sampleTracer;
      this.sampleG.beginPath();
      st.samples.forEach((p, i) => {
        const x = 18 + 8 + (p.x / st.aspect.w) * ss;
        const y = 84 + 8 + (p.y / st.aspect.h) * ss;
        if (i === 0) this.sampleG.moveTo(x, y); else this.sampleG.lineTo(x, y);
      });
      this.sampleG.strokePath();
    }
    if (this.state === 'pick') this.layoutPick();
    this.redrawStrokes();
  }

  showDoneBtn() {
    ui.setActionBar('<button class="act-btn" id="egg-done">✅ 다 그렸어요!</button>');
    document.getElementById('egg-done').addEventListener('click', () => {
      const drawn = this.strokes.length > 0 || (this.stroke && this.stroke.length > 1);
      if (!drawn) { ui.guide('알 위에 그려 주세요!'); return; }
      this.finishTrace();
    });
  }

  onDown(p) {
    if (this.state !== 'trace' || this.stroke) return; // 이미 그리는 중이면 다른 손가락 무시
    this.drawId = p.id;
    this.stroke = [[p.x, p.y]];
    if (this.tracer) this.tracer.feed(p.x, p.y);
  }
  onMove(p) {
    if (this.state !== 'trace' || !this.stroke || p.id !== this.drawId) return;
    const prev = this.stroke[this.stroke.length - 1];
    this.stroke.push([p.x, p.y]);
    this.strokeG.lineStyle(Math.max(6, Math.min(this.scale.width, this.scale.height) * 0.015), 0xe06a9a, 1);
    this.strokeG.lineBetween(prev[0], prev[1], p.x, p.y);
    if (this.tracer) {
      this.tracer.feedSegment(prev[0], prev[1], p.x, p.y); // 빠른 스와이프 보간
      const step = Math.ceil(this.tracer.n / 8);
      const mile = Math.floor(this.tracer.coveredCount / step);
      if (mile > this.mile) { this.mile = mile; audio.pop(mile); }
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
    this.strokeG.lineStyle(Math.max(6, Math.min(this.scale.width, this.scale.height) * 0.015), 0xe06a9a, 1);
    for (const st of this.strokes) {
      for (let i = 1; i < st.length; i++) this.strokeG.lineBetween(st[i - 1][0], st[i - 1][1], st[i][0], st[i][1]);
    }
  }

  finishTrace() {
    if (this.stroke && this.stroke.length > 1) this.strokes.push(this.stroke);
    this.stroke = null;
    if (this.tracer) this.acc = this.tracer.accuracy;
    else this.acc = this.freehandAcc();
    // 점만 찍었으면 가이드 도형을 몸통으로 (유령 캐릭터 방지)
    const totalPts = this.strokes.reduce((s, st) => s + st.length, 0);
    if (totalPts < 6) {
      const src = this.tracer || this.sampleTracer;
      if (src) {
        const shapeStroke = [];
        for (let i = 0; i < src.n; i += 2) {
          const p = src.sp(i);
          shapeStroke.push([p.x, p.y]);
        }
        this.strokes.push(shapeStroke);
      }
    }
    audio.success();
    this.enterDecorate(Math.floor(rand(0, CHAR_COLORS.length)));
    // 효과음과 겹치지 않게 살짝 늦게 발화
    setTimeout(() => audio.speak('멋진 ' + this.shape.name + '! 색과 눈과 무늬를 골라 주세요!', { pri: 1 }), 350);
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
    const eyes = ['🙂', '🤩', '😌'].map((e, i) =>
      `<button class="pick-btn dc-e ${i === this.decorSel.e ? 'sel' : ''}" data-i="${i}">${e}</button>`).join('');
    const pats = ['—', '점', '볼', '줄'].map((t, i) =>
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
    audio.hatch();

    if (this.previewObj) this.previewObj.setVisible(false);
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
                msg: `${p.emoji} ${p.name} ${this.newChar.n}가 태어났어요! 마을에서 만나요!`,
                speakMsg: `${p.name} ${this.newChar.n}가 태어났어요!`,
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
    for (let i = 0; i < tr.n; i += gap) {
      const p = tr.sp(i);
      if (tr.covered[i]) {
        g.fillStyle(0xff6b9a, 1);
        g.fillCircle(p.x, p.y, dotR * 1.2);
      } else {
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(p.x, p.y, dotR);
        g.lineStyle(2, 0x000000, 0.13);
        g.strokeCircle(p.x, p.y, dotR);
      }
    }
    const pulseIdx = tr.firstUncovered();
    const startP = tr.sp(pulseIdx);
    const pulse = 1 + Math.sin(now * 0.006) * 0.18;
    g.fillStyle(0x3cc864, 0.92);
    g.fillCircle(startP.x, startP.y, tr.R * 0.5 * pulse);
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(startP.x, startP.y, tr.R * 0.5 * pulse);
    if (now - tr.lastProgress > 5000) {
      const t = ((now - tr.lastProgress - 5000) % 2000) / 2000;
      const from = pulseIdx;
      const to = Math.min(tr.n - 1, from + Math.floor(tr.n * 0.22));
      const hp = tr.sp(Math.round(from + (to - from) * t));
      this.hintHand.setAlpha(0.9).setPosition(hp.x + 10, hp.y + tr.R);
    } else this.hintHand.setAlpha(0);
  }
}
