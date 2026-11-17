/* 가족 대시보드 — 5. 픽셀 그림 · 5-1. 포켓몬 진화(레벨 계산·알·진화 사슬) · 날씨 아이콘
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* ════════════════════════════════════════════════════════════════
   5. 픽셀 그림 — 글자 격자를 색칠한다 ('.'은 투명)
      ※ 펫은 이 위키를 위해 새로 그린 오리지널 캐릭터다
   ════════════════════════════════════════════════════════════════ */
const BASE_COLORS = { K: "#26324a", E: "#26324a", W: "#ffffff", Y: "#ffd43b", O: "#f59f00", S: "#9fd4ff", R: "#4dabf7", C: "#fffdf3", Q: "#c9d2e3" };
function drawPixels(canvas, grid, colors, scale = 4) {
  const h = grid.length, w = Math.max(...grid.map((r) => r.length));
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    ctx.fillStyle = colors[ch] || BASE_COLORS[ch] || "#f0f";
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
}
// 펫 4단계: 알(0세) → 꼬물이(1~3세) → 뭉치(4~7세) → 날개뭉치(8세~)
const PET = {
  egg: [
    "................",
    "......KKKK......",
    "....KKCCCCKK....",
    "...KCCCCCCCCK...",
    "...KCCBBCCCCK...",
    "..KCCCBBCCCCCK..",
    "..KCCCCCCCBBCK..",
    "..KCCCCCCCBBCK..",
    "..KCBBCCCCCCCK..",
    "..KCBBCCCCCCCK..",
    "..KCCCCCCBBCCK..",
    "...KCCCCCBBCK...",
    "...KQCCCCCCQK...",
    "....KKQQQQKK....",
    "......KKKK......",
    "................",
  ],
  baby: [
    "................",
    "................",
    "...KK......KK...",
    "..KBBK....KBBK..",
    "..KBLBKKKKBLBK..",
    "...KBBBBBBBBK...",
    "..KBBBBBBBBBBK..",
    "..KBBEWBBEWBBK..",
    ".KBBBEEBBEEBBBK.",
    ".KBPBBBBBBBBPBK.",
    ".KBBBBBKKBBBBBK.",
    ".KBBBBBBBBBBBBK.",
    "..KBLLLLLLLLBK..",
    "..KBBKKKKKKBBK..",
    "...KK......KK...",
    "................",
  ],
  kid: [
    "..KK........KK..",
    ".KBBK......KBBK.",
    ".KBLBK....KBLBK.",
    ".KBBBBKKKKBBBBK.",
    "..KBBBBBBBBBBK..",
    ".KBBBBBBBBBBBBK.",
    ".KBBEWBBBBEWBBK.",
    ".KBBEEBBBBEEBBK.",
    ".KPPBBBKKBBBPPK.",
    "..KBBBBBBBBBBK..",
    ".KBKBLLLLLLBKBK.",
    ".KBKBLLLLLLBKBK.",
    "..KKBLLLLLLBKK..",
    "...KBBBBBBBBK...",
    "...KBBK..KBBK...",
    "...KKK....KKK...",
  ],
};
// 마지막 단계 = 뭉치 + 이마 보석 + 양쪽 날개
PET.wing = (() => {
  const wing = { 3: ".K...", 4: "KGK..", 5: "KGGK.", 6: "KGGGK", 7: "KGGGK", 8: ".KGGK", 9: "..KK." };
  return PET.kid.map((row, y) => {
    let body = row;
    if (y === 4) body = body.slice(0, 7) + "DD" + body.slice(9);
    const L = wing[y] || ".....", R = [...L].reverse().join("");
    return L + body + R;
  });
})();
const STAGE_NAME = { egg: "알", baby: "꼬물이", kid: "뭉치", wing: "날개뭉치" };

