/* 검증 하네스 공통 설정 — 경로·포트를 여기 한 곳에서만 정한다.
   환경변수로 덮어쓸 수 있다:
     VILLAGE_BASE  검사할 주소 (기본 http://127.0.0.1:8331)
     VILLAGE_PORT  로컬 서버 포트 (기본 8331)
     VILLAGE_TMP   임시 사본 폴더 (기본 OS 임시폴더/grim-village-e2e)
     VILLAGE_PW    playwright가 설치된 node_modules 경로 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PORT = +(process.env.VILLAGE_PORT || 8331);
export const BASE = process.env.VILLAGE_BASE || `http://127.0.0.1:${PORT}`;
/* 임시 사본은 반드시 저장소 '밖'에 둔다 — 안에 두면 저장소를 자기 안으로
   복사하게 되어 무한 재귀에 빠진다 (서비스워커 테스트가 저장소를 통째로 복사한다) */
export const TMP = process.env.VILLAGE_TMP || join(tmpdir(), 'grim-village-e2e');

/* playwright는 전역 설치를 쓴다 — 이 앱은 빌드 도구가 없는 게 장점이라
   테스트 때문에 node_modules를 들이지 않는다. */
const require = createRequire(process.env.VILLAGE_PW
  ? (process.env.VILLAGE_PW.endsWith('/') ? process.env.VILLAGE_PW : process.env.VILLAGE_PW + '/')
  : '/opt/node22/lib/node_modules/');
export const { chromium } = require('playwright');
export const nodeRequire = require;

/* 지금 소스의 버전 (업데이트 계열 테스트가 하드코딩하지 않도록) */
export function currentVersion() {
  const fs = require('fs');
  const m = fs.readFileSync(join(ROOT, 'src/config.js'), 'utf8').match(/VERSION = '([^']+)'/);
  return m ? m[1] : '?';
}
