import { addSky, addGround, popIn, textStyle, confettiBurst, sparkleBurst } from './common.js';
import { accToStars } from '../tracer.js';
import { store } from '../store.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { SORT_COLORS, SORT_SHAPES, SORT_YES, rand, pick, pickVary, clamp } from '../config.js';

export class SortScene extends Phaser.Scene {
  constructor() { super('Sort'); }

  create() {
    ui.topButtons('play');
    this.cameras.main.fadeIn(250, 240, 236, 250);
    this.bg = addSky(this, { clouds: 2, key: 'sky_sort' });
    this.ground = addGround(this, { horizon: 0.74, tufts: 9 });
    audio.setMood('play');
    this.bg.sky.setTint(0xe8ddff);

    const lvl = store.lvlOf('sort');
    this.lvl = lvl;
    this.total = lvl <= 2 ? 6 : 8;
    this.done = 0; this.attempts = 0; this.correct = 0;
    this.ruleSwitched = false;
    this.setRule(lvl <= 2 ? 'color' : 'shape', lvl === 1 || lvl === 3 ? 2 : 3);

    this.candyObj = null;
    this.grabbed = false;
    this.spawnAt = this.time.now + 700;

    // 진행 별 표시
    this.progStars = [];
    for (let i = 0; i < this.total; i++) {
      const s = this.add.image(0, 0, 'star').setScale(0.22).setAlpha(0.25).setDepth(20);
      this.progStars.push(s);
    }

    this.basketObjs = [];
    this.buildBaskets();

    // 말풍선 (오답 자기소개)
    this.sayBubble = this.add.image(0, 0, 'bubble').setDepth(40).setVisible(false);
    this.sayText = this.add.text(0, 0, '', textStyle(22)).setOrigin(0.5).setDepth(41).setVisible(false);

    this.grabId = null; // 잡은 손가락만 따라간다 (손바닥·둘째 손가락 무시)
    this.input.on('pointerdown', p => this.onDown(p));
    this.input.on('pointermove', p => {
      if (this.grabbed && this.candyObj && p.id === this.grabId) this.candyObj.setPosition(p.x, p.y);
    });
    this.input.on('pointerup', p => this.onUp(p));
    this.input.on('pointerupoutside', p => this.onUp(p));

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    ui.setPill(this.rule === 'color' ? '같은 색 바구니에 담아요!' : '같은 모양 바구니에 담아요!');
    audio.speak(this.rule === 'color'
      ? '별사탕이 떨어져요! 같은 색깔 바구니에 담아 주세요!'
      : '별사탕이 떨어져요! 같은 모양 바구니에 담아 주세요!');
  }

  repeatVoice() {
    audio.speak(this.rule === 'color' ? '같은 색깔 바구니에 담아 주세요!' : '같은 모양 바구니에 담아 주세요!');
  }

  setRule(rule, n) {
    this.rule = rule;
    this.baskets = (rule === 'color' ? SORT_COLORS : SORT_SHAPES).slice(0, n);
  }

