/* 가족 대시보드 — 집 풍경 · 날씨·미세먼지
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* 하루 일과가 비어 있을 때: 시간대별 우리 집 풍경 */
function renderHome(withHint) {
  $("home").className = "card home dark";
  const h = new Date().getHours();
  const P = h < 6 ? ["#0f1530", "모두 꿈나라", "푹 자고 내일 만나요", "moon"]
    : h < 9 ? ["#ffb88a", "좋은 아침이에요", "아침 먹고 힘내요", "sun"]
    : h < 12 ? ["#8fd0ff", "즐거운 오전", "오늘도 신나게", "sun"]
    : h < 14 ? ["#8fd0ff", "점심 시간", "맛있게 먹어요", "sun"]
    : h < 18 ? ["#9fd8ff", "오후 시간", "간식 먹을 시간?", "sun"]
    : h < 21 ? ["#ff9a7a", "저녁 시간", "오늘 하루 어땠나요?", "sun"]
    : ["#1b2347", "잘 준비할 시간", "양치하고 꿈나라로", "moon"];
  const night = P[3] === "moon";
  const win = night ? "#ffd43b" : "#bfe6ff";
  // 32×24 격자 위에 집·해(달)·땅을 사각형으로 그린 SVG
  const svg = `<svg viewBox="0 0 32 24" shape-rendering="crispEdges">
    <rect width="32" height="24" fill="${P[0]}"/>
    ${night ? `<rect x="3" y="3" width="1" height="1" fill="#fff"/><rect x="9" y="6" width="1" height="1" fill="#fff"/><rect x="28" y="9" width="1" height="1" fill="#fff"/><rect x="14" y="2" width="1" height="1" fill="#fff"/>
      <rect x="24" y="2" width="4" height="4" fill="#ffe8a3"/><rect x="26" y="2" width="2" height="2" fill="${P[0]}"/>`
      : `<rect x="24" y="2" width="5" height="5" fill="#ffd43b"/><rect x="25" y="1" width="3" height="7" fill="#ffd43b"/><rect x="23" y="3" width="7" height="3" fill="#ffd43b"/>`}
    <rect y="19" width="32" height="5" fill="${night ? "#2f6b3a" : "#7ccf5a"}"/>
    <rect y="19" width="32" height="1" fill="${night ? "#3d8248" : "#9be07a"}"/>
    <rect x="9" y="11" width="14" height="8" fill="${night ? "#c9b48f" : "#f4e1bd"}"/>
    <rect x="8" y="10" width="16" height="1" fill="#c0392b"/><rect x="9" y="9" width="14" height="1" fill="#d9483b"/>
    <rect x="10" y="8" width="12" height="1" fill="#d9483b"/><rect x="11" y="7" width="10" height="1" fill="#e5584a"/>
    <rect x="12" y="6" width="8" height="1" fill="#e5584a"/><rect x="13" y="5" width="6" height="1" fill="#ef6b5c"/>
    <rect x="11" y="12" width="3" height="3" fill="${win}"/><rect x="18" y="12" width="3" height="3" fill="${win}"/>
    <rect x="15" y="14" width="2" height="5" fill="#8a5a3b"/>
    <rect x="4" y="15" width="3" height="4" fill="#3f9a4f"/><rect x="5" y="19" width="1" height="1" fill="#6b4a2f"/>
    <rect x="26" y="16" width="2" height="3" fill="#3f9a4f"/>
  </svg>`;
  $("home").innerHTML = `<h2>▌우리 집 지금</h2>${svg}<div class="msg">${night ? "🌙 " : ""}${P[1]}<small>${withHint ? "하루 일과를 적으면 아빠·엄마가 지금 뭐 하는지 보여요" : P[2]}</small></div>`;
}

