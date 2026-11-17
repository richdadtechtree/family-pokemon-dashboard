/* 가족 대시보드 — 0. 설정·로그인 확인·아이 색·주소 옵션(?demo, ?lat)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* 로그인이 풀리면(1년이 지났거나 비밀번호를 바꿨을 때) 로그인 화면으로 */
{
  const _fetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await _fetch(...args);
    const url = new URL(typeof args[0] === "string" ? args[0] : args[0].url, location.href);
    if (res.status === 401 && url.origin === location.origin) {
      location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search + location.hash);
    }
    return res;
  };
}
/* ════════════════════════════════════════════════════════════════
   0. 설정 — 필요하면 여기만 고치면 된다
   ════════════════════════════════════════════════════════════════ */
const CONFIG = {
  title: "포켓몬\n루틴 대시보드",
  // 날씨 위치 (기본: 서울). 주소 뒤에 ?lat=37.4&lon=127.1 처럼 붙여도 바뀐다.
  location: { name: "서울", lat: 37.5665, lon: 126.9780 },
  wikiRoot: "../",                 // 위키 문서가 있는 곳 (dashboard 폴더의 한 칸 위)
  wikiRefreshMin: 2,               // 위키 다시 읽는 간격(분)
  weatherRefreshMin: 20,           // 날씨 다시 받는 간격(분)
  indicesRefreshMin: 5,            // 지수(ATH 대비 하락률) 다시 받는 간격(분) — 서버도 5분에 한 번만 네이버에 묻는다
  calendarWeeks: 3,                // 달력에 보일 주 수 (이번 주부터). ◀ ▶ 를 누르면 이만큼씩 넘어간다
  calendarAheadWeeks: 26,          // ▶ 로 미리 볼 수 있는 기간(주) — 약 6개월
  calendarResetSec: 90,            // 넘겨 둔 달력이 이번 주로 저절로 돌아오는 시간(초)
  calendarPerDay: 3,               // 달력 한 칸에 보일 일정 수 (넘치면 '+N개 더', 칸을 누르면 전체)
  upcomingMax: 5,                  // '다가오는 날' 칸에 보일 최대 개수 (같은 날 생일은 한 줄로 합쳐 1개)
  // 사람별 색. 목록에 없는 이름은 아래 palette에서 차례로 고른다.
  colors: { "아빠": "#3e7bd6", "엄마": "#2f9a4a", "가족": "#8a5cd6", "공통": "#8a5cd6" },
  palette: ["#e5487f", "#f08c2e", "#16a3a8", "#c2a01c", "#7a6ad8"],
  sound: true,                     // 레벨업·부화·진화 효과음 (끄려면 false)
  soundVolume: 0.7,                // 효과음 크기 0~1
};

/* 🛍️ 상점 — 옷 이름·가격. 성별(boy/girl)로 나눈다 (아이 이름이 아니라 설정으로 동작).
   원피스(여자 아이만) 4색: 1번 분홍만 무료, 2~4번은 5토큰. 신발 5토큰(여자 아이 빨간 운동화·검정 구두, 남자 아이 파란 운동화·노란 운동화),
   검정 패딩(남자·여자 다) 6토큰. 남자 코디 4번 농구 유니폼·5번 공룡 후드티 5토큰. shopTest = true 동안은 전부 무료. */
const SHOP = {
  outfitNames: { boy: ["기본 옷", "LG 트윈스", "축구 유니폼", "농구 유니폼", "공룡 후드티"], girl: ["기본 옷", "연보라 원피스", "티+치마"] },
  hairNames: { girl: ["단발", "똥머리"] },   // 머리는 여자 아이만 따로 고른다
  topNames: { girl: ["분홍 가디건", "흰 하트 티", "노란 줄무늬 티"] },      // 👗 상의 (여자 아이만, 모두 무료)
  bottomNames: { girl: ["연보라 치마", "분홍 치마", "파란 데님 반바지"] }, // 👗 하의 (여자 아이만, 모두 무료)
  dressNames: { girl: ["분홍 원피스", "노랑 원피스", "파랑 원피스", "초록 원피스"] },
  dressPrice: 5,
  dressFree: 1,
  shoeNames: { boy: ["파란 운동화", "노란 운동화"], girl: ["빨간 운동화", "검정 구두"] },
  shoePrice: 5,
  outfitPrice: 5,
  paddingPrice: 6,
  shopTest: false,
};

/* 아이 목록(기본 2명) — 이름·성별을 여기에서 바꾼다. 아이를 더 늘리거나 줄이려면
   가족 구성원.md 의 ## 아이 표와 여기를 함께 고친다. 자세한 건 README '아이 수·이름·성별 바꾸기'. */
const KID_PROFILES = [
  { name: "첫째", gender: "boy" },
  { name: "둘째", gender: "girl" },
];
const kidGender = (name) => (KID_PROFILES.find((x) => x.name === name) || {}).gender || "boy";
const kidIsGirl = (name) => kidGender(name) === "girl";

/* 아이 펫 색 (아이 순서). B=몸, L=배, D=보석, P=볼, G=날개 */
const KID_SKINS = [
  { B: "#ff9ec4", L: "#ffe3ee", D: "#d9346e", P: "#ff6f9f", G: "#fff2a8", bar: "#ff6f9f" },
  { B: "#7cc8ff", L: "#dcf1ff", D: "#2a73c9", P: "#ff8fb1", G: "#fff2a8", bar: "#3e9be6" },
  { B: "#ffc75a", L: "#fff1c9", D: "#d97a12", P: "#ff8f8f", G: "#d6f0ff", bar: "#f0a020" },
];

const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");
if (params.get("lat") && params.get("lon")) {
  CONFIG.location = { name: params.get("place") || "설정 위치", lat: +params.get("lat"), lon: +params.get("lon") };
}

