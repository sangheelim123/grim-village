/* 사운드: 사전 렌더링된 샘플 + 재생 속도 바리에이션, 한국어 TTS 보조 */
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

  /* 고품질 한국어 보이스 선택 (기기 기본은 저품질 엔진일 수 있다) */
  _voice: null,
  initVoice() {
    if (!('speechSynthesis' in window)) return;
    const pickBest = () => {
      try {
        const ko = speechSynthesis.getVoices().filter(v => /^ko([-_]|$)/i.test(v.lang || ''));
        const rank = v =>
          /Google/i.test(v.name) ? 0 :                 // Chrome 원격 (최고 품질)
          /SunHi|InJoon|Natural/i.test(v.name) ? 1 :   // Edge 신경망
          /Yuna|유나|Sora/i.test(v.name) ? 2 :          // Apple / Windows
          !v.localService ? 3 : 4;                     // 원격 > 로컬(eSpeak류)
        ko.sort((a, b) => rank(a) - rank(b));
        this._voice = ko[0] || null;
      } catch (e) {}
    };
    pickBest();
    try { speechSynthesis.onvoiceschanged = pickBest; } catch (e) {}
  },
  setSound(v) {
    this.on = v;
    try { localStorage.setItem('village-v4-sound', v ? '1' : '0'); } catch (e) {}
    if (!v) this.stopSpeak();
  },
  setBgm(v) {
    this.bgmOn = v;
    try { localStorage.setItem('village-v4-bgm', v ? '1' : '0'); } catch (e) {}
    if (this._bgm) this._bgm.setVolume(v ? 0.5 : 0);
  },

  play(key, opts) {
    if (!this.on || !this.scene) return;
    try { this.scene.sound.play(key, Object.assign({ volume: 0.8 }, opts)); } catch (e) {}
  },
  tap() { this.play('tap', { rate: 0.95 + Math.random() * 0.15 }); },
  pop(step) { this.play('pop', { rate: 0.8 + (step || 0) * 0.09 }); },
  success() { this.play('success'); },
  fanfare() { this.play('fanfare'); },
  star(n) { this.play('star', { rate: 0.85 + n * 0.12, volume: 0.7 }); },
  boing() { this.play('boing', { rate: 0.9 + Math.random() * 0.25 }); },
  nom() { this.play('nom'); },
  squeak() { this.play('squeak', { rate: 0.85 + Math.random() * 0.4 }); },
  hatch() { this.play('hatch'); },
  whoosh() { this.play('whoosh', { volume: 0.5 }); },
  grow() { this.play('grow'); },

  startBgm(scene) {
    if (this._bgm) return;
    try {
      this._bgm = scene.sound.add('bgm', { loop: true, volume: this.bgmOn ? 0.5 : 0 });
      this._bgm.play();
    } catch (e) {}
  },

  /* 우선순위 정책 — 아이의 행동이 문장을 뚝뚝 끊지 않도록:
     pri 0 = 지시(씬 안내·재세기 등, 즉시 교체 가능)
     pri 1 = 피드백(숫자 세기·성격 설명 등, 지시 재생 중이면 양보)
     pri 2 = 플레이버(탭 대사·정답 추임새, 무언가 재생 중이면 스킵) */
  _curPri: null,
  speak(text, opt) {
    if (!this.on || !('speechSynthesis' in window)) return;
    const pri = (opt && opt.pri) != null ? opt.pri : 0;
    try {
      const busy = speechSynthesis.speaking || speechSynthesis.pending;
      if (busy) {
        if (pri === 2) return;
        if (pri === 1 && this._curPri === 0) return;
        speechSynthesis.cancel();
      }
      const u = new SpeechSynthesisUtterance(text);
      if (this._voice) u.voice = this._voice;
      u.lang = 'ko-KR';
      u.rate = 0.95;
      u.pitch = 1.0; // 1.15는 한국어 보이스에서 왜곡 유발
      this._curPri = pri;
      u.onend = u.onerror = () => { this._curPri = null; };
      // cancel 직후 동기 speak는 Chrome 계열에서 무음 버그 → 짧게 지연
      if (busy) setTimeout(() => { try { speechSynthesis.speak(u); } catch (e) {} }, 60);
      else speechSynthesis.speak(u);
    } catch (e) {}
  },
  stopSpeak() {
    this._curPri = null;
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
  },
};
