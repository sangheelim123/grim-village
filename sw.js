/* 오프라인 캐시: 설치 시 전체 프리캐시, 이후 캐시 우선 */
const CACHE = 'village-v4-15';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './vendor/phaser.min.js',
  './src/main.js', './src/config.js', './src/store.js', './src/audio.js',
  './src/tracer.js', './src/creature.js', './src/dom-ui.js',
  './src/scenes/common.js', './src/scenes/BootScene.js', './src/scenes/ProfileScene.js',
  './src/scenes/VillageScene.js', './src/scenes/RoadScene.js', './src/scenes/EggScene.js',
  './src/scenes/FeedScene.js', './src/scenes/SortScene.js', './src/scenes/DrawScene.js',
  './src/scenes/AquaScene.js',
  './assets/font/Jua-Regular.ttf',
  './assets/img/icon-192.png', './assets/img/icon-512.png',
];
const IMGS = ['sky_day','sky_night','sky_egg','sky_feed','sky_sort','sky_road',
  'island_platform','glow','butterfly','bird','hills_far','hills_near','ground','cloud1','cloud2','sun','moon',
  'flower1','flower2','flower3','rainbow','fountain','grass','sign_road','sign_egg','sign_feed','sign_sort','sign_aqua',
  'easel','nest','egg_big','flag','house','plate','basket','tree','apple','orange','grape','strawberry',
  'hand','heart','sparkle','star','dot','leaf','face_bunny','face_bear','btn_round','btn_pill','btn_pill_blue',
  'panel','pill_bg','bubble','candy_circle','candy_tri','candy_square'];
const SFX = ['tap','pop','success','fanfare','star','boing','nom','squeak','hatch','whoosh','grow','bgm'];
for (const k of IMGS) ASSETS.push(`./assets/img/${k}.svg`);
for (const k of SFX) ASSETS.push(`./assets/audio/${k}.wav`);

/* 프리캐시는 반드시 네트워크에서 새로 받는다.
   cache.addAll()은 브라우저 HTTP 캐시를 그대로 쓰기 때문에, 배포 직후
   (GitHub Pages는 max-age=600) 새 서비스워커가 '옛 파일'을 캐시에 담아
   버전만 올라가고 내용은 그대로인 상태가 만들어진다 — 업데이트가 안 되는 진짜 원인. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(url =>
        fetch(new Request(url, { cache: 'reload' })).then(res => {
          // 한 파일이라도 실패하면 설치 전체를 실패시킨다 — 그래야 이전 워커와
          // 이전 캐시가 그대로 남아 앱이 계속 동작한다. 반쪽짜리 새 캐시로
          // 갈아타면(그리고 activate가 옛 캐시를 지우면) 오프라인 앱이 영영 죽는다.
          if (!res || !res.ok) throw new Error('precache failed: ' + url);
          return c.put(url, res);
        }))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
/* 캐시 우선 — 신선도는 '설치 시 프리캐시'가 보장한다(위 install 참고).
   캐시 조회는 반드시 현재 버전 캐시에서만: caches.match는 모든 캐시를 뒤져
   업데이트 직후 구·신 파일이 섞이고, ES 모듈은 섞이는 순간 바로 깨진다.

   새 버전은 '설치 → activate → 자동 새로고침'으로 통째로 갈아탄다.
   요청 단위로 새것을 섞어 오면 안 된다 — 섞이는 순간 앱이 깨진다. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // 외부 요청은 건드리지 않는다
  // 인터넷 연결 확인용 요청은 절대 캐시로 답하지 않는다 —
  // 캐시가 대신 응답하면 오프라인인데도 '연결됨'으로 착각해 캐시를 지워 버린다
  if (url.searchParams.has('probe')) return;

  const fromCache = () => caches.open(CACHE)
    .then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || c.match('./index.html')));

  /* 첫 진입(navigate)도 반드시 캐시에서 — 셸(HTML)과 모듈(JS)은 같은 세대여야 한다.
     네트워크에서 새 index.html만 받아 오면 그 페이지가 캐시의 옛 src/*.js를 불러
     "새 HTML + 옛 JS"가 실행된다. ES 모듈은 그 순간 바로 깨지고(없는 DOM id 참조),
     심지어 그 혼합 HTML이 캐시에 그대로 저장돼 오프라인 부팅까지 망가진다.
     신선도는 install 프리캐시(cache:'reload') + controllerchange 자동 새로고침이 담당한다. */
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(req, { ignoreSearch: true })
          .then(hit => hit || c.match('./index.html'))
          .then(hit => hit || c.match('./'))
          .then(hit => hit || fetch(req)))
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE)
      .then(c => c.match(req, { ignoreSearch: true }).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            c.put(req, copy).catch(() => {}); // 206 등은 조용히 무시
            return res;
          }
          // 404·5xx(배포 중 잠깐 깨진 순간 등)에도 캐시가 있으면 그걸 쓴다
          return c.match(req, { ignoreSearch: true }).then(alt => alt || res);
        }).catch(() => c.match(req, { ignoreSearch: true }));
      }))
  );
});

/* 부모 코너의 '최신 버전 받기' — 캐시를 비우고 네트워크에서 새로 받아 채운다.
   페이지가 그냥 새로고침만 하면 브라우저 HTTP 캐시(GitHub Pages max-age=600)가
   또 옛 파일을 내주므로, 여기서 cache:'reload'로 확실히 새로 받아 둔다. */
function precacheFresh() {
  return caches.open(CACHE).then(c => Promise.all(ASSETS.map(url =>
    fetch(new Request(url, { cache: 'reload' })).then(res => {
      if (!res || !res.ok) throw new Error('refresh failed: ' + url);
      return c.put(url, res);
    }))));
}
self.addEventListener('message', e => {
  const type = e.data && e.data.type;
  if (type !== 'refresh' && type !== 'clear-caches') return;
  const reply = ok => { if (e.source && e.source.postMessage) e.source.postMessage({ type: 'refreshed', ok: ok }); };
  e.waitUntil(
    caches.delete(CACHE)
      .then(() => precacheFresh())
      .then(() => reply(true))
      .catch(() => reply(false))
  );
});
