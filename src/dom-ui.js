/* DOM 오버레이 UI: 안내 필, 토스트, 액션바, 축하, 도감, 부모 코너
   (게임 월드는 Phaser, 메뉴성 UI는 DOM — 검증된 v3 UX를 그대로 계승) */
import { audio } from './audio.js';
import { store } from './store.js';
import { drawCreature2D, drawCreatureReplay, drawArt2D } from './creature.js';
import { PRAISES, PERSONALITIES, VERSION, LEVEL_DESC, AREA_NAME, HOME_TIPS, pickVary, eunNeun } from './config.js';

const $ = id => document.getElementById(id);

/* 오버레이(도감·부모 코너) 열기/닫기.
   열 때 history에 한 칸을 쌓아, 설치형 앱에서 뒤로가기를 누르면
   앱이 꺼지는 대신 오버레이만 닫히게 한다 (popstate가 실제 닫기를 수행). */
let pushedCount = 0;   // 우리가 history에 쌓아 둔 오버레이 항목 수
let ignorePop = 0;     // 우리가 스스로 부른 back()이 만든 popstate는 무시
let overlayOpenedAt = 0;
let gameRef = null;

/* DOM 오버레이(도감·부모 코너·축하)가 떠 있는 동안 게임 입력을 잠근다.
   Phaser는 창 레벨에서도 포인터를 듣기 때문에, 잠그지 않으면 오버레이 버튼을 누른
   손가락이 그 아래 놀이 섬 간판까지 함께 눌러 엉뚱한 씬으로 넘어간다 (실기기 확인). */
export function refreshInputGate() {
  if (!gameRef) return;
  const blocked = !!document.querySelector('#parent.show, #book.show, #gallery.show, #celebrate.show');
  try {
    gameRef.input.enabled = !blocked;
    if (gameRef.canvas) gameRef.canvas.style.pointerEvents = blocked ? 'none' : '';
  } catch (e) {}
}

function openOverlay(id) {
  $(id).classList.add('show');
  overlayOpenedAt = Date.now();
  refreshInputGate();
  try { history.pushState({ ov: true }, ''); pushedCount++; } catch (e) {}
}
/* 닫기는 history와 무관하게 항상 즉시 성공한다 — history 되감기는 부수적으로만 시도 */
function closeOverlay(id) {
  const el = $(id);
  if (!el.classList.contains('show')) return;
  el.classList.remove('show');
  refreshInputGate();
  if (pushedCount > 0) {
    pushedCount--; ignorePop++;
    try { history.back(); } catch (e) { ignorePop--; }
  }
}
function hideAllOverlays() {
  document.querySelectorAll('#parent.show, #book.show, #gallery.show').forEach(el => el.classList.remove('show'));
  refreshInputGate();
}