/* ════════════════════════════════════════════════════════════════
   5-1. 포켓몬 진화 — 루틴 1개 완료 = 레벨 1
       Lv.5 부화 · 1단계 Lv.10 진화 · 2단계 Lv.15 최종 진화 후 동산으로 이동, 새 알 시작
       진화하면 레벨이 1부터 다시 시작한다. 한 마리 졸업까지 루틴 28개

   어떤 포켓몬이 나오나
     - 첫 번째 포켓몬: 알 1개가 랜덤으로 온다.
       부화하면 대시보드가 '아이들/포켓몬 알.md'에 "몇 번째 = 도감번호"를 적어 둔다(목록을 고쳐도 안 바뀌게).
     - 두 번째부터: 다 키우면 알 3개가 오고 아이가 하나를 고른다 → 고른 알도 같은 파일에 적는다.
     - 아이마다 이미 키운 포켓몬(진화 계열)은 다시 나오지 않는다. 전부 다 키웠으면 처음부터 다시.
     - 알 하나하나가 5% 확률로 전설이다(뮤 포함).
     - 알 색은 포켓몬 타입(🔥 불꽃 알, 💧 물 알…)이라 고를 때 힌트가 된다.
       어떤 포켓몬인지는 부화할 때까지 비밀 — 화면(HTML)에 이름·그림·도감번호를 넣지 않는다.
   ════════════════════════════════════════════════════════════════ */
