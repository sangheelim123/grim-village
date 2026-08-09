import { audio } from '../audio.js';
import { bakeEyeTextures } from '../creature.js';
import { SORT_COLORS } from '../config.js';

const IMGS = [
  ['sky_day', 128, 128], ['sky_night', 128, 128],
  ['hills_far', 1000, 260], ['hills_near', 1000, 300], ['ground', 1000, 200],
  ['cloud1', 260, 117], ['cloud2', 195, 91],
  ['sun', 200, 200], ['moon', 170, 170],
  ['flower1', 72, 96], ['flower2', 72, 96], ['flower3', 68, 92],
  ['rainbow', 560, 294], ['fountain', 208, 195], ['grass', 90, 54],
  ['sign_road', 240, 240], ['sign_egg', 240, 240], ['sign_feed', 254, 268], ['sign_sort', 240, 254],
  ['easel', 210, 238], ['nest', 420, 182], ['egg_big', 338, 416],
  ['flag', 117, 156], ['house', 266, 252], ['plate', 468, 143],
  ['basket', 260, 208], ['tree', 546, 624],
  ['apple', 132, 144], ['orange', 132, 139], ['grape', 132, 156], ['strawberry', 132, 144],
  ['hand', 108, 132], ['heart', 96, 89], ['sparkle', 84, 84], ['star', 156, 151],
  ['dot', 64, 64],
  ['face_bunny', 286, 312], ['face_bear', 286, 286],
  ['btn_round', 156, 156], ['btn_pill', 360, 120], ['btn_pill_blue', 360, 120],
  ['panel', 480, 360], ['pill_bg', 480, 101], ['bubble', 390, 208],
];
const SFX = ['tap', 'pop', 'success', 'fanfare', 'star', 'boing', 'nom', 'squeak', 'hatch', 'whoosh', 'grow', 'bgm'];
const CANDY_SHAPES = ['candy_circle', 'candy_tri', 'candy_square'];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const { width: w, height: h } = this.scale;
    const barBg = this.add.rectangle(w / 2, h / 2, Math.min(420, w * 0.7), 26, 0xffffff, 0.6).setOrigin(0.5);
    this.loadBar = this.add.rectangle(barBg.x - barBg.width / 2 + 4, h / 2, 4, 18, 0xff8a5c).setOrigin(0, 0.5);
    this.loadBarBg = barBg;
    const label = this.add.text(w / 2, h / 2 - 40, '마을을 준비하고 있어요...', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#4a3f35',
    }).setOrigin(0.5);
    this.load.on('progress', v => { this.loadBar.width = Math.max(4, (barBg.width - 8) * v); });
    this.load.on('complete', () => label.setText('거의 다 됐어요!'));

    // 단일 파일 배포본은 네트워크 없이 내장 에셋(window.__EMBEDDED_ASSETS)으로 부팅한다
    if (window.__EMBEDDED_ASSETS) return;
    for (const [key, tw, th] of IMGS) this.load.svg(key, `assets/img/${key}.svg`, { width: tw, height: th });
    for (const key of SFX) this.load.audio(key, `assets/audio/${key}.wav`);
    for (const key of CANDY_SHAPES) this.load.text(`${key}_src`, `assets/img/${key}.svg`);
  }

  create() {
    audio.init(this);
    const EMB = window.__EMBEDDED_ASSETS;
    const jobs = [];

    if (EMB) {
      // 이미지: 내장 SVG 텍스트 → 지정 크기로 래스터라이즈
      let done = 0;
      const total = IMGS.length;
      for (const [key, tw, th] of IMGS) {
        const svg = EMB.img[key].replace('<svg ', `<svg width="${tw}" height="${th}" `);
        jobs.push(new Promise(res => {
          const img = new Image();
          img.onload = () => {
            this.textures.addImage(key, img);
            done++;
            this.loadBar.width = Math.max(4, (this.loadBarBg.width - 8) * done / total);
            res();
          };
          img.onerror = () => res();
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        }));
      }
      // 오디오: base64 → ArrayBuffer → 디코드
      const b64buf = b64 => {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr.buffer;
      };
      jobs.push(new Promise(res => {
        let pending = SFX.length;
        if (!pending) return res();
        this.sound.on('decoded', () => { if (--pending <= 0) res(); });
        setTimeout(res, 8000); // 디코드가 막혀도 부팅은 진행
        for (const key of SFX) {
          try { this.sound.decodeAudio(key, b64buf(EMB.audio[key])); } catch (e) { if (--pending <= 0) res(); }
        }
      }));
    }

    bakeEyeTextures(this);

    // 별사탕 색 변형 텍스처 (SVG 템플릿 → 색 치환 → 이미지)
    const candyJobs = () => {
      for (const shape of CANDY_SHAPES) {
        const src = EMB ? EMB.img[shape] : this.cache.text.get(`${shape}_src`);
        for (const col of SORT_COLORS) {
          const key = `${shape}_${col.key}`;
          const hex = '#' + col.tint.toString(16).padStart(6, '0');
          const svg = src.replace(/#COLOR/g, hex).replace('<svg ', '<svg width="120" height="120" ');
          jobs.push(new Promise(res => {
            const img = new Image();
            img.onload = () => { this.textures.addImage(key, img); res(); };
            img.onerror = () => res();
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
          }));
        }
      }
    };
    candyJobs();

    // 한글 폰트 로드 후 시작 (DOM/캔버스 텍스트 모두 주아체)
    const fontSrc = EMB ? `url(data:font/ttf;base64,${EMB.font})` : 'url(assets/font/Jua-Regular.ttf)';
    const font = new FontFace('Jua', fontSrc);
    jobs.push(font.load().then(f => { document.fonts.add(f); }).catch(() => {}));

    Promise.all(jobs).then(() => this.scene.start('Profile'));
  }
}
