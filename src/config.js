/* 앱 버전 — 릴리스마다 올린다 (첫 화면 구석·부모 코너에 표시).
   sw.js의 CACHE 상수도 함께 올려야 설치된 PWA에 새 버전이 전달된다 */
export const VERSION = '1.6.2';

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

/* 날씨: 비·눈·바람이 손님처럼 잠깐 왔다 간다 (맑음이 기본값).
   궂은 날씨에도 벌은 없다 — 친구들은 '못 논다'가 아니라 '다르게 논다'.
   유아의 시간 감각을 생각해 한 번 온 날씨는 대개 30~45초 머문다
   (너무 짧으면 알아채기 전에 끝나고, 너무 길면 마을이 답답해진다).
   다만 길이·종류·순서는 전부 무작위다 — 지나가는 소나기도, 오래 오는 눈도 있다. */
export const WEATHER = {
  /* 시간은 전부 무작위다. 다만 균등 난수는 '늘 비슷한 길이'로 느껴지므로
     짧은 쪽으로 치우친 분포를 쓴다 — 지나가는 소나기도 있고 종일 눈도 있다. */
  firstSec: [10, 45],   // 마을에 들어온 뒤 첫 날씨까지
  clearSec: [40, 150],  // 맑은 하늘이 이어지는 시간
  spellSec: [22, 75],   // 비·눈·바람이 머무는 시간
  skew: 1.6,            // 1이면 균등, 클수록 짧은 쪽이 잦다
  fadeSec: 7,           // 시작·끝 페이드 (뚝 끊기면 놀란다)
  weight: { rain: 0.38, wind: 0.34, snow: 0.28 },
  snowNightBoost: 2,    // 밤에는 눈이 더 자주 (밤+눈이 제일 예쁘다)
  /* '완전 무작위'는 같은 날씨가 연달아 나와 오히려 규칙처럼 느껴진다.
     직전 날씨의 확률만 낮춘다 (막지는 않는다 — 막으면 그것도 규칙이 된다). */
  repeatDamp: 0.45,
  chainChance: 0.16,    // 맑음을 건너뛰고 다른 날씨가 바로 이어질 확률
  resumeSec: 240,       // 앱을 껐다 이 시간 안에 돌아오면 날씨가 그대로 이어진다
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
  hi: ['선을 쏙쏙 따라갔어요! 손가락이 마법사 같아요!', '우와, 점선이 깜짝 놀랐어요! 최고예요!', '한 번에 쓱쓱! 정말 대단해요!'],
  mid: ['멋지게 그렸어요! 점점 잘하고 있어요!', '우와, 힘차게 잘 그렸어요!', '선이 참 예쁘게 됐어요!'],
  low: ['끝까지 다 그렸네요! 참 잘했어요!', '끝까지 힘내서 해냈어요! 멋져요!', '열심히 그린 게 최고예요!'],
};
/* 그리는 중간(절반쯤) 응원 — pri 2: 다른 소리가 나오는 중이면 조용히 넘어간다.
   '절반' 같은 분수 개념어는 4세가 모른다 — 눈에 보이는 말로. */
export const MID_CHEER = ['우와, 여기까지 왔어요!', '우와, 잘 가고 있어요!', '조금만 더예요!', '손가락이 씽씽 달리네요!', '쭉쭉 잘 가요!'];
/* 반짝 섬 정답 추임새 (모듈 상수여야 pickVary의 중복 방지가 동작한다) */
export const SORT_YES = ['딩동댕!', '맞았어요!', '쏙 들어갔다!', '와, 정확해요!', '착!'];
/* 그림 놀이터: 다섯 획째 응원 (한 번만) */
export const DRAW_CHEER = ['알록달록! 정말 멋진 그림이에요!', '우와, 화가님이 오셨네요!', '그림에서 반짝반짝 빛이 나요!'];