// 타입별 알 무늬 색과 표시
const POKE_TYPES = {
  풀: ["🌿", "#5cbf4a"], 불꽃: ["🔥", "#f2703a"], 물: ["💧", "#3e9be6"], 전기: ["⚡", "#f5c518"],
  노말: ["⭐", "#c4a77a"], 에스퍼: ["🔮", "#f25b9a"], 고스트: ["👻", "#7a5cc8"], 드래곤: ["🐉", "#5a5ff0"],
  벌레: ["🐛", "#9bbf2a"], 격투: ["🥊", "#c24a3a"], 바위: ["🪨", "#a8905a"], 땅: ["⛰️", "#d9a650"],
  페어리: ["🎀", "#f29ad6"], 얼음: ["❄️", "#6fd3e0"], 비행: ["🪶", "#8fb0f2"], 독: ["🫧", "#a24cc0"],
  강철: ["⚙️", "#91a3b0"],
};
// 이브이는 8가지 중 하나로 진화한다 (아이·주기마다 정해짐)
const EEVEE_EVOS = [[134, "샤미드"], [135, "쥬피썬더"], [136, "부스터"], [196, "에브이"], [197, "블래키"], [470, "리피아"], [471, "글레이시아"], [700, "님피아"]];
// [타입, 진화 계열] — 계열의 한 칸 = [도감번호, 이름]. 칸이 목록이면(이브이) 그중 하나로 진화한다.
// ⚠️ 계열의 첫 도감번호가 '포켓몬 알.md' 기록의 열쇠다. 이미 있는 계열의 첫 번호는 바꾸지 말 것(추가·순서 변경은 괜찮다).
const POKE_CHAINS = [
  // 귀여운 친구들
  ["전기", [[172, "피츄"], [25, "피카츄"], [26, "라이츄"]]],
  ["노말", [[133, "이브이"], EEVEE_EVOS]],
  ["페어리", [[174, "푸푸린"], [39, "푸린"], [40, "푸크린"]]],
  ["페어리", [[173, "삐"], [35, "삐삐"], [36, "픽시"]]],
  ["물", [[54, "고라파덕"], [55, "골덕"]]],
  ["페어리", [[175, "토게피"], [176, "토게틱"], [468, "토게키스"]]],
  ["물", [[298, "루리리"], [183, "마릴"], [184, "마릴리"]]],
  ["노말", [[52, "나옹"], [53, "페르시온"]]],
  ["노말", [[446, "먹고자"], [143, "잠만보"]]],
  ["노말", [[19, "꼬렛"], [20, "레트라"]]],
  ["풀", [[69, "모다피"], [70, "우츠동"], [71, "우츠보트"]]],
  ["전기", [[417, "파치리스"]]],
  ["독", [[944, "땃쭈르"], [945, "태깅구르"]]],
  ["전기", [[179, "메리프"], [180, "보송송"], [181, "전룡"]]],
  ["에스퍼", [[280, "랄토스"], [281, "킬리아"], [282, "가디안"]]],
  ["얼음", [[220, "꾸꾸리"], [221, "메꾸리"], [473, "맘모꾸리"]]],
  ["물", [[270, "연꽃몬"], [271, "로토스"], [272, "로파파"]]],
  // 스타터
  ["풀", [[1, "이상해씨"], [2, "이상해풀"], [3, "이상해꽃"]]],
  ["불꽃", [[4, "파이리"], [5, "리자드"], [6, "리자몽"]]],
  ["물", [[7, "꼬부기"], [8, "어니부기"], [9, "거북왕"]]],
  ["풀", [[152, "치코리타"], [153, "베이리프"], [154, "메가니움"]]],
  ["불꽃", [[155, "브케인"], [156, "마그케인"], [157, "블레이범"]]],
  ["물", [[158, "리아코"], [159, "엘리게이"], [160, "장크로다일"]]],
  ["풀", [[252, "나무지기"], [253, "나무돌이"], [254, "나무킹"]]],
  ["불꽃", [[255, "아차모"], [256, "영치코"], [257, "번치코"]]],
  ["물", [[258, "물짱이"], [259, "늪짱이"], [260, "대짱이"]]],
  // 벌레·새
  ["벌레", [[10, "캐터피"], [11, "단데기"], [12, "버터플"]]],
  ["벌레", [[13, "뿔충이"], [14, "딱충이"], [15, "독침붕"]]],
  ["벌레", [[265, "개무소"], [266, "실쿤"], [267, "뷰티플라이"]]],
  ["비행", [[16, "구구"], [17, "피죤"], [18, "피죤투"]]],
  ["비행", [[163, "부우부"], [164, "야부엉"]]],
  // 그 밖
  ["풀", [[43, "뚜벅쵸"], [44, "냄새꼬"], [45, "라플레시아"]]],
  ["물", [[60, "발챙이"], [61, "슈륙챙이"], [62, "강챙이"]]],
  ["에스퍼", [[63, "캐이시"], [64, "윤겔라"], [65, "후딘"]]],
  ["격투", [[66, "알통몬"], [67, "근육몬"], [68, "괴력몬"]]],
  ["바위", [[74, "꼬마돌"], [75, "데구리"], [76, "딱구리"]]],
  ["고스트", [[92, "고오스"], [93, "고우스트"], [94, "팬텀"]]],
  ["풀", [[273, "도토링"], [274, "잎새코"], [275, "다탱구"]]],
  ["노말", [[287, "게을로"], [288, "발바로"], [289, "게을킹"]]],
  ["노말", [[304, "가보리"], [305, "갱도라"], [306, "보스로라"]]],
  ["땅", [[328, "톱치"], [329, "비브라바"], [330, "플라이곤"]]],
  // 드래곤
  ["드래곤", [[147, "미뇽"], [148, "신뇽"], [149, "망나뇽"]]],
  ["바위", [[246, "애버라스"], [247, "데기라스"], [248, "마기라스"]]],
  ["드래곤", [[371, "아공이"], [372, "쉘곤"], [373, "보만다"]]],
  // PokeTokenBar와 공통 목록: 기존 순서와 도감번호는 유지한다.
  ["풀", [[387, "모부기"], [388, "수풀부기"], [389, "토대부기"]]],
  ["불꽃", [[390, "불꽃숭이"], [391, "파이숭이"], [392, "초염몽"]]],
  ["물", [[393, "팽도리"], [394, "팽태자"], [395, "엠페르트"]]],
  ["풀", [[495, "주리비얀"], [496, "샤비"], [497, "샤로다"]]],
  ["강철", [[374, "메탕"], [375, "메탕구"], [376, "메타그로스"]]],
  ["드래곤", [[443, "딥상어동"], [444, "한바이트"], [445, "한카리아스"]]],
  ["드래곤", [[610, "터검니"], [611, "액슨도"], [612, "액스라이즈"]]],
  ["드래곤", [[633, "모노두"], [634, "디헤드"], [635, "삼삼드래"]]],
];
// 전설 포켓몬 (진화하지 않는다) — 알 하나당 5% 확률
const POKE_LEGENDARY = [
  ["에스퍼", [[150, "뮤츠"]]], ["에스퍼", [[151, "뮤"]]], ["비행", [[249, "루기아"]]], ["불꽃", [[250, "칠색조"]]], ["드래곤", [[384, "레쿠쟈"]]],
  ["드래곤", [[483, "디아루가"]]], ["물", [[484, "펄기아"]]], ["고스트", [[487, "기라티나"]]],
  ["불꽃", [[643, "레시라무"]]], ["전기", [[644, "제크로무"]]],
];
// 한 목록으로: { key: 첫 도감번호, type, chain, legendary }
const POKE_ALL = [
  ...POKE_CHAINS.map(([type, chain]) => ({ key: chain[0][0], type, chain, legendary: false })),
  ...POKE_LEGENDARY.map(([type, chain]) => ({ key: chain[0][0], type, chain, legendary: true })),
];
const POKE_BY_KEY = new Map(POKE_ALL.map((e) => [e.key, e]));
// 서로 다른 포켓몬 수 (이브이 진화 8가지 포함)
const POKE_TOTAL = POKE_ALL.reduce((s, e) => s + e.chain.reduce((a, x) => a + (Array.isArray(x[0]) ? x.length : 1), 0), 0);

