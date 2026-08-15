/* 사운드: 사전 렌더링된 샘플 + 재생 속도 바리에이션, 한국어 TTS 보조 */
import { store } from './store.js';
import { aYa, clamp } from './config.js';

/* 5음계(도-레-미-솔-라) 사다리 — 어느 두 음이 겹쳐도 협화음이라
   빠른 연타에서도 불협이 생기지 않는다. 값은 반음 수, rate = 2^(n/12). */
const PENTA = [-5, -3, 0, 2, 4, 7, 9, 12, 14, 16];
const semi = n => Math.pow(2, n / 12);

export const audio = {
  scene: null,
  on: true,
  bgmOn: true,
  _bgm: null,

  init(scene) {
    this.scene = scene;
    try { this.on = localStorage.getItem('village-v4-sound') !== '0'; } catch (e) {}
    try { this.bgmOn = localStorage.getItem('village-v4-bgm') !== '0'; } catch (e) {}
    this.initVoice();
  },

  /* 고품질 한국어 보이스 선택 (기기 기본은 저품질 엔진일 수 있다).
     단, 오프라인에서는 원격(Google 등) 보이스가 통째로 무음이 된다 —
     이 게임은 오프라인 PWA이므로 그때는 로컬 엔진이 유일하게 소리 나는 후보다. */
  _voice: null,
  _localVoice: null,
  initVoice() {
    if (!('speechSynthesis' in window)) return;
    const pickBest = () => {
      try {
        const ko = speechSynthesis.getVoices().filter(v => /^ko([-_]|$)/i.test(v.lang || ''));
        const offline = navigator.onLine === false;
        const rank = v =>
          offline ? (v.localService ? 0 : 9) :
            /Google/i.test(v.name) ? 0 :                 // Chrome 원격 (최고 품질)
              /SunHi|InJoon|Natural/i.test(v.name) ? 1 : // Edge 신경망
                /Yuna|유나|Sora/i.test(v.name) ? 2 :      // Apple / Windows
                  !v.localService ? 3 : 4;                // 원격 > 로컬(eSpeak류)
        ko.sort((a, b) => rank(a) - rank(b));
        this._voice = ko[0] || null;
        this._localVoice = ko.filter(v => v.localService)[0] || null;
      } catch (e) {}
    };
    pickBest();
    try { speechSynthesis.onvoiceschanged = pickBest; } catch (e) {}
    try {
      window.addEventListener('online', pickBest);
      window.addEventListener('offline', pickBest);
    } catch (e) {}
  },
  /* iOS: 첫 발화가 사용자 제스처 안에서 한 번 열려야 이후 지연 발화가 산다 */
  _primed: false,
  primeVoice() {
    if (this._primed || !('speechSynthesis' in window)) return;
    this._primed = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch (e) {}
  },
  setSound(v) {
    this.on = v;
    try { localStorage.setItem('village-v4-sound', v ? '1' : '0'); } catch (e) {}
    if (!v) this.stopSpeak();
  },
  setBgm(v) {
    this.bgmOn = v;
    try { localStorage.setItem('village-v4-bgm', v ? '1' : '0'); } catch (e) {}
    this.duck(this._curPri != null);
  },

  play(key, opts) {
    if (!this.on || !this.scene) return;
    try { this.scene.sound.play(key, Object.assign({ volume: 0.8 }, opts)); } catch (e) {}
  },
  tap() { this.play('tap', { rate: 0.95 + Math.random() * 0.15 }); },
  /* 수 세기·진행 신호: 5음계를 따라 또박또박 올라간다 */
  pop(step) {
    const i = clamp(Math.round(step || 0), 0, PENTA.length - 1);
    this.play('pop', { rate: semi(PENTA[i]) });
  },
  success() { this.play('success'); },
  fanfare() { this.play('fanfare'); },
  star(n) { this.play('star', { rate: semi([0, 4, 7][clamp((n | 0) - 1, 0, 2)]), volume: 0.7 }); },
  boing() { this.play('boing', { rate: 0.9 + Math.random() * 0.25 }); },
  nom() { this.play('nom'); },
  squeak() { this.play('squeak', { rate: 0.85 + Math.random() * 0.4 }); },
  hatch() { this.play('hatch'); },
  whoosh() { this.play('whoosh', { volume: 0.5 }); },
  grow() { this.play('grow'); },
  /* 아니야 신호: 정답보다 반드시 작고 부드럽게 (실패가 아니라 안내다) */
  nope() { this.play('boing', { rate: 0.72, volume: 0.5 }); },

  startBgm(scene) {
    if (this._bgm) return;
    try {
      this._bgm = scene.sound.add('bgm', { loop: true, volume: this.bgmOn ? 0.5 : 0 });
      this._bgm.play();
      this.setMood('village');
    } catch (e) {}
  },

  /* 씬 분위기: 파일을 늘리지 않고 로우패스 + 재생속도로 같은 곡을 여러 얼굴로 쓴다 */
  MOOD: {
    village: { cut: 20000, rate: 1.00, vol: 0.50 },
    play: { cut: 20000, rate: 1.00, vol: 0.42 },
    water: { cut: 700, rate: 0.86, vol: 0.40 },   // 물속: 고음이 사라지고 느려진다
    night: { cut: 1600, rate: 0.90, vol: 0.30 },  // 자장가: 부드럽고 낮게
  },
  _mood: null,
  _filter: null,
  setMood(name) {
    const m = this.MOOD[name] || this.MOOD.village;
    if (this._mood === m) return;
    this._mood = m;
    if (!this._bgm) return;
    try { this._bgm.setRate(m.rate); } catch (e) {}
    const f = this._ensureFilter();
    const ctx = this.scene && this.scene.sound && this.scene.sound.context;
    if (f && ctx) { try { f.frequency.setTargetAtTime(m.cut, ctx.currentTime, 0.5); } catch (e) {} }
    this.duck(this._curPri != null);
  },
  /* Phaser 오디오 그래프 꼬리에 로우패스를 끼운다. 실패해도 rate/volume만으로
     분위기는 성립하므로 최악이 "물속 느낌이 덜하다"로 끝난다. */
  _ensureFilter() {
    if (this._filter !== null) return this._filter;
    this._filter = false;
    try {
      const s = this._bgm, mgr = this.scene && this.scene.sound;
      if (!s || !mgr || !mgr.context || !s.volumeNode) return false;
      const f = mgr.context.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 20000; f.Q.value = 0.7;
      const tail = s.pannerNode || s.spatialNode || s.volumeNode;
      tail.disconnect(); tail.connect(f); f.connect(mgr.destination);
      this._filter = f;
    } catch (e) { this._filter = false; }
    return this._filter;
  },
  /* 말할 때 배경음을 낮춘다 — 4세는 소음 속 말소리 분리가 어렵다 */
  duck(on) {
    if (!this._bgm) return;
    const base = this.bgmOn ? (this._mood ? this._mood.vol : 0.5) : 0;
    const to = on ? base * 0.3 : base;
    try {
      const g = this._bgm.volumeNode && this._bgm.volumeNode.gain;
      const ctx = this.scene && this.scene.sound && this.scene.sound.context;
      if (g && ctx) {
        g.cancelScheduledValues(ctx.currentTime);
        g.setTargetAtTime(to, ctx.currentTime, on ? 0.06 : 0.25);
      } else this._bgm.setVolume(to);
    } catch (e) { try { this._bgm.setVolume(to); } catch (e2) {} }
  },
  /* 팡파레 + 별 + 음성이 겹칠 때 합이 1.0을 넘어 찌그러지는 것을 막는다 */
  initLimiter(scene) {
    try {
      const mgr = scene.sound, ctx = mgr.context;
      if (!ctx || !mgr.masterVolumeNode) return;
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -8; c.knee.value = 6; c.ratio.value = 6;
      c.attack.value = 0.003; c.release.value = 0.15;
      mgr.masterVolumeNode.disconnect();
      mgr.masterVolumeNode.connect(c); c.connect(ctx.destination);
    } catch (e) {}
  },

  /* 우선순위 정책 — 아이의 행동이 문장을 뚝뚝 끊지 않도록:
     pri 0 = 지시(씬 안내·재세기 등, 즉시 교체 가능)
     pri 1 = 피드백(숫자 세기·성격 설명 등, 지시 재생 중이면 뒤로 미룬다)
     pri 2 = 플레이버(탭 대사·정답 추임새, 무언가 재생 중이면 스킵)
     긴 문장은 조각으로 나눠 이어 읽는다 — 유아의 청각 작업기억은 한 번에 2~3개다. */
  RATE: [0.90, 0.98, 1.02],
  _curPri: null,
  _seq: 0,
  _pending: null,
  _lastFlavorAt: 0,
  _fellBack: false,

  _chunks(text) {
    const raw = String(text).match(/[^!?.]+[!?.]*/g) || [String(text)];
    const out = [];
    for (const s of raw) {
      const t = s.trim();
      if (!t) continue;
      if (out.length && (out[out.length - 1].length < 8 || t.length < 5)) out[out.length - 1] += ' ' + t;
      else out.push(t);
    }
    return out.length ? out : [String(text)];
  },
  _busy() {
    try { return speechSynthesis.speaking || speechSynthesis.pending; } catch (e) { return false; }
  },
  _end() { this._curPri = null; this.duck(false); },

  speak(text, opt) {
    if (!this.on || !('speechSynthesis' in window) || !text) return;
    const pri = (opt && opt.pri) != null ? opt.pri : 0;
    const now = Date.now();
    if (pri === 2) {
      if (now - this._lastFlavorAt < 1200) return; // 연타 기관총 방지
      if (this._busy()) return;
      this._lastFlavorAt = now;
    }
    // 지시 재생 중의 피드백은 버리지 말고 뒤에 붙인다 — 세기 숫자가 사라지면 안 된다
    if (pri === 1 && this._curPri === 0 && this._busy()) { this._pending = { text, pri }; return; }
    this._fellBack = false;
    this._start(this._chunks(text), pri);
  },

  _start(chunks, pri) {
    const seq = ++this._seq;
    this._curPri = pri;
    const busy = this._busy();
    if (busy) { try { speechSynthesis.cancel(); } catch (e) {} }
    this.duck(true);
    const go = i => {
      if (seq !== this._seq) return; // 새 발화가 들어왔으면 조용히 물러난다
      if (i >= chunks.length) {
        this._end();
        const p = this._pending;
        this._pending = null;
        if (p) { this._fellBack = false; this._start(this._chunks(p.text), p.pri); }
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i]);
      if (this._voice) u.voice = this._voice;
      u.lang = 'ko-KR';
      u.rate = this.RATE[pri] || 0.95;
      u.pitch = 1.0; // 1.15는 한국어 보이스에서 왜곡 유발
      u.onend = () => { if (seq === this._seq) go(i + 1); };
      u.onerror = e => this._onSpeakError(e, chunks, i, pri, seq);
      try { speechSynthesis.speak(u); } catch (e) { go(i + 1); }
    };
    // cancel 직후 동기 speak는 Chrome 계열에서 무음 버그 → 짧게 지연
    if (busy) setTimeout(() => go(0), 60);
    else go(0);
  },

  /* 원격 보이스가 죽으면(오프라인 등) 로컬로 내려앉아 남은 문장부터 다시 읽는다 */
  _onSpeakError(e, chunks, i, pri, seq) {
    if (seq !== this._seq) return;
    const err = e && e.error;
    if (err === 'interrupted' || err === 'canceled') { this._end(); return; }
    if (this._voice && !this._voice.localService && this._localVoice && !this._fellBack) {
      this._fellBack = true;
      this._voice = this._localVoice;
      this._start(chunks.slice(i), pri);
      return;
    }
    this._end();
  },

  /* 아이 이름 부르기 — 아껴 불러야 힘이 산다 (활동의 매듭에서 60초에 한 번) */
  _calledAt: 0,
  callKid(text, opt) {
    const k = store.P && store.P.kid;
    const now = Date.now();
    if (!k || !k.name || !k.call || now - this._calledAt < 60000) return this.speak(text, opt);
    this._calledAt = now;
    this.speak(`${aYa(k.name)}, ${text}`, opt);
  },

  stopSpeak() {
    this._seq++;
    this._pending = null;
    this._end();
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
  },
};
