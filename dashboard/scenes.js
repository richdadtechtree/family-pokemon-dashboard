/* ════════════════════════════════════════════════════════════════
   블록 장면 그리기 — "아빠는 지금 / 엄마는 지금" 카드용 (블록 게임 느낌)
   ────────────────────────────────────────────────────────────────
   원리(쉽게):
   - 장면을 큰 블록(정육면체)과 직육면체로 쌓는다. 레고처럼.
   - 블록 면마다 8×8 도트 무늬(텍스처)를 입힌다 → 잔디·나무판·유리·얼굴이 또렷이 보인다.
   - 블록을 비스듬히(아이소메트릭) 본 모습으로, 뒤에 있는 것부터 그린다.
   - 윗면은 밝게, 옆면은 조금 어둡게, 앞면은 더 어둡게 → 입체감.
   - 결과는 그림(PNG) 한 장으로 만들어 캐시한다 → 화면에선 <img>로 보여 준다.

   장면 이름(위키 "장면" 칸에 쓰는 말):
     버스 · 전철 · 차 · 회사 · 식사 · 운동 · 잠 · 집 · 산책

   움직임: 장면마다 그림 16장(프레임)을 그려 0.2초씩 넘긴다 → 3.2초에 한 바퀴.
     타자 치기·숟가락질·달리기·걷기·숨쉬기·이불 들썩·차 흔들림, 그리고 가끔 눈 깜빡.
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const S = 16;   // 블록 한 칸 화면 크기
  const D = 8;    // 블록 한 면의 도트 수 (8×8)
  const K = 2;    // 선명하게 2배로 그린다(레티나)

  /* ── 1. 색 도우미 ── */
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return "#" + ((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1);
  }
  // 같은 자리엔 늘 같은 값이 나오는 가짜 난수 (그림이 매번 바뀌지 않게)
  const hash = (x, y, s) => (((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) >>> 0) % 1000 / 1000;

  /* ── 2. 텍스처(면 무늬) 만들기 ── */
  function tex(w, h, fn) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { g.fillStyle = fn(x, y); g.fillRect(x, y, 1, 1); }
    return c;
  }
  const noise = (base, seed, amt = 0.12) => tex(D, D, (x, y) => shade(base, 1 + (hash(x, y, seed) - 0.5) * amt * 2));
  const mat = (top, side = top, front = side) => ({ top, side, front });

  // 재료 모음 (처음 쓸 때 한 번만 만든다)
  let M = null;
  function materials() {
    if (M) return M;
    const grassTop = noise("#6cc04c", 1, 0.12);
    const dirtT = noise("#8a5a3b", 2, 0.12);
    const grassSide = tex(D, D, (x, y) => (y < 2 || (y === 2 && hash(x, 0, 7) > 0.45)) ? shade("#6cc04c", 0.95 + hash(x, y, 3) * 0.12) : shade("#8a5a3b", 0.9 + hash(x, y, 4) * 0.2));
    const plank = (base, s) => tex(D, D, (x, y) => {
      if (y === 3 || y === 7) return shade(base, 0.76);
      if ((y < 3 && x === 5) || (y > 3 && y < 7 && x === 1)) return shade(base, 0.82);
      return shade(base, 0.93 + hash(x, y, s) * 0.14);
    });
    const tile = (a, b, s) => tex(D, D, (x, y) => (x % 4 === 0 || y % 4 === 0) ? shade(a, 0.86) : shade(((x >> 2) + (y >> 2)) % 2 ? a : b, 0.96 + hash(x, y, s) * 0.08));
    const glass = (frame, inside, glint) => tex(D, D, (x, y) => (x === 0 || y === 0 || x === 7 || y === 7) ? frame : ((x + y === 6 || x + y === 7) && x > 1 && x < 6 ? glint : inside));
    const leaves = tex(D, D, (x, y) => { const r = hash(x, y, 9); return r < 0.14 ? "#2f6b2f" : shade("#4caf50", 0.82 + r * 0.32); });
    const logSide = tex(D, D, (x, y) => shade("#7a4a2a", (x % 3 === 0 ? 0.78 : 1) * (0.94 + hash(x, y, 5) * 0.12)));
    const logTop = tex(D, D, (x, y) => { const d = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5)); return d > 3 ? "#7a4a2a" : d % 2 > 1 ? "#c7975e" : "#b4844f"; });
    const road = noise("#5a5f6b", 3, 0.08);
    const roadLine = tex(D, D, (x, y) => (y === 3 || y === 4) && x >= 1 && x <= 5 ? "#f2f2f2" : shade("#5a5f6b", 0.92 + hash(x, y, 3) * 0.16));
    const rails = tex(D, D, (x, y) => (y === 2 || y === 5) ? "#a7adbf" : (x % 3 === 1 ? "#6b4a2f" : shade("#474b5e", 0.9 + hash(x, y, 11) * 0.2)));
    const yellow = noise("#ffcf33", 12, 0.05);
    const busLower = tex(D, D, (x, y) => y >= 6 ? "#3a3a3a" : y === 5 ? "#e0a800" : shade("#ffcf33", 0.95 + hash(x, y, 12) * 0.1));
    const busLight = tex(D, D, (x, y) => y >= 6 ? "#3a3a3a" : (y >= 2 && y <= 3 && x >= 5 && x <= 6) ? "#fffbe0" : y === 5 ? "#e0a800" : "#ffcf33");
    const busWin = glass("#ffcf33", "#8fc8f0", "#d8efff");
    const trainLower = tex(D, D, (x, y) => (y === 3 || y === 4) ? "#3b5bd9" : shade("#b3aee0", y > 4 ? 0.88 : 1));
    const trainLight = tex(D, D, (x, y) => (y === 3 || y === 4) ? "#3b5bd9" : (y >= 5 && y <= 6 && x >= 1 && x <= 2) ? "#fff6c2" : "#b3aee0");
    const litWin = glass("#8e88c8", "#ffd86b", "#fff0b0");
    const dark = glass("#8e88c8", "#2a3550", "#3f4f78");
    M = {
      grass: mat(grassTop, grassSide), dirt: mat(dirtT), road: mat(road), roadLine: mat(roadLine, road), curb: mat(noise("#c3c8d1", 4, 0.05)),
      rails: mat(rails, noise("#474b5e", 13, 0.1)), ground: mat(noise("#2f3448", 14, 0.08)),
      leaves: mat(leaves), log: mat(logTop, logSide),
      bus: mat(yellow, busLower), busLight: mat(yellow, busLight, busLower), busWin: mat(yellow, busWin), busFrontWin: mat(yellow, busWin, busWin),
      train: mat(noise("#d4d0f0", 15, 0.04), trainLower), trainLight: mat(noise("#d4d0f0", 15, 0.04), trainLight, trainLower),
      trainWin: mat(noise("#d4d0f0", 15, 0.04), litWin), trainFrontWin: mat(noise("#d4d0f0", 15, 0.04), dark, litWin),
      oak: mat(plank("#b8864f", 20)), darkOak: mat(plank("#7a5232", 21)), birch: mat(plank("#e0c592", 22)),
      plaster: mat(noise("#eef1f5", 23, 0.03)), cream: mat(noise("#f6e3bf", 24, 0.04)), sky: mat(noise("#a9d3f5", 25, 0.04)), navy: mat(noise("#363d68", 26, 0.05)),
      carpet: mat(tile("#c4ccda", "#b4bdcd", 27)), kitchen: mat(tile("#f3e6cc", "#e6d4b4", 28)), gym: mat(tile("#7d8796", "#717b8a", 29)), nightFloor: mat(plank("#3d3552", 30)),
      winDay: mat(noise("#eef1f5", 23, 0.03), glass("#f4f7fb", "#9fd3f5", "#ffffff"), glass("#f4f7fb", "#9fd3f5", "#ffffff")),
      winNight: mat(noise("#363d68", 26, 0.05), tex(D, D, (x, y) => (x === 0 || y === 0 || x === 7 || y === 7) ? "#5a6380" : hash(x, y, 31) > 0.9 ? "#ffffff" : "#141a38")),
      winMoon: mat(noise("#363d68", 26, 0.05), tex(D, D, (x, y) => (x === 0 || y === 0 || x === 7 || y === 7) ? "#5a6380" : (x >= 2 && x <= 5 && y >= 2 && y <= 5 && !(x >= 4 && y <= 3)) ? "#ffe8a3" : "#141a38")),
      red: mat(noise("#e0655a", 32, 0.06)), redDark: mat(noise("#c9524a", 33, 0.06)), white: mat(noise("#f4f4f4", 34, 0.03)),
      blue: mat(noise("#5b7bd0", 35, 0.06)), blueLight: mat(noise("#86a3ea", 36, 0.06)), black: mat(noise("#2b2f3a", 37, 0.05)),
      metal: mat(noise("#9aa0b0", 38, 0.06)), silver: mat(noise("#cfd5e0", 39, 0.04)), purple: mat(noise("#6b5fa8", 40, 0.05)),
      pot: mat(noise("#b5653a", 41, 0.08)), lampOn: mat(noise("#ffe07a", 42, 0.04)), signalRed: mat(noise("#ff4d4d", 43, 0.04)),
      tv: mat(noise("#2b2f3a", 37, 0.05), tex(D, D, (x, y) => (x === 0 || y === 0 || x === 7 || y === 7) ? "#2b2f3a" : y < 4 ? "#6fa8ff" : "#7cd38a")),
      rug: mat(tex(D, D, (x, y) => (x === 0 || y === 0 || x === 7 || y === 7) ? "#d86a5a" : (x + y) % 4 === 0 ? "#f6c35b" : "#f6e7c8")),
      rice: mat(noise("#ffffff", 44, 0.03)), soup: mat(noise("#d27a3c", 45, 0.08)), greens: mat(noise("#6abf4b", 46, 0.1)), egg: mat(noise("#f2c14e", 47, 0.06)),
      flowerPink: mat(noise("#ff8fb1", 48, 0.08)), flowerYellow: mat(noise("#ffd43b", 49, 0.08)), water: mat(noise("#4dabf7", 50, 0.08)), sweat: mat(noise("#8fd8ff", 51, 0.02)),
      sand: mat(tex(D, D, (x, y) => shade(hash(x, y, 52) > 0.5 ? "#e2d3ad" : "#d6c59c", 0.95 + hash(x, y, 53) * 0.1))),
    };
    return M;
  }

  /* ── 3. 사람 텍스처 (머리 8×8 얼굴이 핵심) ── */
  const SKIN = "#f2c9a0", SKIN_D = "#e3b48a";
  const LOOKS = {
    아빠: { shirt: "#4f86d6", pants: "#2f3c5c", hair: "#2b2b33", mouth: "#a8584a" },
    엄마: { shirt: "#e889a8", pants: "#4a4360", hair: "#4a2e22", mouth: "#d9546e", long: true, cheek: "#f5a3a3" },
  };
  const DEFAULT_LOOK = { shirt: "#62b062", pants: "#3c4a5c", hair: "#2b2b33", mouth: "#a8584a" };
  const personTex = {};
  function personTextures(who) {
    if (personTex[who]) return personTex[who];
    const L = LOOKS[who] || DEFAULT_LOOK;
    const H = L.hair, sh = L.shirt, P = L.pants;
    const faceFn = (x, y) => {
      if (y < 2) return H;
      if (L.long && (x === 0 || x === 7)) return H;
      if (y === 2) return (x === 0 || x === 7 || (x === 3 && !L.long)) ? H : SKIN;   // 앞머리
      if (y === 4) return x === 1 || x === 6 ? "#ffffff" : x === 2 || x === 5 ? "#1d2033" : SKIN;   // 눈
      if (y === 5 && L.cheek && (x === 1 || x === 6)) return L.cheek;
      if (y === 6 && (x === 3 || x === 4)) return L.mouth;          // 입
      return SKIN;
    };
    const face = tex(8, 8, faceFn);
    const faceBlink = tex(8, 8, (x, y) => y === 4 && x >= 1 && x <= 6 ? (x === 3 || x === 4 ? SKIN : "#3a2f3a") : faceFn(x, y));   // 눈 감은 얼굴
    const headSide = tex(8, 8, (x, y) => (y < 2 || x >= 4 || (L.long && x >= 2 && y < 7)) ? H : (x === 3 && y === 4 ? SKIN_D : SKIN));
    const headTop = tex(8, 8, (x, y) => shade(H, 0.95 + hash(x, y, 60) * 0.1));
    const shirtFront = tex(8, 6, (x, y) => (L.long && (x === 0 || x === 7) && y < 3) ? H : (y === 0 && (x === 3 || x === 4)) ? SKIN : shade(sh, 0.96 + hash(x, y, 61) * 0.08));
    const shirtSide = tex(4, 6, (x, y) => (L.long && y < 3 && x >= 1) ? H : shade(sh, 0.96 + hash(x, y, 62) * 0.08));
    const shirtTop = tex(8, 4, () => sh);
    const arm = tex(4, 6, (x, y) => y >= 4 ? SKIN : shade(sh, 0.96 + hash(x, y, 63) * 0.08));
    const leg = tex(4, 6, (x, y) => y === 5 ? "#3b2f2f" : shade(P, 0.95 + hash(x, y, 64) * 0.1));
    const pants = noise(P, 65, 0.06);
    // 창문 안에 보이는 얼굴 (버스·전철용): frame=창틀색, inside=유리색
    const win = (frame, inside, blink) => tex(8, 8, (x, y) => {
      if (x === 0 || y === 0 || x === 7 || y === 7) return frame;
      if (x === 6) return inside;
      if (y === 1) return x >= 1 && x <= 5 ? H : inside;
      if (L.long && (x === 1 || x === 5) && y <= 4) return H;
      if (y === 2) return x === 1 || x === 5 ? H : SKIN;
      if (y === 3) return x === 2 || x === 4 ? (blink ? SKIN_D : "#1d2033") : SKIN;
      if (y === 4) return x === 3 ? L.mouth : SKIN;
      return x >= 1 && x <= 5 ? sh : inside;
    });
    return (personTex[who] = {
      win,
      head: mat(headTop, headSide, face),
      headBlink: mat(headTop, headSide, faceBlink),
      torso: mat(shirtTop, shirtSide, shirtFront),
      arm: mat(tex(4, 4, () => sh), arm, arm),
      leg: mat(tex(4, 4, () => P), leg, leg),
      pants: mat(pants),
      lyingHead: mat(faceBlink, headSide, tex(8, 8, () => SKIN)),   // 자는 얼굴은 눈 감고
    });
  }

  /* ── 3-1. 승용차 (아빠 차 — 흰색 소형 세단) ──
     텍스처 크기 = 면 크기(칸) × 8도트에 딱 맞춰 그린다 → 늘어나거나 잘리지 않는다 */
  const CAR = "#f1f3f6", CAR_D = "#c9ced8", TIRE = "#26282f", GLASS = "#7fb4dc", GLINT = "#cfe8fb";
  const carTex = {};
  function carTextures(who) {
    if (carTex[who]) return carTex[who];
    const L = LOOKS[who] || DEFAULT_LOOK;
    const paint = (x, y, s) => shade(CAR, 0.97 + hash(x, y, s) * 0.06);
    // 차 옆면 36×6 (차 길이 4.5칸): 문 틈·손잡이·바퀴 자리
    const bodySide = tex(36, 6, (x, y) => {
      const arch = (c) => Math.abs(x + 0.5 - c) < (y >= 4 ? 4 : 3);     // 바퀴집(아래 두 줄)
      if (y >= 3 && (arch(5.5) || arch(27.5))) return TIRE;
      if (y === 5) return CAR_D;
      if (x === 8 || x === 17 || x === 26) return CAR_D;                    // 문 틈
      if (y === 1 && (x === 14 || x === 15 || x === 23 || x === 24)) return "#8a909c";   // 손잡이
      return paint(x, y, 70);
    });
    // 차 앞면 12×6: 전조등·그릴·번호판
    const bodyFront = tex(12, 6, (x, y) => {
      if (y === 1 && (x <= 2 || x >= 9)) return "#fff6c8";                  // 전조등
      if ((y === 2 || y === 3) && x >= 3 && x <= 8) return y === 2 ? "#3a3f4b" : "#2b2f3a";   // 그릴
      if (y === 4 && x >= 4 && x <= 7) return "#ffffff";                    // 번호판
      if (y === 5) return CAR_D;
      return paint(x, y, 71);
    });
    // 지붕 옆 창 18×6: 뒷유리 · 기둥 · 앞유리(운전석에 사람 얼굴)
    const H = L.hair, sh = L.shirt;
    const cabinFn = (blink) => (x, y) => {
      if (y === 0 || y === 5 || x <= 1 || x === 8 || x === 9 || x >= 16) return paint(x, y, 72);
      if (x >= 11 && x <= 15) {                                            // 운전석 사람
        if (y === 1) return H;
        if (L.long && (x === 11 || x === 15)) return H;
        if (y === 2) return x === 12 || x === 14 ? (blink ? "#e3b48a" : "#1d2033") : SKIN;
        if (y === 3) return x === 13 ? L.mouth : x === 11 || x === 15 ? GLASS : SKIN;
        return sh;
      }
      return (x + y) % 7 === 3 ? GLINT : GLASS;
    };
    const cabinSide = tex(18, 6, cabinFn(false)), cabinBlink = tex(18, 6, cabinFn(true));
    const windshield = tex(10, 6, (x, y) => (y === 0 || y === 5 || x === 0 || x === 9) ? paint(x, y, 73) : (x + y === 5 || x + y === 6) ? GLINT : GLASS);
    const wheel = tex(5, 5, (x, y) => { const d = Math.max(Math.abs(x - 2), Math.abs(y - 2)); return d < 1 ? "#d7dbe3" : d < 2 ? "#9aa0ad" : TIRE; });
    return (carTex[who] = {
      body: mat(noise(CAR, 74, 0.03), bodyFront, bodySide),
      cabin: mat(noise(CAR, 75, 0.03), windshield, cabinSide),
      cabinBlink: mat(noise(CAR, 75, 0.03), windshield, cabinBlink),
      wheel: mat(tex(5, 2, () => TIRE), tex(2, 5, () => TIRE), wheel),
    });
  }

  /* ── 4. 장면 조립 도우미 ── */
  function Scene() {
    const items = [];
    return {
      items,
      // 같이 움직일 묶음(예: 버스 전체)을 위아래로 dz만큼 옮긴다
      lift(from, dz) { for (let i = from; i < items.length; i++) { items[i].z += dz; items[i].unit = false; } },
      // 1칸짜리 블록
      block(x, y, z, m) { items.push({ x, y, z, w: 1, d: 1, h: 1, m, unit: true }); },
      // 여러 칸 블록 채우기
      fill(x0, y0, z0, dx, dy, dz, m) { for (let x = x0; x < x0 + dx; x++) for (let y = y0; y < y0 + dy; y++) for (let z = z0; z < z0 + dz; z++) this.block(x, y, z, typeof m === "function" ? m(x, y, z) : m); },
      // 크기가 자유로운 직육면체 (가구·사람 몸)
      box(x, y, z, w, d, h, m) { items.push({ x, y, z, w, d, h, m }); },
      remove(x, y, z) { const i = items.findIndex((b) => b.unit && b.x === x && b.y === y && b.z === z); if (i >= 0) items.splice(i, 1); },
    };
  }
  // 사람: 몸 1칸 너비, 머리 1칸 큐브. 얼굴은 왼쪽 앞(+y)을 본다.
  // f = 프레임 번호(0~15). 1도트 = 0.125칸 단위로 움직인다.
  //   sit  : act="type"(타자) · "eat"(숟가락질) · "rest"(숨쉬기)
  //   run  : 다리·팔이 번갈아, 몸이 통통
  //   stand: 제자리 걸음
  const blinkAt = (f) => f === 13;                       // 16장 중 한 장만 눈을 감는다
  function person(sc, who, x, y, z, pose = "stand", f = 0, act = "rest") {
    const T = personTextures(who);
    const step = (f >> 1) % 2, slow = (f >> 2) % 2;      // 0.4초마다 · 0.8초마다 바뀌는 값
    let tz = z + 0.75;   // 몸통 시작 높이
    let armL = 0, armR = 0, armRy = 0, bob = 0;
    if (pose === "sit") {
      sc.box(x, y, z, 1, 1, 0.4, T.pants);                    // 허벅지(앞으로 뻗음)
      sc.box(x, y + 0.75, z - 0.6, 1, 0.3, 0.6, T.pants);     // 종아리
      tz = z + 0.4;
      if (act === "type") { armL = step ? 0.125 : 0; armR = step ? 0 : 0.125; }
      else if (act === "eat") { const k = [0, 0.125, 0.25, 0.125][(f >> 1) % 4]; armR = k; armRy = k; }
      else bob = slow ? 0.125 : 0;                            // 숨쉬기: 어깨·머리가 살짝
    } else if (pose === "run") {
      const a = step ? 0.2 : -0.15, b = step ? -0.15 : 0.2;   // 다리 번갈아 내딛기
      sc.box(x, y + a, z + (step ? 0 : 0.125), 0.5, 0.5, 0.75, T.leg);
      sc.box(x + 0.5, y + b, z + (step ? 0.125 : 0), 0.5, 0.5, 0.75, T.leg);
      bob = (f % 2) ? 0.125 : 0;
      armL = step ? 0.15 : 0; armR = step ? 0 : 0.15; armRy = step ? -0.1 : 0.1;
    } else if (pose === "dance") {                            // 춤: 다리 번갈아 콩콩, 팔은 번갈아 번쩍, 몸은 좌우로 살랑
      const sway = [0, 0.125, 0, -0.125][(f >> 1) % 4];
      x += sway;
      sc.box(x, y, z + (step ? 0.25 : 0), 0.5, 0.5, 0.75, T.leg);
      sc.box(x + 0.5, y, z + (step ? 0 : 0.25), 0.5, 0.5, 0.75, T.leg);
      bob = step ? 0.25 : 0.125;
      armL = step ? 0.75 : 0.25; armR = step ? 0.25 : 0.75;      // 손을 머리 위까지 번갈아
    } else {
      sc.box(x, y, z + (step ? 0.125 : 0), 0.5, 0.5, 0.75, T.leg);   // 제자리 걸음
      sc.box(x + 0.5, y, z + (step ? 0 : 0.125), 0.5, 0.5, 0.75, T.leg);
      bob = slow ? 0.125 : 0;
      armL = step ? 0.125 : 0; armR = step ? 0 : 0.125;
    }
    tz += bob;
    sc.box(x - 0.5, y, tz + armL, 0.5, 0.5, 0.75, T.arm);
    sc.box(x, y, tz, 1, 0.5, 0.75, T.torso);
    sc.box(x + 1, y + armRy, tz + armR, 0.5, 0.5, 0.75, T.arm);
    sc.box(x, y - 0.25, tz + 0.75, 1, 1, 1, blinkAt(f) ? T.headBlink : T.head);
  }
  function island(sc, W, Dp) { const m = materials(); sc.fill(0, 0, -1, W, Dp, 1, m.dirt); sc.fill(0, 0, 0, W, Dp, 1, m.grass); }
  function room(sc, W, Dp, H, floor, wall) { sc.fill(0, 0, 0, W, Dp, 1, floor); sc.fill(0, 1, 1, 1, Dp - 1, H, wall); sc.fill(0, 0, 1, W, 1, H, wall); }
  function tree(sc, x, y) {
    const m = materials();
    sc.block(x + 1, y + 1, 1, m.log); sc.block(x + 1, y + 1, 2, m.log);
    sc.fill(x, y, 3, 3, 3, 1, m.leaves); sc.fill(x + 1, y, 4, 1, 3, 1, m.leaves); sc.fill(x, y + 1, 4, 3, 1, 1, m.leaves);
  }
  function plant(sc, x, y, z = 1) { const m = materials(); sc.box(x + 0.2, y + 0.2, z, 0.6, 0.6, 0.5, m.pot); sc.box(x + 0.05, y + 0.05, z + 0.5, 0.9, 0.9, 0.8, m.leaves); }

  /* ── 5. 장면들 ── */
  const SCENES = {
    버스(who, f) {
      const m = materials(), sc = Scene();
      island(sc, 8, 7);
      for (let x = 0; x < 8; x++) { sc.remove(x, 2, 0); sc.block(x, 2, 0, m.curb); for (const y of [3, 4, 5]) { sc.remove(x, y, 0); sc.block(x, y, 0, y === 5 ? m.roadLine : m.road); } }
      tree(sc, 0, 0); tree(sc, 4, -1);
      const from = sc.items.length;
      for (let x = 1; x <= 6; x++) { sc.block(x, 3, 1, m.bus); sc.block(x, 4, 1, x === 6 ? m.busLight : m.bus); sc.block(x, 3, 2, x === 6 ? m.busFrontWin : m.busWin); sc.block(x, 4, 2, x === 6 ? m.busFrontWin : m.busWin); }
      sc.remove(4, 4, 2); sc.block(4, 4, 2, mat(m.bus.top, m.busWin.side, personTextures(who).win("#ffcf33", "#8fc8f0", blinkAt(f))));   // 창가의 사람
      sc.lift(from, (f >> 1) % 2 ? 0.0625 : 0);              // 달리는 버스가 덜컹덜컹
      sc.box(1.3, 5, 1, 0.6, 0.15, 0.45, m.black); sc.box(4.9, 5, 1, 0.6, 0.15, 0.45, m.black);   // 바퀴
      return sc;
    },
    차(who, f) {
      const m = materials(), sc = Scene(), C = carTextures(who);
      island(sc, 8, 7);
      for (let x = 0; x < 8; x++) { sc.remove(x, 2, 0); sc.block(x, 2, 0, m.curb); for (const y of [3, 4, 5]) { sc.remove(x, y, 0); sc.block(x, y, 0, y === 5 ? m.roadLine : m.road); } }
      tree(sc, 0, 0); tree(sc, 5, -1);
      sc.box(7.3, 2.2, 1, 0.2, 0.2, 2.2, m.metal); sc.box(7.15, 2.05, 3.2, 0.5, 0.5, 0.4, m.signalRed);   // 신호등
      // 차는 길 위에 올라앉으므로 그리는 순서(order)를 직접 정한다: 바퀴 → 차체 → 지붕 → 거울
      const X = 1.5;
      const up = (f >> 1) % 2 ? 0.0625 : 0;                 // 엔진이 돌아 차체가 살짝 들썩
      for (const dx of [0.36, 3.11]) sc.items.push({ x: X + dx, y: 4.55, z: 1, w: 0.625, d: 0.15, h: 0.625, m: C.wheel, order: 100 });
      sc.items.push({ x: X, y: 3.2, z: 1.3 + up, w: 4.5, d: 1.5, h: 0.75, m: C.body, order: 101 });          // 차체 (앞이 +x)
      sc.items.push({ x: X + 1, y: 3.325, z: 2.05 + up, w: 2.25, d: 1.25, h: 0.75, m: blinkAt(f) ? C.cabinBlink : C.cabin, order: 102 }); // 지붕·창
      sc.items.push({ x: X + 3.2, y: 4.7, z: 2.05 + up, w: 0.15, d: 0.18, h: 0.12, m: mat(noise(CAR, 76, 0.03)), order: 103 });   // 사이드미러
      return sc;
    },
    전철(who, f) {
      const m = materials(), sc = Scene();
      sc.fill(0, 0, -1, 8, 6, 1, m.ground); sc.fill(0, 0, 0, 8, 6, 1, (x, y) => (y === 2 || y === 3 ? m.rails : m.ground));
      const from = sc.items.length;
      for (let x = 0; x <= 6; x++) { sc.block(x, 2, 1, m.train); sc.block(x, 3, 1, x === 6 ? m.trainLight : m.train); sc.block(x, 2, 2, x === 6 ? m.trainFrontWin : m.trainWin); sc.block(x, 3, 2, x === 6 ? m.trainFrontWin : m.trainWin); }
      sc.remove(3, 3, 2); sc.block(3, 3, 2, mat(m.train.top, m.trainWin.side, personTextures(who).win("#8e88c8", "#ffd86b", blinkAt(f))));   // 창가의 사람
      sc.lift(from, (f >> 2) % 2 ? 0.0625 : 0);              // 전철이 덜컹
      sc.box(7.3, 4.6, 1, 0.2, 0.2, 1.8, m.black); sc.box(7.15, 4.45, 2.8, 0.5, 0.5, 0.4, m.signalRed);   // 신호등
      return sc;
    },
    회사(who, f) {
      const m = materials(), sc = Scene();
      room(sc, 7, 7, 4, m.carpet, m.plaster);
      for (const y of [2, 3, 4]) for (const z of [2, 3]) { sc.remove(0, y, z); sc.block(0, y, z, m.winDay); }
      sc.box(2.5, 2.3, 1, 1.2, 1.1, 0.5, m.black); sc.box(2.5, 2.05, 1.5, 1.2, 0.25, 1.0, m.black);   // 의자
      person(sc, who, 2.6, 2.5, 1.5, "sit", f, "type");
      sc.box(1.4, 4, 1.85, 3.6, 1.3, 0.25, m.oak);                                    // 책상
      for (const [x, y] of [[1.5, 4.1], [4.75, 4.1], [1.5, 5.05], [4.75, 5.05]]) sc.box(x, y, 1, 0.15, 0.15, 0.85, m.darkOak);
      sc.box(2.6, 4.1, 2.1, 1.1, 0.7, 0.07, m.silver); sc.box(2.6, 4.75, 2.1, 1.1, 0.1, 0.75, m.silver);   // 노트북
      sc.box(4.2, 4.3, 2.1, 0.35, 0.35, 0.4, m.white);                                // 커피잔
      plant(sc, 5.8, 1);
      return sc;
    },
    식사(who, f) {
      const m = materials(), sc = Scene();
      room(sc, 7, 7, 4, m.kitchen, m.oak);
      sc.box(1.4, 2.0, 1, 3.6, 1.1, 0.5, m.darkOak); sc.box(1.4, 1.75, 1.5, 3.6, 0.25, 0.9, m.darkOak);   // 의자
      person(sc, who, 2.6, 2.3, 1.5, "sit", f, "eat");
      sc.box(1.3, 3.6, 1.85, 4, 1.6, 0.25, m.birch);                                  // 식탁
      for (const [x, y] of [[1.4, 3.7], [5.1, 3.7], [1.4, 5.0], [5.1, 5.0]]) sc.box(x, y, 1, 0.15, 0.15, 0.85, m.darkOak);
      sc.box(2.2, 3.85, 2.1, 1.8, 1, 0.08, m.white);                                  // 쟁반
      sc.box(2.35, 3.95, 2.18, 0.45, 0.45, 0.3, m.rice); sc.box(3.0, 3.95, 2.18, 0.45, 0.45, 0.3, m.soup);
      sc.box(2.35, 4.45, 2.18, 0.4, 0.35, 0.12, m.greens); sc.box(3.0, 4.45, 2.18, 0.4, 0.35, 0.12, m.egg); sc.box(3.55, 4.2, 2.18, 0.35, 0.5, 0.12, m.red);
      plant(sc, 5.8, 1);
      return sc;
    },
    운동(who, f) {
      const m = materials(), sc = Scene();
      room(sc, 7, 7, 4, m.gym, m.sky);
      sc.box(2.1, 1.6, 1, 2.0, 3.8, 0.3, m.metal); sc.box(2.35, 1.6, 1.3, 1.5, 3.8, 0.05, m.black);   // 러닝머신
      sc.box(2.1, 5.2, 1, 0.2, 0.2, 1.7, m.metal); sc.box(3.9, 5.2, 1, 0.2, 0.2, 1.7, m.metal);
      sc.box(2.1, 5.05, 2.65, 2.0, 0.4, 0.25, m.purple);
      person(sc, who, 2.6, 3.0, 1.35, "run", f);
      const drop = (f % 8) * 0.125;                           // 땀방울이 또르르 떨어진다
      sc.box(3.95, 3.2, 3.6 - drop, 0.15, 0.15, 0.2, m.sweat); sc.box(4.2, 3.0, 3.25 - ((f + 4) % 8) * 0.125, 0.12, 0.12, 0.15, m.sweat);
      sc.box(5.2, 2.2, 1, 0.9, 0.25, 0.25, m.black); sc.box(5.2, 3.0, 1, 0.9, 0.25, 0.25, m.black);   // 아령
      sc.box(5.5, 4.4, 1, 0.3, 0.3, 0.6, m.water);
      return sc;
    },
    잠(who, f) {
      const m = materials(), sc = Scene();
      room(sc, 7, 7, 4, m.nightFloor, m.navy);
      for (const y of [3, 4]) for (const z of [2, 3]) { sc.remove(0, y, z); sc.block(0, y, z, y === 4 && z === 3 ? m.winMoon : m.winNight); }
      sc.box(1.5, 1, 1, 2.6, 4.2, 0.5, m.darkOak); sc.box(1.5, 0.9, 1, 2.6, 0.3, 1.5, m.darkOak);   // 침대 틀·머리판
      sc.box(1.5, 1.2, 1.5, 2.6, 4.0, 0.3, m.blue);                                   // 매트
      sc.box(1.9, 1.3, 1.8, 1.8, 0.9, 0.2, m.white);                                  // 베개
      sc.box(2.3, 1.35, 1.95, 1, 1, 0.75, personTextures(who).lyingHead);             // 누운 머리
      sc.box(1.6, 2.4, 1.8, 2.4, 2.7, 0.35 + ((f >> 2) % 2 ? 0.125 : 0), m.blueLight);   // 이불 (새근새근 들썩)
      sc.box(5, 1.3, 1, 0.5, 0.5, 1.1, m.darkOak); sc.box(4.95, 1.25, 2.1, 0.6, 0.6, 0.4, m.lampOn);   // 스탠드
      return sc;
    },
    집(who, f) {
      const m = materials(), sc = Scene();
      room(sc, 7, 7, 4, m.oak, m.cream);
      for (const y of [4, 5]) for (const z of [2, 3]) { sc.remove(0, y, z); sc.block(0, y, z, m.winDay); }
      sc.box(1.2, 1.1, 1, 4.2, 1.3, 0.6, m.red); sc.box(1.2, 1.0, 1.6, 4.2, 0.4, 0.9, m.redDark);   // 소파
      sc.box(1.2, 1.1, 1.6, 0.45, 1.3, 0.4, m.redDark); sc.box(4.95, 1.1, 1.6, 0.45, 1.3, 0.4, m.redDark);
      person(sc, who, 2.7, 1.5, 1.6, "sit", f, "rest");
      sc.box(1.6, 3.6, 1, 3.4, 2.4, 0.06, m.rug);                                     // 러그
      sc.box(3.0, 4.6, 1.06, 0.4, 0.4, 0.4, m.flowerYellow); sc.box(3.8, 4.2, 1.06, 0.4, 0.4, 0.4, m.flowerPink);   // 장난감 블록
      plant(sc, 5.8, 1);
      sc.box(1, 2.6, 1, 0.6, 1.6, 0.6, m.darkOak); sc.box(1.05, 2.7, 1.6, 0.25, 1.4, 0.9, m.tv);   // 옆벽 TV
      return sc;
    },
    산책(who, f) {
      const m = materials(), sc = Scene();
      island(sc, 8, 7);
      for (let x = 0; x < 8; x++) for (const y of [3, 4]) { sc.remove(x, y, 0); sc.block(x, y, 0, m.sand); }
      tree(sc, 0, 0); tree(sc, 5, 0);
      for (const [x, y, f] of [[1.3, 5.6, m.flowerPink], [6.2, 5.8, m.flowerYellow], [3.4, 1.4, m.flowerYellow], [7.2, 2.4, m.flowerPink]]) sc.box(x, y, 1, 0.35, 0.35, 0.35, f);
      person(sc, who, 3.5, 3.3, 1, "stand", f);
      return sc;
    },
  };
  // 춤: '○○는 지금'을 누르면 잠깐 보여 주는 장면 — 반짝이는 무대 바닥 위에서 춤춘다
  SCENES.춤 = (who, f) => {
    const m = materials(), sc = Scene();
    const COLORS = [m.flowerPink, m.flowerYellow, m.blueLight, m.purple];
    for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) sc.block(x, y, 0, COLORS[(x + y + (f >> 1)) % COLORS.length]);   // 깜빡이는 무대 바닥
    person(sc, who, 3, 3, 1, "dance", f);
    for (let i = 0; i < 6; i++) {                                                     // 위로 떠오르는 반짝이(음표 대신 작은 블록)
      const t = ((f + i * 3) % 16) / 16;
      sc.box(1 + (i * 1.1) % 5, 1 + (i * 1.7) % 5, 1.5 + t * 3, 0.25, 0.25, 0.25, COLORS[i % COLORS.length]);
    }
    return sc;
  };
  SCENES["자동차"] = SCENES.차; SCENES["운전"] = SCENES.차; SCENES["출근"] = SCENES.버스; SCENES["퇴근"] = SCENES.전철; SCENES["일"] = SCENES.회사;
  SCENES["밥"] = SCENES.식사; SCENES["수면"] = SCENES.잠; SCENES["휴식"] = SCENES.집; SCENES["놀이"] = SCENES.산책;

  /* ── 6. 그리기: 뒤에서 앞으로, 면마다 텍스처를 비스듬히 붙인다 ── */
  const ex = [S, S / 2], ey = [-S, S / 2];
  const P = (x, y, z) => [(x - y) * S, (x + y) * S / 2 - z * S];
  // 여러 프레임의 그림 크기를 똑같이 맞춰야 움직여도 화면이 흔들리지 않는다
  function bounds(scenes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sc of scenes) for (const b of sc.items) for (const dx of [0, b.w]) for (const dy of [0, b.d]) for (const dz of [0, b.h]) {
      const [sx, sy] = P(b.x + dx, b.y + dy, b.z + dz);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    return { minX, minY, maxX, maxY };
  }
  function draw(sc, bb = bounds([sc])) {
    const items = sc.items;
    const units = new Set(items.filter((b) => b.unit).map((b) => b.x + "," + b.y + "," + b.z));
    const solid = (x, y, z) => units.has(x + "," + y + "," + z);
    const key = (b) => b.order ?? b.x + b.w / 2 + b.y + b.d / 2 + b.z + b.h / 2;
    items.sort((a, b) => key(a) - key(b) || a.z - b.z);
    const { minX, minY, maxX, maxY } = bb;
    const pad = 3;
    const cv = document.createElement("canvas");
    cv.width = Math.ceil((maxX - minX + pad * 2) * K); cv.height = Math.ceil((maxY - minY + pad * 2) * K);
    const g = cv.getContext("2d");
    const ox = -minX + pad, oy = -minY + pad;
    // 면 하나: 원점 o, 한 칸당 화면 방향 u·v, 크기 U×V칸, 어둡기 dk
    function face(t, o, u, v, U, V, dk) {
      g.setTransform(K * u[0] / D, K * u[1] / D, K * v[0] / D, K * v[1] / D, K * (o[0] + ox), K * (o[1] + oy));
      g.imageSmoothingEnabled = false;
      const W = D * U, H = D * V;
      if (t.width >= W - 0.01 && t.height >= H - 0.01) g.drawImage(t, 0, 0, W, H, 0, 0, W, H);
      else for (let i = 0; i < W; i += D) for (let j = 0; j < H; j += D) {
        const sw = Math.min(D, W - i), sh = Math.min(D, H - j);
        g.drawImage(t, 0, 0, sw, sh, i, j, sw, sh);
      }
      if (dk) { g.fillStyle = `rgba(12,16,32,${dk})`; g.fillRect(0, 0, W, H); }
      g.strokeStyle = "rgba(0,0,0,.22)"; g.lineWidth = 0.45; g.strokeRect(0, 0, W, H);   // 블록 테두리
    }
    for (const b of items) {
      const { x, y, z, w, d, h, m } = b;
      if (!(b.unit && solid(x, y + 1, z))) face(m.front, P(x, y + d, z + h), ex, [0, S], w, h, 0.26);                    // 앞(왼쪽)
      if (!(b.unit && solid(x + 1, y, z))) face(m.side, P(x + w, y + d, z + h), [S, -S / 2], [0, S], d, h, 0.12);         // 옆(오른쪽)
      if (!(b.unit && solid(x, y, z + 1))) face(m.top, P(x, y, z + h), ex, ey, w, d, 0);                                 // 윗면
    }
    return cv.toDataURL("image/png");
  }

  /* ── 7. 움직이기: 첫 장은 바로, 나머지 15장은 화면이 멈추지 않게 조금씩 나눠 그린다 ── */
  const FRAMES = 16, FRAME_MS = 200;
  const cache = {};   // "장면|사람" → { frames: [png...] }
  function build(k, name, who) {
    const make = SCENES[name] || SCENES.집;
    const scenes = Array.from({ length: FRAMES }, (_, f) => make(who, f));
    const bb = bounds(scenes);
    const c = (cache[k] = { frames: [draw(scenes[0], bb)] });
    let f = 1;
    (function next() {
      if (f >= FRAMES) return;
      c.frames[f] = draw(scenes[f], bb); f++;
      setTimeout(next, 30);
    })();
    return c;
  }
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tick = 0;
  setInterval(() => {
    if (still || document.hidden) return;
    tick = (tick + 1) % FRAMES;
    document.querySelectorAll("img[data-voxel]").forEach((img) => {
      const src = cache[img.dataset.voxel] && cache[img.dataset.voxel].frames[tick];
      if (src) img.src = src;
    });
  }, FRAME_MS);

  window.VoxelScenes = {
    names: ["버스", "전철", "차", "회사", "식사", "운동", "잠", "집", "산책"],
    has: (name) => !!SCENES[name],
    // 장면 이름 + 사람 이름 → <img> 글자 (위 타이머가 그림을 넘겨 움직인다)
    render(name, who) {
      const k = name + "|" + who;
      const c = cache[k] || build(k, name, who);
      return `<img src="${c.frames[tick] || c.frames[0]}" data-voxel="${k.replace(/"/g, "&quot;")}" alt="${name}">`;
    },
  };
})();