/* ════════════════════════════════════════════════════════════════
   5-2. 포켓몬 등급 — 종족값 합계 기준 (2026-11-15 아빠 요청)
       SS 680 (전설 9종) / S 600 (준전설 7종) / A 518~545 (29종)
       / B 480~515 (13종) / C 400~479 (35종) / D 400 미만 (71종) = 164종
       특례: 게을킹(289)은 종족값 670이지만 특성 트루안트(한 턴 쉬어야 함) 때문에 A.
       정본은 여기 POKE_TIER·POKE_BST — 등급표는 `아이들/루틴.md` 참고.
       동산·지금 키우는 포켓몬·도감에서 pokeTierBadge()로 배지를 보여준다.
   ════════════════════════════════════════════════════════════════ */
const POKE_TIER = {};
for (const d of [150, 249, 250, 384, 483, 484, 487, 643, 644]) POKE_TIER[d] = "SS";
for (const d of [149, 151, 248, 373, 376, 445, 635]) POKE_TIER[d] = "S";
for (const d of [3, 6, 9, 134, 135, 136, 143, 154, 157, 160, 196, 197, 254, 257, 260, 282, 289, 306, 330, 389, 392, 395, 468, 470, 471, 473, 497, 612, 700]) POKE_TIER[d] = "A";
for (const d of [26, 36, 45, 55, 62, 65, 68, 71, 76, 94, 181, 272, 275]) POKE_TIER[d] = "B";
for (const d of [2, 5, 8, 18, 20, 40, 53, 64, 67, 93, 148, 153, 156, 159, 164, 176, 184, 221, 247, 253, 256, 259, 288, 305, 372, 375, 388, 391, 394, 417, 444, 496, 611, 634, 945]) POKE_TIER[d] = "C";
const POKE_BST = {
  1: 318, 2: 405, 3: 525, 4: 309, 5: 405, 6: 534, 7: 314, 8: 405, 9: 530,
  10: 195, 11: 205, 12: 395, 13: 195, 14: 205, 15: 395, 16: 251, 17: 349, 18: 479,
  19: 253, 20: 413, 25: 320, 26: 485, 35: 323, 36: 483, 39: 270, 40: 435, 43: 320,
  44: 395, 45: 490, 52: 290, 53: 440, 54: 320, 55: 500, 60: 300, 61: 385, 62: 510,
  63: 310, 64: 400, 65: 500, 66: 305, 67: 405, 68: 505, 69: 300, 70: 390, 71: 490,
  74: 300, 75: 390, 76: 495, 92: 310, 93: 405, 94: 500, 133: 325, 134: 525, 135: 525,
  136: 525, 143: 540, 147: 300, 148: 420, 149: 600, 150: 680, 151: 600, 152: 318, 153: 405,
  154: 525, 155: 309, 156: 405, 157: 534, 158: 314, 159: 405, 160: 530, 163: 262, 164: 452,
  172: 205, 173: 218, 174: 210, 175: 245, 176: 405, 179: 280, 180: 365, 181: 510, 183: 250,
  184: 420, 196: 525, 197: 525, 220: 250, 221: 450, 246: 300, 247: 410, 248: 600, 249: 680,
  250: 680, 252: 310, 253: 405, 254: 530, 255: 310, 256: 405, 257: 530, 258: 310, 259: 405,
  260: 535, 265: 195, 266: 205, 267: 395, 270: 220, 271: 340, 272: 480, 273: 220, 274: 340,
  275: 480, 280: 198, 281: 278, 282: 518, 287: 280, 288: 440, 289: 670, 298: 190, 304: 330,
  305: 430, 306: 530, 328: 290, 329: 340, 330: 520, 371: 300, 372: 420, 373: 600, 374: 300,
  375: 420, 376: 600, 384: 680, 387: 318, 388: 405, 389: 525, 390: 309, 391: 405, 392: 534,
  393: 314, 394: 405, 395: 530, 417: 405, 443: 300, 444: 410, 445: 600, 446: 390, 468: 545,
  470: 525, 471: 525, 473: 530, 483: 680, 484: 680, 487: 680, 495: 308, 496: 405, 497: 528,
  610: 320, 611: 410, 612: 540, 633: 300, 634: 420, 635: 600, 643: 680, 644: 680, 700: 525,
  944: 258, 945: 400,
};
const pokeTier = (dex) => POKE_TIER[dex] || "D";
const pokeTierBadge = (dex) => `<span class="tier-badge tier-${pokeTier(dex).toLowerCase()}">${pokeTier(dex)}</span>`;
/* 🕊️ 풀어주기 토큰 (2026-11-15 아빠 요청) — 동산 포켓몬을 풀어주면 등급별 토큰을 받는다. 차이가 너무 크지 않게 50부터 10씩. 서버 serve.py TIER_TOKEN과 같은 값 — 바꾸면 양쪽 다 바꾼다 */
const TIER_TOKEN = { SS: 100, S: 90, A: 80, B: 70, C: 60, D: 50 };
const releaseToken = (dex) => TIER_TOKEN[pokeTier(dex)] || 50;

