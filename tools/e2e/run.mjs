/* 전체 검증 한 번에 돌리기.
   사용: node tools/e2e/run.mjs [--quick] [--only <이름>]
     --quick  기능 스위트만 (마우스). 기본은 마우스+터치+서비스워커+단일파일
     --only   이름에 해당하는 것만 (예: --only wx)
   서버는 여기서 띄운다 — 따로 실행할 필요 없다. */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { serve } from './serve.mjs';
import { PORT } from './_env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUICK = process.argv.includes('--quick');
const onlyAt = process.argv.indexOf('--only');
const ONLY = onlyAt > 0 ? process.argv[onlyAt + 1] : null;

/* 기능: 아이가 실제로 하는 일. 터치는 마우스로 못 잡는 히트 판정 버그를 잡는다. */
const FUNCTIONAL = [
  ['e2e', true], ['e2e-new', false], ['e2e-v13', false], ['e2e-v14', true],
  ['e2e-aqua', false], ['e2e-overlay', true], ['e2e-wx', true], ['e2e-bake', true],
];
/* 서비스워커: 앱이 새 버전을 받아오는 길. 각자 자기 서버를 띄운다. */
const SW = ['e2e-update', 'e2e-swguard', 'e2e-forceupd', 'e2e-partial', 'e2e-slow'];

const run = (file, args = []) => new Promise(res => {
  const p = spawn(process.execPath, [join(HERE, file + '.mjs'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => res({ code, out }));
});

const summary = out => {
  const m = out.match(/\[[^\]]+\]\s*(\d+)\/(\d+)\s*통과/);
  if (m) return { pass: +m[1], total: +m[2] };
  if (/부팅: ✅/.test(out)) return { pass: 1, total: 1 };
  return null;
};

const main = async () => {
  const server = await serve();
  console.log(`정적 서버 :${PORT} 시작\n`);
  let pass = 0, total = 0, failed = [];
  const exec = async (name, args, label) => {
    if (ONLY && !name.includes(ONLY)) return;
    process.stdout.write(`${label.padEnd(24)}`);
    const { code, out } = await run(name, args);
    const s = summary(out);
    if (s) { pass += s.pass; total += s.total; }
    const ok = code === 0 && (!s || s.pass === s.total);
    console.log(ok ? `✅ ${s ? s.pass + '/' + s.total : 'OK'}` : `❌ ${s ? s.pass + '/' + s.total : '실패'}`);
    if (!ok) {
      failed.push(label);
      out.split('\n').filter(l => l.includes('❌') || l.includes('💥')).slice(0, 4)
        .forEach(l => console.log('     ' + l.trim()));
    }
  };
  for (const [name, touch] of FUNCTIONAL) {
    await exec(name, [], name);
    if (!QUICK && touch) await exec(name, ['--touch'], name + ' (터치)');
  }
  if (!QUICK) {
    for (const name of SW) await exec(name, [], name);
    await exec('standalone-check', [], '단일 파일 배포본');
  }
  server.close();
  console.log(`\n합계 ${pass}/${total}${failed.length ? '  실패: ' + failed.join(', ') : '  전부 통과'}`);
  process.exit(failed.length ? 1 : 0);
};
main().catch(e => { console.error(e); process.exit(1); });
