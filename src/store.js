import { TUNING, NAME_SYL, pick, clamp } from './config.js';

const STORE_KEY = p => `village-v4-p${p}`;
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

function defaultState() {
  return {
    v: 1,
    chars: [],
    trails: [],
    aqua: [], // 수족관 물고기 (색 보존 스트로크)
    flowers: 0,
    stars: { road: 0, egg: 0, feed: 0, sort: 0 },
    lvl: { road: 1, egg: 1, feed: 1, sort: 1 },
    hist: { road: [], egg: [], feed: [], sort: [] },
    decor: [],
    stats: { d: todayStr(), sec: 0, plays: 0 },
    intro: false,
  };
}

export const store = {
  profile: 0,
  P: null,
  _timer: null,

  load(p) {
    this.flush();
    this.profile = p;
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY(p)) || 'null');
      if (d && d.v === 1) {
        const base = defaultState();
        for (const k in base) if (!(k in d)) d[k] = base[k];
        if (d.stats.d !== todayStr()) d.stats = { d: todayStr(), sec: 0, plays: 0 };
        this.P = d;
        return;
      }
    } catch (e) {}
    this.P = defaultState();
  },
  peek(p) {
    try { return JSON.parse(localStorage.getItem(STORE_KEY(p)) || 'null'); } catch (e) { return null; }
  },
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 350);
  },
  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    if (!this.P) return;
    try { localStorage.setItem(STORE_KEY(this.profile), JSON.stringify(this.P)); } catch (e) {}
  },
  reset() {
    try { localStorage.removeItem(STORE_KEY(this.profile)); } catch (e) {}
    this.P = defaultState();
    this.flush();
  },

  totalStars() {
    const s = this.P.stars;
    return s.road + s.egg + s.feed + s.sort;
  },
  lvlOf(key) { return clamp(Math.round(this.P.lvl[key]), 1, 5); },
  adapt(key, acc) {
    const h = this.P.hist[key];
    h.push(acc);
    if (h.length > 3) h.shift();
    const avg = h.reduce((a, b) => a + b, 0) / h.length;
    if (h.length >= 2) {
      if (avg >= TUNING.adaptUp) this.P.lvl[key] = clamp(this.P.lvl[key] + 0.5, 1, 5);
      else if (avg <= TUNING.adaptDown) this.P.lvl[key] = clamp(this.P.lvl[key] - 0.6, 1, 5);
      else this.P.lvl[key] = clamp(this.P.lvl[key] + 0.12, 1, 5);
    }
    this.save();
  },

  addCreature(char) {
    this.P.chars.push(char);
    if (this.P.chars.length > 80) {
      // 하드 상한 정리 시에도 짝꿍은 절대 지우지 않는다
      const favs = this.P.chars.filter(c => c.fav);
      const rest = this.P.chars.filter(c => !c.fav).slice(-(80 - favs.length));
      this.P.chars = this.P.chars.filter(c => favs.includes(c) || rest.includes(c));
    }
    this.save();
  },
  activeChars() {
    // 짝꿍 우선 + 최근 순으로 채움 (짝꿍은 마을에서 밀려나지 않는다)
    const favs = this.P.chars.filter(c => c.fav);
    const recent = this.P.chars.filter(c => !c.fav).slice(-(TUNING.charCap - favs.length));
    return favs.concat(recent);
  },
  villageChars(n) {
    const favs = this.P.chars.filter(c => c.fav);
    const recent = this.P.chars.filter(c => !c.fav).slice(-Math.max(0, n - favs.length));
    return favs.concat(recent).slice(-n);
  },
  /* 냠냠·길 섬의 주인공: 짝꿍이 있으면 짝꿍 중에서 */
  pickPlaymate() {
    const favs = this.P.chars.filter(c => c.fav);
    const pool = favs.length ? favs : this.activeChars();
    return pool.length ? pick(pool) : null;
  },
  favCount() { return this.P.chars.filter(c => c.fav).length; },
};

/* 아이의 스트로크(화면 좌표) → 0~100 정규화 저장 포맷 */
export function normalizeStrokes(strokes) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const st of strokes) for (const p of st) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  const w = Math.max(8, maxX - minX), h = Math.max(8, maxY - minY);
  const sc = 100 / Math.max(w, h);
  const ox = (100 - w * sc) / 2, oy = (100 - h * sc) / 2;
  const geoLen = st => {
    let l = 0;
    for (let i = 1; i < st.length; i++) l += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
    return l;
  };
  const sorted = strokes.slice().sort((a, b) => geoLen(b) - geoLen(a)).slice(0, 8);
  return sorted.map(st => {
    const n = Math.min(28, st.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = st[Math.floor(i * (st.length - 1) / Math.max(1, n - 1))];
      out.push([Math.round((p[0] - minX) * sc + ox), Math.round((p[1] - minY) * sc + oy)]);
    }
    return out;
  });
}

export function makeName() { return pick(NAME_SYL) + pick(NAME_SYL); }
/* 이름 후보 3개 — 아이가 고른다 (명명은 애착 형성의 핵심 행위) */
export function nameCandidates() {
  const set = new Set();
  while (set.size < 3) set.add(makeName());
  return [...set];
}

export function newCreature(strokes, colorIdx, eyeIdx, patIdx, source, name, pers) {
  return {
    s: normalizeStrokes(strokes), c: colorIdx, e: eyeIdx, pt: patIdx,
    p: pers || 0, // 성격 (기존 캐릭터는 읽는 곳에서 기본값 처리)
    g: 0, f: 0, n: name || makeName(), sc: source || 'egg', b: Date.now(),
  };
}
export function creatureSize(char) { return [52, 66, 82][char.g] || 52; }
