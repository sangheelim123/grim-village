import { sparkleBurst, heartBurst } from './common.js';
import { store } from '../store.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { DRAW_COLORS, DRAW_CHEER, RAINBOW, rand, pick, pickVary, clamp } from '../config.js';

/* ==========================================================================
   수족관 섬 — 그린 그림이 색 그대로 물고기가 되어 헤엄친다.
   그리기 모드(전체 화면 종이) ↔ 헤엄 모드(어항).
   물을 콕 누르면 먹이가 퐁당, 물고기를 누르면 하트가 퐁퐁.
   실패 없음: 무엇을 그려도 살아난다. 물고기는 배고파도 슬퍼하지 않는다.
   ========================================================================== */

const MAX_STORED = 20;  // 저장 상한 (초과 시 가장 오래된 것부터 정리)
const MAX_SHOWN = 10;   // 동시에 헤엄치는 물고기 (성능·소란 방지)

/* 저장 포맷 스트로크({c, w, h, p}) → CSS 색 (텍스처 베이크용) */
function fishSegColor(stroke, i) {
  if (stroke.c !== RAINBOW) return DRAW_COLORS[stroke.c];
  return `hsl(${(stroke.h + i * 5) % 360}, 85%, 55%)`;
}

/* 화면 좌표 스트로크(색·굵기 포함) → 0~100 정규화 (색이 곧 아이의 표현이라 보존한다) */
function normalizeAquaStrokes(strokes) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const s of strokes) for (const p of s.pts) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  const w = Math.max(8, maxX - minX), h = Math.max(8, maxY - minY);
  // 6~94 범위로 안쪽 여백을 둔다 — 굵은 붓의 둥근 끝이 텍스처 가장자리에서 잘리지 않게
  const sc = 88 / Math.max(w, h);
  const ox = (100 - w * sc) / 2, oy = (100 - h * sc) / 2;
  return strokes.slice(0, 12).map(s => {
    const n = Math.min(32, s.pts.length);
    const p = [];
    for (let i = 0; i < n; i++) {
      const q = s.pts[Math.floor(i * (s.pts.length - 1) / Math.max(1, n - 1))];
      p.push([Math.round((q[0] - minX) * sc + ox), Math.round((q[1] - minY) * sc + oy)]);
    }
    return { c: s.c, w: s.w, h: s.h0 || 0, p };
  });
}

let fishTexSeq = 0;
function bakeFishTexture(scene, fish) {
  const key = `aqua-${fish.b || 0}-${fishTexSeq++}`;
  const tex = scene.textures.createCanvas(key, 256, 256);
  const c = tex.getContext();
  c.save();
  c.scale(2.56, 2.56);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of fish.s) {
    if (!s.p || s.p.length < 1) continue;
    c.lineWidth = [3.5, 6, 10][s.w] || 6;
    if (s.p.length === 1) {
      c.fillStyle = fishSegColor(s, 0);
      c.beginPath(); c.arc(s.p[0][0], s.p[0][1], c.lineWidth / 2, 0, Math.PI * 2); c.fill();
      continue;
    }
    for (let i = 1; i < s.p.length; i++) {
      c.strokeStyle = fishSegColor(s, i);
      c.beginPath();
      c.moveTo(s.p[i - 1][0], s.p[i - 1][1]);
      c.lineTo(s.p[i][0], s.p[i][1]);
      c.stroke();
    }
  }
  c.restore();
  tex.refresh();
  return key;
}

export class AquaScene extends Phaser.Scene {
  constructor() { super('Aqua'); }

