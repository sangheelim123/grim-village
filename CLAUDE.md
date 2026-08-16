# 무럭무럭 그림 마을

4~7세 교육 게임. "내가 그린 것이 살아난다"가 핵심 아젠다.

## 구조
- Phaser 3 (vendor/phaser.min.js) + ES 모듈 (src/, src/scenes/)
- 메뉴성 UI는 DOM 오버레이(index.html), 게임 월드는 Phaser
- 에셋: 자작 SVG(assets/img), 사전 렌더링 WAV(assets/audio), 주아체(OFL)
- PWA: manifest + sw.js (캐시 버전은 sw.js의 CACHE 상수 — 코드 변경 시 반드시 올릴 것)
- 단일 파일 배포본: `node tools/build-standalone.mjs` → dist/

## 배포
- main에 푸시하면 GitHub Actions가 gh-pages 브랜치로 자동 배포
- 주소: https://sangheelim123.github.io/grim-village/

## 설계 원칙 (지켜야 할 것)
- 실패 상태 없음, 별은 아무것도 잠그지 않음, 방치 페널티 없음
- 판정은 관대하게 (상수는 src/config.js TUNING에 집중)
- 드래그 중에는 절대 완료를 선언하지 않는다 — 판정은 손을 뗀 순간에만
- 컨테이너 히트 영역은 (0,0,w,h) 좌상단 규약 (src/scenes/common.js pressify 주석 참고)
- 음성은 우선순위 정책(pri 0 지시/1 피드백/2 플레이버)으로 서로 끊지 않는다
- 보상 = 아이의 창작물 (화폐·뽑기·스트릭 금지)

## 검증
- 전체: `node tools/e2e/run.mjs` — 서버까지 알아서 띄운다 (마우스 + 터치 + 서비스워커 + 단일 파일)
  - `--quick` 기능 스위트만(마우스) / `--only <이름>` 하나만
  - playwright는 전역 설치를 쓴다 (`VILLAGE_PW`로 경로 변경, `VILLAGE_PORT`로 포트 변경)
- 모바일 터치는 반드시 hasTouch 에뮬레이션으로 별도 검증 (마우스 테스트만으로는 히트 판정 버그를 놓친다)
- 릴리스마다: `src/config.js`의 VERSION + `sw.js`의 CACHE를 함께 올리고 `node tools/build-standalone.mjs`

### 계측 도구 (tools/perf) — 추측 대신 재고 고친다
- `hit-audit.mjs` 전 씬 탭 히트 영역 감사 / `hit-probe.mjs` 친구 반응 영역 격자 프로브
- `tap-size.mjs` 버튼 크기 (유아 기준 48px) / `prof-boot.mjs` 부팅 시간 (CPU 저속 에뮬레이션)
- `prof-draw.mjs` 획 수 대비 프레임 비용 / `prof-fill.mjs` 오버드로우·텍스처 메모리
- `prof-detail.mjs` 드로우콜·JS 렌더 시간 / `prof-tex.mjs` 텍스처 크기 대비 실제 표시 크기
- `leak-check.mjs` 장시간 사용 누수 (섬 왕복·회전·날씨 반복)

## 성능에서 되풀이된 함정 (실측으로 확인된 것)
- Phaser Graphics는 **매 프레임 커맨드 버퍼 전체를 다시 처리**한다. 완성된 획을 쌓아 두면
  프레임 비용이 획 수에 정비례한다(30획 67ms/프레임). 획은 손을 뗀 순간 RenderTexture에 굽는다.
- 저사양 기기의 병목은 JS가 아니라 **픽셀 채우기**다. 완전히 가려지는 전체 화면 레이어는 끈다.
- 컨테이너 히트 판정은 로컬좌표에 displayOrigin(w/2,h/2)이 더해져 들어온다 — 원형 히트 영역도
  중심을 (w/2,h/2)에 두어야 한다. (0,0)에 두면 반응 영역이 통째로 왼쪽 위로 밀린다.
- 헤드리스 브라우저는 소프트웨어 렌더링이라 fps 절대값이 무의미하고 시간이 갈수록 느려진다.
  성능은 반드시 대조군(같은 조건의 '맑음' 등)과 비교하거나, 드로우콜·오버드로우처럼 세는 값으로 본다.

## 응답 원칙
- 항상 한국어로 응답