/* 부모 코너용: 지금 아이가 어디쯤인지 '말'로 (별점이 아니라) */
export const LEVEL_DESC = {
  road: ['곧은 선을 긋는 단계', '비스듬한 선과 꺾인 선', '물결·언덕 같은 곡선', '지그재그·계단', '고리와 소용돌이'],
  egg: ['동그라미·네모', '더하기와 세모', '엑스와 하트', '다이아몬드·꽃', '기억해서 그리기'],
  feed: ['셋까지 세기', '다섯까지 세기', '더하기 시작', '빼기 시작', '두 종류를 한꺼번에'],
  sort: ['색으로 나누기', '색 세 가지', '모양으로 나누기', '모양 세 가지', '규칙이 바뀌어도 따라가기'],
};
export const AREA_NAME = { road: '길 그리기', egg: '모양 알', feed: '냠냠', sort: '반짝' };
/* 화면 밖에서 함께할 거리 — "실물 놀이를 대신하지 않는다"를 실행 가능한 조언으로 */
export const HOME_TIPS = {
  road: ['큰 종이에 굵은 크레용으로 길게 선을 그어 보세요. 손목이 아니라 팔 전체로 긋는 게 이 단계의 목표예요.',
    '바닥에 마스킹테이프로 길을 만들고 따라 걸어 보세요.',
    '물결선·산 모양을 함께 그려 보세요. 곡선은 각진 선보다 먼저 익숙해집니다.',
    '지그재그·계단 모양을 번갈아 그려 보세요.',
    '달팽이 소용돌이를 크게-작게 그려 보세요.'],
  egg: ['동그라미와 네모를 손가락으로 허공에 그려 보세요.',
    '십자(+)를 그려 보세요. 획이 교차하는 그리기는 한글 자모의 준비 운동이에요.',
    '엑스와 하트를 그려 보세요. 사선은 이 시기의 큰 도전이에요.',
    '자를 대지 말고 다이아몬드를 그려 보세요.',
    '모양을 잠깐 보여 준 뒤 가리고, 기억해서 그려 보게 해 보세요.'],
  feed: ['간식을 하나씩 짚으며 함께 세어 보세요. 마지막 수가 전체 개수라는 걸 짚어 주면 좋아요.',
    '다섯 개까지 세고 "모두 몇 개지?" 하고 다시 물어봐 주세요.',
    '"둘에 셋을 더하면?"처럼 간식으로 물어봐 주세요.',
    '"다섯 개 중에 두 개 먹으면 몇 개 남지?" 하고 물어봐 주세요.',
    '두 가지 간식을 각각 세어 보게 해 보세요.'],
  sort: ['빨래를 색깔별로 같이 나눠 보세요.',
    '블록을 세 가지 색으로 나눠 담아 보세요.',
    '단추나 블록을 모양별로 나눠 보세요.',
    '같은 모양 중에서 다시 색으로 나눠 보세요.',
    '"이번엔 색깔 말고 모양으로!" 하고 규칙을 바꿔 보세요.'],
};

export const DECOR_UNLOCKS = [
  { at: 6, key: 'garden', name: '꽃밭' },
  { at: 14, key: 'fountain', name: '분수' },
  { at: 24, key: 'rainbow', name: '무지개' },
  { at: 36, key: 'firefly', name: '반딧불' },
  { at: 52, key: 'garden2', name: '더 큰 꽃밭' },
  { at: 72, key: 'rainbow2', name: '무지개 다리' },
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
/* 조사 헬퍼: (이름 / 보통명사) × (주격 / 주제격 / 여격 / 호격).
   이름은 받침이 있으면 '이'가 붙어 한 음절 늘어난다 — 동 → 동이가 / 동이는 / 동이에게 / 동아.
   보통명사는 늘어나지 않는다 — 귤 → 귤이 / 귤은. 섞어 쓰면 "귤이가"가 된다. */
export function eulRl(word) { return word + (hasBatchim(word) ? '을' : '를'); }
export function iGa(name) { return name + (hasBatchim(name) ? '이가' : '가'); }        // 이름 주격
export function neunNm(name) { return name + (hasBatchim(name) ? '이는' : '는'); }      // 이름 주제격
export function egeNm(name) { return name + (hasBatchim(name) ? '이에게' : '에게'); }   // 이름 여격
export function aYa(name) { return name + (hasBatchim(name) ? '아' : '야'); }          // 이름 호격
export function iGaN(word) { return word + (hasBatchim(word) ? '이' : '가'); }         // 보통명사 주격
export function eunNeun(word) { return word + (hasBatchim(word) ? '은' : '는'); }      // 보통명사 주제격
/* 수 관형사 — "2개"를 TTS가 "이 개"로 읽는 것을 막는다 (귀는 우리말, 눈은 숫자) */
export const KOR_GAE = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
export const gae = n => (KOR_GAE[n - 1] || String(n)) + ' 개';

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