export const ui = {
  setPill(text) {
    const el = $('pill');
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },
  guide(text) { this.setPill(text); audio.speak(text); },
  toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  },
  setActionBar(html) {
    const bar = $('action-bar');
    bar.innerHTML = html || '';
    bar.classList.toggle('show', !!html);
  },
  topButtons(mode) {
    // mode: 'village' | 'play' | 'none'
    $('btn-home').classList.toggle('show', mode === 'play');
    $('btn-voice').classList.toggle('show', mode === 'play');
    $('btn-profile').classList.toggle('show', mode === 'village');
    $('btn-book').classList.toggle('show', mode === 'village');
    // 기어는 첫 화면에서도 보인다 — 부모가 설정에 닿으려고 마을까지 들어갈 필요는 없다
    $('btn-gear').classList.toggle('show', mode === 'village' || mode === 'none');
  },

  /* ---- 축하 ---- */
  _celState: null,
  celebrate(opts) {
    this._celState = opts;
    $('cel-title').textContent = pickVary(PRAISES);
    const starsEl = $('cel-stars');
    starsEl.innerHTML = '';
    if (opts.stars != null) {
      for (let s = 1; s <= 3; s++) {
        const span = document.createElement('span');
        span.className = 'star' + (s <= opts.stars ? '' : ' off');
        span.textContent = '⭐';
        starsEl.appendChild(span);
        if (s <= opts.stars) setTimeout(() => { span.classList.add('on'); audio.star(s); }, 250 + s * 380);
      }
    }
    const cc = $('cel-canvas');
    if (opts.char) {
      cc.style.display = 'block';
      const c2 = cc.getContext('2d');
      c2.clearRect(0, 0, 150, 150);
      drawCreature2D(c2, opts.char, 75, 78, 118);
    } else cc.style.display = 'none';
    $('cel-msg').textContent = opts.msg || '';
    $('cel-again').style.display = opts.onAgain ? '' : 'none';
    $('celebrate').classList.add('show');
    refreshInputGate(); // 축하창 버튼이 뒤의 게임까지 누르지 않게
    audio.fanfare();
    // 칭찬 문구는 대형 텍스트+별로 이미 전달됨 — 핵심 메시지만, 팡파레와 겹치지 않게 늦게 발화
    if (opts.speakMsg) setTimeout(() => audio.speak(opts.speakMsg), 600);
    store.P.stats.plays++;
    store.save();
  },
  closeCelebrate() { $('celebrate').classList.remove('show'); refreshInputGate(); },

  /* ---- 도감 ---- */
  openBook() {
    const grid = $('book-grid');
    grid.innerHTML = '';
    const chars = store.P.chars;
    $('book-empty').style.display = chars.length ? 'none' : 'block';
    $('book-sub').textContent = chars.length
      ? `친구 ${chars.length}명 · 별 ⭐ ${store.totalStars()}개 · 💛를 눌러 짝꿍을 정해요 · 그림을 누르면 다시 그려져요` : '';
    chars.slice().reverse().forEach(char => {
      const card = document.createElement('div');
      card.className = 'book-card';
      // 짝꿍 토글 (짝꿍은 마을에서 절대 사라지지 않고, 냠냠·길에 우선 등장)
      const favBtn = document.createElement('button');
      favBtn.className = 'fav-btn';
      favBtn.textContent = char.fav ? '💛' : '🤍';
      favBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!char.fav && store.favCount() >= 2) {
          this.toast('💛 짝꿍은 두 명까지예요!');
          audio.boing();
          return;
        }
        char.fav = char.fav ? 0 : 1;
        store.save();
        favBtn.textContent = char.fav ? '💛' : '🤍';
        audio.pop(3);
        if (char.fav) audio.speak(`${eunNeun(char.n)} 이제 짝꿍이에요!`, { pri: 1 });
      });
      card.appendChild(favBtn);
      const cv = document.createElement('canvas');
      cv.width = 88; cv.height = 88;
      drawCreature2D(cv.getContext('2d'), char, 44, 47, 72);
      // 그림 탭 → 스트로크 리플레이: "그때 내가 그렸던 손짓"이 다시 그려진다
      cv.addEventListener('click', () => this.playReplay(cv, char));
      card.appendChild(cv);
      const nm = document.createElement('div');
      nm.className = 'book-name'; nm.textContent = char.n;
      card.appendChild(nm);
      const st = document.createElement('div');
      st.className = 'book-stage';
      const p = PERSONALITIES[(char.p || 0) % 3];
      st.textContent = `${p.emoji} ${p.name} · ` + ['🐣 아기', '🌱 어린이', '🌳 어른'][char.g] + ` · 냠냠 ${char.f}번`;
      card.appendChild(st);
      grid.appendChild(card);
    });
    openOverlay('book');
    audio.pop(3);
  },
  /* ---- 그림 게시판 (그림 놀이터에서 건 그림) ---- */
  openGallery() {
    const grid = $('gallery-grid');
    grid.innerHTML = '';
    const arts = (store.P.arts || []).slice().reverse();
    $('gallery-empty').style.display = arts.length ? 'none' : 'block';
    $('gallery-sub').textContent = arts.length ? `그림 ${arts.length}장 · 그림을 누르면 다시 그려져요` : '';
    for (const art of arts) {
      const cv = document.createElement('canvas');
      cv.width = 106; cv.height = 106;
      drawArt2D(cv.getContext('2d'), art, 53, 53, 100);
      cv.addEventListener('click', () => this.playArtReplay(cv, art));
      grid.appendChild(cv);
    }
    openOverlay('gallery');
    audio.pop(3);
  },
  playArtReplay(cv, art) {
    if (cv._replaying) return;
    cv._replaying = true;
    audio.pop(2);
    const c2 = cv.getContext('2d');
    const t0 = performance.now();
    const DUR = 1600;
    const step = now => {
      const t = Math.min(1, (now - t0) / DUR);
      c2.clearRect(0, 0, 106, 106);
      drawArt2D(c2, art, 53, 53, 100, t);
      if (t < 1) requestAnimationFrame(step);
      else { cv._replaying = false; audio.star(2); }
    };
    requestAnimationFrame(step);
  },

  playReplay(cv, char) {
    if (cv._replaying) return;
    cv._replaying = true;
    audio.pop(2);
    const c2 = cv.getContext('2d');
    const t0 = performance.now();
    const DUR = 1600;
    const step = now => {
      const t = Math.min(1, (now - t0) / DUR);
      c2.clearRect(0, 0, 88, 88);
      drawCreatureReplay(c2, char, 44, 47, 72, t);
      if (t < 1) requestAnimationFrame(step);
      else {
        cv._replaying = false;
        audio.star(2);
      }
    };
    requestAnimationFrame(step);
  },

  /* ---- 부모 코너 ---- */
  openParent() {
    const P = store.P;
    const m = Math.floor(P.stats.sec / 60);
    $('parent-stats').innerHTML =
      `오늘 놀이 시간: <b>${m}분</b> · 완료한 활동: <b>${P.stats.plays}회</b><br>` +
      `마을 친구: <b>${P.chars.length}명</b> · 모은 별: <b>⭐ ${store.totalStars()}</b>`;
    // 지금 어디쯤인지 — 점수가 아니라 말로
    const areas = ['road', 'egg', 'feed', 'sort'];
    $('parent-levels').innerHTML = areas.map(k => {
      const n = Math.min(5, Math.max(1, Math.round(P.lvl[k])));
      return `<div><b>${AREA_NAME[k]}</b> · ${LEVEL_DESC[k][n - 1]} <span style="color:#9ab">(5단계 중 ${n})</span></div>`;
    }).join('');
    // 화면 밖에서 함께할 거리 — 가장 낮은 영역 하나를 골라 제안
    const low = areas.slice().sort((a, b) => P.lvl[a] - P.lvl[b])[0];
    const lowN = Math.min(5, Math.max(1, Math.round(P.lvl[low])));
    $('parent-tip').textContent = `💡 ${AREA_NAME[low]}: ${HOME_TIPS[low][lowN - 1]}`;
    const kidInput = $('parent-kid');
    if (kidInput) kidInput.value = (P.kid && P.kid.name) || '';
    const avg = (P.lvl.road + P.lvl.egg + P.lvl.feed + P.lvl.sort) / 4;
    document.querySelectorAll('.preset-btn[data-preset]').forEach(b => {
      b.classList.toggle('sel', Math.abs(+b.dataset.preset - avg) < 0.8);
    });
    $('parent-sound').textContent = audio.on ? '🔊 효과음·음성 켜짐' : '🔇 효과음·음성 꺼짐';
    $('parent-bgm').textContent = audio.bgmOn ? '🎵 배경음악 켜짐' : '🎵 배경음악 꺼짐';
    const pv = $('parent-version'); // 구버전 캐시 HTML엔 없을 수 있다 — 열림 자체는 막지 않는다
    if (pv) pv.textContent = `앱 버전 v${VERSION}`;
    openOverlay('parent');
  },
};

