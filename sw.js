/* 오프라인 캐시: 설치 시 전체 프리캐시, 이후 캐시 우선 */
const CACHE = 'village-v4-10';
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
  'hand','heart','sparkle','star','dot','face_bunny','face_bear','btn_round','btn_pill','btn_pill_blue',
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

   예외는 '첫 진입(navigate)' 하나뿐이다. 어떤 이유로 새 서비스워커가 아직
   안 깔렸어도 문 앞에서 새 index.html을 한 번 확인해 보고, 2초 안에 응답이
   없거나 오프라인이면 즉시 캐시로 논다 — 요청이 하나뿐이라 부팅이 느려지지 않는다. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // 외부 요청은 건드리지 않는다

  const fromCache = () => caches.open(CACHE)
    .then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || c.match('./index.html')));

  if (req.mode === 'navigate') {
    let fresh;
    // navigate 요청을 그대로 재구성하지 못하는 브라우저가 있다 — 실패하면 원본을 쓴다
    try { fresh = new Request(req, { cache: 'no-cache' }); } catch (err) { fresh = req; }
    e.respondWith(
      Promise.race([
        fetch(fresh).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        }).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 2000)),
      ]).then(res => res || fromCache().then(hit => hit || fetch(req)))
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE)
      .then(c => c.match(req, { ignoreSearch: true }))
      .then(hit => hit || fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); // 206 등은 조용히 무시
        }
        return res;
      }))
  );
});

/* 부모 코너의 '최신 버전 받기' — 캐시를 통째로 비우고 다시 받는다 */
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'clear-caches') return;
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => { if (e.source && e.source.postMessage) e.source.postMessage({ type: 'caches-cleared' }); })
  );
});
