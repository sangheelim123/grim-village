/* 오프라인 캐시: 설치 시 전체 프리캐시, 이후 캐시 우선 */
const CACHE = 'village-v4-5';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './vendor/phaser.min.js',
  './src/main.js', './src/config.js', './src/store.js', './src/audio.js',
  './src/tracer.js', './src/creature.js', './src/dom-ui.js',
  './src/scenes/common.js', './src/scenes/BootScene.js', './src/scenes/ProfileScene.js',
  './src/scenes/VillageScene.js', './src/scenes/RoadScene.js', './src/scenes/EggScene.js',
  './src/scenes/FeedScene.js', './src/scenes/SortScene.js', './src/scenes/DrawScene.js',
  './assets/font/Jua-Regular.ttf',
  './assets/img/icon-192.png', './assets/img/icon-512.png',
];
const IMGS = ['sky_day','sky_night','hills_far','hills_near','ground','cloud1','cloud2','sun','moon',
  'flower1','flower2','flower3','rainbow','fountain','grass','sign_road','sign_egg','sign_feed','sign_sort',
  'easel','nest','egg_big','flag','house','plate','basket','tree','apple','orange','grape','strawberry',
  'hand','heart','sparkle','star','dot','face_bunny','face_bear','btn_round','btn_pill','btn_pill_blue',
  'panel','pill_bg','bubble','candy_circle','candy_tri','candy_square'];
const SFX = ['tap','pop','success','fanfare','star','boing','nom','squeak','hatch','whoosh','grow','bgm'];
for (const k of IMGS) ASSETS.push(`./assets/img/${k}.svg`);
for (const k of SFX) ASSETS.push(`./assets/audio/${k}.wav`);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
    )
  );
});
