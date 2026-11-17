/* 가족 대시보드 — 3. 위키·캘린더·공휴일 불러오기 · 4. 위키 내용 → 화면용 데이터
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* ════════════════════════════════════════════════════════════════
   3. 위키 파일 불러오기
   ════════════════════════════════════════════════════════════════ */
const FILES = {
  family: "가족 구성원.md",
  todo: "장보기·할 일.md",
  schedule: "일정/일정표.md",
  annual: "일정/가족 연간 일정.md",
  trip: "여행/다음 여행.md",
  routine: "일정/하루 일과.md",
  pokeLog: "아이들/포켓몬 기록.md",
  pokeEggs: "아이들/포켓몬 알.md",     // 몇 번째 포켓몬이 어떤 알이었는지 (고른 알·첫 알)
  kidRoutine: "아이들/루틴.md",
  coupon: "아이들/쿠폰.md",            // 주간 보상·데이트 쿠폰 (서버가 적고, 쓰면 '쓴 날'을 채움)
  cheer: "일정/응원.md",               // 엄마·아빠 응원 한마디 | 날짜 | 받는 아이 | 보낸 사람 | 한마디 |
  growth: "아이들/성장 기록.md",       // 키·몸무게 | 날짜 | 아이 | 키(cm) | 몸무게(kg) | — 동산 키 나무
  words: "아이들/영어 단어.md",        // 영어 퀴즈 단어장 ## 단어 | 그림 | 단어 | 뜻 |
  ledger: "아이들/동산 장부.md",       // 동산에 들어오고 나간 포켓몬 | 날짜 | 아이 | 들고남 | 도감번호 | 이름 | 까닭 |
  dadCompanion: "아빠/포켓몬-동료.json",
  ideas: "가족회의/아이디어.md",
  outfit: "아이들/캐릭터.md",           // 14-2. 캐릭터 코디 | 아이 | 코디 | 바꾼 날 |
  hair: "아이들/머리.md",               // 14-3. 캐릭터 머리 | 아이 | 머리 | 바꾼 날 | (여자 아이만)
  top: "아이들/상의.md",                // 14-5. 캐릭터 상의 | 아이 | 상의 | 바꾼 날 | (여자 아이만, 모두 무료)
  bottom: "아이들/하의.md",             // 14-5. 캐릭터 하의 | 아이 | 하의 | 바꾼 날 | (여자 아이만, 모두 무료)
  dress: "아이들/원피스.md",            // 14-6. 🛍️ 상점 원피스 ## 가진 원피스 | 아이 | 원피스 | 산 날 | · ## 쓰는 원피스 | 아이 | 원피스 | 바꾼 날 | (여자 아이만, 0=안 입음, 1번 분홍 무료·2~4번 5토큰·테스트 무료)
  shoes: "아이들/신발.md",              // 14-6. 🛍️ 상점 신발 ## 가진 신발 | 아이 | 신발 | 산 날 | · ## 쓰는 신발 | 아이 | 신발 | 바꾼 날 | (여자 아이 빨간 운동화·검정 구두, 남자 아이 파란 운동화·노란 운동화, 5토큰)
  padding: "아이들/패딩.md",            // 14-6. 🛍️ 상점 패딩 ## 가진 패딩 | 아이 | 패딩 | 산 날 | · ## 쓰는 패딩 | 아이 | 패딩 | 바꾼 날 | (1=검정 패딩, 6토큰·테스트 무료)
  boughtOutfit: "아이들/코디.md",       // 14-7. 🛍️ 상점 남자 코디 ## 가진 코디 | 아이 | 코디 | 산 날 | (남자 아이만, 4번 농구 유니폼·5번 공룡 후드티, 5토큰)
  bank: "아이들/은행.md",               // 14-9. 🏦 은행 ## 예금 | 날짜 | 아이 | 원금 | 기간 | 일금리 | 만기일 | 상태 | (7일 10% · 14일 15% · 21일 20% · 28일 25%, 일 금리 단리)
  token: "아이들/토큰.md",             // 14-4. 토큰 장부 | 날짜 | 아이 | 변화 | 까닭 | (루틴 1개=1토큰, 하루 완료 +2, 형제 +1)
  usage: "아빠/토큰-사용량.json",       // 토큰 사용량 (서버 usage_fetch가 3분마다 갱신)
};
async function loadWiki() {
  const out = {}; const missing = [];
  await Promise.all(Object.entries(FILES).map(async ([key, path]) => {
    if (DEMO) {
      let t = demoFiles()[key] || "";
      if (key === "pokeLog") t += demoState.added.map((x) => `| ${ymd(new Date())} | ${x.kid} | ${x.routine} |\n`).join("");
      if (key === "pokeLog") for (const x of demoState.removed.filter((x) => x.routine)) { const row = `| ${ymd(new Date())} | ${x.kid} | ${x.routine} |`; const i = t.lastIndexOf(row); if (i >= 0) t = t.slice(0, i) + t.slice(t.indexOf("\n", i) + 1); }
      if (key === "coupon") t = t.split("\n").map((l) => (demoState.couponUsed.some((u) => l.includes(`| ${u.got} | ${u.kid} | ${u.name} | ${u.why} |`))
        ? l.replace(/\|\s*$/, "").replace(/\|[^|]*$/, `| ${ymd(new Date())} |`) : l)).join("\n")
        + demoState.couponAdd.map((x) => `| ${ymd(new Date())} | ${x.kid} | ${x.name} | ${x.why} | |\n`).join("");
      if (key === "ledger") t += demoState.ledgerAdd.map((x) => `| ${ymd(new Date())} | ${x.kid} | ${x.sign || "+"} | ${x.dex} | ${x.name} | ${x.why || "찾아옴"} |\n`).join("")
        + demoState.ledgerAdd2.map((x) => [[x.a, "-", x.a_dex, x.a_name], [x.a, "+", x.b_dex, x.b_name], [x.b, "-", x.b_dex, x.b_name], [x.b, "+", x.a_dex, x.a_name]]
          .map(([k, s, d, n]) => `| ${ymd(new Date())} | ${k} | ${s} | ${d} | ${n} | 교환 |\n`).join("")).join("");
      if (key === "growth") t += demoState.growth.map((x) => `| ${ymd(new Date())} | ${x.kid} | ${x.height ?? ""} | ${x.weight ?? ""} |\n`).join("");
      if (key === "cheer") {
        t += demoState.cheerAdd.map((x) => `| ${x.date} | ${x.to} | ${x.from} | ${x.text} |\n`).join("");
        for (const x of demoState.cheerDel) t = t.split("\n").filter((l) => l.trim() !== `| ${x.date} | ${x.to} | ${x.from} | ${x.text} |`).join("\n");
      }
      if (key === "pokeEggs") t = (t || "| 날짜 | 아이 | 몇 번째 | 도감번호 |\n|---|---|---|---|\n") + demoState.picks.map((x) => `| ${ymd(new Date())} | ${x.kid} | ${x.n} | ${x.dex} |${x.friend ? " 친구 |" : ""}\n`).join("");
      if (key === "todo") t = t.split("\n").map((l) => { const s = parseItems([l])[0]; const v = s && demoState.supply[`${s.text}|${s.who}`];
        return v === undefined ? l : l.replace(/\[[ xX]\]/, v ? "[x]" : "[ ]"); }).join("\n");
      if (key === "todo") for (const x of demoState.removed.filter((x) => x.text)) t = t.split("\n").filter((l) => !(l.includes(x.text) && (!x.who || l.includes(`(${x.who})`)))).join("\n");
      out[key] = t; return;
    }
    try {
      const res = await fetch(CONFIG.wikiRoot + path.split("/").map(encodeURIComponent).join("/"), { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      out[key] = await res.text();
    } catch (e) { out[key] = ""; missing.push(path); }
  }));
  return { files: out, missing };
}

/* 3-2. 구글 캘린더 '우리가족' — serve.py가 /calendar.ics 로 건네준다 */
let calState = "";
async function loadCalendar() {
  if (DEMO) { calState = "예시"; return demoIcs(); }
  try {
    const res = await fetch("/calendar.ics", { cache: "no-store" });
    if (!res.ok) { calState = "연결 안 됨"; return null; }
    calState = res.headers.get("X-Calendar-Stale") ? "연결됨(예전 내용 — 인터넷 확인)" : "연결됨";
    return await res.text();
  } catch (e) { calState = "연결 안 됨"; return null; }
}
/* 3-3. 공휴일(빨간 날) — serve.py가 /holidays.json 으로 건네준다. 빨간 날은 주말처럼 다룬다 */
let holState = "";
let HOLIDAYS = {};   // { "2026-12-25": "크리스마스" }
async function loadHolidays() {
  if (DEMO) { holState = "예시"; HOLIDAYS = { [ymd(addDays(new Date(), 6))]: "예시 공휴일" }; return; }
  try {
    const res = await fetch("/holidays.json", { cache: "no-store" });
    const j = await res.json();
    if (!j.ok) throw 0;
    HOLIDAYS = j.days; holState = j.stale ? "연결됨(예전 내용)" : "연결됨";
  } catch (e) { holState = "연결 안 됨"; }
}
const holidayOf = (d) => HOLIDAYS[ymd(d)] || "";
const isOffDay = (d) => d.getDay() === 0 || d.getDay() === 6 || !!holidayOf(d);   // 주말 또는 빨간 날

// 일정 제목 앞의 이름으로 누구 일정인지 정한다: "아빠 골프", "[엄마] 필라테스", "가족: 외식"
// 제목 앞 이름: "[첫째] 태권도" · "첫째 피아노" · "(둘째) 병원" · 여럿이면 "[첫째·둘째] 파마" / "[첫째, 둘째] 파마"
function splitWho(title, names) {
  const one = names.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const n = `(?:${one})(?:\\s*[·,&]\\s*(?:${one}))*`;
  const m = title.match(new RegExp(`^\\s*(?:\\[(${n})\\]|\\((${n})\\)|(${one})(?=[\\s:·\\-]))\\s*[:·\\-]?\\s*(.+)$`));
  if (!m) return { who: "가족", whos: ["가족"], rest: title, explicit: false };
  const whos = (m[1] || m[2] || m[3]).split(/\s*[·,&]\s*/);
  return { who: whos[0], whos, rest: m[4].trim(), explicit: true };
}
// 일정 제목 → 장면 (낱말로 추측). 모르면 외출(산책) 그림
const SCENE_WORDS = [
  ["잠", /낮잠|수면|취침/], ["버스", /버스/], ["전철", /전철|지하철|기차|KTX|SRT|ITX/i], ["차", /운전|드라이브|자동차|자가용|차로|차 타고/],
  ["운동", /운동|헬스|PT|필라테스|요가|수영|골프|러닝|달리기|축구|농구|테니스|배드민턴|자전거|클라이밍/i],
  ["식사", /점심|저녁|아침|식사|밥|외식|브런치|맛집|회식|모임|파티|카페/],
  ["회사", /회사|출근|근무|업무|회의|미팅|출장|야근|세미나|교육|워크숍/],
  ["집", /집|재택|휴식|청소|빨래|요리/],
  ["산책", /산책|공원|나들이|여행|캠핑|등산|놀이|키즈카페|동물원|바다|휴가|마트|장보기|쇼핑|병원|학원|등원|하원/],
];
const guessScene = (t, fallback = "산책") => (SCENE_WORDS.find(([, re]) => re.test(t)) || [fallback])[0];

/* ════════════════════════════════════════════════════════════════
   4. 위키 내용 → 화면용 데이터
   ════════════════════════════════════════════════════════════════ */
const colorCache = {};
function colorOf(name) {
  if (!name) return CONFIG.colors["가족"];
  if (CONFIG.colors[name]) return CONFIG.colors[name];
  if (!colorCache[name]) colorCache[name] = CONFIG.palette[Object.keys(colorCache).length % CONFIG.palette.length];
  return colorCache[name];
}

function buildData(files) {
  /* 4-1. 가족 구성원: 아이 표, 어른 생일, 양가 어른 생신 */
  const fam = splitFrontmatter(files.family || "").body;
  const kids = parseTable(sectionLines(fam, "아이"))
    .filter((r) => r[0] && !/^\(.*\)$/.test(r[0]))
    .map((r, i) => {
      const lunar = /음력/.test(r[1] || "");
      const name = r[0];
      const skin = KID_SKINS[i % KID_SKINS.length];
      colorCache[name] = colorCache[name] || skin.D;   // 달력 점 색 = 펫 색
      return { name, birth: lunar ? null : parseYMD(r[1]), lunar, skin };
    });
  const birthdays = [];   // { name, month, day, title }
  const lunarTitles = [];  // 음력 생신·생일 제목 — 날짜는 구글 캘린더에 해마다 양력으로 넣어 둔 일정에서 가져온다
  for (const r of parseTable(sectionLines(fam, "우리 가족"))) {
    const d = parseYMD(r[2]);
    if (r[0] && d && !/음력/.test(r[2])) birthdays.push({ who: r[0], m: d.getMonth(), d: d.getDate(), title: `🎂 ${r[0]} 생일` });
  }
  for (const k of kids) if (k.birth) birthdays.push({ who: k.name, m: k.birth.getMonth(), d: k.birth.getDate(), title: `🎂 ${k.name} 생일` });
  // 양가 어른들(생신)·친척(생일): | 성함(이름) | 관계 | 날짜 | — 이름을 모르면 관계(예: 할머니)로 보여 준다.
  // 날짜는 1970-05-12 또는 태어난 해를 모르면 02-20. 음력은 양력 변환이 필요해 달력에서 뺀다.
  const monthDay = (v) => {
    const full = parseYMD(v);
    if (full) return [full.getMonth(), full.getDate()];
    const md = String(v || "").match(/^\s*(\d{1,2})\s*[\/.\-월]\s*(\d{1,2})/);
    return md ? [+md[1] - 1, +md[2]] : null;
  };
  for (const [sec, word, label] of [
    ["양가 어른들", "생신", (r) => r[1] || (r[0] ? `${r[0]}님` : "")],
    ["친척", "생일", (r) => (r[0] && r[1] ? `${r[0]} ${r[1]}` : r[1] || r[0])],
  ]) {
    for (const r of parseTable(sectionLines(fam, sec))) {
      const name = label(r), md = monthDay(r[2]);
      if (name && !/故/.test(r[0] + r[1]) && /음력/.test(r[2] || "")) { lunarTitles.push(`🎂 ${name} ${word}`); continue; }
      if (!name || /故/.test(r[0] + r[1]) || !md) continue;
      birthdays.push({ who: "가족", m: md[0], d: md[1], title: `🎂 ${name} ${word}` });
    }
  }

  /* 4-2. 일정: 한 번뿐인 일정표 + 해마다 돌아오는 날 + 생일 */
  const events = [];   // { date: "YYYY-MM-DD", time, title, who }
  for (const r of parseTable(sectionLines(splitFrontmatter(files.schedule || "").body, null))) {
    const d = parseYMD(r[0]);
    if (d && r[2]) { const whos = (r[3] || "가족").split(/\s*[·,&]\s*/).filter(Boolean); events.push({ date: ymd(d), time: r[1] || "", title: r[2], who: whos[0], whos, rest: r[2] }); }
  }
  const year = new Date().getFullYear();
  const annual = [];
  for (const r of parseTable(sectionLines(splitFrontmatter(files.annual || "").body, null))) {
    if (!r[2] || !r[1] || /음력/.test(r.join(" "))) continue;
    const md = r[1].match(/(\d{1,2})\s*[\/.\-월]\s*(\d{1,2})/);
    const m = md ? +md[1] - 1 : (r[0].match(/(\d{1,2})/) || [])[1] - 1;
    const d = md ? +md[2] : +(r[1].match(/(\d{1,2})/) || [])[1];
    if (m >= 0 && d) annual.push({ who: "가족", m, d, title: r[2] });
  }
  for (const y of [year - 1, year, year + 1]) {
    for (const a of [...annual, ...birthdays]) {
      const dt = new Date(y, a.m, a.d);
      if (dt.getMonth() === a.m) events.push({ date: ymd(dt), time: "종일", title: a.title, who: a.who, yearly: true });
    }
  }

  /* 4-3. 장보기·할 일 */
  const td = splitFrontmatter(files.todo || "").body;
  const shopping = parseItems(sectionLines(td, "장보기"));
  const todos = parseItems(sectionLines(td, "할 일"));
  const supplies = parseItems(sectionLines(td, "준비물"));   // '- [ ] 실내화 ~11/14 (첫째)' — 그날의 준비물

  /* 4-4. 다음 여행 */
  const tp = splitFrontmatter(files.trip || "");
  const groups = [];
  let cur = null;
  for (const l of tp.body.split("\n")) {
    if (/^##\s/.test(l)) { cur = { title: l.replace(/^#+\s*/, ""), items: [] }; groups.push(cur); continue; }
    if (cur) cur.items.push(...parseItems([l]));
  }
  const trip = {
    title: tp.meta["여행"] || tp.meta["장소"] || tp.meta["title"] || "",
    start: parseYMD(tp.meta["출발"]),
    named: !!(tp.meta["여행"] || tp.meta["장소"]),   // 여행 이름을 따로 적었는지 (+ 창에서 물어볼지)
    groups: groups.filter((g) => g.items.length),
  };
  /* 4-5. 하루 일과: "## 아빠 · 평일" 아래 표 | 시간 | 무엇 | 한마디 | 장면 | */
  const routines = {};
  const secs = {};
  let rk = null;
  for (const l of splitFrontmatter(files.routine || "").body.split("\n")) {
    const h = l.match(/^##\s+(.+?)\s*[·\-\/]\s*(평일|주말|매일)\s*$/);
    if (h) { rk = h[1].trim() + "|" + h[2]; secs[rk] = []; continue; }
    if (/^#{1,2}\s/.test(l)) { rk = null; continue; }
    if (rk) secs[rk].push(l);
  }
  for (const [k, lines] of Object.entries(secs)) {
    const [who, kind] = k.split("|");
    const list = parseTable(lines).map((c) => {
      const t = (c[0] || "").match(/(\d{1,2}):(\d{2})/);
      return t && c[1] ? { min: +t[1] * 60 + +t[2], text: c[1], sub: c[2] || "", scene: (c[3] || "").trim() } : null;
    }).filter(Boolean).sort((a, b) => a.min - b.min);
    if (list.length) (routines[who] ||= {})[kind] = list;
  }
  /* 4-5. 포켓몬 기록: 아이들/포켓몬 기록.md 표 한 줄 = 루틴 1개 완료 */
  const pokeCounts = {};
  const pokeRows = {};
  for (const r of parseTable(sectionLines(splitFrontmatter(files.pokeLog || "").body, null))) {
    if (r[1]) {
      pokeCounts[r[1]] = (pokeCounts[r[1]] || 0) + 1;
      (pokeRows[r[1]] ||= []).push({ date: r[0] || "", routine: r[2] || "" });
    }
  }
  /* 4-5-1. 포켓몬 알: 아이들/포켓몬 알.md 표 | 날짜 | 아이 | 몇 번째 | 도감번호 |
     pokeState()가 이 기록으로 "몇 번째 포켓몬은 무엇"을 정한다(전역 pokePicks) */
  const picks = {}, fpicks = {};
  for (const r of parseTable(sectionLines(splitFrontmatter(files.pokeEggs || "").body, null))) {
    const n = parseInt(r[2], 10), dex = parseInt(r[3], 10);
    if (!(r[1] && n > 0 && dex > 0) || (picks[r[1]] || {})[n] || (fpicks[r[1]] || {})[n]) continue;   // 같은 순서가 두 줄이면 먼저 적힌 것
    if ((r[4] || "").trim() === "친구") (fpicks[r[1]] ||= {})[n] = dex;   // 비고 '친구' = 데려온 친구를 알 대신 진화시킴(10-4)
    else (picks[r[1]] ||= {})[n] = dex;
  }
  pokePicks = picks; pokeFriendPicks = fpicks;
  /* 4-6. 아이들 루틴: "## 아침" / "## 저녁" 아래 | 루틴 | 시간 | (세 아이 공통) */
  const kidRoutines = [];
  const rb = splitFrontmatter(files.kidRoutine || "").body;
  for (const sec of ["아침", "점심", "오후", "저녁", "주말"]) {
    for (const c of parseTable(sectionLines(rb, sec))) {
      if (c[0]) kidRoutines.push({ part: sec, name: c[0], when: c[1] || "", weekdayOnly: /평일/.test(c[1] || ""), weekendOnly: !/평일/.test(c[1] || "") && /주말|빨간/.test(c[1] || "") });   // 시간 칸 "(주말·빨간 날만)" = 쉬는 날에만
    }
  }
  /* 4-6-1. 쿠폰: 아이들/쿠폰.md 표 | 받은 날 | 아이 | 쿠폰 | 까닭 | 쓴 날 | — 쓴 날이 비어 있으면 아직 안 쓴 쿠폰 */
  const coupons = parseTable(sectionLines(splitFrontmatter(files.coupon || "").body, null))
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0] || "") && c[1] && c[2])
    .map((c) => ({ got: c[0], kid: c[1], name: c[2], why: c[3] || "", used: c[4] || "" }));
  /* 4-6-2. 응원: 일정/응원.md 표 | 날짜 | 받는 아이(이름·모두) | 보낸 사람 | 한마디 | */
  const cheers = parseTable(sectionLines(splitFrontmatter(files.cheer || "").body, null))
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0] || "") && c[1] && c[2] && c[3])
    .map((c) => ({ date: c[0], to: c[1], from: c[2], text: c[3] }));
  /* 4-5-2. 동산 장부: 아이들/동산 장부.md | 날짜 | 아이 | 들고남(+/-) | 도감번호 | 이름 | 까닭 | — pokeState()가 동산에 더하고 뺀다 */
  const ledger = {};
  for (const c of parseTable(sectionLines(splitFrontmatter(files.ledger || "").body, null))) {
    const dex = parseInt(c[3], 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0] || "") || !c[1] || !(dex > 0) || !/^[+-]/.test(c[2] || "")) continue;
    (ledger[c[1]] ||= []).push({ date: c[0], sign: c[2].startsWith("-") ? -1 : 1, dex, name: c[4] || `#${dex}`, why: c[5] || "" });
  }
  gardenLedger = ledger;
  /* 4-6-4. 영어 단어장: 아이들/영어 단어.md ## 단어 | 그림 | 단어 | 뜻 | */
  const words = parseTable(sectionLines(splitFrontmatter(files.words || "").body, "단어"))
    .filter((c) => c[0] && c[1]).map((c) => ({ emoji: c[0], word: c[1], mean: c[2] || "" }));
  /* 4-6-3. 성장 기록: 아이들/성장 기록.md 표 | 날짜 | 아이 | 키(cm) | 몸무게(kg) | — 아이별로 날짜순 */
  const growth = {};
  for (const c of parseTable(sectionLines(splitFrontmatter(files.growth || "").body, null))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0] || "") || !c[1]) continue;
    const h = parseFloat(c[2]), w = parseFloat(c[3]);
    (growth[c[1]] ||= []).push({ date: c[0], height: Number.isFinite(h) ? h : null, weight: Number.isFinite(w) ? w : null });
  }
  for (const k of Object.keys(growth)) growth[k].sort((a, b) => a.date.localeCompare(b.date));
  /* 4-7. 아빠 포켓몬 동료: 아빠/포켓몬-동료.json (서버가 토큰 사용량으로 키우는 동료 — serve.py dad_tick)
     없거나 형식이 다르면 null → 미니 카드는 안내만 보여 준다 (가짜 포켓몬 없음) */
  let dadCompanion = null;
  try {
    const dc = JSON.parse(files.dadCompanion || "");
    if (dc && typeof dc === "object" && dc.version === 1) dadCompanion = dc;
  } catch { dadCompanion = null; }
  /* 4-7-1. 토큰 사용량: 아빠/토큰-사용량.json (서버 usage_fetch가 3분마다 갱신)
     없거나 형식이 다르면 null → 사용량 보기는 안내만 보여 준다 */
  let usage = null;
  try {
    const u = JSON.parse(files.usage || "");
    if (u && typeof u === "object" && u.version === 1) usage = u;
  } catch { usage = null; }
  /* 11-2. 회의 아이디어: 가족회의/아이디어.md — 이번 주 주제 하나 + 의견(- 이름: 내용) + 아이디어 목록 + 지난 주제 */
  const ib = splitFrontmatter(files.ideas || "").body;
  const items = (s) => sectionLines(ib, s).filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, "").trim());
  const topicRaw = items("이번 주 주제")[0] || "";
  const tm = topicRaw.match(/^(.*?)(?:\s*\(([^()]+)\))?(?:\s*·\s*(\d{4}-\d{2}-\d{2}))?$/);
  const ideas = {
    topic: topicRaw ? { raw: topicRaw, text: tm[1].trim(), by: tm[2] || "", date: tm[3] || "" } : null,
    opinions: items("이번 주 의견").map((raw) => { const m = raw.match(/^([^:：]{1,10})[:：]\s*(.*)$/); return { raw, who: m ? m[1].trim() : "", text: m ? m[2] : raw }; }),
    list: items("아이디어").map((raw) => { const m = raw.match(/^(.*?)(?:\s*\(([^()]+)\))?(?:\s*·\s*(\d{4}-\d{2}-\d{2}))?$/); return { raw, text: m[1].trim(), by: m[2] || "", date: m[3] || "" }; }),
    past: items("지난 주제"),
  };
  /* 14-4. 토큰 + 모자 상점: 아이들/토큰.md (잔액 = 변화 합계) · 아이들/모자.md (가진 모자·쓰는 모자) */
  const tokens = {};
  for (const r of parseTable(sectionLines(splitFrontmatter(files.token || "").body, "토큰 장부"))) { const v = parseInt(r[2], 10); if (r[1] && !isNaN(v)) tokens[r[1]] = (tokens[r[1]] || 0) + v; }
  /* 14-9. 🏦 은행: 아이들/은행.md ## 예금 | 날짜 | 아이 | 원금 | 기간 | 일금리 | 만기일 | 상태 | (id = 표 줄 번호, 1부터) */
  const bank = parseTable(sectionLines(splitFrontmatter(files.bank || "").body, "예금")).map((r, i) => ({ id: i + 1, date: r[0], kid: r[1], principal: +r[2] || 0, term: +r[3] || 0, rate: parseInt(r[4], 10) || 0, maturity: r[5], status: r[6] || "" })).filter((d) => d.kid && d.principal > 0);
  /* 14-6. 🛍️ 상점: 아이들/원피스.md · 아이들/신발.md · 아이들/패딩.md · 아이들/코디.md */
  const shoesOwned = {};
  for (const r of parseTable(sectionLines(splitFrontmatter(files.shoes || "").body, "가진 신발"))) { if (r[0] && +r[1] >= 1) (shoesOwned[r[0]] ||= []).push(+r[1]); }
  /* 14-7. 🛍️ 상점 남자 코디: 가진 코디(산 것) + 코디 1~3은 무료라서 언제나 가진 것 */
  const outfitsOwned = {};
  for (const r of parseTable(sectionLines(splitFrontmatter(files.boughtOutfit || "").body, "가진 코디"))) { if (r[0] && +r[1] >= 1) (outfitsOwned[r[0]] ||= []).push(+r[1]); }
  for (const k of kids.map((x) => x.name)) { if (!kidIsGirl(k)) outfitsOwned[k] = [...new Set([1, 2, 3, ...(outfitsOwned[k] || [])])]; }
  // 원피스: 쓰는 원피스(쓰는 원피스 칸, 옛 형식이면 표 전체) + 가진 원피스(가진 원피스 칸, 옛 형식이면 1번 무료 + 입고 있던 것)
  const dressBody = splitFrontmatter(files.dress || "").body;
  const dressWornRows = parseTable(sectionLines(dressBody, "쓰는 원피스"));
  const dresses = Object.fromEntries((dressWornRows.length ? dressWornRows : parseTable(sectionLines(dressBody, null))).filter((r) => r[0] && +r[1] >= 1).map((r) => [r[0], +r[1]]));
  const dressesOwned = {};
  const dressOwnedRows = parseTable(sectionLines(dressBody, "가진 원피스"));
  if (dressOwnedRows.length) { for (const r of dressOwnedRows) { if (r[0] && +r[1] >= 1) (dressesOwned[r[0]] ||= []).push(+r[1]); } }
  else { for (const [k, n] of Object.entries(dresses)) dressesOwned[k] = [1, n].filter((v, i, a) => a.indexOf(v) === i); }
  for (const k of Object.keys(dressesOwned)) if (!dressesOwned[k].includes(1)) dressesOwned[k].push(1);   // 1번(분홍)은 무료라서 언제나 가진 것
  return { kids, events, shopping, todos, supplies, trip, routines, pokeCounts, pokeRows, kidRoutines, coupons, cheers, growth, words, lunarTitles, dadCompanion, usage, ideas, tokens, bank,
    outfits: Object.fromEntries(parseTable(sectionLines(splitFrontmatter(files.outfit || "").body, null)).filter((r) => r[0] && +r[1] >= 1).map((r) => [r[0], +r[1]])),
    hairs: Object.fromEntries(parseTable(sectionLines(splitFrontmatter(files.hair || "").body, null)).filter((r) => r[0] && +r[1] >= 1).map((r) => [r[0], +r[1]])),
    tops: Object.fromEntries(parseTable(sectionLines(splitFrontmatter(files.top || "").body, null)).filter((r) => r[0] && +r[1] >= 1).map((r) => [r[0], +r[1]])),
    bottoms: Object.fromEntries(parseTable(sectionLines(splitFrontmatter(files.bottom || "").body, null)).filter((r) => r[0] && +r[1] >= 1).map((r) => [r[0], +r[1]])),
    dresses,
    dressesOwned,
    outfitsOwned,
    shoesOwned,
    shoesWorn: Object.fromEntries(parseTable(sectionLines(splitFrontmatter(files.shoes || "").body, "쓰는 신발")).filter((r) => r[0] && +r[1] >= 1).map((r) => [r[0], +r[1]])),
    paddingOwned: Object.fromEntries(parseTable(sectionLines(splitFrontmatter(files.padding || "").body, "가진 패딩")).filter((r) => r[0] && +r[1] === 1).map((r) => [r[0], true])),
    paddingWorn: Object.fromEntries(parseTable(sectionLines(splitFrontmatter(files.padding || "").body, "쓰는 패딩")).filter((r) => r[0] && +r[1] === 1).map((r) => [r[0], true])) };
}

