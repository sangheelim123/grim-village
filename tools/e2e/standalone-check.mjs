/* 단일 파일 배포본(dist/무럭무럭그림마을.html)이 실제로 부팅하는지.
   빌드가 에셋을 하나라도 빠뜨리면 여기서 걸린다. */
import { chromium, BASE } from './_env.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = BASE + '/dist/' + encodeURIComponent('무럭무럭그림마을.html');

/* 단일 파일은 옆에 sw.js가 없다 — 서비스워커 등록 404는 정상이고,
   오디오 자동재생 경고도 헤드리스에서 늘 난다. 진짜 오류만 남긴다. */
const BENIGN = /fetching the script|service ?worker|AudioContext|Web Audio|autoplay|speechSynthesis|the user didn't interact/i;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1024, height: 700 } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(URL);
await sleep(5000);
const state = await page.evaluate(() => ({
  boot: !!(window.__game && window.__game.scene.isActive('Profile')),
  tex: window.__game ? Object.keys(window.__game.textures.list).length : 0,
  embedded: !!window.__EMBEDDED_ASSETS,
}));
const real = errs.filter(e => !BENIGN.test(e));
const ok = state.boot && state.embedded && state.tex > 50 && real.length === 0;
console.log(`${ok ? '✅' : '❌'} 단일 파일 배포본 부팅 — 텍스처 ${state.tex}개, 내장에셋 ${state.embedded ? 'O' : 'X'}` +
  (real.length ? `, 오류 ${real.slice(0, 3).join(' | ')}` : ''));
console.log(`\n[단일파일] ${ok ? 1 : 0}/1 통과`);
await browser.close();
process.exit(ok ? 0 : 1);
