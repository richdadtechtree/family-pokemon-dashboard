/* 가족 대시보드 — 4-3. 날씨 효과: 비 → 빗줄기, 눈 → 눈송이, 흐림·안개 → 구름 그림자, 천둥 → 빗줄기 + 가끔 번쩍
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 지금 날씨(Open-Meteo 날씨 코드, weather.js renderWeather)에 맞춰 화면 전체에 옅게 겹친다. 누르는 데 방해되지 않게 클릭은 통과.
   - body 에 wx-rain / wx-snow / wx-cloud / wx-thunder 클래스도 붙여서 동산 배경(4-4) 등이 날씨를 따라갈 수 있게 한다.
   - 미리 보기: 주소 끝에 ?weather=rain (snow · cloud · thunder · clear) */
"use strict";
let WEATHER_MODE = "clear";
// 날씨 코드 → 효과 종류
function wxMode(code) {
  if (code >= 95) return "thunder";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  return "clear";
}
let wxFlashTimer = 0, wxApplied = false;
// 동산을 다시 그리고 지금 보던 화면(어느 아이 동산인지)도 다시 맞춘다
function wxRedrawGarden() {
  if (!lastData || typeof renderGarden !== "function") return;
  renderGarden(lastData);
  applyView(lastData);
}
function applyWeatherFx(code) {
  const forced = params.get("weather");
  const mode = ["rain", "snow", "cloud", "thunder", "clear"].includes(forced) ? forced : wxMode(code);
  if (mode === WEATHER_MODE && wxApplied) return;                  // 날씨가 그대로면 아무것도 안 한다
  WEATHER_MODE = mode; wxApplied = true;
  document.body.classList.remove("wx-rain", "wx-snow", "wx-cloud", "wx-thunder");
  document.getElementById("wxFx")?.remove();
  clearTimeout(wxFlashTimer);
  if (mode === "clear") { wxRedrawGarden(); return; }
  document.body.classList.add(`wx-${mode}`);
  const fx = document.createElement("div");
  fx.id = "wxFx";
  fx.setAttribute("aria-hidden", "true");
  const calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (mode === "snow") {                     // 눈송이 — 크기·속도·출발 위치를 제각각
    const n = calm ? 8 : 16;                 // 느낌만 나게 적게
    fx.innerHTML = Array.from({ length: n }, () => {
      const s = 3 + Math.random() * 5;
      return `<i class="flake" style="left:${Math.random() * 100}%;width:${s}px;height:${s}px;animation-duration:${7 + Math.random() * 8}s,${2 + Math.random() * 2}s;animation-delay:-${Math.random() * 12}s,-${Math.random() * 2}s"></i>`;
    }).join("");
  } else if (mode === "cloud") {             // 구름 그림자 — 커다란 흐릿한 그림자 셋이 천천히 지나간다
    fx.innerHTML = [0, 1, 2].map((i) => `<i class="shade" style="top:${10 + i * 28}%;animation-duration:${50 + i * 15}s;animation-delay:-${i * 18}s"></i>`).join("");
  } else {                                   // 비·천둥: 빗줄기 두 겹(앞은 빠르고 진하게, 뒤는 느리고 옅게)
    fx.innerHTML = `<i class="rain far"></i><i class="rain near"></i>${mode === "thunder" ? `<i class="flash"></i>` : ""}`;
  }
  document.body.appendChild(fx);
  if (mode === "thunder") {                  // 8~20초마다 한 번씩 번쩍(가끔 두 번)
    const flash = () => {
      const f = fx.querySelector(".flash");
      if (!f || !document.body.contains(fx)) return;
      f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
      if (Math.random() < 0.4) setTimeout(() => { f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }, 260);
      wxFlashTimer = setTimeout(flash, 8000 + Math.random() * 12000);
    };
    wxFlashTimer = setTimeout(flash, 1500);
  }
  wxRedrawGarden();                                               // 동산 배경도 날씨에 맞춰 다시
}