const POKE_SPRITE = (dex) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;
// 아빠 동료 스프라이트 (이로치면 shiny 폴더 — 아이들과 같은 PokéAPI 도트 스프라이트)
const DAD_SPRITE = (dex, shiny) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny ? "shiny/" : ""}${dex}.png`;
// 문자열 해시 (djb2) — 새로고침해도 같은 아이·같은 주기는 같은 결과
function pokeHash(s) {
  let h = 5381;
  for (const ch of String(s)) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
  return h;
}
// 아이별 고른 알 기록: { 아이 이름: { 몇 번째: 도감번호 } } — buildData가 '아이들/포켓몬 알.md'에서 채운다
let pokePicks = {};
// 10-1. 동산 장부: { 아이 이름: [{ sign: +1|-1, dex, name, why }] } — buildData가 '아이들/동산 장부.md'에서 채운다
let gardenLedger = {};
// 10-4. 친구 진화시키기: { 아이 이름: { 몇 번째: 도감번호 } } — '포켓몬 알.md'에서 비고 칸이 '친구'인 줄(데려온 친구를 알 대신 키움)
let pokeFriendPicks = {};
// 도감번호가 어느 계열의 몇 번째 모습인지 — { e: 계열, j: 몇 번째(0부터), form: [번호, 이름] } / 없으면 null
function friendEntry(dex) {
  for (const e of POKE_ALL) {
    for (let j = 0; j < e.chain.length; j++) {
      const s = e.chain[j], hit = Array.isArray(s[0]) ? s.find((x) => x[0] === dex) : s[0] === dex ? s : null;
      if (hit) return { e, j, form: hit };
    }
  }
  return null;
}
// 아직 진화할 수 있는 친구인가(전설·최종 모습은 아니다)
function friendEvolvable(dex) {
  const f = friendEntry(dex);
  return !!f && !f.e.legendary && f.j < f.e.chain.length - 1;
}
// 계열의 모습들 — 친구를 키우는 주기면 그 친구 모습부터(앞 모습은 빼고, 첫 칸은 실제 친구 모습)
function chainOf(entry, seed) {
  const ch = resolveChain(entry, seed);
  if (!entry.friend) return ch;
  return [entry.friend.form, ...ch.slice(entry.friend.j + 1)];
}
// 계열 안의 갈래(이브이)를 아이·주기마다 하나로 정한다
function resolveChain(entry, seed) {
  return entry.chain.map((s, j) => (Array.isArray(s[0]) ? s[pokeHash(`${seed}#evo${j}`) % s.length] : s));
}
// 아직 안 키운 것 중에서 하나 뽑기 (seed가 같으면 늘 같은 결과). 5%는 전설.
function pokeDraw(seed, exclude) {
  const h = pokeHash(seed);
  const legs = POKE_ALL.filter((e) => e.legendary && !exclude.has(e.key));
  const norms = POKE_ALL.filter((e) => !e.legendary && !exclude.has(e.key));
  if (legs.length && ((h % 100) < 5 || !norms.length)) return legs[Math.floor(h / 100) % legs.length];
  const list = norms.length ? norms : POKE_ALL.filter((e) => !e.legendary);   // 전부 키웠으면 처음부터 다시
  return list[Math.floor(h / 100) % list.length];
}
// n번째 포켓몬의 후보 알 3개 (두 번째부터). 이미 키운 계열(raised)은 빼고, 셋은 서로 다르다.
function eggChoices(kid, n, raised) {
  const ex = new Set(raised), out = [];
  for (let s = 0; out.length < 3 && s < 40; s++) {
    const e = pokeDraw(`${kid}#${n}#egg${s}`, ex);
    if (!out.includes(e)) { out.push(e); ex.add(e.key); }
  }
  return out;
}
const eggColors = (type, fallback) => (type && POKE_TYPES[type] ? { ...fallback, B: POKE_TYPES[type][1] } : fallback);
const eggLabel = (type) => (POKE_TYPES[type] ? `${POKE_TYPES[type][0]} ${type} 알` : "알");   // 타입을 모르면 그냥 "알"