  buildBaskets() {
    for (const b of this.basketObjs) b.destroy();
    this.basketObjs = this.baskets.map(b => {
      const cont = this.add.container(0, 0).setDepth(10);
      const img = this.add.image(0, 0, 'basket');
      cont.add(img);
      if (this.rule === 'color') {
        const g = this.add.graphics();
        g.fillStyle(b.tint, 1);
        g.fillCircle(0, 14, 26);
        g.lineStyle(5, 0xffffff, 1);
        g.strokeCircle(0, 14, 26);
        cont.add(g);
      } else {
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 1);
        const s = 24;
        if (b.key === 'circle') g.fillCircle(0, 14, s);
        else if (b.key === 'tri') g.fillTriangle(0, 14 - s, s, 14 + s * 0.8, -s, 14 + s * 0.8);
        else g.fillRect(-s * 0.85, 14 - s * 0.85, s * 1.7, s * 1.7);
        cont.add(g);
      }
      cont.basketData = b;
      cont.imgRef = img;
      return cont;
    });
    this.layoutBaskets();
  }

  layout() {
    const { width: w, height: h } = this.scale;
    this.bg.fit(w, h);
    this.ground.fit(w, h);
    this.progStars.forEach((s, i) => {
      s.setPosition(w / 2 - (this.total - 1) * 16 + i * 32, 96);
    });
    this.layoutBaskets();
    if (this.candyObj && !this.grabbed) {
      this.candyObj.x = clamp(this.candyObj.x, w * 0.1, w * 0.9);
      this.candyObj.y = clamp(this.candyObj.y, -60, this.floorY());
    }
  }
  layoutBaskets() {
    const { width: w, height: h } = this.scale;
    const n = this.basketObjs.length;
    const bw = Math.min(170, w / (n + 1.2));
    const gap = (w - n * bw) / (n + 1);
    this.basketObjs.forEach((cont, i) => {
      cont.setPosition(gap + i * (bw + gap) + bw / 2, h - Math.min(100, h * 0.15));
      cont.imgRef.setDisplaySize(bw, bw * 0.8);
      cont.bw = bw;
    });
  }
  floorY() { return this.scale.height - Math.min(190, this.scale.height * 0.28); }

  spawnCandy() {
    const col = pick(SORT_COLORS.slice(0, this.rule === 'color' ? this.baskets.length : 3));
    const shp = pick(SORT_SHAPES.slice(0, this.rule === 'shape' ? this.baskets.length : 3));
    const { width: w } = this.scale;
    const size = clamp(Math.min(w, this.scale.height) * 0.11, 56, 92);
    const img = this.add.image(rand(w * 0.2, w * 0.8), -60, `candy_${shp.key}_${col.key}`)
      .setDisplaySize(size, size).setDepth(30);
    img.colData = col; img.shpData = shp;
    img.vy = Math.min(w, this.scale.height) * (0.05 + this.lvl * 0.008);
    this.candyObj = img;
    this.tweens.add({ targets: img, angle: { from: -7, to: 7 }, duration: 800, yoyo: true, repeat: -1 });
  }

  onDown(p) {
    if (!this.candyObj || this.grabbed) return;
    const d = Phaser.Math.Distance.Between(p.x, p.y, this.candyObj.x, this.candyObj.y);
    if (d < Math.max(52, this.candyObj.displayWidth * 0.8)) {
      this.grabbed = true;
      this.grabId = p.id;
      // 튕김 이동 트윈이 손가락에서 사탕을 끌고 가지 않도록 위치 트윈 제거 후 흔들림만 복원
      this.tweens.killTweensOf(this.candyObj);
      this.tweens.add({ targets: this.candyObj, angle: { from: -7, to: 7 }, duration: 800, yoyo: true, repeat: -1 });
      this.candyObj.setPosition(p.x, p.y);
      this.tweens.add({ targets: this.candyObj, scale: this.candyObj.scale * 1.12, duration: 120 });
      audio.pop(2);
    }
  }

  onUp(p) {
    if (!this.grabbed || !this.candyObj || p.id !== this.grabId) return;
    this.grabbed = false;
    this.grabId = null;
    const candy = this.candyObj;
    for (const cont of this.basketObjs) {
      const half = cont.bw / 2 + 16;
      if (Math.abs(p.x - cont.x) < half && p.y > cont.y - cont.imgRef.displayHeight) {
        this.attempts++;
        const b = cont.basketData;
        const ok = this.rule === 'color' ? b.key === candy.colData.key : b.key === candy.shpData.key;
        if (ok) {
          this.correct++;
          this.done++;
          store.P.flowers++;
          store.save();
          sparkleBurst(this, p.x, p.y, 12);
          audio.pop(this.done + 2);
          audio.speak(pickVary(SORT_YES), { pri: 2 });
          this.progStars[this.done - 1].setAlpha(1);
          this.tweens.add({ targets: this.progStars[this.done - 1], scale: 0.34, duration: 240, yoyo: true });
          this.tweens.add({
            targets: candy, y: cont.y, scale: 0, duration: 300, ease: 'Quad.easeIn',
            onComplete: () => candy.destroy(),
          });
          this.tweens.add({ targets: cont, scaleX: 1.1, scaleY: 0.92, duration: 130, yoyo: true });
          this.candyObj = null;
          this.afterDrop();
        } else {
          // 오답 = 자기소개 (배움의 순간, 벌점 없음)
          const say = `나는 ${candy.colData.name} ${candy.shpData.name}야~!`;
          audio.speak(say, { pri: 1 });
          audio.nope();
          this.showSay(candy.x, candy.y - candy.displayHeight, say);
          this.tweens.add({
            targets: candy,
            x: clamp(candy.x + rand(-80, 80), this.scale.width * 0.15, this.scale.width * 0.85),
            y: cont.y - 190,
            scale: candy.scale / 1.12,
            duration: 420, ease: 'Back.easeOut',
          });
        }
        return;
      }
    }
    this.tweens.add({ targets: candy, scale: candy.scale / 1.12, duration: 120 });
  }

  showSay(x, y, text) {
    const { width: w } = this.scale;
    this.sayText.setText(text);
    const bw = this.sayText.width + 60;
    const bx = clamp(x, bw / 2 + 8, w - bw / 2 - 8);
    const by = Math.max(60, y - 40);
    this.sayBubble.setVisible(true).setPosition(bx, by).setDisplaySize(bw, 84).setAlpha(1);
    this.sayText.setVisible(true).setPosition(bx, by - 8).setAlpha(1);
    this.tweens.killTweensOf([this.sayBubble, this.sayText]);
    this.tweens.add({
      targets: [this.sayBubble, this.sayText], alpha: 0, delay: 2000, duration: 400,
      onComplete: () => { this.sayBubble.setVisible(false); this.sayText.setVisible(false); },
    });
  }

  afterDrop() {
    if (this.lvl >= 5 && !this.ruleSwitched && this.done === Math.floor(this.total / 2)) {
      this.ruleSwitched = true;
      this.setRule(this.rule === 'color' ? 'shape' : 'color', 3);
      this.buildBaskets();
      const msg = this.rule === 'color' ? '이번엔 놀이가 바뀌어요! 이번엔 색깔로 나눠요!' : '이번엔 놀이가 바뀌어요! 이번엔 모양으로 나눠요!';
      ui.setPill(this.rule === 'color' ? '이번엔 색깔로!' : '이번엔 모양으로!');
      audio.speak(msg);
    }
    if (this.done >= this.total) {
      const acc = this.attempts ? this.correct / this.attempts : 1;
      const stars = accToStars(acc);
      store.P.stars.sort += stars;
      store.adapt('sort', acc);
      store.save();
      ui.setPill('');
      confettiBurst(this, this.scale.width / 2, this.scale.height * 0.3);
      this.time.delayedCall(700, () => {
        ui.celebrate({
          stars,
          msg: '별사탕이 마을의 꽃이 되었어요!',
          speakMsg: '별사탕이 마을의 꽃이 되었어요!',
          onAgain: () => this.scene.restart(),
        });
      });
    }
  }

  update(now, dt) {
    this.bg.step(Math.min(0.05, (dt || 16) / 1000), this.scale.width);
    if (!this.candyObj && this.done < this.total && now > this.spawnAt) {
      this.spawnCandy();
      this.spawnAt = now + 700;
    }
    if (this.candyObj && !this.grabbed) {
      this.candyObj.y += this.candyObj.vy * dt / 60;
      const fy = this.floorY();
      if (this.candyObj.y > fy) this.candyObj.y = fy; // 바닥에서 기다림 (놓칠 일 없음)
    }
  }
}
