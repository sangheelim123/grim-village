import { addSky, pressify, textStyle } from './common.js';
import { store } from '../store.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { switchScene } from '../main.js';
import { VERSION } from '../config.js';

export class ProfileScene extends Phaser.Scene {
  constructor() { super('Profile'); }

  create() {
    ui.topButtons('none');
    this.cameras.main.fadeIn(250, 255, 255, 255);
    this.bg = addSky(this, { clouds: 4 });
    this.hills = this.add.image(0, 0, 'hills_near').setOrigin(0.5, 1).setDepth(-80);

    this.title = this.add.text(0, 0, '무럭무럭 그림 마을', textStyle(46, '#ffffff', '#2a8ac0', 10)).setOrigin(0.5);
    this.sub = this.add.text(0, 0, '누가 놀러 왔나요? 얼굴을 눌러 주세요!', textStyle(21, '#2a6a9a')).setOrigin(0.5);
    // 버전 표시 — 업데이트가 적용됐는지 한눈에 확인하는 용도
    this.verText = this.add.text(0, 0, 'v' + VERSION, textStyle(13, '#5a86a0')).setOrigin(0, 1).setAlpha(0.75);

    let last = 0;
    try { last = +(localStorage.getItem('village-v4-last') || 0); } catch (e) {}

    this.cards = [0, 1].map(p => {
      const cont = this.add.container(0, 0);
      const panel = this.add.image(0, 0, 'panel').setDisplaySize(240, 300);
      const face = this.add.image(0, -52, p === 0 ? 'face_bunny' : 'face_bear').setScale(0.62);
      const name = this.add.text(0, 62, p === 0 ? '토끼 마을' : '곰돌이 마을', textStyle(25)).setOrigin(0.5);
      const d = store.peek(p);
      const infoText = d && d.chars ? `친구 ${d.chars.length}명 · ⭐ ${(d.stars.road || 0) + (d.stars.egg || 0) + (d.stars.feed || 0) + (d.stars.sort || 0)}` : '새 마을';
      const info = this.add.text(0, 96, infoText, textStyle(15, '#9a8a70')).setOrigin(0.5);
      cont.add([panel, face, name, info]);
      if (p === last) {
        const ring = this.add.image(0, 0, 'panel').setDisplaySize(256, 316).setTint(0xffd166).setAlpha(0.5);
        cont.addAt(ring, 0);
      }
      cont.setSize(240, 300);
      pressify(this, cont, () => this.pickProfile(p));
      this.tweens.add({
        targets: cont, y: '+=8', duration: 1800 + p * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return cont;
    });

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  pickProfile(p) {
    try { localStorage.setItem('village-v4-last', String(p)); } catch (e) {}
    store.load(p);
    document.getElementById('btn-profile').textContent = p === 0 ? '🐰' : '🐻';
    audio.success();
    audio.startBgm(this);
    switchScene(this, 'Village');
  }

  layout() {
    const { width: w, height: h } = this.scale;
    this.bg.sky.setDisplaySize(w, h);
    this.hills.setPosition(w / 2, h + 10).setDisplaySize(Math.max(w * 1.1, 900), 240);
    this.title.setPosition(w / 2, h * 0.16).setFontSize(Math.min(52, w * 0.055));
    this.sub.setPosition(w / 2, h * 0.16 + Math.min(52, w * 0.055) * 0.9);
    this.verText.setPosition(10, h - 8);
    const gap = Math.min(300, w * 0.3);
    const cy = h * 0.56;
    const sc = Math.min(1, w / 640, h / 560);
    this.cards[0].setPosition(w / 2 - gap / 2, cy).setScale(sc);
    this.cards[1].setPosition(w / 2 + gap / 2, cy).setScale(sc);
  }
}
