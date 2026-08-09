import { BootScene } from './scenes/BootScene.js';
import { ProfileScene } from './scenes/ProfileScene.js';
import { VillageScene } from './scenes/VillageScene.js';
import { RoadScene } from './scenes/RoadScene.js';
import { EggScene } from './scenes/EggScene.js';
import { FeedScene } from './scenes/FeedScene.js';
import { SortScene } from './scenes/SortScene.js';
import { DrawScene } from './scenes/DrawScene.js';
import { bindGlobalUI, ui } from './dom-ui.js';
import { audio } from './audio.js';
import { store } from './store.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#aee9ff',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 3 },
  scene: [BootScene, ProfileScene, VillageScene, RoadScene, EggScene, FeedScene, SortScene, DrawScene],
});

/* 장면 전환 (페이드 + 휙 소리). Phaser가 씬 종료 시 타이머·트윈을 정리하므로
   v3의 '축하 타이머 누수' 계열 문제가 구조적으로 사라진다. */
export function switchScene(from, key, data) {
  if (from._switching) return;
  from._switching = true;
  audio.whoosh();
  audio.stopSpeak();
  ui.closeCelebrate(); // 잔여 축하 오버레이·상태 무효화 (씬 이중 활성 방지)
  ui._celState = null;
  ui.setActionBar('');
  ui.setPill('');
  from.cameras.main.fadeOut(220, 255, 255, 255);
  from.time.delayedCall(230, () => {
    from._switching = false; // 씬 객체는 재사용되므로 반드시 리셋
    from.scene.start(key, data || {});
  });
}

function activeGameScene() {
  for (const key of ['Village', 'Road', 'Egg', 'Feed', 'Sort', 'Draw', 'Profile']) {
    const s = game.scene.getScene(key);
    if (s && game.scene.isActive(key)) return s;
  }
  return null;
}

game.events.on('goto-village', () => {
  const s = activeGameScene();
  if (s && s.scene.key !== 'Village') switchScene(s, 'Village');
});
game.events.on('goto-profile', () => {
  const s = activeGameScene();
  if (s) switchScene(s, 'Profile');
});
game.events.on('repeat-voice', () => {
  const s = activeGameScene();
  if (s && s.repeatVoice) s.repeatVoice();
});

bindGlobalUI(game);
window.__game = game;

/* 오늘 놀이 시간 누적 */
let statAccum = 0, lastT = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = (now - lastT) / 1000;
  lastT = now;
  if (store.P && document.visibilityState === 'visible') {
    statAccum += dt;
    if (statAccum >= 10) {
      store.P.stats.sec += Math.round(statAccum);
      statAccum = 0;
      store.save();
    }
  }
}, 2000);

/* PWA 서비스 워커 (http/https에서만) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