/* 6-8. 날씨·미세먼지 (Open-Meteo: 무료, 가입·키 필요 없음) */
// 하늘 상태 코드(WMO) → 한국어 + 아이콘
function wmo(code) {
  if (code === 0) return ["맑음", "sun"];
  if (code === 1) return ["대체로 맑음", "sun"];
  if (code === 2) return ["구름 조금", "partly"];
  if (code === 3) return ["흐림", "cloud"];
  if (code === 45 || code === 48) return ["안개", "cloud"];
  if (code >= 51 && code <= 57) return ["이슬비", "rain"];
  if (code >= 61 && code <= 67) return ["비", "rain"];
  if (code >= 71 && code <= 77) return ["눈", "snow"];
  if (code >= 80 && code <= 82) return ["소나기", "rain"];
  if (code === 85 || code === 86) return ["눈 소나기", "snow"];
  if (code >= 95) return ["뇌우", "rain"];
  return ["확인 필요", "cloud"];
}
// 환경부 미세먼지 예보 등급 기준 (PM10 / PM2.5, ㎍/㎥)
function dustGrade(pm10, pm25) {
  const g10 = pm10 == null ? -1 : pm10 <= 30 ? 0 : pm10 <= 80 ? 1 : pm10 <= 150 ? 2 : 3;
  const g25 = pm25 == null ? -1 : pm25 <= 15 ? 0 : pm25 <= 35 ? 1 : pm25 <= 75 ? 2 : 3;
  const g = Math.max(g10, g25);   // 둘 중 나쁜 쪽을 보여 준다
  return [["확인 필요", "g-none"], ["좋음", "g-good"], ["보통", "g-normal"], ["나쁨", "g-bad"], ["매우나쁨", "g-worst"]][g + 1];
}
async function loadWeather() {
  const { lat, lon } = CONFIG.location;
  const base = `latitude=${lat}&longitude=${lon}&timezone=Asia%2FSeoul`;
  const [wx, aq] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${base}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,precipitation_probability,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=2`).then((r) => r.ok ? r.json() : Promise.reject(r.status)),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${base}&current=pm10,pm2_5`).then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);
  return { wx, aq };
}
function renderWeather(w, isSample) {
  const el = $("weather");
  if (!w) { window.__wxCode = null; el.innerHTML = `<div class="empty" style="grid-column:1/-1">날씨 정보를 못 받아 왔어요. 인터넷 연결을 확인해 주세요. (잠시 뒤 자동으로 다시 시도해요)</div>`; applyWeatherFx(0); return; }
  const c = w.wx.current, daily = w.wx.daily, hr = w.wx.hourly;
  window.__wxCode = c.weather_code;   // '아빠는 지금' 비 오는 날 테니스→헬스 판정용 (board.js isRainingNow)
  applyWeatherFx(c.weather_code);                                   // 4-3. 화면 전체 날씨 효과 (js/wxfx.js)
  const [desc, iconKey] = wmo(c.weather_code);
  const icon = c.is_day === 0 && (iconKey === "sun" || iconKey === "partly") ? "moon" : iconKey;
  const pm10 = w.aq?.current?.pm10, pm25 = w.aq?.current?.pm2_5;
  const [grade, gcls] = dustGrade(pm10, pm25);
  // 다음 4개 시간대: 지금부터 1시간 뒤, 이후 4시간 간격
  const nowKey = c.time.slice(0, 13);
  let idx = hr.time.findIndex((t) => t.slice(0, 13) === nowKey);
  if (idx < 0) idx = 0;
  const slots = [1, 5, 9, 13].map((o) => idx + o).filter((i) => i < hr.time.length);
  const max = Math.round(daily.temperature_2m_max[0]), min = Math.round(daily.temperature_2m_min[0]);
  const rain = daily.precipitation_probability_max?.[0] ?? 0;
  // 한마디: 비 > 미세먼지 > 더위·추위 > 보통 순으로 골라 말한다
  const tip = rain >= 60 ? ["우산", "오늘 비 올 확률이 높아요. 우산 챙기세요"]
    : gcls === "g-bad" || gcls === "g-worst" ? ["마스크", "미세먼지가 나빠요. 바깥 놀이는 짧게"]
    : max >= 30 ? ["더위", "더워요. 물 자주 마시기"]
    : min <= 0 ? ["추위", "영하예요. 장갑·목도리 챙기기"]
    : ["나갈 때", "나들이하기 좋은 날씨예요"];
  el.innerHTML = `
    <div class="dust ${gcls}" title="PM10 ${pm10 ?? "-"} · PM2.5 ${pm25 ?? "-"} ㎍/㎥">미세먼지<div class="grade">${grade}</div></div>
    <div class="now-icon"><canvas id="wxIcon"></canvas></div>
    <div class="now-text"><div class="temp">${Math.round(c.temperature_2m)}°</div><div class="desc">${desc}</div>
      <div class="minmax">최고 ${max}° · 최저 ${min}° · ${escapeHtml(CONFIG.location.name)}</div></div>
    <div class="hourly">${slots.map((i, n) => `<div class="slot">${+hr.time[i].slice(11, 13)}시<canvas id="hrIcon${n}"></canvas>
      <div class="t">${Math.round(hr.temperature_2m[i])}°</div><div class="p">비 ${hr.precipitation_probability[i] ?? 0}%</div></div>`).join("")}</div>
    <div class="tip"><b>${tip[0]}</b>${tip[1]}${isSample ? ' <span class="badge-demo">예시 날씨</span>' : ""}</div>`;
  drawPixels($("wxIcon"), ICON[icon], {}, 5);
  slots.forEach((i, n) => {
    const k = wmo(hr.weather_code[i])[1];
    drawPixels($(`hrIcon${n}`), ICON[hr.is_day[i] === 0 && (k === "sun" || k === "partly") ? "moon" : k], {}, 2);
  });
}

