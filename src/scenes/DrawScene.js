import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { switchScene } from '../main.js';
import { DRAW_COLORS, CHAR_COLORS, DRAW_CHEER, pickVary } from '../config.js';

/* 무지개 붓: 색 인덱스가 DRAW_COLORS 길이와 같으면 점 순서를 따라 색이 흐른다 */
const RAINBOW = DRAW_COLORS.length;
function segColor(stroke, i) {
  if (stroke.c !== RAINBOW) return Phaser.Display.Color.HexStringToColor(DRAW_COLORS[stroke.c]).color;
  return Phaser.Display.Color.HSLToColor(((stroke.h0 + i * 5) % 360) / 360, 0.85, 0.6).color;
}

export class DrawScene extends Phaser.Scene {
  constructor() { super('Draw'); }

  create() {
    ui.topButtons('play');
    this.cameras.main.fadeIn(250, 255, 255, 255);
    this.paper = this.add.rectangle(0, 0, 10, 10, 0xfffdf6).setOrigin(0).setDepth(-10);
    this.lineG = this.add.graphics().setDepth(-9);
    this.strokeG = this.add.graphics().setDepth(5);

    this.strokes = [];  // {pts, c, w, h0}
    this.stroke = null;
    this.color = 1;
    this.size = 1;      // 0 가는 / 1 중간 / 2 굵은 붓
    this.cheered = false;
    this.clearedBackup = null; // 씬 객체는 재사용된다 — 지난 방문의 그림이 살아나면 안 됨

    this.drawId = null; // 그리는 손가락 하나만 (손바닥·둘째 손가락이 선을 뺏지 않게)
    const endStroke = () => {
      if (!this.stroke) return;
      if (this.stroke.pts.length === 1) {
        const q = this.stroke.pts[0];
        this.stroke.pts.push([q[0] + 2, q[1] + 2]);
        this.redraw();
      }
      this.strokes.push(this.stroke);
      this.stroke = null;
      this.drawId = null;
      if (!this.cheered && this.strokes.length >= 5) {
        this.cheered = true;
        audio.speak(pickVary(DRAW_CHEER), { pri: 2 });
      }
    };
    this.endStroke = endStroke;
    this.input.on('pointerdown', p => {
      if (this.stroke) return;
      // 액션바 영역 보호 — 버튼이 늘어 줄바꿈되면 실제 높이만큼 지킨다
      const bar = document.getElementById('action-bar');
      const barH = (bar && bar.offsetHeight) || 86;
      if (p.y > this.scale.height - barH - 24) return;
      this.drawId = p.id;
      this.stroke = { pts: [[p.x, p.y]], c: this.color, w: this.size, h0: Math.floor(Math.random() * 360) };
      this.strokeG.fillStyle(segColor(this.stroke, 0), 1);
      this.strokeG.fillCircle(p.x, p.y, this.brushW(this.size) / 2);
    });
    this.input.on('pointermove', p => {
      if (!this.stroke || p.id !== this.drawId) return;
      // 액션바 버튼 위에서 떼면 캔버스가 up을 못 받는다 — 유령선 방지
      if (!p.isDown) { endStroke(); return; }
      const pts = this.stroke.pts;
      const prev = pts[pts.length - 1];
      pts.push([p.x, p.y]);
      const bw = this.brushW(this.stroke.w);
      const col = segColor(this.stroke, pts.length - 1);
      this.strokeG.lineStyle(bw, col, 1);
      this.strokeG.lineBetween(prev[0], prev[1], p.x, p.y);
      // 동그란 마디로 굵은 선의 각짐을 없앤다
      this.strokeG.fillStyle(col, 1);
      this.strokeG.fillCircle(p.x, p.y, bw / 2);
    });
    this.input.on('pointerup', p => { if (this.stroke && p.id === this.drawId) endStroke(); });
    this.input.on('pointerupoutside', p => { if (this.stroke && p.id === this.drawId) endStroke(); });

    this.showBar();
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    ui.setPill('마음껏 그려 봐요!');
    audio.speak('그림 놀이터예요! 마음껏 그려 봐요! 다 그리면 태어나라 버튼을 눌러도 좋아요!');
  }

