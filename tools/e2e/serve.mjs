/* 검증용 로컬 정적 서버.
   단일 스레드 http.server는 병렬 요청에서 503을 뱉어 테스트를 흔든다 —
   node http는 기본이 비동기라 그 문제가 없다.
   사용: node tools/e2e/serve.mjs  (VILLAGE_PORT로 포트 변경) */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { ROOT, PORT } from './_env.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.png': 'image/png',
  '.css': 'text/css',
};

export function serve(root = ROOT, port = PORT) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, url === '/' ? 'index.html' : url);
    if (!file.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'max-age=600', // GitHub Pages와 같은 조건으로 맞춘다
      });
      res.end(data);
    });
  });
  /* 포트가 이미 잡혀 있으면 조용히 멈추지 말고 분명히 알려 준다 —
     아무 출력 없이 매달리는 게 제일 찾기 어렵다 */
  return new Promise((resolve, reject) => {
    server.once('error', e => reject(e.code === 'EADDRINUSE'
      ? new Error(`포트 ${port}이 이미 사용 중입니다. 다른 서버를 끄거나 VILLAGE_PORT를 바꿔 주세요.`)
      : e));
    server.listen(port, () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  serve().then(() => console.log(`정적 서버: http://127.0.0.1:${PORT}  (${ROOT})`));
}