// 아이의 포켓몬 상태: total = 지금까지 완료한 루틴 수
// 단계별 레벨: 알 Lv.0~4 (5번째 루틴에 부화) → 1단계 Lv.1~9 (Lv.10이 되면 진화)
//   → 2단계 Lv.1~14 (Lv.15가 되면 최종 진화 후 동산으로 이동, 새 알 시작)
// 진화한 그 루틴이 다음 단계의 Lv.1이 된다. 한 마리 졸업까지 루틴 28개 (5 + 9 + 14).
const POKE_CYCLE_LEN = 28;
function pokeState(childName, total) {
  const cycle = Math.floor(total / POKE_CYCLE_LEN);   // 다 키운 마리 수 (지금 알이 몇 번째인지 - 1)
  const t = total % POKE_CYCLE_LEN;                    // 지금 주기에서 한 루틴 수
  const picks = pokePicks[childName] || {};
  const raised = [];        // 이미 키운 계열(첫 도감번호) — 다시 안 나오게
  const unrecorded = [];    // 랜덤으로 정해졌는데 아직 '포켓몬 알.md'에 안 적힌 것 (부화했거나 지나간 것만)
  // c번째 주기(0부터)의 계열: 기록 → 그대로 / 첫 알·고르지 않고 지나간 주기 → 랜덤 / 지금 두 번째 이후 → 고르는 중(null)
  const entryOf = (c) => {
    const fd = (pokeFriendPicks[childName] || {})[c + 1], fe = fd && friendEntry(fd);
    if (fe) return { ...fe.e, friend: fe };                          // 데려온 친구를 키우는 주기 — 알 없이 그 모습부터
    const rec = POKE_BY_KEY.get(picks[c + 1]);
    if (rec) return rec;
    if (c > 0 && c === cycle) return null;
    const e = pokeDraw(`${childName}#${c}`, new Set(raised));
    if (c < cycle || t >= 5) unrecorded.push({ n: c + 1, key: e.key });
    return e;
  };
  // 지난 주기에 졸업한 포켓몬들 (동산) — met: 이 아이가 만난 포켓몬 도감번호(키운 계열의 모든 모습, 도감용)
  const garden = [], met = [];
  for (let c = 0; c < cycle; c++) {
    const e = entryOf(c);
    raised.push(e.key);
    const ch = chainOf(e, `${childName}#${c}`), last = ch[ch.length - 1];
    garden.push({ dex: last[0], name: last[1], legendary: e.legendary, from: "졸업" });
    met.push(...ch.map((p) => p[0]));
  }
  // 10-1. 동산 장부(아이들/동산 장부.md): 찾아온 몬스터·교환으로 들어오면 더하고, 나가면 뺀다
  for (const r of gardenLedger[childName] || []) {
    if (r.sign > 0) { garden.push({ dex: r.dex, name: r.name, legendary: false, from: r.why }); met.push(r.dex); }
    else { const i = garden.findIndex((g) => g.dex === r.dex); if (i >= 0) garden.splice(i, 1); }
  }
  const entry = entryOf(cycle);
  if (!entry) {             // 두 번째부터: 아직 알을 고르지 않았다 → 알 3개 중 고르기
    // 동산에 있는 '데려온·교환한' 친구 중 아직 진화할 수 있는 친구 — 알 대신 골라서 진화시킬 수 있다
    const seen = new Set();
    const friends = garden.filter((g) => g.from !== "졸업" && !g.legendary && friendEvolvable(g.dex) && !seen.has(g.dex) && seen.add(g.dex)).map((g) => [g.dex, g.name]);
    return { total, cycle, n: cycle + 1, needPick: true, choices: eggChoices(childName, cycle + 1, raised), friends, waiting: t,
      level: 0, legendary: false, chain: [], garden, met, cur: null, nextAt: 5, left: 5, pct: 0, type: null, unrecorded };
  }
  const chain = chainOf(entry, `${childName}#${cycle}`);
  if (entry.friend) {                // 친구 키우기: 친구 모습 Lv.1~14 → Lv.15에 진화(2단계 Lv.1~14) → 다 키우면 최종 모습으로 동산
    met.push(chain[0][0]);
    if (t >= 14 && chain[1]) met.push(chain[1][0]);
    const level = t < 14 ? t + 1 : t - 13, cur = t < 14 ? chain[0] : chain[Math.min(1, chain.length - 1)];
    return { total, cycle, n: cycle + 1, needPick: false, friend: true, level, legendary: false, chain, garden, met, cur, nextAt: 15,
      left: 15 - level, pct: Math.round(((t < 14 ? t : level - 1) / 14) * 100), type: entry.type, unrecorded };
  }
  if (t >= 5) met.push(chain[0][0]);                                // 부화했으면 첫 모습을 만났다
  if (t >= 14 && chain[1]) met.push(chain[1][0]);                   // 진화했으면 두 번째 모습도
  // 지금 단계와 레벨
  let level, cur, nextAt, pct;
  if (t < 5) {                       // 알
    level = t; cur = null; nextAt = 5; pct = t / 5;
  } else if (t < 14) {               // 1단계 (Lv.1~9, Lv.10이 되면 진화)
    level = t - 4; cur = chain[0]; nextAt = 10; pct = (level - 1) / 9;
  } else {                           // 2단계 (Lv.1~14, Lv.15가 되면 최종 진화)
    level = t - 13; cur = chain[Math.min(1, chain.length - 1)]; nextAt = 15; pct = (level - 1) / 14;
  }
  return { total, cycle, n: cycle + 1, needPick: false, level, legendary: entry.legendary, chain, garden, met, cur, nextAt,
    left: nextAt - level, pct: Math.round(pct * 100), type: entry.type, unrecorded };
}

