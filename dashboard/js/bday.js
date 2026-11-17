/* 가족 대시보드 — 5. 생일: 생일 대시보드(5-1) · 생일 노래(5-2)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 오늘 생일인 아이(가족 구성원.md 아이 표의 양력 생일): 그 아이 색 하늘·가랜드·풍선, 큰 배너, 그 아이 포켓몬들이 줄지어 축하.
     그 아이 화면은 "○○야 생일 축하해!", 형제 화면은 "오늘은 ○○ 생일! 축하해 주세요".
   - 생일 아이가 그날 첫 루틴을 누르면 축하 화면 뒤에 🎂 장면 + 생일 축하 멜로디(공개 곡, 브라우저가 직접 만든 소리). 이 기기에서 하루 한 번.
   - 미리 보기: 주소 끝에 ?birthday=첫째 (그 아이를 오늘 생일로 친다) */
"use strict";
function bdayKids(data, now = new Date()) {
  const force = params.get("birthday");
  return (data.kids || []).filter((k) => (force && k.name === force)
    || (!force && k.birth && k.birth.getMonth() === now.getMonth() && k.birth.getDate() === now.getDate()));
}
const isBdayKid = (data, name) => bdayKids(data).some((k) => k.name === name);
// 생일 아이의 축하 행렬: 동산 포켓몬 모두 + 지금 키우는 포켓몬(알이면 알)
function bdayParade(k, data) {
  const st = pokeState(k.name, (data.pokeCounts || {})[k.name] || 0);
  const imgs = st.garden.map((g) => `<img src="${POKE_SPRITE(g.dex)}" alt="${escapeHtml(g.name)}">`);
  if (st.cur) imgs.push(`<img src="${POKE_SPRITE(st.cur[0])}" alt="${escapeHtml(st.cur[1])}">`);
  return imgs.length ? imgs.join("") : "";
}
function renderBirthday(data) {
  if (!data) return;
  const ks = bdayKids(data);
  document.body.classList.toggle("bday", ks.length > 0);
  let ban = document.getElementById("bdayBanner"), deco = document.getElementById("bdayDeco");
  if (!ks.length) { ban?.remove(); deco?.remove(); return; }
  document.documentElement.style.setProperty("--bday", ks[0].skin.bar);
  document.documentElement.style.setProperty("--bday-soft", ks[0].skin.L);
  const names = ks.map((k) => k.name);
  const v = currentView();
  const viewing = (v.kind === "garden" || v.kind === "todo") ? data.kids[v.idx] : null;
  const ya = (n) => n + (jong(n) ? "아" : "야");                  // 첫째야 / 둘째야
  let text;
  if (viewing && names.includes(viewing.name)) text = `🎂 ${ya(viewing.name)} 생일 축하해!`;
  else if (viewing) text = `🎉 오늘은 ${names.join("·")} 생일! 축하해 주세요`;
  else text = `🎂 ${names.map(ya).join(" · ")} 생일 축하해!`;
  const parade = (viewing && !names.includes(viewing.name)) ? "" : ks.map((k) => bdayParade(k, data)).join("");
  if (!ban) {
    ban = document.createElement("div");
    ban.id = "bdayBanner";
    const fit = $("fit"), wrap = fit.querySelector(".wrap");
    fit.insertBefore(ban, wrap);
  }
  ban.innerHTML = `<div class="bd-text">${escapeHtml(text)}</div>${parade ? `<div class="bd-parade">${parade}</div>` : ""}`;
  if (!deco) {                                                   // 가랜드(위) + 풍선(양옆에서 천천히 떠오름)
    deco = document.createElement("div");
    deco.id = "bdayDeco"; deco.setAttribute("aria-hidden", "true");
    const flags = Array.from({ length: 24 }, (_, i) => `<i style="--h:${(i * 47) % 360}"></i>`).join("");
    const balloons = Array.from({ length: 8 }, (_, i) => `<b style="left:${i < 4 ? 1 + i * 3 : 85 + (i - 4) * 3.5}%;animation-delay:-${i * 2.3}s;animation-duration:${11 + (i % 3) * 3}s">🎈</b>`).join("");
    deco.innerHTML = `<div class="bd-garland">${flags}</div>${balloons}`;
    document.body.appendChild(deco);
  }
}
// 5-2. 생일 노래 — 생일 아이의 그날 첫 루틴 때 한 번
const BDAY_KEY = "bdaySong";
function bdaySongDue(kidName) {
  if (!lastData || !isBdayKid(lastData, kidName)) return false;
  const key = `${ymd(new Date())}|${kidName}`;
  try {
    if (localStorage.getItem(BDAY_KEY) === key) return false;
    localStorage.setItem(BDAY_KEY, key);
  } catch (e) {
    if (bdaySongMem === key) return false;
    bdaySongMem = key;
  }
  return true;
}
let bdaySongMem = "";
