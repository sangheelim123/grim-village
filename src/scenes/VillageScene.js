import { addSky, addFlyers, popIn, pressify, textStyle, heartBurst, sparkleBurst } from './common.js';
import { store, creatureSize } from '../store.js';
import { makeCreatureSprite, drawArt2D } from '../creature.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { switchScene } from '../main.js';
import { DECOR_UNLOCKS, WEATHER, rand, pick, clamp } from '../config.js';

const ISLANDS = [
  { key: 'Road', sign: 'sign_road', name: '길 그리기', nx: 0.14, ny: 0.36, sc: 0.86 },
  { key: 'Egg', sign: 'sign_egg', name: '모양 알', nx: 0.86, ny: 0.36, sc: 0.86 },
  { key: 'Aqua', sign: 'sign_aqua', name: '수족관', nx: 0.5, ny: 0.33, sc: 0.8 },
  { key: 'Feed', sign: 'sign_feed', name: '냠냠', nx: 0.14, ny: 0.75, sc: 1.06 },
  { key: 'Sort', sign: 'sign_sort', name: '반짝', nx: 0.86, ny: 0.75, sc: 1.06 },
];

/* ───────── 날씨 ─────────
   비·눈·바람이 손님처럼 왔다 간다. 궂은 날씨에도 벌은 없다 —
   친구들은 '못 논다'가 아니라 '다르게 논다'(비 오면 집으로, 바람 불면 힘겹게, 눈 오면 받으려 폴짝).
   상태를 모듈 스코프에 두는 이유: 섬을 다녀와도(씬 재생성) 날씨가 이어져야
   "내가 없는 동안에도 마을이 흐르고 있었다"가 성립한다.
   this.time.now는 게임 시작 기준이라 씬을 넘어 연속이다.
   kind = 지금 화면에 그려지는 날씨, want = 일정표가 말하는 날씨.
   둘이 다르면 먼저 i를 0까지 내린 뒤에 갈아탄다 (날씨가 뚝 바뀌지 않게). */
const wx = { kind: 'clear', want: 'clear', i: 0, until: 0, dir: 1, snow: 0, wet: 0, gust: 0.6, lastKind: null };

/* 앱을 완전히 껐다 켜면 모듈 변수도 함께 사라진다 — 잠깐 자리를 비운 사이라면
   비가 그대로 내리고 있어야 세계가 이어진다. 오래 지났으면 새 하루처럼 맑음부터.
   프로필별 저장이 아니라 '마을의 지금'이므로 store와는 다른 키를 쓴다. */
const WX_KEY = 'village-v4-wx';
let wxLoaded = false;
function saveWx(t) {
  try {
    localStorage.setItem(WX_KEY, JSON.stringify({
      k: wx.kind, w: wx.want, i: +wx.i.toFixed(2), l: wx.lastKind, d: wx.dir,
      s: +wx.snow.toFixed(2), e: +wx.wet.toFixed(2),
      r: Math.max(0, Math.round(wx.until - t)), // 남은 시간 (게임 시각은 재시작하면 0부터라 저장 불가)
      at: Date.now(),
    }));
  } catch (e) {}
}
function loadWx(t) {
  wxLoaded = true;
  try {
    const d = JSON.parse(localStorage.getItem(WX_KEY) || 'null');
    if (!d || !d.at) return;
    const gap = (Date.now() - d.at) / 1000;
    if (gap < 0 || gap > WEATHER.resumeSec) return; // 오래 비웠다 — 새로 시작한다
    wx.kind = d.k; wx.want = d.w; wx.i = d.i; wx.lastKind = d.l; wx.dir = d.d;
    wx.snow = d.s; wx.wet = d.e;
    wx.until = t + Math.max(5, d.r - gap); // 자리를 비운 만큼 일정도 흘러 있다
  } catch (e) {}
}
const WX_INFO = {
  rain: {
    toast: '🌧️ 비가 내려요',
    lines: ['앗, 비가 와요! 다들 집으로 얼른!', '후두둑 후두둑! 비가 내려요!'],
  },
  snow: {
    toast: '❄️ 눈이 내려요',
    lines: ['우와, 하얀 눈이 내려요!', '눈이 펑펑 와요! 손을 내밀어 볼까요?'],
  },
  wind: {
    toast: '🍃 바람이 불어요',
    lines: ['씽씽! 바람이 불어요!', '바람이 세게 부네요. 친구들이 끙끙 걸어가요!'],
  },
};

export class VillageScene extends Phaser.Scene {
  constructor() { super('Village'); }