/* 알 금 가기: 알 Lv.1~4가 될 때마다 금(검은 점선)이 한 마디씩 길어진다.
   좌표는 PET.egg(16×16) 그림 위의 [가로 x, 세로 y] 칸. Lv.4면 알을 가로지르는 금 + 위아래 갈래 */
const EGG_CRACKS = [
  [],                                  // Lv.0 — 금 없음
  [[3, 7], [4, 6], [5, 7]],            // Lv.1 — 왼쪽에 작은 금
  [[6, 8], [7, 7], [8, 6]],            // Lv.2 — 가운데까지
  [[9, 7], [10, 8], [11, 7], [12, 6]], // Lv.3 — 오른쪽 끝까지
  [[8, 5], [8, 4], [7, 9], [7, 10]],   // Lv.4 — 위아래로 갈라짐(곧 부화!)
];
function eggGrid(level) {
  const g = PET.egg.map((row) => [...row]);
  const n = Math.max(0, Math.min(EGG_CRACKS.length - 1, level | 0));
  for (let i = 1; i <= n; i++) for (const [x, y] of EGG_CRACKS[i]) g[y][x] = "K";
  return g.map((row) => row.join(""));
}

// 날씨 아이콘 (12×12)
const ICON = {
  sun: [".....YY.....", "..Y..YY..Y..", "...Y....Y...", "....OOOO....", "...OYYYYO...", "YY.OYYYYO.YY",
        "YY.OYYYYO.YY", "...OYYYYO...", "....OOOO....", "...Y....Y...", "..Y..YY..Y..", ".....YY....."],
  cloud: ["............", "............", "............", "....KKKK....", "...KWWWWK...", ".KKWWWWWWKK.",
          "KWWWWWWWWWWK", "KWWWWWWWWWWK", "KQQQQQQQQQQK", ".KKKKKKKKKK.", "............", "............"],
  moon: ["............", "....KKK.....", "...KYYK.....", "..KYYK......", ".KYYYK......", ".KYYYK......",
         ".KYYYYK.....", ".KYYYYYKKK..", "..KYYYYYYYK.", "...KYYYYYK..", "....KKKKK...", "............"],
};
const overlay = (base, top, dy = 0, dx = 0) => base.map((row, y) => [...row].map((ch, x) => {
  const t = (top[y - dy] || "")[x - dx];
  return t && t !== "." ? t : ch;
}).join(""));
const up = (g, n) => [...g.slice(n), ...Array(n).fill("............")];
ICON.partly = overlay(ICON.sun, ICON.cloud, 2, 1);
ICON.rain = overlay(up(ICON.cloud, 2), ["", "", "", "", "", "", "", "", "", "..R...R...R.", ".R...R...R..", "............"]);
ICON.snow = overlay(up(ICON.cloud, 2), ["", "", "", "", "", "", "", "", "", "..S...S...S.", "....S...S...", "............"]);

