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
- 로컬: `python3 -m http.server 8321` 후 Playwright E2E
- 모바일 터치는 반드시 hasTouch 에뮬레이션으로 별도 검증 (마우스 테스트만으로는 히트 판정 버그를 놓친다)

## 응답 원칙
- 항상 한국어로 응답
