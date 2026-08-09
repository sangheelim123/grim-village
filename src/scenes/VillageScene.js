import { addSky, pressify, textStyle, heartBurst } from './common.js';
import { store, creatureSize } from '../store.js';
import { makeCreatureSprite } from '../creature.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { switchScene } from '../main.js';
import { DECOR_UNLOCKS, rand, pick, clamp } from '../config.js';

const ISLANDS = [
  { key: 'Road', sign: 'sign_road', name: '길 그리기', nx: 0.14, ny: 0.36 },
  { key: 'Egg', sign: 'sign_egg', name: '도형 알', nx: 0.86, ny: 0.36 },
  { key: 'Aqua', sign: 'sign_aqua', name: '수족관', nx: 0.5, ny: 0.33 },
  { key: 'Feed', sign: 'sign_feed', name: '냠냠', nx: 0.14, ny: 0.75 },
  { key: 'Sort', sign: 'sign_sort', name: '반짝', nx: 0.86, ny: 0.75 },
];

export class VillageScene extends Phaser.Scene {
  constructor() { super('Village'); }

  create() {
    ui.topButtons('village');
    this.cameras.main.fadeIn(250, 255, 255, 255);
    const P = store.P;

    this.bg = addSky(this, { clouds: 3 });
    this.nightSky = this.add.image(0, 0, 'sky_night').setOrigin(0).setDepth(-99).setAlpha(0);
    this.sun = this.add.image(0, 0, 'sun').setDepth(-88);
    this.moon = this.add.image(0, 0, 'moon').setDepth(-88).setAlpha(0);
    this.tweens.add({ targets: [this.sun, this.moon], angle: 6, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.rainbowImg = this.add.image(0, 0, 'rainbow').setDepth(-72).setAlpha(P.decor.includes('rainbow') ? 0.85 : 0);
    this.hillsFar = this.add.image(0, 0, 'hills_far').setOrigin(0.5, 1).setDepth(-70);
    this.hillsNear = this.add.image(0, 0, 'hills_near').setOrigin(0.5, 1).setDepth(-60);
    this.groundImg = this.add.image(0, 0, 'ground').setOrigin(0.5, 1).setDepth(-50);
    this.trailG = this.add.graphics().setDepth(-45);

    this.flowerImgs = [];
    this.fountainImg = this.add.image(0, 0, 'fountain').setDepth(-40).setVisible(P.decor.includes('fountain'));

    // 놀이 섬 입구
    this.signs = ISLANDS.map(isl => {
      const cont = this.add.container(0, 0).setDepth(10);
      const img = this.add.image(0, 0, isl.sign);
      const label = this.add.text(0, 0, isl.name, textStyle(24, '#ffffff', '#b5794a', 7)).setOrigin(0.5);
      cont.add([img, label]);
      cont.islData = isl; cont.imgRef = img; cont.labelRef = label;
      cont.setSize(img.width, img.height + 46); // setInteractive 전에 크기 확정 필수
      pressify(this, cont, () => switchScene(this, isl.key));
      this.tweens.add({
        targets: cont, y: '+=7', duration: 1600 + Math.random() * 700,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return cont;
    });

    // 그림 놀이터
    this.easelCont = this.add.container(0, 0).setDepth(10);
    const easelImg = this.add.image(0, 0, 'easel');
    const easelLabel = this.add.text(0, 0, '그림 놀이터', textStyle(21, '#ffffff', '#a76b3f', 6)).setOrigin(0.5);
    this.easelCont.add([easelImg, easelLabel]);
    this.easelCont.easelImg = easelImg; this.easelCont.easelLabel = easelLabel;
    this.easelCont.setSize(easelImg.width, easelImg.height + 40);
    pressify(this, this.easelCont, () => switchScene(this, 'Draw'));
    this.tweens.add({ targets: this.easelCont, angle: 2, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 캐릭터들 (짝꿍은 절대 밀려나지 않는다)
    this.walkers = [];
    for (const char of store.villageChars(8)) this.spawnWalker(char);

    // 근접 이모트: 친구끼리 가까워지면 인사 (내 창작물들이 한 세계에 산다)
    this.emoteCooldown = new Map();
    this.time.addEvent({ delay: 2600, loop: true, callback: () => this.checkEmotes() });

    // 빈 마을 안내
    this.hintHand = this.add.image(0, 0, 'hand').setDepth(60).setVisible(false).setScale(0.8);
    this.hintText = this.add.text(0, 0, '도형 알 섬에서 그림을 그리면\n친구가 태어나요!',
      textStyle(24, '#ffffff', '#e8955c', 8)).setOrigin(0.5).setAlign('center').setDepth(60).setVisible(false);
    if (P.chars.length === 0) {
      this.hintHand.setVisible(true).setAngle(30);
      this.hintText.setVisible(true);
      this.tweens.add({ targets: this.hintHand, y: '+=16', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // 반딧불 (밤 + 해금)
    this.fireflies = this.add.particles(0, 0, 'sparkle', {
      x: { min: 0, max: 2000 }, y: { min: 0, max: 500 },
      lifespan: 4000, scale: { start: 0.16, end: 0 },
      alpha: { start: 0.9, end: 0 }, speed: { min: 4, max: 18 },
      quantity: 1, frequency: 600, tint: 0xfff09a,
    }).setDepth(-30);
    this.fireflies.stop();

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      for (const w of this.walkers) if (w.destroyTexture) w.destroyTexture();
    });

    // 해금 알림이 있으면 인사말은 생략 (알림을 350ms 만에 삼키지 않도록)
    const unlocked = this.checkNewDecor();
    if (!P.intro) {
      P.intro = true; store.save();
      this.time.delayedCall(500, () => audio.speak('무럭무럭 그림 마을에 온 걸 환영해요! 도형 알 섬에서 그림을 그리면 친구가 태어나요!'));
    } else if (!unlocked && P.chars.length > 0) {
      this.time.delayedCall(350, () => audio.speak('친구들이 기다리고 있었어요!', { pri: 2 }));
    }
  }

  /* 새 장식 해금 알림 (누적 별 기준, 100% 코스메틱) — 해금 발생 여부 반환 */
  checkNewDecor() {
    const t = store.totalStars();
    let any = false;
    for (const d of DECOR_UNLOCKS) {
      if (t >= d.at && !store.P.decor.includes(d.key)) {
        any = true;
        store.P.decor.push(d.key);
        store.save();
        ui.toast(`✨ 마을에 ${d.name}이(가) 생겼어요!`);
        audio.grow();
        setTimeout(() => audio.speak(`마을에 ${d.name}이 생겼어요!`), 400);
        if (d.key === 'rainbow') this.tweens.add({ targets: this.rainbowImg, alpha: 0.85, duration: 1200 });
        if (d.key === 'fountain') this.fountainImg.setVisible(true);
        this.layout();
      }
    }
    return any;
  }

  spawnWalker(char) {
    const cont = makeCreatureSprite(this, char);
    const pers = (char.p || 0) % 3; // 성격: 0 씩씩이 / 1 잠꾸러기 / 2 부끄럼쟁이 (기존 캐릭터는 0)
    cont.pers = pers;
    const label = this.add.text(0, cont.baseSize * 0.72, (char.fav ? '💛 ' : '') + char.n,
      textStyle(15, '#6a5a42', '#ffffff', 4)).setOrigin(0.5);
    cont.add(label);
    const zzz = this.add.text(cont.baseSize * 0.3, -cont.baseSize * 0.7, '💤', textStyle(20)).setOrigin(0.5).setVisible(false);
    cont.add(zzz);
    cont.zzzText = zzz;
    cont.setDepth(20);
    cont.setInteractive(new Phaser.Geom.Circle(0, 0, cont.baseSize * 0.7), Phaser.Geom.Circle.Contains);
    cont.on('pointerdown', () => {
      // 성격이 무엇이든 탭 보상(소리+하트)은 항상 지켜진다
      audio.squeak();
      heartBurst(this, cont.x, cont.y - cont.baseSize * 0.6);
      if (cont.sleeping) this.wakeUp(cont);
      if (pers === 2) {
        // 부끄럼쟁이: 제자리에서 눈 가렸다 빼꼼 + 부르르 (도망은 없다)
        cont.setEyesClosed(true);
        this.tweens.add({ targets: cont, angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: 3,
          onComplete: () => { cont.setAngle(0); cont.setEyesClosed(false); } });
        if (Math.random() < 0.4) audio.speak(char.n + '! ' + pick(['부끄러워요…', '헤헤…', '깜짝이야!']), { pri: 2 });
      } else {
        const hop = pers === 0 ? 46 : 30; // 씩씩이는 더 높이!
        this.tweens.add({ targets: cont, y: cont.y - hop, duration: 190, yoyo: true, ease: 'Quad.easeOut' });
        if (Math.random() < 0.35) audio.speak(char.n + '! ' + pick(['안녕!', '히히!', '좋아요!', '냠냠 먹고 싶다!']), { pri: 2 });
      }
    });
    this.walkers.push(cont);
    const band = this.wanderBand();
    cont.setPosition(rand(band.x0, band.x1), rand(band.y0, band.y1));
    this.time.delayedCall(rand(300, 1500), () => this.wander(cont));
    return cont;
  }

  wakeUp(cont) {
    cont.sleeping = false;
    cont.zzzText.setVisible(false);
    cont.setEyesClosed(false);
  }

  checkEmotes() {
    if (!this.scene.isActive()) return;
    const now = this.time.now;
    for (let i = 0; i < this.walkers.length; i++) {
      for (let j = i + 1; j < this.walkers.length; j++) {
        const a = this.walkers[i], b = this.walkers[j];
        if (!a.active || !b.active || a.sleeping || b.sleeping) continue;
        if (Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) > 95) continue;
        const key = `${i}-${j}`;
        if (now - (this.emoteCooldown.get(key) || 0) < 12000) continue;
        this.emoteCooldown.set(key, now);
        const em = pick(['💗', '🎵', '✨']);
        for (const w of [a, b]) {
          const t = this.add.text(w.x, w.y - w.baseSize * 0.9, em, textStyle(24)).setOrigin(0.5).setDepth(40);
          this.tweens.add({
            targets: t, y: t.y - 34, alpha: 0, duration: 1400, ease: 'Quad.easeOut',
            onComplete: () => t.destroy(),
          });
        }
        audio.pop(4);
        return; // 한 번에 한 쌍만 (소란 방지)
      }
    }
  }

  wanderBand() {
    const { width: w, height: h } = this.scale;
    return { x0: w * 0.24, x1: w * 0.76, y0: h * 0.6, y1: h * 0.85 };
  }

  wander(cont) {
    if (!cont.active || !this.scene.isActive()) return;
    const pers = cont.pers || 0;
    const band = this.wanderBand();
    const tx = rand(band.x0, band.x1);
    const ty = clamp(cont.y + rand(-40, 40), band.y0, band.y1);
    cont.bodyImg.setFlipX(tx < cont.x);
    const dist = Math.hypot(tx - cont.x, ty - cont.y);
    const speed = pers === 0 ? 0.05 : pers === 1 ? 0.026 : 0.035; // 씩씩이 빠름, 잠꾸러기 느긋
    const dur = dist / speed;
    const hop = this.tweens.add({
      targets: cont, scaleY: 0.94, duration: pers === 0 ? 130 : 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: cont, x: tx, y: ty, duration: dur, ease: 'Sine.easeInOut',
      onComplete: () => {
        hop.stop(); cont.scaleY = 1;
        if (!cont.active) return;
        // 씩씩이: 도착하면 가끔 신나서 폴짝
        if (pers === 0 && Math.random() < 0.4) {
          this.tweens.add({ targets: cont, y: cont.y - 24, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
        }
        let idle = rand(1400, 3600);
        // 잠꾸러기: 가끔 그 자리에서 새근새근 (단일 체인이라 순간이동 버그 없음)
        if (pers === 1 && Math.random() < 0.45) {
          idle = rand(5000, 8000);
          cont.sleeping = true;
          cont.setEyesClosed(true);
          cont.zzzText.setVisible(true);
          this.tweens.add({ targets: cont.zzzText, y: cont.zzzText.y - 6, duration: 800, yoyo: true, repeat: 4 });
        }
        this.time.delayedCall(idle, () => {
          if (!cont.active) return;
          if (cont.sleeping) this.wakeUp(cont);
          this.wander(cont);
        });
      },
    });
  }

  update(now) {
    // 4분 주기 낮/밤
    const t = (now / 1000) % 240;
    let nf = 0;
    if (t >= 170 && t < 190) nf = (t - 170) / 20;
    else if (t >= 190 && t < 225) nf = 1;
    else if (t >= 225) nf = 1 - (t - 225) / 15;
    this.nightSky.setAlpha(nf);
    this.sun.setAlpha(1 - nf);
    this.moon.setAlpha(nf);
    const dim = 1 - nf * 0.45;
    const tint = Phaser.Display.Color.GetColor(Math.round(255 * dim), Math.round(255 * dim), Math.round(255 * (1 - nf * 0.25)));
    [this.hillsFar, this.hillsNear, this.groundImg, this.fountainImg].forEach(o => o.setTint(tint));
    const fireflyOn = nf > 0.4 && store.P.decor.includes('firefly');
    if (fireflyOn && !this._ffOn) { this.fireflies.start(); this._ffOn = true; }
    if (!fireflyOn && this._ffOn) { this.fireflies.stop(); this._ffOn = false; }
  }

  layout() {
    const { width: w, height: h } = this.scale;
    const P = store.P;
    const m = Math.min(w, h);
    this.bg.sky.setDisplaySize(w, h);
    this.nightSky.setDisplaySize(w, h);
    this.sun.setPosition(w * 0.5, h * 0.1).setScale(m * 0.0009);
    this.moon.setPosition(w * 0.5, h * 0.1).setScale(m * 0.0009);
    this.rainbowImg.setPosition(w * 0.5, h * 0.46).setScale(Math.min(1.2, w / 700));
    this.hillsFar.setPosition(w / 2, h * 0.62).setDisplaySize(Math.max(w * 1.05, 800), h * 0.24);
    this.hillsNear.setPosition(w / 2, h * 0.74).setDisplaySize(Math.max(w * 1.05, 800), h * 0.26);
    this.groundImg.setPosition(w / 2, h + 2).setDisplaySize(Math.max(w * 1.05, 800), h * 0.34);
    this.fountainImg.setPosition(w * 0.5, h * 0.6).setScale(m * 0.0009);

    // 아이가 만든 길
    this.trailG.clear();
    P.trails.slice(-5).forEach((tr, ti) => {
      const col = Phaser.Display.Color.HSLToColor((tr.hue % 360) / 360, 0.55, 0.5).color;
      this.trailG.lineStyle(9, col, 0.5);
      this.trailG.beginPath();
      tr.pts.forEach((p, i) => {
        const x = w * 0.2 + (p[0] / 100) * w * 0.6;
        const y = h * 0.66 + (p[1] / 100) * h * 0.2 + ti * 4;
        if (i === 0) this.trailG.moveTo(x, y); else this.trailG.lineTo(x, y);
      });
      this.trailG.strokePath();
    });

    // 꽃 (반짝 보상 + 꽃밭 해금)
    for (const f of this.flowerImgs) f.destroy();
    this.flowerImgs = [];
    const flowerN = Math.min(18, P.flowers) + (P.decor.includes('garden') ? 6 : 0);
    for (let i = 0; i < flowerN; i++) {
      const fx = (Math.sin(i * 87.7) * 0.5 + 0.5) * w * 0.9 + w * 0.05;
      const fy = h * (0.88 + (Math.cos(i * 55.3) * 0.5 + 0.5) * 0.07);
      const img = this.add.image(fx, fy, ['flower1', 'flower2', 'flower3'][i % 3])
        .setScale(m * 0.0007).setDepth(-35).setOrigin(0.5, 1);
      this.tweens.add({ targets: img, angle: rand(-5, 5), duration: rand(1800, 2600), yoyo: true, repeat: -1 });
      this.flowerImgs.push(img);
    }

    const signScale = clamp(m * 0.0012, 0.55, 1.05);
    this.signs.forEach(cont => {
      const isl = cont.islData;
      cont.setPosition(isl.nx * w, isl.ny * h);
      cont.imgRef.setScale(signScale);
      cont.labelRef.setPosition(0, cont.imgRef.displayHeight * 0.62).setFontSize(Math.max(17, 24 * signScale));
      cont.setSize(cont.imgRef.displayWidth, cont.imgRef.displayHeight + 30);
      // 컨테이너 히트 영역은 (0,0,w,h) 좌상단 규약 (common.js pressify 참고)
      cont.input && (cont.input.hitArea = new Phaser.Geom.Rectangle(0, 0, cont.width, cont.height));
    });
    this.easelCont.setPosition(w * 0.5, h * 0.82);
    this.easelCont.easelImg.setScale(signScale * 0.85);
    this.easelCont.easelLabel.setPosition(0, this.easelCont.easelImg.displayHeight * 0.58)
      .setFontSize(Math.max(15, 20 * signScale));
    this.easelCont.setSize(this.easelCont.easelImg.displayWidth, this.easelCont.easelImg.displayHeight + 26);
    if (this.easelCont.input) this.easelCont.input.hitArea = new Phaser.Geom.Rectangle(
      0, 0, this.easelCont.width, this.easelCont.height);

    const eggSign = this.signs[1];
    this.hintHand.setPosition(eggSign.x - eggSign.imgRef.displayWidth * 0.62, eggSign.y + 8).setAngle(40);
    this.hintText.setPosition(w / 2, h * 0.5).setFontSize(Math.max(17, m * 0.033));

    this.fireflies.setConfig ? null : null;
    this.fireflies.setPosition(0, h * 0.45);

    const band = this.wanderBand();
    for (const wk of this.walkers) {
      wk.x = clamp(wk.x, band.x0, band.x1);
      wk.y = clamp(wk.y, band.y0, band.y1);
    }
  }
}
