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
export const NAME_SYL = ['모', '미', '보', '리', '두', '코', '나', '비', '로', '쭈', '뽀', '까', '유', '타', '핑', '동'];
/* 성격: 어떤 성격도 탭 보상(소리+하트)을 깨지 않는다 — 표현만 다르다 */
export const PERSONALITIES = [
  { key: 0, name: '씩씩이', emoji: '⚡', desc: '빨리 뛰고 자주 폴짝!' },
  { key: 1, name: '잠꾸러기', emoji: '💤', desc: '가끔 새근새근 잠들어요' },
  { key: 2, name: '부끄럼쟁이', emoji: '🙈', desc: '만지면 볼이 빨개져요' },
];
export const PRAISES = ['우와! 멋져요!', '정말 잘했어요!', '최고예요!', '대단해요!', '참 잘했어요!', '짱이에요!'];

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

/* 받침에 맞는 을/를 조사 ("물방울를" 방지) */
export function eulRl(word) {
  const code = word.charCodeAt(word.length - 1) - 0xAC00;
  const bat = code >= 0 && code < 11172 && code % 28 !== 0;
  return word + (bat ? '을' : '를');
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const KOR_NUM = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
