import { addSky, addGround, popIn, textStyle, confettiBurst, sparkleBurst } from './common.js';
import { accToStars } from '../tracer.js';
import { store } from '../store.js';
import { makeCreatureSprite } from '../creature.js';
import { audio } from '../audio.js';
import { ui } from '../dom-ui.js';
import { FRUITS, KOR_NUM, eulRl, iGa, iGaN, egeNm, gae, rand, pick, clamp } from '../config.js';

export class FeedScene extends Phaser.Scene {
  constructor() { super('Feed'); }

  create(data) {
    ui.topButtons('play');
    this.cameras.main.fadeIn(250, 255, 240, 220);
    this.bg = addSky(this, { clouds: 2, key: 'sky_feed' });
    this.ground = addGround(this, { horizon: 0.7, tufts: 8, tint: 0x8fd873 });
    audio.setMood('play');
    this.treeImg = this.add.image(0, 0, 'tree').setDepth(2);
    this.plateImg = this.add.image(0, 0, 'plate').setDepth(3);
    this.bubbleImg = this.add.image(0, 0, 'bubble').setDepth(8);
    this.bubbleText = this.add.text(0, 0, '', textStyle(30)).setOrigin(0.5).setDepth(9);
    this.dotG = this.add.graphics().setDepth(9);
    this.noteImg = null;

    const lvl = store.lvlOf('feed');
    this.lvl = lvl;
    // 짝꿍 우선 — 아이가 아끼는 캐릭터가 밥을 받고, 그래서 성장한다
    this.eaterChar = store.pickPlaymate();
    if (this.eaterChar) {
      this.eaterObj = makeCreatureSprite(this, this.eaterChar, 120);
    } else {
      this.eaterObj = this.add.image(0, 0, 'star').setDisplaySize(110, 107);
    }
    this.eaterObj.setDepth(6);
    this.tweens.add({ targets: this.eaterObj, y: '+=6', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    /* 모드 (레벨 1~2: 세기+점 / 3: 세기·덧셈 / 4: +뺄셈 / 5: +두 과일 합성)
       덧셈 = 두 묶음을 모아 담기(counting-on), 뺄셈 = 친구에게 나눠 주고 남기기(taking-away)
       — 수 세기에서 자연스럽게 이어지는 구체물 연산 */
    let mode = 'count';
    const roll = Math.random();
    if (data && data.forceMode) mode = data.forceMode;
    else if (lvl >= 5) mode = roll < 0.35 ? 'add' : roll < 0.65 ? 'sub' : roll < 0.85 ? 'mix' : 'count';
    else if (lvl >= 4) mode = roll < 0.4 ? 'add' : roll < 0.65 ? 'sub' : 'count';
    else if (lvl >= 3) mode = roll < 0.4 ? 'add' : 'count';
    this.mode = mode;

    this.request = [];
    this.addParts = null;
    this.subTotal = 0; this.subTake = 0; this.takerTaken = 0;
    if (mode === 'add') {
      const maxSum = lvl >= 5 ? 9 : lvl >= 4 ? 8 : 5;
      const a = (data && data.a) || Math.floor(rand(1, Math.min(5, maxSum - 1) + 1));
      const b = (data && data.b) || Math.floor(rand(1, Math.min(5, maxSum - a) + 1));
      this.addParts = [a, b];
      this.request = [{ fruit: pick(FRUITS), count: a + b }];
    } else if (mode === 'sub') {
      const N = (data && data.n) || (lvl >= 5 ? Math.floor(rand(4, 9)) : Math.floor(rand(3, 7)));
      const K = (data && data.k) || Math.floor(rand(1, N));
      this.subTotal = N; this.subTake = K;
      this.request = [{ fruit: pick(FRUITS), count: N - K }];
    } else if (mode === 'mix') {
      const f1 = pick(FRUITS); let f2 = pick(FRUITS);
      while (f2.key === f1.key) f2 = pick(FRUITS);
      this.request = [
        { fruit: f1, count: Math.floor(rand(1, 4)) },
        { fruit: f2, count: Math.floor(rand(1, 4)) },
      ];
    } else {
      const max = [3, 5, 5, 8, 9][lvl - 1];
      this.request = [{ fruit: pick(FRUITS), count: Math.floor(rand(1, max + 1)) }];
    }
    // 점 병기: 저레벨 세기, 그리고 덧셈은 두 색 묶음으로 (구체물 지원)
    this.showDots = mode === 'add' || (mode === 'count' && lvl <= 2);
    this.tries = 0;
    this.plate = [];   // 스프라이트 (fruitKey 보관)
    this.flying = 0;
    this.state = 'play';
    this.recountReq = 0; this.recountI = 0;

    // 뺄셈: 나눠 줄 두 번째 친구 (아이의 다른 창작물 — 없으면 별님이 친구)
    this.takerObj = null;
    if (mode === 'sub') {
      const others = store.activeChars().filter(c => c !== this.eaterChar);
      this.takerChar = others.length ? pick(others) : null;
      this.takerObj = this.takerChar
        ? makeCreatureSprite(this, this.takerChar, 100)
        : this.add.image(0, 0, 'star').setDisplaySize(92, 90);
      this.takerObj.setDepth(6);
      this.tweens.add({ targets: this.takerObj, y: '+=5', duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // 나무 과일 배치 (뺄셈은 접시에 전부 미리 담겨 시작 — 나무는 쉼)
    this.treeFruits = [];
    if (mode !== 'sub') {
      const kinds = new Set(this.request.map(r => r.fruit.key));
      const list = [];
      for (const r of this.request) {
        for (let i = 0; i < r.count + 2 + Math.floor(rand(0, 3)); i++) list.push(r.fruit.key);
      }
      if (lvl >= 2) {
        let other = pick(FRUITS);
        while (kinds.has(other.key)) other = pick(FRUITS);
        for (let i = 0; i < 3; i++) list.push(other.key);
      }
      for (const key of list) {
        const img = this.add.image(0, 0, key).setDepth(5);
        img.fruitKey = key;
        img.nx = rand(0.08, 0.42); img.ny = rand(0.14, 0.6);
        img.setInteractive({ useHandCursor: true });
        img.on('pointerdown', () => this.pickFruit(img));
        this.tweens.add({ targets: img, angle: rand(-6, 6), duration: rand(1600, 2400), yoyo: true, repeat: -1 });
        this.treeFruits.push(img);
      }
    } else {
      for (let i = 0; i < this.subTotal; i++) {
        const img = this.add.image(0, 0, this.request[0].fruit.key).setDepth(5);
        img.fruitKey = this.request[0].fruit.key;
        img.plated = true;
        this.plate.push(img);
      }
    }

    const nm = this.eaterChar ? this.eaterChar.n : '별님이';
    const takerNm = this.takerChar ? this.takerChar.n : '별동이';
    if (mode === 'add') {
      const [a, b] = this.addParts;
      const fn = this.request[0].fruit.name;
      ui.setPill(`${fn} ${a}개랑 ${b}개 주세요!`);
      audio.speak(`${iGa(nm)} 배가 고프대요! ${fn} ${gae(a)}랑, ${gae(b)} 더 담아 주세요! 모두 몇 개가 될까요?`);
    } else if (mode === 'sub') {
      const fn = this.request[0].fruit.name;
      ui.setPill(`${takerNm}에게 ${this.subTake}개 나눠 주세요!`);
      audio.speak(`${iGaN(fn)} ${gae(this.subTotal)} 있어요! ${iGa(takerNm)} ${gae(this.subTake)} 먹고 싶대요. 접시의 ${eulRl(fn)} 눌러서, ${gae(this.subTake)}만 나눠 주세요!`);
    } else {
      const reqText = this.request.map(r => `${r.fruit.name} ${r.count}개`).join('랑 ');
      ui.setPill(`${reqText} 주세요!`);
      audio.speak(`${iGa(nm)} 배가 고프대요! ${reqText} 주세요!`);
    }
    ui.setActionBar('<button class="act-btn" id="feed-done">🍽️ 다 줬어요!</button>');
    document.getElementById('feed-done').addEventListener('click', () => this.checkPlate());

    // 접시 과일 되돌리기 (스스로 고치기)
    this.input.on('pointerdown', p => this.onTapPlate(p));

    this.layout();
    popIn(this, [this.treeImg, this.plateImg, this.eaterObj, this.takerObj, this.bubbleImg]);
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      if (this.eaterObj.destroyTexture) this.eaterObj.destroyTexture();
      if (this.takerObj && this.takerObj.destroyTexture) this.takerObj.destroyTexture();
    });
  }

  update(now, delta) {
    this.bg.step(Math.min(0.05, (delta || 16) / 1000), this.scale.width);
  }

  repeatVoice() {
    const fn = this.request[0].fruit.name;
    if (this.mode === 'add') {
      audio.speak(`${fn} ${gae(this.addParts[0])}랑 ${gae(this.addParts[1])} 접시에 담아 주세요!`);
    } else if (this.mode === 'sub') {
      const takerNm = this.takerChar ? this.takerChar.n : '별동이';
      const left = this.subTake - this.takerTaken;
      audio.speak(left > 0
        ? `접시의 ${eulRl(fn)} 눌러서 ${egeNm(takerNm)} ${gae(left)} 더 나눠 주세요!`
        : '이제 남은 과일을 다 줬어요 버튼으로 주세요!');
    } else {
      audio.speak(this.request.map(r => `${r.fruit.name} ${r.count}개`).join('랑 ') + ' 주세요!');
    }
  }

  layout() {
    const { width: w, height: h } = this.scale;
    const m = Math.min(w, h);
    this.bg.fit(w, h);
    this.ground.fit(w, h);
    this.treeImg.setPosition(w * 0.24, h * 0.42).setScale(clamp(m * 0.0013, 0.5, 1.1));
    this.plateImg.setPosition(w * 0.5, h * 0.8).setScale(clamp(m * 0.001, 0.55, 1));
    if (this.takerObj) this.takerObj.setPosition(w * 0.18, h * 0.72);
    this.bubbleImg.setPosition(w * 0.72, h * 0.17).setScale(clamp(m * 0.001, 0.6, 1));
    this.eaterObj.setPosition(w * 0.72, h * 0.5);
    const fs = Math.max(26, m * 0.05);
    // 말풍선 안: 실제 과일 그림 + × 개수
    if (this.bubbleIcons) this.bubbleIcons.forEach(o => o.destroy());
    this.bubbleIcons = [];
    if (this.request.length > 1) {
      this.bubbleText.setText('');
      this.request.forEach((r, ri) => {
        const y = this.bubbleImg.y - 26 + ri * 40;
        const icon = this.add.image(this.bubbleImg.x - 52, y, r.fruit.key).setScale(0.32).setDepth(9);
        const t = this.add.text(this.bubbleImg.x + 8, y, `× ${r.count}`, textStyle(fs * 0.62)).setOrigin(0, 0.5).setDepth(9);
        this.bubbleIcons.push(icon, t);
      });
    } else {
      this.bubbleText.setText('');
      const r0 = this.request[0];
      // 말풍선 라벨: 세기 "× N" / 덧셈 "a + b" / 뺄셈 "N − K"
      const label = this.mode === 'add' ? `${this.addParts[0]} + ${this.addParts[1]}`
        : this.mode === 'sub' ? `${this.subTotal} − ${this.subTake}`
          : `× ${r0.count}`;
      const icon = this.add.image(this.bubbleImg.x - 46, this.bubbleImg.y - 12, r0.fruit.key).setScale(0.42).setDepth(9);
      const t = this.add.text(this.bubbleImg.x + 4, this.bubbleImg.y - 12, label, textStyle(fs * 0.85)).setOrigin(0, 0.5).setDepth(9);
      this.bubbleIcons.push(icon, t);
    }
    // 수량 점 병기 (저레벨 세기 / 덧셈은 두 색 묶음 — "2랑 3이 모여 5"가 눈에 보이게)
    this.dotG.clear();
    if (this.showDots) {
      if (this.mode === 'add') {
        const [a, b] = this.addParts;
        const gap = 14;
        const total = (a + b - 1) * 22 + gap;
        const x0 = this.bubbleImg.x - total / 2;
        this.dotG.fillStyle(0xff8a5c, 1);
        for (let i = 0; i < a; i++) this.dotG.fillCircle(x0 + i * 22, this.bubbleImg.y + 26, 7);
        this.dotG.fillStyle(0x56b4ec, 1);
        for (let i = 0; i < b; i++) this.dotG.fillCircle(x0 + gap + (a + i) * 22, this.bubbleImg.y + 26, 7);
      } else {
        const r0 = this.request[0];
        this.dotG.fillStyle(0xff8a5c, 1);
        for (let i = 0; i < r0.count; i++) {
          this.dotG.fillCircle(this.bubbleImg.x - (r0.count - 1) * 11 + i * 22, this.bubbleImg.y + 26, 7);
        }
      }
    }
    for (const f of this.treeFruits) {
      if (f.plated) continue;
      f.setPosition(f.nx * w, f.ny * h).setScale(clamp(m * 0.0009, 0.4, 0.8));
    }
    this.layoutPlate();
  }

  plateSlot(i) {
    const px = this.plateImg.x, py = this.plateImg.y;
    const w = this.plateImg.displayWidth;
    return {
      x: px - w * 0.36 + (i % 6) * (w * 0.145),
      y: py - 8 + Math.floor(i / 6) * -30,
    };
  }
  layoutPlate() {
    const m = Math.min(this.scale.width, this.scale.height);
    const sc = clamp(m * 0.0009, 0.4, 0.8) * 0.85;
    this.plate.forEach((img, i) => {
      const s = this.plateSlot(i);
      img.setPosition(s.x, s.y).setScale(sc);
    });
  }

  pickFruit(img) {
    if (this.state !== 'play' || img.plated || img.inFlight) return;
    img.inFlight = true;
    this.flying++;
    const slot = this.plateSlot(this.plate.length + this.flying - 1);
    audio.pop(this.plate.length + this.flying);
    // 요청 과일이면 함께 세기
    const match = this.request.find(r => r.fruit.key === img.fruitKey);
    if (match) {
      const cnt = this.plate.filter(p => p.fruitKey === img.fruitKey).length +
        this.treeFruits.filter(f => f.inFlight && f.fruitKey === img.fruitKey).length;
      const need = this.request.find(r => r.fruit.key === img.fruitKey);
      if (need && cnt === need.count) audio.speak(`${KOR_NUM[cnt - 1]}! ${gae(cnt)} 다 담았어요!`, { pri: 1 });
      else audio.speak(KOR_NUM[cnt - 1] || String(cnt), { pri: 1 });
    }
    this.tweens.add({
      targets: img, x: slot.x, y: slot.y, scale: img.scale * 0.85, duration: 340, ease: 'Quad.easeInOut',
      onUpdate: (tw, target) => {
        target.y -= Math.sin(tw.progress * Math.PI) * 2.2;
      },
      onComplete: () => {
        img.inFlight = false;
        img.plated = true;
        this.flying--;
        this.plate.push(img);
        this.layoutPlate();
      },
    });
  }

  onTapPlate(p) {
    if (this.state !== 'play') return;
    const tapR = Math.max(44, Math.min(this.scale.width, this.scale.height) * 0.06);
    for (let i = this.plate.length - 1; i >= 0; i--) {
      const img = this.plate[i];
      if (Phaser.Math.Distance.Between(p.x, p.y, img.x, img.y) < tapR) {
        // 뺄셈 모드: 접시 탭 = 친구에게 나눠 주기 (덜어내기가 곧 뺄셈)
        if (this.mode === 'sub') { this.giveToTaker(i, img); return; }
        this.plate.splice(i, 1);
        img.plated = false;
        audio.boing();
        const m = Math.min(this.scale.width, this.scale.height);
        this.tweens.add({
          targets: img, x: img.nx * this.scale.width, y: img.ny * this.scale.height,
          scale: clamp(m * 0.0009, 0.4, 0.8), duration: 380, ease: 'Back.easeOut',
        });
        this.layoutPlate();
        return;
      }
    }
  }

  /* 뺄셈: 접시의 과일을 두 번째 친구에게 — 필요한 만큼만 받고, 넘치면 상냥하게 사양 */
  giveToTaker(i, img) {
    const takerNm = this.takerChar ? this.takerChar.n : '별동이';
    if (this.takerTaken >= this.subTake) {
      audio.boing();
      ui.guide(`${takerNm}는 ${this.subTake}개면 충분하대요!`);
      audio.nope();
      this.tweens.add({
        targets: this.takerObj, angle: { from: -8, to: 8 }, duration: 100, yoyo: true, repeat: 3,
        onComplete: () => this.takerObj.setAngle(0),
      });
      return;
    }
    this.plate.splice(i, 1);
    this.takerTaken++;
    audio.speak(KOR_NUM[this.takerTaken - 1] || String(this.takerTaken), { pri: 1 });
    this.tweens.add({
      targets: img, x: this.takerObj.x, y: this.takerObj.y, scale: 0, duration: 380, ease: 'Quad.easeIn',
      onComplete: () => { audio.nom(); img.destroy(); },
    });
    this.layoutPlate();
    if (this.takerTaken === this.subTake) {
      sparkleBurst(this, this.takerObj.x, this.takerObj.y - 30, 8);
      this.tweens.add({
        targets: this.takerObj, angle: { from: -10, to: 10 }, duration: 150, yoyo: true, repeat: 4,
        onComplete: () => this.takerObj.setAngle(0),
      });
      const nm = this.eaterChar ? this.eaterChar.n : '별님이';
      this.time.delayedCall(700, () => {
        if (this.state === 'play' && this.scene.isActive()) {
          audio.speak(`${iGa(takerNm)} 고맙대요! 남은 과일은 몇 개일까요? 다 줬어요 버튼으로 ${egeNm(nm)} 주세요!`, { pri: 1 });
        }
      });
    }
  }

  settleFlying() {
    // 날아가는 중인 과일도 판정에 포함 (연타 오탐 방지)
    for (const f of this.treeFruits) {
      if (f.inFlight) {
        this.tweens.killTweensOf(f);
        f.inFlight = false;
        f.plated = true;
        this.flying = 0;
        this.plate.push(f);
      }
    }
    this.layoutPlate();
  }

  checkPlate() {
    if (this.state !== 'play') return;
    this.settleFlying();
    this.tries++;
    const cnt = key => this.plate.filter(p => p.fruitKey === key).length;
    const ok = this.request.every(r => cnt(r.fruit.key) === r.count) &&
      this.plate.length === this.request.reduce((s, r) => s + r.count, 0);
    if (ok) this.eat();
    else {
      this.state = 'recount';
      this.recountReq = 0; this.recountI = 0;
      ui.setPill('같이 다시 세어 볼까요?');
      audio.boing();
      this.recountTick();
    }
  }

  recountTick() {
    if (this.state !== 'recount' || !this.scene.isActive()) return;
    const target = this.request[this.recountReq];
    const mine = this.plate.filter(p => p.fruitKey === target.fruit.key);
    if (this.recountI < mine.length) {
      const img = mine[this.recountI];
      audio.speak(KOR_NUM[this.recountI] || '', { pri: 1 });
      audio.pop(this.recountI);
      this.tweens.add({ targets: img, scale: img.scale * 1.35, duration: 200, yoyo: true });
      sparkleBurst(this, img.x, img.y - 14, 4);
      this.recountI++;
      this.time.delayedCall(850, () => this.recountTick());
      return;
    }
    if (mine.length) {
      // 기수 원리: 마지막에 센 수가 곧 전체의 양이라는 것 — 세고 나서 총량을 되짚어 준다
      audio.speak(`모두 ${gae(mine.length)}! ${target.fruit.name}가 ${mine.length}개예요!`, { pri: 1 });
    }
    const diff = target.count - mine.length;
    if (diff > 0) {
      this.state = 'play';
      ui.guide(`${target.fruit.name} ${diff}개 더 주세요!`);
      audio.speak(`${target.fruit.name} ${gae(diff)} 더 주세요!`);
    } else if (diff < 0) {
      this.state = 'play';
      ui.guide(`${target.fruit.name}가 너무 많아요! 접시를 눌러 빼요!`);
      audio.speak(`${iGaN(target.fruit.name)} 너무 많아요! 접시를 눌러서 빼 볼까요?`);
    } else if (this.recountReq < this.request.length - 1) {
      this.recountReq++;
      this.recountI = 0;
      audio.speak(`이제 ${eulRl(this.request[this.recountReq].fruit.name)} 세어 볼까요?`);
      this.time.delayedCall(2300, () => this.recountTick()); // 문장이 끝까지 들리도록
    } else {
      this.state = 'play';
      const extra = this.plate.find(p => !this.request.some(r => r.fruit.key === p.fruitKey));
      if (extra) {
        const name = FRUITS.find(f => f.key === extra.fruitKey).name;
        ui.guide(`${name}는 부탁 안 했어요! 접시를 눌러 빼요!`);
        audio.speak(`어? ${iGaN(name)} 아니에요! 접시를 눌러서 빼 볼까요?`);
        this.tweens.add({ targets: extra, angle: { from: -14, to: 14 }, duration: 110, yoyo: true, repeat: 4 });
      } else ui.guide('좋아요! 다 줬어요 버튼을 눌러 봐요!');
    }
  }

  eat() {
    this.state = 'eat';
    ui.setActionBar('');
    ui.setPill('냠냠냠~!');
    audio.nom();
    const acc = this.tries === 1 ? 1 : this.tries === 2 ? 0.6 : 0.4;
    const stars = accToStars(acc);
    store.P.stars.feed += stars;
    store.adapt('feed', acc);
    let growMsg = '';
    if (this.eaterChar) {
      this.eaterChar.f++;
      if (this.eaterChar.f === 3 && this.eaterChar.g < 1) { this.eaterChar.g = 1; growMsg = `${iGa(this.eaterChar.n)} 무럭무럭 자랐어요!`; }
      if (this.eaterChar.f === 8 && this.eaterChar.g < 2) { this.eaterChar.g = 2; growMsg = `${iGa(this.eaterChar.n)} 어른이 되었어요!`; }
    }
    store.save();

    // 연산 결과 문장 — 셈의 의미를 몸으로 겪은 직후에 말로 들려준다
    // (음성은 우리말 수사 "둘에 셋을 더하면 다섯", 글자는 식 "2 + 3 = 5")
    let mathMsg = '', mathSpeak = '';
    if (this.mode === 'add') {
      const [a, b] = this.addParts;
      mathMsg = `${a} + ${b} = ${a + b}!`;
      mathSpeak = `${KOR_NUM[a - 1]}에 ${eulRl(KOR_NUM[b - 1])} 더하면 ${KOR_NUM[a + b - 1]}!`;
    } else if (this.mode === 'sub') {
      const N = this.subTotal, K = this.subTake;
      mathMsg = `${N} − ${K} = ${N - K}!`;
      mathSpeak = `${KOR_NUM[N - 1]}에서 ${eulRl(KOR_NUM[K - 1])} 빼면 ${KOR_NUM[N - K - 1]}!`;
    }

    // 과일이 입으로 → 춤
    this.plate.forEach((img, i) => {
      this.tweens.add({
        targets: img, x: this.eaterObj.x, y: this.eaterObj.y, scale: 0, duration: 420,
        delay: i * 120, ease: 'Quad.easeIn',
        onStart: () => audio.nom(),
      });
    });
    const danceDelay = this.plate.length * 120 + 400;
    const totalEaten = this.plate.length;
    this.time.delayedCall(danceDelay, () => {
      if (totalEaten) audio.speak(`모두 ${gae(totalEaten)}, 다 먹었어요!`, { pri: 1 });
      if (growMsg) {
        audio.grow();
        this.tweens.add({ targets: this.eaterObj, scale: 1.25, duration: 600, ease: 'Back.easeOut' });
        sparkleBurst(this, this.eaterObj.x, this.eaterObj.y, 18);
      }
      this.tweens.add({ targets: this.eaterObj, angle: { from: -12, to: 12 }, duration: 160, yoyo: true, repeat: 5 });
      confettiBurst(this, this.scale.width / 2, this.scale.height * 0.3);
      this.time.delayedCall(1100, () => {
        if (this._switching) return;
        const baseMsg = growMsg || (this.eaterChar ? `${iGa(this.eaterChar.n)} 배불러서 춤을 춰요!` : '별님이가 배불러요!');
        ui.celebrate({
          stars,
          char: this.eaterChar || null,
          msg: mathMsg ? `${mathMsg} ${baseMsg}` : baseMsg,
          speakMsg: [mathSpeak, growMsg].filter(Boolean).join(' ') || undefined,
          onAgain: () => this.scene.restart(),
        });
      });
    });
  }
}

function fruitEmojiName(key) {
  return { apple: '🍎', orange: '🍊', grape: '🍇', strawberry: '🍓' }[key] || key;
}