  create() {
    ui.topButtons('village');
    this.cameras.main.fadeIn(250, 255, 255, 255);
    const P = store.P;

    this.bg = addSky(this, { clouds: 3 });
    this.nightSky = this.add.image(0, 0, 'sky_night').setOrigin(0).setDepth(-99).setAlpha(0);
    // 노을 레이어 (해질녘·해뜰녘에만 하늘 아래쪽이 주황빛으로 물든다)
    this.duskG = this.add.graphics().setDepth(-89);
    this._lastGlow = -1;
    // 밤하늘 별 (밤에만 반짝반짝)
    this.stars = [];
    for (let i = 0; i < 16; i++) {
      const s = this.add.image(0, 0, 'sparkle').setDepth(-92).setAlpha(0).setScale(0.2 + Math.random() * 0.14);
      s.fx = Math.random(); s.fy = 0.03 + Math.random() * 0.32; s.tw = Math.random() * 6.3;
      this.stars.push(s);
    }
    // 해·달: 왼쪽 지평선에서 떠서 가운데를 지나 오른쪽으로 진다 (update가 위치를 몬다)
    this.sun = this.add.image(0, 0, 'sun').setDepth(-88);
    this.moon = this.add.image(0, 0, 'moon').setDepth(-88).setAlpha(0);
    this.cycleOffset = 0; // 테스트·디버그용 시간 이동
    this.tweens.add({ targets: [this.sun, this.moon], angle: 6, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 해님·달님도 만질 수 있다 (탭 보상 문법 그대로)
    const skyTaps = [
      [this.sun, ['앗, 뜨거워라! 히히!', '해님이 방긋 웃어요!']],
      [this.moon, ['쉿! 달님이 인사해요', '좋은 꿈 꾸세요~']],
    ];
    for (const [obj, lines] of skyTaps) {
      obj.setInteractive(new Phaser.Geom.Circle(obj.width / 2, obj.height / 2, obj.width * 0.55), Phaser.Geom.Circle.Contains);
      obj.on('pointerdown', () => {
        if (obj.alpha < 0.4) return; // 져 있는 동안은 반응하지 않는다
        audio.squeak();
        sparkleBurst(this, obj.x, obj.y, 8);
        this.tweens.add({ targets: obj, scale: obj.scale * 1.15, duration: 150, yoyo: true });
        if (Math.random() < 0.5) audio.speak(pick(lines), { pri: 2 });
      });
    }

    this.rainbowImg = this.add.image(0, 0, 'rainbow').setDepth(-72).setAlpha(P.decor.includes('rainbow') ? 0.85 : 0);
    this.hillsFar = this.add.image(0, 0, 'hills_far').setOrigin(0.5, 1).setDepth(-70);
    this.hillsNear = this.add.image(0, 0, 'hills_near').setOrigin(0.5, 1).setDepth(-60);
    this.groundImg = this.add.image(0, 0, 'ground').setOrigin(0.5, 1).setDepth(-50);
    this.trailG = this.add.graphics().setDepth(-45);

    this.flowerImgs = [];
    this.fountainImg = this.add.image(0, 0, 'fountain').setDepth(-40).setVisible(P.decor.includes('fountain'));

    // 마을에 집과 나무 — 지금까지 '마을'인데 집이 한 채도 없었다.
    // 캐릭터가 돌아다니는 띠(x 0.24~0.76) 바깥에 두어 겹치지 않게 한다.
    this.props = [
      { key: 'house', nx: 0.09, ny: 0.66, s: 1.00, tint: 0xffffff, win: true },
      { key: 'house', nx: 0.20, ny: 0.63, s: 0.74, tint: 0xbfe0ff, win: true },
      { key: 'house', nx: 0.91, ny: 0.65, s: 0.86, tint: 0xffe0b0, win: true },
      { key: 'tree', nx: 0.015, ny: 0.71, s: 0.60 },
      { key: 'tree', nx: 0.985, ny: 0.69, s: 0.54 },
    ].map(d => {
      const im = this.add.image(0, 0, d.key).setOrigin(0.5, 1).setDepth(-42);
      if (d.tint) im.setTint(d.tint);
      im.d = d;
      // 밤이면 창문에 불이 들어온다
      if (d.win) im.winLights = [-0.19, 0.19].map(() => this.add.image(0, 0, 'dot').setTint(0xffd98a).setDepth(-41).setAlpha(0));
      return im;
    });

    // 놀이 섬 입구
    this.signs = ISLANDS.map(isl => {
      const cont = this.add.container(0, 0).setDepth(10);
      const plat = this.add.image(0, 0, 'island_platform');
      const img = this.add.image(0, 0, isl.sign);
      const label = this.add.text(0, 0, isl.name, textStyle(24, '#ffffff', '#b5794a', 7)).setOrigin(0.5);
      cont.add([plat, img, label]);
      cont.islData = isl; cont.imgRef = img; cont.labelRef = label; cont.platRef = plat;
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

    // 그림 게시판 — 아이가 그림 놀이터에서 건 그림이 마을에 실제로 걸린다
    // 위치는 간판들 사이의 빈 띠(세로 0.58) — 좁은 폰에서 간판 히트 영역에 묻히지 않는 곳
    this.boardCont = this.add.container(0, 0).setDepth(11);
    const boardBg = this.add.image(0, 0, 'panel').setDisplaySize(112, 100);
    this.boardCont.add(boardBg);
    this.boardBg = boardBg;
    this.boardArt = null;
    this.refreshBoard();
    this.boardCont.setSize(112, 112);
    pressify(this, this.boardCont, () => ui.openGallery());
    this.tweens.add({ targets: this.boardCont, angle: -1.5, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 캐릭터들 (짝꿍은 절대 밀려나지 않는다)
    this.walkers = [];
    for (const char of store.villageChars(8)) this.spawnWalker(char);

    // 근접 이모트: 친구끼리 가까워지면 인사 (내 창작물들이 한 세계에 산다)
    this.emoteCooldown = new Map();
    this.time.addEvent({ delay: 2600, loop: true, callback: () => this.checkEmotes() });

    // 빈 마을 안내
    this.hintHand = this.add.image(0, 0, 'hand').setDepth(60).setVisible(false).setScale(0.8);
    this.hintText = this.add.text(0, 0, '모양 알 섬에서 그림을 그리면\n친구가 태어나요!',
      textStyle(24, '#ffffff', '#e8955c', 8)).setOrigin(0.5).setAlign('center').setDepth(60).setVisible(false);
    if (P.chars.length === 0) {
      this.hintHand.setVisible(true).setAngle(30);
      this.hintText.setVisible(true);
      this.tweens.add({ targets: this.hintHand, y: '+=16', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // 반딧불 (밤 + 해금)
    this.fireflies = this.add.particles(0, 0, 'sparkle', {
      x: { min: 0, max: this.scale.width }, y: { min: 0, max: this.scale.height * 0.42 },
      lifespan: 4000, scale: { start: 0.16, end: 0 },
      alpha: { start: 0.9, end: 0 }, speed: { min: 4, max: 18 },
      quantity: 1, frequency: 600, tint: 0xfff09a,
    }).setDepth(-30);
    this.fireflies.stop();

    // 화면을 가로지르는 생명 — 정지한 세계에 숨을 넣는다 (마리 수는 꼭 적게)
    this.butterflies = addFlyers(this, 3, { y0: 0.62, y1: 0.86, depth: 25 });
    this.birds = addFlyers(this, 2, { key: 'bird', y0: 0.12, y1: 0.28, depth: -85, scale: 0.7, tint: 0xa8c0d8 });

    this.wx = wx; // 디버그·테스트에서 들여다볼 수 있게
    if (!wxLoaded) loadWx(this.time.now / 1000); // 페이지 수명당 한 번만
    this.createWeather();

    this.layout();
    popIn(this, this.signs.concat([this.easelCont]), { delay: 70 });
    /* 다른 섬에 다녀오는 동안 날씨 시계는 멈춰 있었다 — 들어오자마자
       날씨가 홱 바뀌면 인사말과 겹쳐 어수선하다. 조금 뒤로 미룬다. */
    const tNow = this.time.now / 1000;
    if (wx.until && tNow > wx.until - 3) wx.until = tNow + rand(6, 18);
    /* 이미 비가 내리는 중이었다면 친구들은 벌써 집에 모여 있어야 한다.
       want으로 보는 이유: 비가 막 시작된 찰나에 섬을 다녀오면 kind는 아직 'clear'라
       (페이드 중) 아무도 대피하지 않은 채 비를 맞고 서 있게 된다. */
    if (wx.want === 'rain') this.walkers.forEach((c, i) => this.goShelter(c, i, wx.i > 0.35));
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      audio.setWeather('clear', 0); // 마을을 떠나면 빗소리·바람소리도 함께 멎는다
      saveWx(this.time.now / 1000);  // 섬에서 앱이 꺼져도 마지막 날씨는 남는다
      for (const w of this.walkers) if (w.destroyTexture) w.destroyTexture();
    });

    // 해금 알림이 있으면 인사말은 생략 (알림을 350ms 만에 삼키지 않도록)
    const unlocked = this.checkNewDecor();
    if (!P.intro) {
      P.intro = true; store.save();
      this.time.delayedCall(500, () => audio.speak('무럭무럭 그림 마을에 잘 왔어요! 모양 알 섬에서 그림을 그리면, 친구가 태어나요!'));
    } else if (!unlocked && P.chars.length > 0) {
      this.time.delayedCall(350, () => audio.speak('친구들이 기다리고 있었어요!', { pri: 2 }));
    }
  }

  /* 게시판에 가장 최근 그림을 굽는다 (없으면 "그려 보세요" 안내) */
  refreshBoard() {
    const arts = store.P.arts || [];
    const has = arts.length > 0;
    this.boardCont.setVisible(true);
    if (this.boardArt) { this.boardArt.destroy(); this.boardArt = null; }
    if (this.boardTip) { this.boardTip.destroy(); this.boardTip = null; }
    if (has) {
      const key = `board-${arts[arts.length - 1].b || 0}`;
      if (!this.textures.exists(key)) {
        const tex = this.textures.createCanvas(key, 220, 220);
        drawArt2D(tex.getContext(), arts[arts.length - 1], 110, 110, 200);
        tex.refresh();
      }
      this.boardArt = this.add.image(0, -2, key).setDisplaySize(82, 82);
      this.boardCont.add(this.boardArt);
    } else {
      this.boardTip = this.add.text(0, 0, '🖼️\n그림을\n걸어 봐요', textStyle(12, '#9a8a70'))
        .setOrigin(0.5).setAlign('center');
      this.boardCont.add(this.boardTip);
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
    cont.zzzBaseY = zzz.y;
    cont.gen = 0;        // 이동 '세대' — 날씨가 바뀌면 올려서 옛 트윈 체인을 무효화한다
    cont.mode = 'wander';
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
        cont._angleLock = true; // 이 동안은 바람 기울기가 끼어들지 않는다
        this.tweens.add({ targets: cont, angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: 3,
          onComplete: () => { cont._angleLock = false; cont.setAngle(0); cont.setEyesClosed(false); } });
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
    this.later(cont, rand(300, 1500), () => this.wander(cont));
    return cont;
  }

  wakeUp(cont) {
    cont.sleeping = false;
    this.tweens.killTweensOf(cont.zzzText);
    cont.zzzText.setVisible(false).setY(cont.zzzBaseY);
    cont.setEyesClosed(false);
  }

  /* 이동 체인 끊기: 세대를 올리면 진행 중이던 트윈·예약이 전부 무효가 된다.
     (날씨가 바뀔 때 옛 목적지로 계속 걸어가는 유령을 막는다) */
  moveStop(cont) {
    cont.gen = (cont.gen || 0) + 1;
    this.tweens.killTweensOf(cont);
    if (cont.idleEv) { cont.idleEv.remove(); cont.idleEv = null; }
    cont.scaleY = 1;
    cont.setAngle(0);
  }

  later(cont, ms, fn) {
    const g = cont.gen;
    cont.idleEv = this.time.delayedCall(ms, () => {
      if (!cont.active || cont.gen !== g || !this.scene.isActive()) return;
      fn();
    });
  }

  /* 머리 위로 떠오르는 한 글자 감정 */
  emoteAt(cont, em) {
    if (!cont.active) return;
    const t = this.add.text(cont.x, cont.y - cont.baseSize * 0.9, em, textStyle(22)).setOrigin(0.5).setDepth(40);
    this.tweens.add({
      targets: t, y: t.y - 32, alpha: 0, duration: 1350, ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
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
        for (const w of [a, b]) this.emoteAt(w, em);
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
    cont.mode = 'wander';
    const g = cont.gen;
    const pers = cont.pers || 0;
    const band = this.wanderBand();
    const tx = rand(band.x0, band.x1);
    const ty = clamp(cont.y + rand(-40, 40), band.y0, band.y1);
    cont.bodyImg.setFlipX(tx < cont.x);
    const dist = Math.hypot(tx - cont.x, ty - cont.y);
    let speed = pers === 0 ? 0.05 : pers === 1 ? 0.026 : 0.035; // 씩씩이 빠름, 잠꾸러기 느긋
    /* 날씨가 걸음을 바꾼다 — 바람 앞에서는 누구나 느려지고(힘겹다),
       눈길에서는 조심조심. 성격 차이는 그대로 유지된다(곱하기라서). */
    const base = wx.kind === 'wind' ? 0.42 : wx.kind === 'snow' ? 0.72 : 1;
    speed *= 1 - (1 - base) * wx.i;
    const hop = this.tweens.add({
      targets: cont, scaleY: 0.94,
      duration: (pers === 0 ? 130 : 170) * (wx.kind === 'wind' ? 1 + wx.i * 0.8 : 1),
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: cont, x: tx, y: ty, duration: dist / speed, ease: 'Sine.easeInOut',
      onComplete: () => {
        hop.stop(); cont.scaleY = 1;
        if (!cont.active || cont.gen !== g) return;
        // 씩씩이: 도착하면 가끔 신나서 폴짝
        if (pers === 0 && Math.random() < 0.4) {
          this.tweens.add({ targets: cont, y: cont.y - 24, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
        }
        let idle = rand(1400, 3600);
        if (wx.i > 0.5 && wx.kind === 'snow' && Math.random() < 0.5) {
          // 눈: 손 내밀어 눈을 받으려고 폴짝 (궂은 날씨도 놀이가 된다)
          this.emoteAt(cont, '❄️');
          this.tweens.add({ targets: cont, y: cont.y - 22, duration: 210, yoyo: true, ease: 'Quad.easeOut' });
        } else if (wx.i > 0.5 && wx.kind === 'wind' && Math.random() < 0.45) {
          // 바람: 한 번씩 밀려났다가 버틴다
          this.emoteAt(cont, pick(['💨', '😣']));
          this.tweens.add({ targets: cont, x: cont.x + wx.dir * 26, duration: 430, yoyo: true, ease: 'Sine.easeInOut' });
          idle = rand(1800, 3800);
        } else if (pers === 1 && Math.random() < 0.45) {
          // 잠꾸러기: 가끔 그 자리에서 새근새근 (단일 체인이라 순간이동 버그 없음)
          idle = rand(5000, 8000);
          cont.sleeping = true;
          cont.setEyesClosed(true);
          cont.zzzText.setVisible(true);
          this.tweens.add({ targets: cont.zzzText, y: cont.zzzBaseY - 6, duration: 800, yoyo: true, repeat: 4 });
        }
        this.later(cont, idle, () => {
          if (cont.sleeping) this.wakeUp(cont);
          this.wander(cont);
        });
      },
    });
  }

  /* ───────── 날씨: 만들기 ───────── */

  createWeather() {
    const { width: w, height: h } = this.scale;
    /* 빗줄기: dot을 세로로 길게 늘여 쓴다 (새 그림 없이).
       캐릭터보다 앞(46)에 내려야 "세계 전체가 비에 잠겼다"로 읽힌다. */
    this.rainEm = this.add.particles(0, 0, 'dot', {
      x: { min: -w * 0.2, max: w * 1.2 }, y: -24,
      speedY: { min: 800, max: 1040 }, speedX: { min: 100, max: 190 },
      lifespan: 1100, quantity: 2, frequency: 30,
      scaleX: 0.065, scaleY: 0.55, rotate: -9,
      alpha: { start: 0.6, end: 0.32 }, tint: 0xd8edff,
    }).setDepth(46);
    this.rainEm.stop();
    /* 땅에 닿아 튀는 물방울 — 비가 '내리기만' 하면 세계에 닿지 않는다 */
    this.splashEm = this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: w }, y: { min: h * 0.86, max: h * 0.99 },
      speedY: { min: -90, max: -40 }, speedX: { min: -26, max: 26 }, gravityY: 320,
      lifespan: 460, quantity: 1, frequency: 55,
      scale: { start: 0.08, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0xe6f6ff,
    }).setDepth(-20);
    this.splashEm.stop();
    /* 눈: 앞뒤 두 겹이라 깊이가 생긴다 (뒤는 작고 흐리고 느리게) */
    this.snowBackEm = this.add.particles(0, 0, 'dot', {
      x: { min: -30, max: w + 30 }, y: -14,
      speedY: { min: 26, max: 52 }, speedX: { min: -18, max: 18 },
      lifespan: 16000, quantity: 1, frequency: 240,
      scale: { min: 0.05, max: 0.09 }, alpha: 0.55, tint: 0xffffff,
    }).setDepth(-24);
    this.snowBackEm.stop();
    this.snowEm = this.add.particles(0, 0, 'dot', {
      x: { min: -30, max: w + 30 }, y: -18,
      speedY: { min: 40, max: 88 }, speedX: { min: -30, max: 30 },
      lifespan: 11000, quantity: 1, frequency: 150,
      scale: { min: 0.09, max: 0.19 }, alpha: { start: 0.95, end: 0.8 }, tint: 0xffffff,
    }).setDepth(47);
    this.snowEm.stop();
    /* 바람: 나뭇잎이 빙글빙글 돌며 화면을 가로지른다 — 보이지 않는 바람의 몸 */
    this.leafEm = this.add.particles(0, 0, 'leaf', {
      x: -40, y: { min: h * 0.18, max: h * 0.92 },
      speedX: { min: 170, max: 360 }, speedY: { min: -40, max: 50 },
      accelerationY: 26,
      lifespan: 6000, quantity: 1, frequency: 340,
      scale: { min: 0.14, max: 0.3 },
      rotate: { start: 0, end: 700 },
      alpha: { start: 0.95, end: 0.75 },
      tint: [0x8fd05a, 0xd9b23e, 0xe08a4a],
    }).setDepth(44);
    this.leafEm.stop();

    /* 눈이 쌓인 자리: 언덕·땅과 똑같은 실루엣을 흰색으로 덮는다.
       setTint는 곱하기라 초록 언덕을 하얗게 만들 수 없다 → setTintFill(실루엣 채우기).
       원본보다 조금 위에 놓아 아래쪽에 원래 색이 한 줄 남게 한다.
       tintFill은 WebGL 전용이다 — Canvas로 떨어진 기기에서는 언덕이 두 겹으로
       비쳐 보이므로 아예 만들지 않는다 (눈송이만으로도 눈은 충분히 읽힌다). */
    const webgl = this.game.renderer && this.game.renderer.type === Phaser.WEBGL;
    this.snowCaps = !webgl ? [] : [this.hillsFar, this.hillsNear, this.groundImg].map(src => {
      const im = this.add.image(0, 0, src.texture.key).setOrigin(0.5, 1)
        .setDepth(src.depth + 1).setAlpha(0);
      try { im.setTintFill(0xf2f9ff); } catch (e) { im.setTint(0xf2f9ff); }
      im.src = src;
      return im;
    });
    /* 비 온 뒤 물웅덩이 — 비가 그쳐도 세계에 자국이 남고 천천히 마른다 */
    this.puddleG = this.add.graphics().setDepth(-44);
    this._wetDrawn = -1;
    this._wxAppliedI = -1;
    this.fitWeather();
    this.applyWindDir();
    this.syncWeatherEmitters();
  }

  /* 화면 크기가 바뀌면 파티클의 범위와 수명도 다시 맞춘다
     (수명이 화면보다 짧으면 비가 공중에서 사라지고, 길면 헛돈다) */
  fitWeather() {
    if (!this.rainEm) return;
    const { width: w, height: h } = this.scale;
    const set = fn => { try { fn(); } catch (e) {} };
    set(() => this.rainEm.ops.x.onChange(-w * 0.2, w * 1.2));
    set(() => this.rainEm.ops.lifespan.onChange((h + 90) * 1.15));
    set(() => this.splashEm.ops.x.onChange(0, w));
    set(() => this.splashEm.ops.y.onChange(h * 0.86, h * 0.99));
    set(() => this.snowEm.ops.x.onChange(-30, w + 30));
    set(() => this.snowEm.ops.lifespan.onChange(Math.min(20000, (h + 60) * 16)));
    set(() => this.snowBackEm.ops.x.onChange(-30, w + 30));
    set(() => this.snowBackEm.ops.lifespan.onChange(Math.min(26000, (h + 60) * 26)));
    set(() => this.leafEm.ops.y.onChange(h * 0.18, h * 0.92));
    set(() => this.leafEm.ops.lifespan.onChange(Math.min(9000, (w + 120) * 4)));
    this.applyWindDir();
  }

  /* 바람이 부는 쪽으로 비도 기울고 나뭇잎도 날아간다 */
  applyWindDir() {
    if (!this.rainEm) return;
    const { width: w } = this.scale;
    const d = wx.dir;
    const rng = (op, a, b) => { try { op.onChange(Math.min(a, b), Math.max(a, b)); } catch (e) {} };
    const one = (op, v) => { try { op.onChange(v); } catch (e) {} };
    rng(this.rainEm.ops.speedX, d * 100, d * 190);
    one(this.rainEm.ops.rotate, -d * 9);
    one(this.leafEm.ops.x, d > 0 ? -40 : w + 40);
    rng(this.leafEm.ops.speedX, d * 170, d * 360);
  }

  /* 지금 날씨·세기에 맞춰 파티클을 켜고 끈다 (세기가 약할수록 드문드문) */
  syncWeatherEmitters() {
    if (!this.rainEm) return;
    const i = wx.i, k = wx.kind;
    const on = (em, want, freq, qty) => {
      if (!em) return;
      if (want) {
        try { em.setFrequency(freq, qty); } catch (e) {}
        if (!em.emitting) em.start();
      } else if (em.emitting) em.stop();
    };
    const lively = i > 0.05;
    const slow = f => Math.round(f / clamp(i, 0.2, 1));
    on(this.rainEm, k === 'rain' && lively, slow(30), 2);
    on(this.splashEm, k === 'rain' && i > 0.3, slow(55), 1);
    on(this.snowEm, k === 'snow' && lively, slow(150), 1);
    on(this.snowBackEm, k === 'snow' && lively, slow(240), 1);
    on(this.leafEm, k === 'wind' && lively, slow(340), 1);
  }

  /* ───────── 날씨: 시간 ───────── */

  stepWeather(nowMs, dtMs) {
    const t = nowMs / 1000;
    const dt = Math.min(0.05, dtMs / 1000);
    if (!wx.until) wx.until = t + rand(WEATHER.firstSec[0], WEATHER.firstSec[1]);
    if (t >= wx.until) this.rollWeather(t);

    // 시작도 끝도 뚝 끊기지 않게 (kind는 i가 0이 된 뒤에만 갈아탄다)
    const target = wx.want === wx.kind ? 1 : 0;
    const sp = dt / WEATHER.fadeSec;
    wx.i = target > wx.i ? Math.min(target, wx.i + sp) : Math.max(target, wx.i - sp);
    if (wx.want !== wx.kind && wx.i <= 0.0001) {
      wx.kind = wx.want; wx.i = 0;
      this.applyWindDir();
      this.syncWeatherEmitters();
    }
    // 돌풍: 느린 사인 둘이 겹쳐 불규칙하게 밀려온다 (0.42~1.0)
    wx.gust = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * 1.05)) * (0.55 + 0.45 * Math.sin(t * 0.37 + 1.2));

    const rainI = wx.kind === 'rain' ? wx.i : 0;
    const snowI = wx.kind === 'snow' ? wx.i : 0;
    // 젖고 마르고, 쌓이고 녹는다 — 날씨보다 느리게 움직여야 세계가 두꺼워진다
    wx.wet = clamp(wx.wet + (rainI > 0.3 ? dt / 14 : -dt / 45), 0, 1);
    wx.snow = clamp(wx.snow + (snowI > 0.3 ? dt / 20 : -dt / 50), 0, 1);
    if (Math.abs(wx.wet - this._wetDrawn) > 0.04) { this._wetDrawn = wx.wet; this.drawPuddles(); }
    for (const c of this.snowCaps) c.setAlpha(wx.snow * 0.82);
    if (Math.abs(wx.i - this._wxAppliedI) > 0.08) { this._wxAppliedI = wx.i; this.syncWeatherEmitters(); }
    if (t - (this._wxSavedAt || 0) > 4) { this._wxSavedAt = t; saveWx(t); }
    // 소리는 계단식으로만 갱신한다 (매 프레임 setTargetAtTime을 쌓지 않는다)
    const lvl = Math.round(wx.i * 8) / 8;
    if (lvl !== this._wxSndI || wx.kind !== this._wxSndKind) {
      this._wxSndI = lvl; this._wxSndKind = wx.kind;
      audio.setWeather(wx.kind, lvl);
    }
    return { rainI, snowI, windI: wx.kind === 'wind' ? wx.i : 0 };
  }

  /* 무슨 날씨가 올지 고르기.
     - 밤에는 눈 가중치가 올라간다 (유일하게 의도한 편향 — 밤+눈이 제일 예쁘다)
     - 직전과 같은 날씨는 확률을 낮춘다. 완전 균등 난수는 "또 비야?"가 자주 나와
       오히려 규칙처럼 느껴진다 (pickVary가 대사에 쓰는 것과 같은 생각).
     - hard=true면 아예 제외한다 (맑음 없이 곧바로 이어질 때는 같은 날씨면 안 된다) */
  pickWeather(avoid, hard) {
    const night = (this._nf || 0) > 0.5;
    const w = {
      rain: WEATHER.weight.rain,
      wind: WEATHER.weight.wind,
      snow: WEATHER.weight.snow * (night ? WEATHER.snowNightBoost : 1),
    };
    if (avoid && w[avoid] != null) w[avoid] *= hard ? 0 : WEATHER.repeatDamp;
    const ent = Object.entries(w);
    let r = Math.random() * ent.reduce((a, b) => a + b[1], 0);
    for (const [k, v] of ent) if ((r -= v) <= 0) return k;
    return ent[0][0];
  }

  rollWeather(t) {
    // 짧은 쪽으로 치우친 난수 — 균등하면 길이가 늘 비슷해 '주기'처럼 들킨다
    const span = ([a, b]) => a + (b - a) * Math.pow(Math.random(), WEATHER.skew);
    const startSpell = (avoid, hard) => {
      const kind = this.pickWeather(avoid, hard);
      wx.want = kind;
      wx.dir = Math.random() < 0.5 ? -1 : 1;
      wx.until = t + span(WEATHER.spellSec);
      this.onWeatherStart(kind);
    };
    if (wx.want === 'clear') { startSpell(wx.lastKind); return; }

    const prev = wx.want;
    wx.lastKind = prev;
    /* 궂은 날씨 뒤에 반드시 맑음이 오면 그 교대 자체가 규칙이 된다 —
       가끔은 맑음을 건너뛰고 다른 날씨가 바로 이어진다 (비 그치자마자 바람) */
    if (Math.random() < WEATHER.chainChance) {
      startSpell(prev, true); // 대피해 있던 친구들은 onWeatherStart가 마당으로 내보낸다
      return;
    }
    wx.want = 'clear';
    wx.until = t + span(WEATHER.clearSec);
    this.onWeatherEnd(prev);
  }

  /* 테스트·디버그용 즉시 전환 */
  forceWeather(kind, secs, instant) {
    const t = this.time.now / 1000;
    const prev = wx.want !== 'clear' ? wx.want : wx.kind;
    if (kind === 'clear') {
      wx.want = 'clear';
      wx.until = t + (secs || 60);
      this.onWeatherEnd(prev);
    } else {
      wx.want = kind;
      wx.dir = 1;
      wx.until = t + (secs || 40);
      this.onWeatherStart(kind);
    }
    if (instant) {
      wx.kind = wx.want;
      wx.i = wx.want === 'clear' ? 0 : 1;
      this._wxAppliedI = wx.i;
      this.applyWindDir();
      this.syncWeatherEmitters();
    }
  }

  /* ───────── 날씨: 친구들의 반응 ───────── */

  onWeatherStart(kind) {
    this.applyWindDir();
    const info = WX_INFO[kind];
    if (info) {
      ui.toast(info.toast);
      // pri 2 — 안내 음성이 나오는 중이면 조용히 넘어간다 (말이 겹치지 않는다)
      this.time.delayedCall(300, () => audio.speak(pick(info.lines), { pri: 2 }));
    }
    if (kind === 'rain') {
      // 비 = 집으로! 자던 친구도 깨서 종종걸음으로 뛰어간다
      this.walkers.forEach((c, i) => this.goShelter(c, i, false));
    } else {
      /* 걸음걸이는 wander()가 출발할 때 정해진다 — 가던 걸음을 끊고 다시 출발시켜야
         바람이 부는 순간 곧바로 '힘겨워' 보인다 (안 그러면 몇 초 뒤에야 바뀐다) */
      this.walkers.forEach((c, i) => this.restartWander(c, 60 + i * 90));
      const em = kind === 'snow' ? '❄️' : '💨';
      this.walkers.slice(0, 3).forEach(c => this.emoteAt(c, em));
    }
  }

  restartWander(cont, delayMs) {
    if (!cont.active) return;
    this.moveStop(cont);
    if (cont.sleeping) this.wakeUp(cont);
    cont.mode = 'wander';
    this.later(cont, delayMs, () => this.wander(cont));
  }

  onWeatherEnd(prev) {
    if (prev === 'clear') { // 이미 맑았다면 걸음만 원래대로
      this.walkers.forEach((c, i) => this.restartWander(c, 60 + i * 90));
      return;
    }
    /* 날씨는 fadeSec에 걸쳐 물러간다 — "그쳤어요"는 실제로 잦아든 뒤에 말해야 참이 된다.
       (아직 비가 쏟아지는데 그쳤다고 하면, 날씨 말을 배우는 중인 아이에게 거짓말이 된다) */
    this.time.delayedCall(WEATHER.fadeSec * 660, () => {
      if (!this.scene.isActive() || wx.want !== 'clear') return;
      const rainbow = prev === 'rain' && (this._nf || 0) < 0.35;
      if (prev === 'rain') {
        ui.toast(rainbow ? '🌈 비가 그치고 무지개!' : '☁️ 비가 그쳤어요');
        this.time.delayedCall(400, () => audio.speak(rainbow
          ? '비가 그쳤어요! 우와, 무지개가 떴어요!'
          : '비가 그쳤어요! 다시 놀러 나가요!', { pri: 2 }));
        if (rainbow) this.showRainbow();
      } else if (prev === 'snow') ui.toast('☀️ 눈이 그쳤어요');
      else if (prev === 'wind') ui.toast('☀️ 바람이 잦아들었어요');

      this.walkers.forEach((c, i) => {
        if (c.mode === 'shelter') this.emoteAt(c, rainbow ? '🌈' : '✨');
        // 날씨가 물러가면 걸음도 다시 가벼워진다
        this.restartWander(c, c.mode === 'shelter' ? rand(200, 1400) : 60 + i * 90);
      });
    });
  }

  showRainbow() {
    const keep = store.P.decor.includes('rainbow') ? 0.85 : 0;
    this.tweens.killTweensOf(this.rainbowImg);
    this.tweens.add({
      targets: this.rainbowImg, alpha: 0.95, duration: 2200, ease: 'Sine.easeOut',
      onComplete: () => this.time.delayedCall(11000, () => {
        if (!this.scene.isActive()) return;
        this.tweens.add({ targets: this.rainbowImg, alpha: keep, duration: 2600 });
      }),
    });
  }

  /* 비를 피할 자리: 집 앞에 나란히. 세 집에 번갈아 배정해 한 집에 몰리지 않는다 */
  shelterSlots() {
    const { width: w, height: h } = this.scale;
    const homes = this.props.filter(p => p.d.win);
    const out = [];
    for (let k = 0; k < 3; k++) {
      for (const im of homes) {
        out.push({
          x: clamp(im.x + (k - 1) * im.displayWidth * 0.32, w * 0.045, w * 0.955),
          y: im.y + h * 0.02 + (k === 1 ? h * 0.012 : 0),
        });
      }
    }
    return out;
  }

  goShelter(cont, idx, instant) {
    if (!cont.active) return;
    const slots = this.shelterSlots();
    if (!slots.length) return;
    const s = slots[idx % slots.length];
    this.moveStop(cont);
    if (cont.sleeping) this.wakeUp(cont);
    cont.mode = 'shelter';
    if (instant) { cont.setPosition(s.x, s.y); this.shelterIdle(cont); return; }
    cont.bodyImg.setFlipX(s.x < cont.x);
    const g = cont.gen;
    const dist = Math.hypot(s.x - cont.x, s.y - cont.y);
    // 빗속에서는 성격과 상관없이 다 같이 종종걸음 (급한 발놀림 = 빠른 hop)
    const hop = this.tweens.add({
      targets: cont, scaleY: 0.9, duration: 95, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: cont, x: s.x, y: s.y, duration: clamp(dist / 0.13, 450, 3200), ease: 'Sine.easeOut',
      onComplete: () => {
        hop.stop(); cont.scaleY = 1;
        if (!cont.active || cont.gen !== g) return;
        cont.bodyImg.setFlipX(false);
        this.shelterIdle(cont);
      },
    });
  }

  /* 처마 밑에서 옹기종기 — 가만히 서 있기만 하면 '멈춘 세계'가 된다 */
  shelterIdle(cont) {
    this.later(cont, rand(1300, 3400), () => {
      if (Math.random() < 0.55) {
        this.tweens.add({ targets: cont, y: cont.y - 9, duration: 240, yoyo: true, ease: 'Quad.easeOut' });
      } else this.emoteAt(cont, pick(['💧', '☂️', '🏠', '💗']));
      this.shelterIdle(cont);
    });
  }

  drawPuddles() {
    const g = this.puddleG;
    if (!g) return;
    g.clear();
    if (wx.wet < 0.03) return;
    const { width: w, height: h } = this.scale;
    for (let i = 0; i < 7; i++) {
      const px = w * (0.07 + 0.13 * i) + Math.sin(i * 41.3) * w * 0.03;
      const py = h * (0.9 + 0.035 * (Math.cos(i * 23.7) * 0.5 + 0.5));
      const rw = w * (0.05 + 0.03 * (Math.sin(i * 17.1) * 0.5 + 0.5));
      g.fillStyle(0xa9dcf7, wx.wet * 0.42);
      g.fillEllipse(px, py, rw * 2, rw * 0.5);
    }
  }

  update(now, delta) {
    /* 4분 주기: 해가 왼쪽 지평선에서 떠서 가운데를 지나 오른쪽으로 지고(0~112초),
       노을이 물들며 밤이 오면(112~128초) 달이 같은 길을 따라간다(126~224초).
       해·달은 언덕(-70)보다 뒤(-88)라 지평선 뒤로 자연스럽게 잠긴다. */
    const { width: w, height: h } = this.scale;
    const T = 240;
    const t = ((now / 1000) + this.cycleOffset) % T;
    const bell = (x, c, sd) => Math.exp(-((x - c) * (x - c)) / (2 * sd * sd));

    let nf = 0;
    if (t >= 112 && t < 128) nf = (t - 112) / 16;
    else if (t >= 128 && t < 222) nf = 1;
    else if (t >= 222) nf = 1 - (t - 222) / 18;
    this.nightSky.setAlpha(nf);
    this._nf = nf; // 날씨 추첨(밤엔 눈이 더 자주)·무지개 판단이 참조한다

    /* 날씨는 낮밤 위에 한 겹 더 얹힌다 — 흐림(overcast)이 해·노을·별·색을
       한꺼번에 눌러 준다. 값 하나로 묶어야 "구름 낀 날"이 따로 놀지 않는다. */
    const W = this.stepWeather(now, delta || 16);
    const overcast = clamp(W.rainI * 0.92 + W.snowI * 0.4 + W.windI * 0.18, 0, 1);
    // 바람이 불면 구름이 눈에 띄게 빨라진다 (보이지 않는 바람을 하늘이 대신 보여 준다)
    this.bg.step(Math.min(0.05, (delta || 16) / 1000) * (1 + W.windI * 2.6 * wx.gust), w);

    // 해·달 호 궤적: 좌측 하단 → 중앙 상단 → 우측 하단
    const horizonY = h * 0.68, apexY = h * 0.1;
    const arc = p => ({ x: w * (0.05 + 0.9 * p), y: horizonY - Math.sin(p * Math.PI) * (horizonY - apexY) });
    const skyDim = 1 - overcast * 0.92; // 구름 뒤로 해·달이 숨는다
    if (t < 112) {
      const q = arc(t / 112);
      this.sun.setPosition(q.x, q.y).setAlpha(skyDim);
    } else this.sun.setAlpha(0);
    if (t >= 126 && t <= 224) {
      const q = arc((t - 126) / 98);
      this.moon.setPosition(q.x, q.y).setAlpha(skyDim);
    } else this.moon.setAlpha(0);

    // 노을: 해질녘이 가장 붉고, 새벽·아침은 은은하게 (흐린 날엔 노을도 흐려진다)
    const glow = Math.min(1, bell(t, 107, 11) + bell(t, 233, 9) * 0.8 + bell(t, 6, 8) * 0.6) * (1 - overcast * 0.85);
    if (Math.abs(glow - this._lastGlow) > 0.02 || this._glowW !== w || this._glowH !== h) {
      this._lastGlow = glow; this._glowW = w; this._glowH = h;
      this.duskG.clear();
      if (glow > 0.02) {
        this.duskG.fillGradientStyle(0xff9a50, 0xff9a50, 0xff5a6a, 0xff5a6a, 0, 0, glow * 0.5, glow * 0.5);
        this.duskG.fillRect(0, 0, w, h * 0.72);
      }
    }

    // 별: 밤에만, 제각각 반짝 (구름이 끼면 가려진다)
    for (const s of this.stars) {
      s.setAlpha(nf * (1 - overcast) * (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(now * 0.004 + s.tw))));
    }
    // 하늘 자체도 흐려진다 — 파랑이 빠지면서 회색으로 내려앉는다
    if (Math.abs(overcast - (this._lastOc == null ? -1 : this._lastOc)) > 0.02) {
      this._lastOc = overcast;
      this.bg.sky.setTint(Phaser.Display.Color.GetColor(
        Math.round(255 * (1 - overcast * 0.20)),
        Math.round(255 * (1 - overcast * 0.22)),
        Math.round(255 * (1 - overcast * 0.34))));
    }

    // 언덕·땅: 밤에는 어둡고 푸르게, 노을엔 따뜻하게 / 구름은 노을에 분홍빛
    const dim = (1 - nf * 0.45) * (1 - overcast * 0.30);
    const warm = glow * 0.5;
    const tint = Phaser.Display.Color.GetColor(
      Math.round(255 * dim),
      Math.round(255 * dim * (1 - warm * 0.25)),
      Math.round(255 * (1 - nf * 0.25) * (1 - warm * 0.5)));
    [this.hillsFar, this.hillsNear, this.groundImg, this.fountainImg].forEach(o => o.setTint(tint));
    const cloudTint = Phaser.Display.Color.GetColor(
      Math.round(255 * Math.min(1, dim + warm * 0.5)), // 노을엔 발그레, 밤엔 함께 어두워진다
      Math.round(255 * dim * (1 - warm * 0.35)),
      Math.round(255 * (1 - nf * 0.3) * (1 - warm * 0.5)));
    for (const c of this.bg.clouds) c.setTint(cloudTint);
    // 표지판·이젤·꽃·소품도 함께 저물게 — 밤인데 이것들만 대낮이면 세계가 둘로 쪼개진다.
    // 다만 아이의 창작물(캐릭터)은 가장 밝게 남겨 시선이 그쪽으로 간다.
    if (Math.abs(nf - (this._lastNf == null ? -1 : this._lastNf)) > 0.01
      || Math.abs(glow - (this._lastGlowT || -1)) > 0.02
      || Math.abs(overcast - (this._lastOcT == null ? -1 : this._lastOcT)) > 0.02) {
      this._lastNf = nf; this._lastGlowT = glow; this._lastOcT = overcast;
      const soft = 1 - (1 - dim) * 0.55;
      const softTint = Phaser.Display.Color.GetColor(
        Math.round(255 * soft), Math.round(255 * soft * (1 - warm * 0.12)), Math.round(255 * soft * (1 - warm * 0.2)));
      for (const f of this.flowerImgs) f.setTint(tint);
      for (const s of this.signs) { s.imgRef.setTint(softTint); if (s.platRef) s.platRef.setTint(tint); }
      this.easelCont.easelImg.setTint(softTint);
      for (const im of this.props) if (!im.d.tint) im.setTint(tint);
      this.rainbowImg.setTint(tint);
      // 나비와 새도 비바람은 피한다 (세계가 날씨에 함께 반응해야 진짜가 된다)
      for (const b of this.butterflies) b.setVisible(nf < 0.5 && overcast < 0.25);
      for (const b of this.birds) b.setVisible(nf < 0.6 && overcast < 0.45);
      // 쌓인 눈도 밤에는 함께 저문다 — 다만 달빛을 되비쳐 땅보다는 밝게 남는다
      if (this.snowCaps) {
        const sd = 1 - nf * 0.42;
        const snowTint = Phaser.Display.Color.GetColor(
          Math.round(242 * sd), Math.round(249 * sd * (1 - warm * 0.1)), Math.round(255 * sd));
        for (const c of this.snowCaps) {
          try { c.setTintFill(snowTint); } catch (e) { c.setTint(snowTint); }
        }
      }
    }
    for (const im of this.props) {
      if (!im.winLights) continue;
      // 흐린 날에는 낮에도 창에 불이 들어온다
      const a = Math.max(nf, overcast * 0.55) * 0.8 * (0.9 + 0.1 * Math.sin(now * 0.002));
      for (const wl of im.winLights) wl.setAlpha(a);
    }
    audio.setMood(nf > 0.5 ? 'night' : 'village');

    /* 바람: 친구도, 나무도, 간판도 다 같이 버틴다.
       기울기는 매 프레임 덮어쓰므로 트윈과 싸우지 않도록 _angleLock을 존중한다. */
    if (W.windI > 0.03) {
      const lean = -wx.dir * (4 + 8 * wx.gust) * W.windI;
      for (const c of this.walkers) if (!c._angleLock) c.setAngle(lean);
      for (const im of this.props) {
        if (im.d.key !== 'tree') continue;
        im.setAngle(Math.sin(now * 0.0042 + im.d.nx * 9) * 5 * W.windI * (0.6 + 0.4 * wx.gust));
      }
      this.signs.forEach((s, i) => s.setAngle(Math.sin(now * 0.0035 + i) * 3.2 * W.windI));
      this._windOn = true;
    } else if (this._windOn) {
      this._windOn = false;
      for (const c of this.walkers) if (!c._angleLock) c.setAngle(0);
      for (const im of this.props) if (im.d.key === 'tree') im.setAngle(0);
      this.signs.forEach(s => s.setAngle(0));
    }
    if (Math.abs(W.windI - (this._lastWindI == null ? -1 : this._lastWindI)) > 0.06) {
      this._lastWindI = W.windI;
      for (const f of this.flowerImgs) if (f.swayTw) f.swayTw.timeScale = 1 + W.windI * 2.6;
    }

    // 반딧불은 비가 쏟아지면 숨는다
    const fireflyOn = nf > 0.4 && store.P.decor.includes('firefly') && W.rainI < 0.3;
    if (fireflyOn && !this._ffOn) { this.fireflies.start(); this._ffOn = true; }
    if (!fireflyOn && this._ffOn) { this.fireflies.stop(); this._ffOn = false; }
  }

  layout() {
    const { width: w, height: h } = this.scale;
    const P = store.P;
    const m = Math.min(w, h);
    this.bg.sky.setDisplaySize(w, h);
    this.nightSky.setDisplaySize(w, h);
    this.sun.setScale(m * 0.0009); // 위치는 update()의 호 궤적이 정한다
    this.moon.setScale(m * 0.0009);
    for (const s of this.stars) s.setPosition(s.fx * w, s.fy * h);
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
    const flowerN = Math.min(40, P.flowers) + (P.decor.includes('garden') ? 6 : 0) + (P.decor.includes('garden2') ? 10 : 0);
    for (let i = 0; i < flowerN; i++) {
      const fx = (Math.sin(i * 87.7) * 0.5 + 0.5) * w * 0.9 + w * 0.05;
      const fy = h * (0.88 + (Math.cos(i * 55.3) * 0.5 + 0.5) * 0.07);
      const img = this.add.image(fx, fy, ['flower1', 'flower2', 'flower3'][i % 3])
        .setScale(m * 0.0007).setDepth(-35).setOrigin(0.5, 1);
      // 바람이 불면 timeScale로 흔들림을 빠르게 한다 (트윈과 싸우지 않는 방법)
      img.swayTw = this.tweens.add({ targets: img, angle: rand(-5, 5), duration: rand(1800, 2600), yoyo: true, repeat: -1 });
      img.swayTw.timeScale = 1 + (this._lastWindI || 0) * 2.6;
      this.flowerImgs.push(img);
    }

    const signScale = clamp(m * 0.0012, 0.55, 1.05);
    this.signs.forEach(cont => {
      const isl = cont.islData;
      cont.setPosition(isl.nx * w, isl.ny * h);
      cont.imgRef.setScale(signScale * (isl.sc || 1));
      cont.labelRef.setPosition(0, cont.imgRef.displayHeight * 0.62).setFontSize(Math.max(17, 24 * signScale));
      cont.platRef.setScale(signScale * (isl.sc || 1) * 1.05)
        .setPosition(0, cont.imgRef.displayHeight * 0.42);
      cont.setSize(cont.imgRef.displayWidth, cont.imgRef.displayHeight + 30);
      // 컨테이너 히트 영역은 (0,0,w,h) 좌상단 규약 (common.js pressify 참고)
      cont.input && (cont.input.hitArea = new Phaser.Geom.Rectangle(0, 0, cont.width, cont.height));
    });
    this.boardCont.setPosition(w * 0.5, h * (store.P.chars.length ? 0.58 : 0.62)).setScale(clamp(m * 0.0016, 0.6, 1.05));
    this.boardCont.input && (this.boardCont.input.hitArea = new Phaser.Geom.Rectangle(0, 0, this.boardCont.width, this.boardCont.height));
    this.easelCont.setPosition(w * 0.5, h * 0.82);
    this.easelCont.easelImg.setScale(signScale * 0.85);
    this.easelCont.easelLabel.setPosition(0, this.easelCont.easelImg.displayHeight * 0.58)
      .setFontSize(Math.max(15, 20 * signScale));
    this.easelCont.setSize(this.easelCont.easelImg.displayWidth, this.easelCont.easelImg.displayHeight + 26);
    if (this.easelCont.input) this.easelCont.input.hitArea = new Phaser.Geom.Rectangle(
      0, 0, this.easelCont.width, this.easelCont.height);

    const eggSign = this.signs[1];
    this.hintHand.setPosition(eggSign.x - eggSign.imgRef.displayWidth * 0.62, eggSign.y + 8).setAngle(40);
    this.hintText.setPosition(w / 2, h * 0.45).setFontSize(Math.max(17, m * 0.033));

    this.fireflies.setPosition(0, h * 0.45);
    try { this.fireflies.ops.x.onChange(0, w); this.fireflies.ops.y.onChange(0, h * 0.42); } catch (e) {}
    for (const im of this.props) {
      im.setPosition(im.d.nx * w, im.d.ny * h).setScale(m * 0.0011 * im.d.s);
      if (im.winLights) im.winLights.forEach((wl, i) => wl
        .setPosition(im.x + (i ? 0.19 : -0.19) * im.displayWidth, im.y - im.displayHeight * 0.55)
        .setDisplaySize(im.displayWidth * 0.14, im.displayWidth * 0.14));
    }

    // 눈 쌓임 레이어는 언덕·땅의 새 크기를 그대로 따라간다
    if (this.snowCaps) {
      for (const c of this.snowCaps) {
        c.setPosition(c.src.x, c.src.y - Math.max(2, h * 0.006))
          .setDisplaySize(c.src.displayWidth, c.src.displayHeight);
      }
      this._wetDrawn = -1;
      this.drawPuddles();
      this.fitWeather();
    }

    const band = this.wanderBand();
    const slots = this.shelterSlots();
    this.walkers.forEach((wk, i) => {
      // 비를 피하는 중인 친구는 띠 밖(집 앞)이 제자리다 — 억지로 끌어오면 안 된다
      if (wk.mode === 'shelter' && slots.length) {
        const s = slots[i % slots.length];
        wk.setPosition(s.x, s.y);
        return;
      }
      wk.x = clamp(wk.x, band.x0, band.x1);
      wk.y = clamp(wk.y, band.y0, band.y1);
    });
  }
}
