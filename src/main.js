import { BootScene } from './scenes/BootScene.js';
import { ProfileScene } from './scenes/ProfileScene.js';
import { VillageScene } from './scenes/VillageScene.js';
import { RoadScene } from './scenes/RoadScene.js';
import { EggScene } from './scenes/EggScene.js';
import { FeedScene } from './scenes/FeedScene.js';
import { SortScene } from './scenes/SortScene.js';
import { DrawScene } from './scenes/DrawScene.js';
import { AquaScene } from './scenes/AquaScene.js';
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
  scene: [BootScene, ProfileScene, VillageScene, RoadScene, EggScene, FeedScene, SortScene, DrawScene, AquaScene],
});

/* 장면 전환 (페이드 + 휙 소리). Phaser가 씬 종료 시 타이머·트윈을 정리하므로
   v3의 '축하 타이머 누수' 계열 문제가 구조적으로 사라진다. */
/* 목적지 색으로 페이드 — 전환 자체가 "어디로 가는지"를 색으로 예고한다.
   특히 어두운 수족관으로 들어갈 때 흰 섬광이 터지지 않게 한다. */
const FADE = {
  Aqua: [26, 110, 168], Egg: [255, 232, 240], Feed: [255, 240, 220],
  Sort: [240, 236, 250], Road: [234, 250, 255], Draw: [255, 253, 246], Village: [255, 255, 255],
};
export function switchScene(from, key, data) {
  if (from._switching) return;
  from._switching = true;
  audio.whoosh();
  audio.stopSpeak();
  ui.closeCelebrate(); // 잔여 축하 오버레이·상태 무효화 (씬 이중 활성 방지)
  ui._celState = null;
  ui.setActionBar('');
  ui.setPill('');
  const [fr, fg, fb] = FADE[key] || [255, 255, 255];
  from.cameras.main.fadeOut(220, fr, fg, fb);
  from.time.delayedCall(230, () => {
    from._switching = false; // 씬 객체는 재사용되므로 반드시 리셋
    from.scene.start(key, data || {});
  });
}

function activeGameScene() {
  for (const key of ['Village', 'Road', 'Egg', 'Feed', 'Sort', 'Draw', 'Aqua', 'Profile']) {
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

/* iOS 등에서 회전 직후 캔버스 크기가 어긋나는 문제 — 안정화 후 강제 재측정 */
window.addEventListener('orientationchange', () => {
  setTimeout(() => { try { game.scale.refresh(); } catch (e) {} }, 350);
});

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

/* PWA 서비스 워커 (http/https에서만).
   설치된 앱이 새 버전을 실제로 받아오게 하는 3단계:
   1) 앱이 앞으로 올 때마다 새 워커가 있는지 확인 (update)
   2) 새 워커가 제어권을 잡으면 한 번만 자동 새로고침 — 그래야 새 코드가 실제로 돈다
   3) 첫 설치(이전 워커 없음)에서는 새로고침하지 않는다 (불필요한 깜빡임 방지) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  const RELOAD_KEY = 'village-sw-reload';
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    // 문서가 바뀌면 위 플래그도 사라진다 — 탭 수명 저장소로 재로드 루프를 막는다
    let last = 0;
    try { last = +(sessionStorage.getItem(RELOAD_KEY) || 0); } catch (e) {}
    if (Date.now() - last < 60000) return;
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e) {}
    refreshing = true;
    /* 아직 저장되지 않은 창작물이 하나라도 있으면 새로고침하지 않는다.
       손가락이 화면에 닿아 있는 순간만 보면 안 된다 — 아이의 그림은 손을 뗀 뒤
       메모리(strokes)에만 있다가 '걸기/보내기/부화' 때 비로소 저장된다.
       그 사이(획과 획 사이, 색·눈·이름 고르는 내내)에 새로고침하면 통째로 사라진다. */
    const busy = () => {
      // 화면이 꺼져 있거나 다른 앱에 가려져 있을 때 새로고침하면
      // (특히 홈 화면 설치 앱에서) 돌아왔을 때 하얀 화면을 만날 수 있다
      if (document.hidden) return true;
      const s = activeGameScene();
      if (!s) return true; // 부팅 중 — 로딩을 끊지 않는다
      if (s) {
        if (s.stroke || s.drawing) return true;                 // 손이 화면에 닿아 있다
        if (s.strokes && s.strokes.length) return true;         // 저장 전 그림이 메모리에 있다
        if (s.scene.key === 'Egg' && s.state && s.state !== 'pick') return true; // 꾸미기·이름 짓는 중
      }
      return !!document.querySelector('#celebrate.show, #book.show, #gallery.show, #parent.show');
    };
    const deadline = Date.now() + 180000; // 3분 넘게 바쁘면 포기하고 다음 실행에 맡긴다
    const tryReload = () => {
      if (busy()) {
        if (Date.now() < deadline) setTimeout(tryReload, 1500);
        else refreshing = false;
        return;
      }
      store.flush(); // 혹시 남아 있는 저장 예약을 확실히 내보낸다
      location.reload();
    };
    tryReload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      let lastCheck = 0;
      const check = () => {
        // 30초 스로틀 — 앱 전환을 반복해도 네트워크를 두드리지 않는다
        if (Date.now() - lastCheck < 30000) return;
        lastCheck = Date.now();
        try { const r = reg.update(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
      };
      check();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }).catch(() => {});
  });
}