/* 공통 DOM 이벤트 바인딩 — main.js에서 1회 호출 */
export function bindGlobalUI(game) {
  gameRef = game;
  $('cel-again').addEventListener('click', () => {
    ui.closeCelebrate();
    audio.pop(2);
    if (ui._celState && ui._celState.onAgain) ui._celState.onAgain();
  });
  $('cel-home').addEventListener('click', () => {
    ui.closeCelebrate();
    audio.tap();
    game.events.emit('goto-village');
  });
  $('btn-home').addEventListener('click', () => {
    audio.tap();
    audio.stopSpeak();
    game.events.emit('goto-village');
  });
  $('btn-voice').addEventListener('click', () => {
    audio.tap();
    game.events.emit('repeat-voice');
  });
  $('btn-profile').addEventListener('click', () => {
    audio.tap();
    audio.stopSpeak();
    game.events.emit('goto-profile');
  });
  $('btn-book').addEventListener('click', () => ui.openBook());
  $('book-close').addEventListener('click', () => {
    closeOverlay('book');
    audio.tap();
  });
  // 항상 보이는 ✕, 그리고 어두운 바깥을 눌러도 닫힌다
  $('book-x').addEventListener('click', () => { closeOverlay('book'); audio.tap(); });
  $('parent-x').addEventListener('click', () => { closeOverlay('parent'); audio.tap(); });
  /* 어두운 바깥을 눌러서 닫기.
     주의 (실기기 터치 버그 이력): 기어를 3초 길게 눌러 설정이 열리면, 손을 떼는 순간
     그 손가락이 '새로 뜬 창의 바깥'을 누른 것으로 click이 전달돼 즉시 닫혀 버린다.
     그래서 (1) 누르기가 실제로 바깥에서 시작됐는지 확인하고 (2) 갓 열린 창은 잠깐 보호한다. */
  $('gallery-x').addEventListener('click', () => { closeOverlay('gallery'); audio.tap(); });
  $('gallery-close').addEventListener('click', () => { closeOverlay('gallery'); audio.tap(); });
  for (const id of ['book', 'parent', 'gallery']) {
    let downOnBackdrop = false;
    $(id).addEventListener('pointerdown', e => { downOnBackdrop = e.target.id === id; });
    $(id).addEventListener('click', e => {
      if (e.target.id !== id || !downOnBackdrop) return;
      downOnBackdrop = false;
      if (Date.now() - overlayOpenedAt < 500) return;
      closeOverlay(id);
      audio.tap();
    });
  }
  // 설치형 앱의 뒤로가기: 오버레이가 열려 있으면 앱을 끄지 않고 그것만 닫는다
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; } // 우리가 부른 back()의 메아리
    if (document.querySelector('#parent.show, #book.show, #gallery.show')) {
      pushedCount = Math.max(0, pushedCount - 1);
      hideAllOverlays();
      audio.tap();
    }
  });

  let gearTimer = null;
  $('btn-gear').addEventListener('pointerdown', e => {
    e.preventDefault();
    gearTimer = setTimeout(() => { ui.openParent(); gearTimer = null; }, 3000);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
    $('btn-gear').addEventListener(ev, () => {
      if (gearTimer) {
        clearTimeout(gearTimer); gearTimer = null;
        ui.toast('⚙️ 3초 동안 꾹 누르면 부모 코너가 열려요');
      }
    }));

  document.querySelectorAll('.preset-btn[data-preset]').forEach(b =>
    b.addEventListener('click', () => {
      const v = +b.dataset.preset;
      store.P.lvl = { road: v, egg: v, feed: v, sort: v };
      store.P.hist = { road: [], egg: [], feed: [], sort: [] };
      store.save();
      document.querySelectorAll('.preset-btn[data-preset]').forEach(x => x.classList.toggle('sel', x === b));
    }));
  $('parent-sound').addEventListener('click', () => {
    audio.setSound(!audio.on);
    $('parent-sound').textContent = audio.on ? '🔊 효과음·음성 켜짐' : '🔇 효과음·음성 꺼짐';
  });
  $('parent-bgm').addEventListener('click', () => {
    audio.setBgm(!audio.bgmOn);
    $('parent-bgm').textContent = audio.bgmOn ? '🎵 배경음악 켜짐' : '🎵 배경음악 꺼짐';
  });
  /* 최신 버전 받기 — 안전이 최우선이다.
     이 버튼은 잘못 만들면 앱을 영구히 못 켜게 만들 수 있다:
     오프라인에서 캐시를 지우면 다시 받아올 곳이 없어 앱이 사라지고,
     같은 주소(github.io)를 쓰는 다른 프로젝트의 캐시·워커까지 지울 수 있다.
     그래서 (1) 인터넷을 실제로 확인하고 (2) 우리 캐시(village-*)만 지우고
     (3) 서비스워커는 등록을 풀지 않고 갱신만 요청한다. 아이의 저장물은 그대로. */
  const forceBtn = $('btn-force-update');
  if (forceBtn) forceBtn.addEventListener('click', async () => {
    if (forceBtn._busy) return; // 연타 방어
    forceBtn._busy = true;
    const label = forceBtn.textContent;
    forceBtn.textContent = '⏳ 확인 중...';
    store.flush();
    try {
      // 정말 인터넷이 되는지 실제로 받아 본다 (navigator.onLine은 거짓말을 한다)
      const probe = await fetch('./index.html?probe=' + Date.now(), { cache: 'no-store' });
      if (!probe || !probe.ok) throw new Error('offline');
    } catch (e) {
      forceBtn.textContent = label;
      forceBtn._busy = false;
      ui.toast('📡 인터넷이 연결되면 눌러 주세요');
      audio.nope();
      return;
    }
    forceBtn.textContent = '⏳ 받는 중...';
    try {
      const sw = navigator.serviceWorker;
      const ctrl = sw && sw.controller;
      if (ctrl) {
        // 서비스워커에게 직접 "네트워크에서 새로 받아 채워라"를 시킨다.
        // (페이지가 캐시만 지우고 새로고침하면 브라우저 HTTP 캐시가 또 옛 파일을 내준다)
        await new Promise(resolve => {
          const done = () => { sw.removeEventListener('message', onMsg); resolve(); };
          const onMsg = ev => { if (ev.data && ev.data.type === 'refreshed') done(); };
          sw.addEventListener('message', onMsg);
          setTimeout(done, 20000); // 오래 걸려도 앱을 붙잡아 두지 않는다
          ctrl.postMessage({ type: 'refresh' });
        });
        try { const reg = await sw.getRegistration(); if (reg) { const r = reg.update(); if (r && r.catch) r.catch(() => {}); } } catch (e2) {}
      } else if ('caches' in window) {
        const keys = await caches.keys();
        // 우리 캐시만 — 같은 주소의 다른 앱 것을 지우면 안 된다
        await Promise.all(keys.filter(k => k.startsWith('village-')).map(k => caches.delete(k)));
      }
    } catch (e) {}
    try { sessionStorage.removeItem('village-sw-reload'); } catch (e) {}
    location.reload();
  });

  let resetArmed = false;
  $('btn-reset-data').addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      $('btn-reset-data').textContent = '정말 지울까요? (한 번 더)';
      setTimeout(() => { resetArmed = false; $('btn-reset-data').textContent = '데이터 초기화'; }, 4000);
      return;
    }
    store.reset();
    resetArmed = false;
    $('btn-reset-data').textContent = '데이터 초기화';
    closeOverlay('parent');
    game.events.emit('goto-village');
  });
  $('parent-close-btn').addEventListener('click', () => { closeOverlay('parent'); audio.pop(3); });
  const kidEl = $('parent-kid');
  if (kidEl) kidEl.addEventListener('change', e => {
    if (!store.P.kid) store.P.kid = { name: '', call: 1 };
    store.P.kid.name = String(e.target.value || '').trim().slice(0, 6);
    store.save();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });
  window.addEventListener('pagehide', () => store.flush());
}
