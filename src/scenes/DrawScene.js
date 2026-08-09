import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { switchScene } from '../main.js';
import { DRAW_COLORS, CHAR_COLORS } from '../config.js';

export class DrawScene extends Phaser.Scene {
  constructor() { super('Draw'); }

  create() {
    ui.topButtons('play');
    this.cameras.main.fadeIn(250, 255, 255, 255);
    this.paper = this.add.rectangle(0, 0, 10, 10, 0xfffdf6).setOrigin(0).setDepth(-10);
    this.lineG = this.add.graphics().setDepth(-9);
    this.strokeG = this.add.graphics().setDepth(5);

    this.strokes = [];  // {pts, c}
    this.stroke = null;
    this.color = 1;

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
    };
    this.endStroke = endStroke;
    this.input.on('pointerdown', p => {
      if (this.stroke) return;
      if (p.y > this.scale.height - 110) return; // 액션바 영역 보호
      this.drawId = p.id;
      this.stroke = { pts: [[p.x, p.y]], c: this.color };
    });
    this.input.on('pointermove', p => {
      if (!this.stroke || p.id !== this.drawId) return;
      // 액션바 버튼 위에서 떼면 캔버스가 up을 못 받는다 — 유령선 방지
      if (!p.isDown) { endStroke(); return; }
      const pts = this.stroke.pts;
      const prev = pts[pts.length - 1];
      pts.push([p.x, p.y]);
      this.strokeG.lineStyle(this.brushW(), Phaser.Display.Color.HexStringToColor(DRAW_COLORS[this.stroke.c]).color, 1);
      this.strokeG.lineBetween(prev[0], prev[1], p.x, p.y);
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

  brushW() { return Math.max(8, Math.min(this.scale.width, this.scale.height) * 0.016); }

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
      this.strokeG.lineStyle(this.brushW(), Phaser.Display.Color.HexStringToColor(DRAW_COLORS[s.c]).color, 1);
      for (let i = 1; i < s.pts.length; i++) {
        this.strokeG.lineBetween(s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]);
      }
    }
  }

  showBar() {
    const colors = DRAW_COLORS.map((col, i) =>
      `<button class="pick-btn dw-c ${i === this.color ? 'sel' : ''}" data-i="${i}" style="background:${col}"></button>`).join('');
    ui.setActionBar(`${colors}
      <button class="act-btn small blue" id="dw-undo">↩️</button>
      <button class="act-btn small blue" id="dw-clear">🗑️</button>
      <button class="act-btn" id="dw-hatch">🐣 태어나라!</button>`);
    document.querySelectorAll('.dw-c').forEach(b => b.addEventListener('click', () => {
      this.color = +b.dataset.i; this.showBar(); audio.pop(2);
    }));
    document.getElementById('dw-undo').addEventListener('click', () => {
      this.strokes.pop(); this.redraw(); audio.tap();
    });
    document.getElementById('dw-clear').addEventListener('click', () => {
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