  repeatVoice() { audio.speak('마음껏 그려 봐요! 다 그리면 태어나라 버튼으로 친구를 만들 수 있어요!'); }

  brushW(sizeIdx) {
    const base = Math.max(8, Math.min(this.scale.width, this.scale.height) * 0.016);
    return base * [0.55, 1, 1.7][sizeIdx == null ? this.size : sizeIdx];
  }

  layout() {
    const { width: w, height: h } = this.scale;
    this.paper.setSize(w, h);
    this.lineG.clear();
    this.lineG.lineStyle(2, 0xf0e8d8, 1);
    for (let gy = 70; gy < h; gy += 48) this.lineG.lineBetween(0, gy, w, gy);
    this.redraw();
  }

  redraw() {
    this.strokeG.clear();
    for (const s of this.strokes) {
      const bw = this.brushW(s.w);
      this.strokeG.fillStyle(segColor(s, 0), 1);
      this.strokeG.fillCircle(s.pts[0][0], s.pts[0][1], bw / 2);
      for (let i = 1; i < s.pts.length; i++) {
        const col = segColor(s, i);
        this.strokeG.lineStyle(bw, col, 1);
        this.strokeG.lineBetween(s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]);
        this.strokeG.fillStyle(col, 1);
        this.strokeG.fillCircle(s.pts[i][0], s.pts[i][1], bw / 2);
      }
    }
  }

  showBar() {
    const colors = DRAW_COLORS.map((col, i) =>
      `<button class="pick-btn dw-c ${i === this.color ? 'sel' : ''}" data-i="${i}" style="background:${col}"></button>`).join('');
    const rainbow = `<button class="pick-btn dw-c ${this.color === RAINBOW ? 'sel' : ''}" data-i="${RAINBOW}"
      style="background:conic-gradient(#ff5c5c,#ff9838,#ffd21e,#4dc25e,#4a90e2,#a06ae8,#ff7db0,#ff5c5c)"></button>`;
    const sizes = [0, 1, 2].map(i =>
      `<button class="pick-btn dw-s ${i === this.size ? 'sel' : ''}" data-i="${i}"
      style="font-size:${[13, 21, 31][i]}px">●</button>`).join('');
    ui.setActionBar(`${colors}${rainbow}<span style="width:8px"></span>${sizes}
      <button class="act-btn small blue" id="dw-undo">↩️</button>
      <button class="act-btn small blue" id="dw-clear">🗑️</button>
      <button class="act-btn" id="dw-hatch">🐣 태어나라!</button>`);
    document.querySelectorAll('.dw-c').forEach(b => b.addEventListener('click', () => {
      this.color = +b.dataset.i; this.showBar(); audio.pop(2);
      if (this.color === RAINBOW) audio.speak('무지개 붓이에요!', { pri: 2 });
    }));
    document.querySelectorAll('.dw-s').forEach(b => b.addEventListener('click', () => {
      this.size = +b.dataset.i; this.showBar(); audio.pop(3 + this.size);
    }));
    document.getElementById('dw-undo').addEventListener('click', () => {
      // 실수로 전부 지웠어도 ↩️ 한 번이면 그림이 돌아온다 (창작물은 소중하다)
      if (!this.strokes.length && this.clearedBackup) {
        this.strokes = this.clearedBackup;
        this.clearedBackup = null;
        this.redraw(); audio.boing();
        return;
      }
      this.strokes.pop(); this.redraw(); audio.tap();
    });
    document.getElementById('dw-clear').addEventListener('click', () => {
      if (this.strokes.length) this.clearedBackup = this.strokes;
      this.strokes = []; this.redraw(); audio.tap();
    });
    document.getElementById('dw-hatch').addEventListener('click', () => {
      if (this.endStroke) this.endStroke(); // 그리고 있던 선도 캐릭터에 포함
      if (this.strokes.length === 0) { ui.guide('먼저 그림을 그려 주세요!'); return; }
      audio.boing();
      const strokes = this.strokes.map(s => s.pts.map(p => [p[0], p[1]]));
      switchScene(this, 'Egg', { strokes, color: this.color % CHAR_COLORS.length });
    });
  }
}
