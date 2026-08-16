/* 실제 업데이트 시나리오 E2E:
   1) 서버에 '구버전'을 두고 앱 설치(SW 등록) → 오프라인 동작 확인
   2) 서버 파일을 '신버전'으로 교체 (GitHub Pages 배포와 동일한 상황)
   3) 새로고침 1회 → 신버전이 떠야 한다
   4) 다시 오프라인으로 만들어도 여전히 동작해야 한다 */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from './_env.mjs';
const fs = require('fs'); const path = require('path');
const http = require('http');

const ROOT = TMP + '/upd-root';
const CUR = (fs.readFileSync(REPO + '/src/config.js','utf8').match(/VERSION = '([^']+)'/) || [,'?'])[1];
const SRC = REPO;
const PORT = 8389;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = [];
function step(n, ok, x) { steps.push(ok); console.log(`${ok?'✅':'❌'} ${n}${x?' — '+x:''}`); if (!ok) process.exitCode = 1; }

// 저장소를 복사해 '서버 디렉터리'를 만든다
fs.rmSync(ROOT, { recursive: true, force: true });
fs.cpSync(SRC, ROOT, { recursive: true, filter: s => !s.includes('/.git') && !s.includes('/dist') });

// 구버전으로 되돌린다 (VERSION + 캐시 이름)
const cfg = path.join(ROOT, 'src/config.js');
fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(`VERSION = '${CUR}'`, "VERSION = '0.9.9-OLD'"));
const swf = path.join(ROOT, 'sw.js');
fs.writeFileSync(swf, fs.readFileSync(swf, 'utf8').replace(/village-v4-[0-9]+/, "village-OLD"));

const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.wav':'audio/wav',
  '.ttf':'font/ttf', '.png':'image/png' };
let offline = false;
const server = http.createServer((req, res) => {
  if (offline) { res.socket.destroy(); return; }
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    // GitHub Pages와 동일하게 10분 캐시 헤더 (stale 프리캐시 재현의 핵심)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                         'Cache-Control': 'max-age=600' });
    res.end(data);
  });
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
const page = await ctx.newPage();
const base = `http://localhost:${PORT}/index.html`;
const shownVersion = () => page.evaluate(() => {
  const v = window.__game && window.__game.scene.getScene('Profile');
  return v && v.verText ? v.verText.text : null;
});

await page.goto(base);
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')", { timeout: 20000 });
await sleep(1200);
step('구버전 설치', (await shownVersion()) === 'v0.9.9-OLD', await shownVersion());
await page.evaluate(() => navigator.serviceWorker.ready);
await sleep(1500); // 프리캐시 완료 대기

// 오프라인에서도 뜨는지
offline = true;
await page.goto(base).catch(() => {});
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')", { timeout: 20000 }).catch(()=>{});
step('오프라인에서 앱 실행 (구버전)', (await shownVersion()) === 'v0.9.9-OLD', await shownVersion());
offline = false;

// === 신버전 배포 ===
fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace("VERSION = '0.9.9-OLD'", `VERSION = '${CUR}'`));
fs.writeFileSync(swf, fs.readFileSync(swf, 'utf8').replace("village-OLD", "village-v4-NEW"));

// 새로고침 1회 → 신버전이어야 한다 (controllerchange 자동 새로고침 포함)
await page.goto(base);
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')", { timeout: 25000 });
await sleep(3500); // SW 설치 → activate → controllerchange → 자동 reload
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')", { timeout: 25000 }).catch(()=>{});
const after = await shownVersion();
step('새로고침 1회 → 신버전 적용', after === `v${CUR}`, after);

// 신버전이 오프라인에서도 되는지
await sleep(2500);
offline = true;
await page.goto(base).catch(() => {});
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')", { timeout: 20000 }).catch(()=>{});
const off = await shownVersion();
step('오프라인에서 앱 실행 (신버전)', off === `v${CUR}`, off);
offline = false;

// 무한 새로고침 루프가 없는지 (5초간 로드 횟수)
let loads = 0;
page.on('load', () => loads++);
await page.goto(base);
await sleep(5000);
step('새로고침 루프 없음', loads <= 2, `추가 로드 ${loads}회`);

await browser.close();
server.close();
console.log(`\n[업데이트] ${steps.filter(Boolean).length}/${steps.length} 통과`);