  create() {
    ui.topButtons('play');
    this.cameras.main.fadeIn(250, 255, 255, 255);
    const saved = store.P.aqua || [];

    // ---- 어항 배경 (그라데이션 물 + 모래 + 물풀 + 공기방울) ----
    this.waterG = this.add.graphics().setDepth(-100);
    this.seaweedG = this.add.graphics().setDepth(-40);
    this.seaweeds = [];
    for (let i = 0; i < 6; i++) {
      this.seaweeds.push({ fx: 0.06 + i * 0.17 + rand(-0.03, 0.03), seg: 5 + Math.floor(rand(0, 3)), ph: rand(0, 6.3), sp: rand(0.008, 0.02), hue: rand(120, 160) });
    }
    // 좌표는 이미터 기준 상대값 — y:0으로 두고 이미터를 바닥에 놓는다
    const bh = this.scale.height || 700;
    this.bubbleEm = this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: 4000 }, y: 0,
      lifespan: { min: 5000, max: 9000 },
      speedY: { min: -bh * 0.13, max: -bh * 0.06 }, speedX: { min: -8, max: 8 },
      scale: { min: 0.05, max: 0.14 }, alpha: { start: 0.35, end: 0 },
      quantity: 1, frequency: 700, tint: 0xffffff,
    }).setDepth(-30);

    // ---- 그리기 모드용 종이 ----
    this.paper = this.add.rectangle(0, 0, 10, 10, 0xfffdf6).setOrigin(0).setDepth(40).setVisible(false);
    this.strokeG = this.add.graphics().setDepth(45);

    this.fishObjs = [];
    this.fading = []; // 퇴장 연출 중인 물고기 (셧다운 시에도 텍스처 정리 보장)
    this.foods = [];
    this.strokes = [];
    this.stroke = null;
    this.color = 5; // 파랑부터 (물고기니까)
    this.size = 1;
    this.cheered = false;
    this.clearedBackup = null;
    this.drawId = null;

    this.input.on('pointerdown', p => this.onDown(p));
    this.input.on('pointermove', p => this.onMove(p));
    this.input.on('pointerup', p => this.onUp(p));
    this.input.on('pointerupoutside', p => this.onUp(p));

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      for (const f of this.fishObjs.concat(this.fading)) this.destroyFish(f, true);
    });

    // 저장된 물고기 풀어놓기
    for (const fish of saved.slice(-MAX_SHOWN)) this.spawnFish(fish, false);

    if (this.fishObjs.length) {
      this.enterSwim();
      audio.speak(`물고기 ${this.fishObjs.length}마리가 기다리고 있었어요! 물속을 콕 누르면 먹이가 퐁당!`);
    } else {
      this.enterDraw();
      audio.speak('여기는 수족관이에요! 물고기를 그리면 진짜로 헤엄쳐요!');
    }
  }

  repeatVoice() {
    audio.speak(this.state === 'draw'
      ? '물고기를 그리고 살아나라 버튼을 눌러 보세요!'
      : '물속을 콕 누르면 먹이가 퐁당! 물고기를 누르면 좋아해요!');
  }

  /* ---------- 상태 전환 ---------- */
  enterDraw() {
    this.state = 'draw';
    this.paper.setVisible(true);
    this.redraw();
    ui.setPill('물고기를 그려 봐요!');
    this.showDrawBar();
  }
  enterSwim() {
    this.state = 'swim';
    this.paper.setVisible(false);
    this.strokeG.clear();
    ui.setPill('물속을 콕! 누르면 먹이가 퐁당!');
    ui.setActionBar('<button class="act-btn" id="aq-draw">🖍️ 새 물고기 그리기</button>');
    document.getElementById('aq-draw').addEventListener('click', () => {
      audio.tap();
      this.strokes = [];
      this.stroke = null;
      this.enterDraw();
      audio.speak('새 물고기를 그려 봐요!', { pri: 1 });
    });
  }

  showDrawBar() {
    const colors = DRAW_COLORS.map((col, i) =>
      `<button class="pick-btn aq-c ${i === this.color ? 'sel' : ''}" data-i="${i}" style="background:${col}"></button>`).join('');
    const rainbow = `<button class="pick-btn aq-c ${this.color === RAINBOW ? 'sel' : ''}" data-i="${RAINBOW}"
      style="background:conic-gradient(#ff5c5c,#ff9838,#ffd21e,#4dc25e,#4a90e2,#a06ae8,#ff7db0,#ff5c5c)"></button>`;
    const sizes = [0, 1, 2].map(i =>
      `<button class="pick-btn aq-s ${i === this.size ? 'sel' : ''}" data-i="${i}"
      style="font-size:${[13, 21, 31][i]}px">●</button>`).join('');
    ui.setActionBar(`${colors}${rainbow}<span style="width:8px"></span>${sizes}
      <button class="act-btn small blue" id="aq-undo">↩️</button>
      <button class="act-btn small blue" id="aq-clear">🗑️</button>
      <button class="act-btn" id="aq-alive">🐟 살아나라!</button>`);
    document.querySelectorAll('.aq-c').forEach(b => b.addEventListener('click', () => {
      this.color = +b.dataset.i; this.showDrawBar(); audio.pop(2);
      if (this.color === RAINBOW) audio.speak('무지개 붓이에요!', { pri: 2 });
    }));
    document.querySelectorAll('.aq-s').forEach(b => b.addEventListener('click', () => {
      this.size = +b.dataset.i; this.showDrawBar(); audio.pop(3 + this.size);
    }));
    document.getElementById('aq-undo').addEventListener('click', () => {
      if (!this.strokes.length && this.clearedBackup) {
        this.strokes = this.clearedBackup;
        this.clearedBackup = null;
        this.redraw(); audio.boing();
        return;
      }
      this.strokes.pop(); this.redraw(); audio.tap();
    });
    document.getElementById('aq-clear').addEventListener('click', () => {
      if (this.strokes.length) this.clearedBackup = this.strokes;
      this.strokes = []; this.redraw(); audio.tap();
    });
    document.getElementById('aq-alive').addEventListener('click', () => this.makeAlive());
  }

  /* ---------- 그리기 입력 ---------- */
  brushW(sizeIdx) {
    const base = Math.max(8, Math.min(this.scale.width, this.scale.height) * 0.016);
    return base * [0.55, 1, 1.7][sizeIdx == null ? this.size : sizeIdx];
  }

  onDown(p) {
    if (this.state === 'swim') { this.swimTap(p); return; }
    if (this.state !== 'draw' || this.stroke) return;
    const bar = document.getElementById('action-bar');
    const barH = (bar && bar.offsetHeight) || 86;
    if (p.y > this.scale.height - barH - 24) return;
    this.drawId = p.id;
    this.stroke = { pts: [[p.x, p.y]], c: this.color, w: this.size, h0: Math.floor(Math.random() * 360) };
    this.strokeG.fillStyle(this.segTint(this.stroke, 0), 1);
    this.strokeG.fillCircle(p.x, p.y, this.brushW(this.size) / 2);
  }
  onMove(p) {
    if (this.state !== 'draw' || !this.stroke || p.id !== this.drawId) return;
    if (!p.isDown) { this.endStroke(); return; }
    const pts = this.stroke.pts;
    const prev = pts[pts.length - 1];
    pts.push([p.x, p.y]);
    const bw = this.brushW(this.stroke.w);
    const col = this.segTint(this.stroke, pts.length - 1);
    this.strokeG.lineStyle(bw, col, 1);
    this.strokeG.lineBetween(prev[0], prev[1], p.x, p.y);
    this.strokeG.fillStyle(col, 1);
    this.strokeG.fillCircle(p.x, p.y, bw / 2);
  }
  onUp(p) {
    if (this.state !== 'draw' || !this.stroke || (p && p.id !== this.drawId)) return;
    this.endStroke();
  }
  endStroke() {
    if (!this.stroke) return;
    if (this.stroke.pts.length === 1) {
      const q = this.stroke.pts[0];
      this.stroke.pts.push([q[0] + 2, q[1] + 2]);
    }
    this.strokes.push(this.stroke);
    this.stroke = null;
    this.drawId = null;
    if (!this.cheered && this.strokes.length >= 5) {
      this.cheered = true;
      audio.speak(pickVary(DRAW_CHEER), { pri: 2 });
    }
  }
  segTint(stroke, i) {
    if (stroke.c !== RAINBOW) return Phaser.Display.Color.HexStringToColor(DRAW_COLORS[stroke.c]).color;
    return Phaser.Display.Color.HSLToColor(((stroke.h0 + i * 5) % 360) / 360, 0.85, 0.6).color;
  }

  redraw() {
    this.strokeG.clear();
    if (this.state !== 'draw') return;
    for (const s of this.strokes) {
      const bw = this.brushW(s.w);
      this.strokeG.fillStyle(this.segTint(s, 0), 1);
      this.strokeG.fillCircle(s.pts[0][0], s.pts[0][1], bw / 2);
      for (let i = 1; i < s.pts.length; i++) {
        const col = this.segTint(s, i);
        this.strokeG.lineStyle(bw, col, 1);
        this.strokeG.lineBetween(s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]);
        this.strokeG.fillStyle(col, 1);
        this.strokeG.fillCircle(s.pts[i][0], s.pts[i][1], bw / 2);
      }
    }
  }

  /* ---------- 살아나라! ---------- */
  makeAlive() {
    if (this.state !== 'draw') return;
    this.endStroke();
    if (this.strokes.length === 0) { ui.guide('먼저 물고기를 그려 주세요!'); return; }
    const fish = { s: normalizeAquaStrokes(this.strokes), b: Date.now() };
    if (!store.P.aqua) store.P.aqua = [];
    store.P.aqua.push(fish);
    while (store.P.aqua.length > MAX_STORED) store.P.aqua.shift();
    store.save();
    this.strokes = [];
    this.stroke = null;
    this.clearedBackup = null;

    audio.success();
    this.enterSwim();
    const obj = this.spawnFish(fish, true);
    sparkleBurst(this, obj.x, this.scale.height * 0.2, 12);
    // 초과분은 가장 오래된 물고기가 스르르 숨는다 (데이터는 그대로 — 사라지지 않는다)
    while (this.fishObjs.length > MAX_SHOWN) {
      const old = this.fishObjs.shift();
      this.fading.push(old);
      this.tweens.add({
        targets: old, alpha: 0, duration: 900,
        onComplete: () => {
          this.fading = this.fading.filter(f => f !== old);
          this.destroyFish(old);
        },
      });
    }
    setTimeout(() => audio.speak('물고기가 태어났어요! 물속을 콕 누르면 먹이가 퐁당 떨어져요!', { pri: 1 }), 300);
  }

  spawnFish(fish, entering) {
    const { width: w, height: h } = this.scale;
    const key = bakeFishTexture(this, fish);
    const size = clamp(Math.min(w, h) * rand(0.15, 0.2), 58, 120);
    const img = this.add.image(0, 0, key).setDisplaySize(size, size).setDepth(10);
    img.texKey = key;
    img.fishSize = size;
    img.vx = rand(28, 70) * (Math.random() < 0.5 ? 1 : -1);
    img.wob = rand(0, 6.3);
    img.wobSp = rand(1.4, 2.4);
    img.baseY = rand(h * 0.3, h * 0.72);
    img.setFlipX(img.vx < 0);
    if (entering) {
      img.setPosition(rand(w * 0.25, w * 0.75), -size);
      img.setScale(img.scaleX * 0.3, img.scaleY * 0.3);
      this.tweens.add({ targets: img, y: img.baseY, scaleX: img.scaleX / 0.3, scaleY: img.scaleY / 0.3, duration: 900, ease: 'Back.easeOut' });
      audio.boing();
    } else {
      img.setPosition(rand(w * 0.1, w * 0.9), img.baseY);
    }
    this.fishObjs.push(img);
    return img;
  }
  destroyFish(img, keep) {
    try { this.textures.remove(img.texKey); } catch (e) {}
    if (!keep) img.destroy();
  }

  /* ---------- 어항 인터랙션 ---------- */
  swimTap(p) {
    // 물고기 먼저 (최근 것이 위) — 유아 손가락 기준 관대한 히트
    for (let i = this.fishObjs.length - 1; i >= 0; i--) {
      const f = this.fishObjs[i];
      const r = f.fishSize * 0.62 + 16;
      if (Math.abs(p.x - f.x) < r && Math.abs(p.y - f.y) < r) {
        audio.squeak();
        heartBurst(this, f.x, f.y - f.fishSize * 0.4);
        f.spinning = true;
        this.tweens.add({
          targets: f, angle: 360, duration: 450,
          onComplete: () => { f.setAngle(0); f.spinning = false; },
        });
        this.floatEmoji(f.x, f.y - f.fishSize * 0.6, '💕');
        if (Math.random() < 0.3) audio.speak(pick(['간지러워요!', '히히, 좋아요!', '뽀글뽀글!']), { pri: 2 });
        return;
      }
    }
    // 빈 물 → 먹이 퐁당 (연타 폭주 방지 상한)
    if (this.foods.length >= 40) return;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const food = this.add.image(p.x + rand(-18, 18), p.y + rand(-8, 8), 'dot')
        .setDisplaySize(rand(8, 12), rand(8, 12)).setTint(0xe8a735).setDepth(5);
      food.vy = this.scale.height * rand(0.1, 0.16); // 화면 크기에 비례한 낙하 속도
      food.wob = rand(0, 6.3);
      food.rest = 0;
      this.foods.push(food);
    }
    audio.pop(1);
  }

  floatEmoji(x, y, ch) {
    const t = this.add.text(x, y, ch, { fontSize: '26px' }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1100, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  /* ---------- 프레임 루프 ---------- */
  update(now, delta) {
    const dt = Math.min(0.05, delta / 1000);
    const { width: w, height: h } = this.scale;

    // 물풀 흔들림
    const sg = this.seaweedG;
    sg.clear();
    if (this.state === 'swim') {
      for (const s of this.seaweeds) {
        s.ph += s.sp;
        const x0 = s.fx * w;
        const segLen = h * 0.028;
        sg.lineStyle(Math.max(5, w * 0.008), Phaser.Display.Color.HSLToColor(s.hue / 360, 0.5, 0.3).color, 0.9);
        sg.beginPath();
        sg.moveTo(x0, h);
        for (let i = 1; i <= s.seg; i++) {
          sg.lineTo(x0 + Math.sin(s.ph + i * 0.5) * (4 + i * 2.2), h - h * 0.055 - i * segLen);
        }
        sg.strokePath();
      }
    }

    if (this.state !== 'swim') return;

    // 먹이 낙하
    for (const food of this.foods) {
      if (food.rest > 0) {
        food.rest -= dt;
        if (food.rest <= 0) {
          this.tweens.add({ targets: food, alpha: 0, duration: 500, onComplete: () => food.destroy() });
          food.gone = true;
        }
        continue;
      }
      food.wob += dt * 4;
      food.x += Math.sin(food.wob) * 0.4;
      food.y += food.vy * dt;
      if (food.y > h * 0.9) { food.y = h * 0.9; food.rest = 3; }
    }
    this.foods = this.foods.filter(f => !f.gone && f.active);

    // 물고기 헤엄 + 먹이 쫓기
    for (const f of this.fishObjs) {
      f.wob += dt * f.wobSp;
      let chased = false;
      let nearest = null, nd = 1e9;
      for (const food of this.foods) {
        if (food.gone) continue;
        const d = Math.hypot(food.x - f.x, food.y - f.y);
        if (d < nd) { nd = d; nearest = food; }
      }
      if (nearest) { // 먹이가 떨어지면 어디서든 헤엄쳐 온다 — "몰려오는" 맛이 핵심
        chased = true;
        const ang = Math.atan2(nearest.y - f.y, nearest.x - f.x);
        const sp = Math.min(w, h) * 0.3 + Math.abs(f.vx);
        f.x += Math.cos(ang) * sp * dt;
        f.y += Math.sin(ang) * sp * dt;
        f.setFlipX(Math.cos(ang) < 0);
        if (nd < f.fishSize * 0.45) {
          nearest.gone = true; nearest.destroy();
          audio.nom();
          sparkleBurst(this, nearest.x, nearest.y, 5);
          this.floatEmoji(f.x, f.y - f.fishSize * 0.6, '😊');
        }
      }
      if (!chased) {
        f.x += f.vx * dt;
        f.y = (f.baseY || f.y) + Math.sin(f.wob) * h * 0.02;
        f.setFlipX(f.vx < 0);
        const half = f.fishSize / 2;
        if (f.vx > 0 && f.x > w + half) f.x = -half;
        if (f.vx < 0 && f.x < -half) f.x = w + half;
      } else {
        f.baseY = clamp(f.y, h * 0.2, h * 0.82);
      }
      if (!f.spinning) f.setAngle(Math.sin(f.wob) * 5);
    }
  }

  /* ---------- 레이아웃 (회전·리사이즈 시 그리던 그림 보존) ---------- */
  layout() {
    const { width: w, height: h } = this.scale;
    if (this._lastW && (this._lastW !== w || this._lastH !== h)) {
      const sc = Math.min(w / this._lastW, h / this._lastH);
      const ox = (w - this._lastW * sc) / 2, oy = (h - this._lastH * sc) / 2;
      const remap = s => { s.pts = s.pts.map(q => [q[0] * sc + ox, q[1] * sc + oy]); };
      this.strokes.forEach(remap);
      if (this.stroke) remap(this.stroke);
      if (this.clearedBackup) this.clearedBackup.forEach(remap);
      for (const f of this.fishObjs) {
        f.x = f.x / this._lastW * w;
        f.baseY = (f.baseY || f.y) / this._lastH * h;
      }
    }
    this._lastW = w; this._lastH = h;

    this.paper.setSize(w, h);
    this.bubbleEm.setPosition(0, h * 0.98);
    // 물: 위는 밝고 아래로 깊어지는 파랑 + 모래바닥
    const g = this.waterG;
    g.clear();
    g.fillGradientStyle(0x2a8ac8, 0x2a8ac8, 0x0a3a6a, 0x0a3a6a, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(0xd8c48a, 1);
    g.fillRect(0, h * 0.94, w, h * 0.06);
    g.fillStyle(0xc4b078, 1);
    for (let i = 0; i < 5; i++) {
      const rx = (Math.sin(i * 87.7) * 0.5 + 0.5) * w;
      g.fillEllipse(rx, h * 0.945, w * 0.06 + i * 8, 14);
    }
    // 수면 반짝임
    g.fillStyle(0xbfe9ff, 0.35);
    g.fillRect(0, 0, w, h * 0.035);
    this.redraw();
  }
}
