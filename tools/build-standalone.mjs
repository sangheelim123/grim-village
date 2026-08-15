/* 단일 파일 배포본 빌더:
   엔진 + 게임 코드 + 그림 + 소리 + 폰트를 전부 내장한 HTML 하나를 만든다.
   사용: node tools/build-standalone.mjs → dist/무럭무럭그림마을.html */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const readB64 = p => readFileSync(join(ROOT, p)).toString('base64');
// 인라인 <script> 안전 이스케이프 (문자열 리터럴 의미는 동일하게 유지됨)
const esc = s => s.replace(/<\/script/gi, '<\\/script');

const MODULES = [
  'src/config.js', 'src/store.js', 'src/audio.js', 'src/tracer.js',
  'src/creature.js', 'src/dom-ui.js',
  'src/scenes/common.js', 'src/scenes/BootScene.js', 'src/scenes/ProfileScene.js',
  'src/scenes/VillageScene.js', 'src/scenes/RoadScene.js', 'src/scenes/EggScene.js',
  'src/scenes/FeedScene.js', 'src/scenes/SortScene.js', 'src/scenes/DrawScene.js',
  'src/scenes/AquaScene.js',
  'src/main.js',
];
const IMG_KEYS = ['sky_day','sky_night','sky_egg','sky_feed','sky_sort','sky_road',
  'island_platform','glow','butterfly','bird','hills_far','hills_near','ground','cloud1','cloud2','sun','moon',
  'flower1','flower2','flower3','rainbow','fountain','grass','sign_road','sign_egg','sign_feed','sign_sort','sign_aqua',
  'easel','nest','egg_big','flag','house','plate','basket','tree','apple','orange','grape','strawberry',
  'hand','heart','sparkle','star','dot','face_bunny','face_bear','btn_round','btn_pill','btn_pill_blue',
  'panel','pill_bg','bubble','candy_circle','candy_tri','candy_square'];
const SFX_KEYS = ['tap','pop','success','fanfare','star','boing','nom','squeak','hatch','whoosh','grow','bgm'];

// 1. 게임 코드: import 제거, export 키워드 제거 후 순서대로 연결
const bundle = MODULES.map(p => {
  let s = read(p);
  s = s.replace(/^import .*$/gm, '');
  s = s.replace(/^export (const|function|class)/gm, '$1');
  return `// ===== ${p} =====\n${s}`;
}).join('\n');

// 2. 에셋 내장
const assets = {
  img: Object.fromEntries(IMG_KEYS.map(k => [k, read(`assets/img/${k}.svg`)])),
  audio: Object.fromEntries(SFX_KEYS.map(k => [k, readB64(`assets/audio/${k}.wav`)])),
  font: readB64('assets/font/Jua-Regular.ttf'),
};

// 3. 셸: index.html에서 CSS와 DOM을 추출 (외부 참조는 제거)
const indexHtml = read('index.html');
let css = indexHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
css = css.replace(/@font-face\s*\{[\s\S]*?\}/, ''); // 폰트는 부팅 시 data URI로 주입
const dom = indexHtml.match(/<body>([\s\S]*?)<script /)[1];

const out = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
<title>무럭무럭 그림 마을</title>
<meta name="theme-color" content="#8fd8ff">
<style>${css}</style>
</head>
<body>
${dom}
<script>${esc(read('vendor/phaser.min.js'))}</script>
<script>window.__EMBEDDED_ASSETS = ${esc(JSON.stringify(assets))};</script>
<script>${esc(bundle)}</script>
</body>
</html>
`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const outPath = join(ROOT, 'dist', '무럭무럭그림마을.html');
writeFileSync(outPath, out);
console.log('빌드 완료:', outPath, (out.length / 1024 / 1024).toFixed(1) + 'MB');
