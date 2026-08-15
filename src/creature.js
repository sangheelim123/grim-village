import { CHAR_COLORS, CHAR_DARK, DRAW_COLORS, rand } from './config.js';
import { creatureSize } from './store.js';

/* ==========================================================================
   캐릭터 렌더러 — 단일 구현
   paintBody / paintEyes 를 Phaser 텍스처 베이크와 도감용 2D 캔버스가
   공유한다 (마을의 아이와 도감의 아이는 반드시 같은 모습이어야 한다)
   ========================================================================== */

/* 무늬용 미니 도형 (몸통 클리핑 안에서만 그려진다) */
function heartAt(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.15, y, x - s * 0.6, y - s * 0.85, x, y - s * 0.25);
  c.bezierCurveTo(x + s * 0.6, y - s * 0.85, x + s * 1.15, y, x, y + s * 0.9);
  c.fill();
}
function starAt(c, x, y, r) {
  c.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + k * (Math.PI * 4 / 5);
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
}

/* 닫았을 때 면적이 거의 없는 획(직선·십자 등)은 몸통 채우기가 보이지 않는다 */
function strokeArea(st) {
  let a = 0;
  for (let i = 0; i < st.length; i++) {
    const p = st[i], q = st[(i + 1) % st.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function buildBodyPath(c, char) {
  const body = char.s[0];
  // 선만 있는 그림(십자·엑스·막대 그림)은 뒤에 동그란 풍선 몸통을 깔아
  // 색·무늬 선택이 항상 눈에 보이게 한다 — 아이의 선은 그 위에 그대로 남는다
  if (!body || body.length < 3 || strokeArea(body) < 700) {
    c.beginPath();
    c.arc(50, 52, 43, 0, Math.PI * 2);
    return 'blob';
  }
  c.beginPath();
  c.moveTo(body[0][0], body[0][1]);
  for (let i = 1; i < body.length; i++) c.lineTo(body[i][0], body[i][1]);
  c.closePath();
  return true;
}

/* c: 0~100 좌표계로 스케일된 2D 컨텍스트 */
export function paintBody(c, char) {
  const hasBody = buildBodyPath(c, char);
  if (hasBody) {
    c.fillStyle = CHAR_COLORS[char.c % CHAR_COLORS.length];
    c.fill();
    // 무늬는 몸통 안에만 (클리핑 — 밖으로 삐져나가지 않는다)
    if (char.pt) {
      c.save();
      buildBodyPath(c, char);
      c.clip();
      if (char.pt === 1) { // 점무늬
        c.fillStyle = 'rgba(255,255,255,0.65)';
        [[35, 62], [58, 70], [48, 50], [66, 44]].forEach(p => {
          c.beginPath(); c.arc(p[0], p[1], 5.5, 0, 6.3); c.fill();
        });
      } else if (char.pt === 2) { // 볼터치
        c.fillStyle = 'rgba(255,120,140,0.55)';
        c.beginPath(); c.arc(28, 48, 7, 0, 6.3); c.fill();
        c.beginPath(); c.arc(72, 48, 7, 0, 6.3); c.fill();
      } else if (char.pt === 3) { // 줄무늬 (클리핑 도입으로 해금)
        c.strokeStyle = 'rgba(255,255,255,0.5)';
        c.lineWidth = 6;
        for (let y = 58; y <= 94; y += 14) {
          c.beginPath(); c.moveTo(-5, y); c.lineTo(105, y + 6); c.stroke();
        }
      } else if (char.pt === 4) { // 하트무늬
        c.fillStyle = 'rgba(255,255,255,0.7)';
        [[35, 62], [58, 70], [48, 50], [66, 46]].forEach(p => heartAt(c, p[0], p[1], 5));
      } else if (char.pt === 5) { // 별무늬
        c.fillStyle = 'rgba(255,255,255,0.7)';
        [[36, 60], [60, 68], [50, 48], [68, 46]].forEach(p => starAt(c, p[0], p[1], 6));
      }
      c.restore();
    }
  }
  c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = CHAR_DARK[char.c % CHAR_DARK.length];
  if (hasBody === 'blob') { // 풍선 몸통 테두리
    c.save();
    c.lineWidth = 5;
    c.beginPath(); c.arc(50, 52, 43, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  const body = char.s[0];
  for (const st of char.s) {
    if (st.length < 2) continue;
    c.beginPath();
    c.moveTo(st[0][0], st[0][1]);
    for (let i = 1; i < st.length; i++) c.lineTo(st[i][0], st[i][1]);
    if (st === body) c.closePath();
    c.stroke();
  }
  // 입
  c.strokeStyle = '#7a4a3a'; c.lineWidth = 3.5;
  c.beginPath(); c.arc(50, 49, 7, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
}

export function paintEyes(c, char) {
  const ey = 36;
  for (const ex of [36, 64]) {
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(ex, ey, 9, 0, 6.3); c.fill();
    c.fillStyle = '#333';
    if (char.e === 1) {
      c.beginPath(); c.arc(ex + 1.5, ey + 1, 5.5, 0, 6.3); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + 3.4, ey - 1, 2, 0, 6.3); c.fill();
    } else if (char.e === 2) {
      c.lineWidth = 3; c.strokeStyle = '#333';
      c.beginPath(); c.arc(ex, ey + 1, 5.5, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
    } else if (char.e === 3) { // 방긋 (^ ^)
      c.lineWidth = 3; c.strokeStyle = '#333';
      c.beginPath(); c.arc(ex, ey + 4, 5.5, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    } else {
      c.beginPath(); c.arc(ex, ey + 1, 5, 0, 6.3); c.fill();
    }
  }
}

/* ---------- Phaser 텍스처 베이크 (몸통만 — 눈은 깜빡임용 스프라이트) ---------- */
const TEX = 256;
let texSeq = 0;

export function bakeCreatureTexture(scene, char) {
  const key = `body-${char.b || 0}-${texSeq++}`;
  const tex = scene.textures.createCanvas(key, TEX, TEX);
  const c = tex.getContext();
  c.save();
  c.scale(TEX / 100, TEX / 100);
  paintBody(c, char);
  c.restore();
  tex.refresh();
  return key;
}

/* ---------- 도감·축하·미리보기용 순수 2D 렌더 ---------- */
export function drawCreature2D(c, char, x, y, size) {
  c.save();
  c.translate(x - size / 2, y - size / 2);
  c.scale(size / 100, size / 100);
  paintBody(c, char);
  paintEyes(c, char);
  c.restore();
}

/* ---------- 스트로크 리플레이 — "그때 내가 그렸던 손짓"을 다시 그린다 ----------
   char.s는 그린 순서 그대로 보존되어 있다. progress: 0~1 */
export function drawCreatureReplay(c, char, x, y, size, progress) {
  const total = char.s.reduce((s, st) => s + st.length, 0);
  const upto = Math.floor(total * progress);
  c.save();
  c.translate(x - size / 2, y - size / 2);
  c.scale(size / 100, size / 100);
  c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = CHAR_DARK[char.c % CHAR_DARK.length];
  let n = 0;
  for (const st of char.s) {
    if (n >= upto) break;
    c.beginPath();
    c.moveTo(st[0][0], st[0][1]);
    for (let i = 1; i < st.length && n + i < upto; i++) c.lineTo(st[i][0], st[i][1]);
    c.stroke();
    n += st.length;
  }
  c.restore();
  if (progress >= 1) drawCreature2D(c, char, x, y, size);
}

/* ---------- 눈 텍스처 (공용 3종) ---------- */
/* ---------- 색 보존 그림 (그림 놀이터 갤러리 · 수족관 물고기 공용) ----------
   아이가 고른 색과 붓 굵기를 그대로 간직한 스트로크 포맷: {c, w, h, p[[x,y]…]} */
export function normalizeColorStrokes(strokes) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const s of strokes) for (const q of s.pts) {
    minX = Math.min(minX, q[0]); minY = Math.min(minY, q[1]);
    maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]);
  }
  const w = Math.max(8, maxX - minX), h = Math.max(8, maxY - minY);
  const sc = 88 / Math.max(w, h); // 6~94 여백 — 굵은 붓 끝이 가장자리에서 잘리지 않게
  const ox = (100 - w * sc) / 2, oy = (100 - h * sc) / 2;
  return strokes.slice(0, 24).map(s => {
    const n = Math.min(40, s.pts.length);
    const p = [];
    for (let i = 0; i < n; i++) {
      const q = s.pts[Math.floor(i * (s.pts.length - 1) / Math.max(1, n - 1))];
      p.push([Math.round((q[0] - minX) * sc + ox), Math.round((q[1] - minY) * sc + oy)]);
    }
    return { c: s.c, w: s.w, h: s.h0 || 0, p };
  });
}
export function artSegColor(stroke, i, rainbowIdx) {
  if (stroke.c !== rainbowIdx) return DRAW_COLORS[stroke.c] || '#4a3f35';
  return `hsl(${(stroke.h + i * 5) % 360}, 85%, 55%)`;
}
/* 0~100 좌표계 그림을 2D 컨텍스트에 그린다. upto를 주면 그린 순서대로 일부만 (리플레이) */
export function drawArt2D(c, art, x, y, size, upto) {
  const strokes = art.s || [];
  const total = strokes.reduce((a, s) => a + s.p.length, 0);
  const limit = upto == null ? total : Math.max(1, Math.floor(total * upto));
  c.save();
  c.translate(x - size / 2, y - size / 2);
  c.scale(size / 100, size / 100);
  c.lineCap = 'round'; c.lineJoin = 'round';
  let n = 0;
  for (const s of strokes) {
    if (!s.p || !s.p.length || n >= limit) break;
    c.lineWidth = [2.2, 3.8, 6.4][s.w] || 3.8;
    c.beginPath();
    c.moveTo(s.p[0][0], s.p[0][1]);
    let drew = 0;
    for (let i = 1; i < s.p.length && n + i < limit; i++) {
      c.strokeStyle = artSegColor(s, i, DRAW_COLORS.length);
      c.lineTo(s.p[i][0], s.p[i][1]);
      c.stroke();
      c.beginPath();
      c.moveTo(s.p[i][0], s.p[i][1]);
      drew = i;
    }
    if (!drew) { // 점 하나짜리 획
      c.fillStyle = artSegColor(s, 0, DRAW_COLORS.length);
      c.beginPath(); c.arc(s.p[0][0], s.p[0][1], c.lineWidth / 2, 0, Math.PI * 2); c.fill();
    }
    n += s.p.length;
  }
  c.restore();
}

export function bakeEyeTextures(scene) {
  const mk = (key, draw) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, 48, 48);
    const c = t.getContext();
    draw(c);
    t.refresh();
  };
  mk('eye0', c => {
    c.fillStyle = '#fff'; c.beginPath(); c.arc(24, 24, 20, 0, 6.3); c.fill();
    c.fillStyle = '#333'; c.beginPath(); c.arc(24, 27, 11, 0, 6.3); c.fill();
  });
  mk('eye1', c => {
    c.fillStyle = '#fff'; c.beginPath(); c.arc(24, 24, 20, 0, 6.3); c.fill();
    c.fillStyle = '#333'; c.beginPath(); c.arc(27, 26, 13, 0, 6.3); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(31, 21, 5, 0, 6.3); c.fill();
  });
  mk('eye2', c => {
    c.fillStyle = '#fff'; c.beginPath(); c.arc(24, 24, 20, 0, 6.3); c.fill();
    c.strokeStyle = '#333'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.arc(24, 22, 11, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
  });
  mk('eye3', c => { // 방긋 (^ ^)
    c.fillStyle = '#fff'; c.beginPath(); c.arc(24, 24, 20, 0, 6.3); c.fill();
    c.strokeStyle = '#333'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.arc(24, 31, 11, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  });
}

/* ---------- 살아있는 캐릭터 컨테이너 ---------- */
export function makeCreatureSprite(scene, char, size) {
  const sz = size || creatureSize(char);
  const cont = scene.add.container(0, 0);
  const shadow = scene.add.image(0, sz * 0.52, 'dot')
    .setDisplaySize(sz * 0.85, sz * 0.25).setTint(0x000000).setAlpha(0.16);
  const bodyKey = bakeCreatureTexture(scene, char);
  const body = scene.add.image(0, 0, bodyKey).setDisplaySize(sz, sz);
  const eyeKey = `eye${(char.e || 0) % 4}`;
  const eyeScale = (sz / 256) * 0.75;
  const eyeL = scene.add.image(-sz * 0.14, -sz * 0.14, eyeKey).setScale(eyeScale);
  const eyeR = scene.add.image(sz * 0.14, -sz * 0.14, eyeKey).setScale(eyeScale);
  cont.add([shadow, body, eyeL, eyeR]);
  cont.setSize(sz, sz);
  cont.bodyImg = body;
  cont.eyes = [eyeL, eyeR];
  cont.eyeScale = eyeScale;
  cont.charData = char;
  cont.baseSize = sz;
  cont.texKey = bodyKey;

  const blink = () => {
    if (!cont.active || cont.sleeping) {
      if (cont.active) scene.time.delayedCall(rand(2200, 5200), blink);
      return;
    }
    scene.tweens.add({
      targets: [eyeL, eyeR], scaleY: eyeScale * 0.1, duration: 70, yoyo: true,
      onComplete: () => {
        if (cont.active) scene.time.delayedCall(rand(2200, 5200), blink);
      },
    });
  };
  scene.time.delayedCall(rand(800, 3200), blink);

  cont.setEyesClosed = closed => {
    eyeL.scaleY = eyeR.scaleY = closed ? eyeScale * 0.1 : eyeScale;
  };
  cont.destroyTexture = () => {
    try { scene.textures.remove(bodyKey); } catch (e) {}
  };
  return cont;
}
