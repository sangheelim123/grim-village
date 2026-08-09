/* 앱 버전 — 릴리스마다 올린다 (첫 화면 구석·부모 코너에 표시).
   sw.js의 CACHE 상수도 함께 올려야 설치된 PWA에 새 버전이 전달된다 */
export const VERSION = '1.2.0';

/* 판정·밸런스 상수 — 전부 관대한 쪽이 기본값 */
export const TUNING = {
  traceRFrac: 0.055,
  traceRMin: 26, traceRMax: 52,
  traceRLvlBonus: [1.5, 1.25, 1.0, 0.85, 0.75],
  /* 완료 판정 원칙: 드래그 중에는 절대 완료를 선언하지 않는다.
     알 섬은 손을 뗀 순간(coverage 기준), 길 섬은 깃발 도달 순간에만 완료. */
  eggAutoFinish: 0.92,   // 알: 손 뗐을 때 커버리지가 이 이상이면 완료 (R 선행 보정 포함 시 실제 손 진행 ~85%)
  roadEndCoverage: 0.85, // 길: 깃발(끝점) 도달 필수 + 중간 관용 커버리지
  starAcc: [0.5, 0.85],
  lookahead: 10,
  adaptUp: 0.85, adaptDown: 0.45,
  charCap: 30,
  animCap: 8,
  /* 기억 그리기(레벨 5): 견본을 보여 준 뒤 숨기는 시간 / 살짝 보기 시간.
     숨겨도 언제든 다시 볼 수 있다 — 기억은 도전이지 시험이 아니다. */
  memoryShowMs: 4500,
  memoryPeekMs: 3000,
};

export const COLORS = {
  text: 0x4a3f35,
  textCss: '#4a3f35',
  accent: 0xff8a5c,
  accentCss: '#ff8a5c',
  blue: 0x56b4ec,
};

export const CHAR_COLORS = ['#ffb3c1', '#ffd166', '#95d5b2', '#a8d8f0', '#cdb4f0', '#ffc49b'];
export const CHAR_DARK = ['#e0708a', '#d09a20', '#4a9a6a', '#4a90c0', '#8a60c0', '#e08a50'];
export const DRAW_COLORS = ['#4a3f35', '#ff5c5c', '#ff9838', '#ffd21e', '#4dc25e', '#4a90e2', '#a06ae8', '#ff7db0'];
/* 무지개 붓: DRAW_COLORS 다음 인덱스 (그림 놀이터·수족관 공용) */
export const RAINBOW = DRAW_COLORS.length;
export const NAME_SYL = ['모', '미', '보', '리', '두', '코', '나', '비', '로', '쭈', '뽀', '까', '유', '타', '핑', '동'];
/* 성격: 어떤 성격도 탭 보상(소리+하트)을 깨지 않는다 — 표현만 다르다 */
export const PERSONALITIES = [
  { key: 0, name: '씩씩이', emoji: '⚡', desc: '빨리 뛰고 자주 폴짝!' },
  { key: 1, name: '잠꾸러기', emoji: '💤', desc: '가끔 새근새근 잠들어요' },
  { key: 2, name: '부끄럼쟁이', emoji: '🙈', desc: '만지면 볼이 빨개져요' },
];
export const PRAISES = ['우와! 멋져요!', '정말 잘했어요!', '최고예요!', '대단해요!', '참 잘했어요!', '짱이에요!'];

/* 따라 그리기 완료 칭찬 — 정확도별 표현만 다르고 전부 긍정 (실패 없음 원칙).
   낮은 정확도 문구도 "끝까지 해냈다"를 칭찬한다. */
export const TRACE_PRAISE = {
  hi: ['선을 쏙쏙 따라 그렸네요! 손이 마법사예요!', '우와, 점선이 깜짝 놀라겠어요! 완벽해요!', '한 번에 쓱쓱! 정말 대단해요!'],
  mid: ['멋지게 그렸어요! 점점 잘하고 있어요!', '우와, 씩씩하게 잘 그렸어요!', '선이 참 예쁘게 됐어요!'],
  low: ['끝까지 다 그렸네요! 참 잘했어요!', '포기하지 않고 해냈어요! 멋져요!', '열심히 그린 게 최고예요!'],
};
/* 그리는 중간(절반쯤) 응원 — pri 2: 다른 소리가 나오는 중이면 조용히 넘어간다 */
export const MID_CHEER = ['벌써 절반이나 왔어요!', '우와, 잘 가고 있어요!', '조금만 더예요!', '손가락이 씽씽 달리네요!'];
/* 그림 놀이터: 다섯 획째 응원 (한 번만) */
export const DRAW_CHEER = ['알록달록! 정말 멋진 그림이에요!', '우와, 화가님이 오셨네요!', '그림에서 반짝반짝 빛이 나요!'];

export const DECOR_UNLOCKS = [
  { at: 6, key: 'garden', name: '꽃밭' },
  { at: 14, key: 'fountain', name: '분수' },
  { at: 24, key: 'rainbow', name: '무지개' },
  { at: 36, key: 'firefly', name: '반딧불' },
];

export const FRUITS = [
  { key: 'apple', name: '사과' },
  { key: 'orange', name: '귤' },
  { key: 'grape', name: '포도' },
  { key: 'strawberry', name: '딸기' },
];

export const SORT_COLORS = [
  { key: 'red', name: '빨간', tint: 0xff6b6b },
  { key: 'blue', name: '파란', tint: 0x5aa9ff },
  { key: 'yellow', name: '노란', tint: 0xffd21e },
];
export const SORT_SHAPES = [
  { key: 'circle', name: '동그라미' },
  { key: 'tri', name: '세모' },
  { key: 'square', name: '네모' },
];

/* 받침에 맞는 조사 ("물방울를"·"동가" 방지) */
function hasBatchim(word) {
  const code = word.charCodeAt(word.length - 1) - 0xAC00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
}
export function eulRl(word) { return word + (hasBatchim(word) ? '을' : '를'); }
export function iGa(word) { return word + (hasBatchim(word) ? '이가' : '가'); }
export function eunNeun(word) { return word + (hasBatchim(word) ? '은' : '는'); }

/* 직전 것만 피하는 랜덤 — 유아는 같은 말 반복에 금방 습관화된다 */
const _lastPick = new WeakMap();
export function pickVary(arr) {
  if (arr.length < 2) return arr[0];
  let i = Math.floor(Math.random() * arr.length);
  if (i === _lastPick.get(arr)) i = (i + 1) % arr.length;
  _lastPick.set(arr, i);
  return arr[i];
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const KOR_NUM = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
