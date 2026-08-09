import { TUNING, clamp } from './config.js';

export function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}
export function resamplePath(pts, n) {
  const total = pathLength(pts);
  const out = [pts[0]];
  const target = total / (n - 1);
  let acc = 0, seg = 1, prev = pts[0];
  while (out.length < n - 1 && seg < pts.length) {
    const cur = pts[seg];
    const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (acc + d >= target) {
      const t = (target - acc) / d;
      const np = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
      out.push(np); prev = np; acc = 0;
    } else { acc += d; prev = cur; seg++; }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/* 따라 그리기 판정 엔진 (v3에서 검증된 로직 그대로)
   freeOrder: 닫힌 도형용 — 방향·시작점 자유 */
export class Tracer {
  constructor(raw, aspect, lvl, freeOrder, viewW, viewH) {
    this.freeOrder = !!freeOrder;
    this.aspect = aspect;
    const n = clamp(Math.round(pathLength(raw) * 46), 40, 200);
    this.samples = resamplePath(raw, n);
    this.n = n;
    this.covered = new Array(n).fill(false);
    this.coveredCount = 0;
    this.frontier = 0;
    this.devSum = 0; this.devCount = 0;
    this.lvl = lvl;
    this.lastProgress = performance.now();
    this.fit(viewW, viewH);
  }
  fit(w, h) {
    this.vw = w; this.vh = h;
    const margin = clamp(Math.min(w, h) * 0.13, 50, 100);
    const availH = h - margin * 2 - 40;
    const availW = w - margin * 2;
    this.scale = Math.min(availW / this.aspect.w, availH / this.aspect.h);
    this.ox = (w - this.aspect.w * this.scale) / 2;
    this.oy = (h - this.aspect.h * this.scale) / 2 + 20;
    const base = clamp(Math.min(w, h) * TUNING.traceRFrac, TUNING.traceRMin, TUNING.traceRMax);
    this.R = base * TUNING.traceRLvlBonus[clamp(Math.round(this.lvl), 1, 5) - 1];
  }
  sp(i) { const p = this.samples[i]; return { x: this.ox + p.x * this.scale, y: this.oy + p.y * this.scale }; }
  /* 아이가 깃발(끝점) 쪽에서 시작하면 경로를 뒤집어 준다 — 탐색은 벌점이 아니다 */
  reverseIfCloser(x, y) {
    if (this.coveredCount > 0) return;
    const a = this.sp(0), b = this.sp(this.n - 1);
    if (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y)) this.samples.reverse();
  }
  feed(x, y) {
    const maxIdx = this.freeOrder ? this.n - 1
      : Math.min(this.n - 1, this.frontier + TUNING.lookahead);
    let minDist = Infinity;
    for (let i = 0; i <= maxIdx; i++) {
      const p = this.sp(i);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < minDist) minDist = d;
      if (d <= this.R && !this.covered[i]) {
        this.covered[i] = true; this.coveredCount++;
        if (i > this.frontier) this.frontier = i;
        this.lastProgress = performance.now();
      }
    }
    // 정확도 편차는 그리기 시작(첫 커버) 이후에만 누적 — 시작 전 탐색은 무벌점
    if (this.coveredCount > 0) {
      this.devSum += Math.min(minDist, this.R * 2);
      this.devCount++;
    }
  }
  /* 빠른 스와이프의 성긴 이벤트 사이를 보간해 구멍을 막는다 */
  feedSegment(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (this.R * 0.5)));
    for (let i = 1; i <= steps; i++) {
      this.feed(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
    }
  }
  get coverage() { return this.coveredCount / this.n; }
  get accuracy() {
    if (!this.devCount) return 1;
    return clamp(1 - (this.devSum / this.devCount) / this.R, 0, 1);
  }
  firstUncovered() {
    for (let i = 0; i < this.n; i++) if (!this.covered[i]) return i;
    return this.n - 1;
  }
}

export function accToStars(acc) {
  return acc >= TUNING.starAcc[1] ? 3 : acc >= TUNING.starAcc[0] ? 2 : 1;
}
