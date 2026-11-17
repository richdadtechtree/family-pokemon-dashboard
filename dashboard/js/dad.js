/* 아빠의 포켓몬 도감(아빠는 현재 동료 포함). 아이들 보상에는 합산하지 않는다.
   아빠 = data.dadCompanion(서버가 토큰 사용량으로 키움, serve.py dad_tick). */
"use strict";
function dadDexOf(data, who = "아빠") {
  const d = (who === "아빠" ? data.dadCompanion : data.momCompanion) || {};
  const names = new Map(DEX_ALL);
  const met = new Map();
  const add = p => {
    if (!p || !Number.isInteger(p.dex) || p.dex <= 0 || p.dex > 1025 || !p.ko) return;
    names.set(p.dex, names.get(p.dex) || p.ko);
    met.set(p.dex, { ...p, shiny: !!p.shiny || !!met.get(p.dex)?.shiny });
  };
  (Array.isArray(d.pokedex) ? d.pokedex : []).forEach(add);
  (Array.isArray(d.met) ? d.met : []).forEach(add);
  // An egg (dex:null) never unlocks a species.
  add(d.companion);
  return { met, all: [...names].sort((a, b) => a[0] - b[0]), graduated: Array.isArray(d.pokedex) ? d.pokedex.length : 0 };
}
function openDadDex(who = "아빠") {
  if (!lastData) return;
  // 아빠 도감은 대시보드 아빠 줄에서 누구나 연다(알 속은 원래 안 보임).
  document.querySelector(".sheet-bg.dad-dex")?.remove();
  const d = dadDexOf(lastData, who);
  const bg = document.createElement("div");
  bg.className = "sheet-bg dex dad-dex";
  bg.setAttribute("role", "dialog");
  bg.setAttribute("aria-modal", "true");
  bg.setAttribute("aria-label", `${who} 포켓몬 도감`);
  bg.innerHTML = `<div class="sheet"><h2>📖 ${who} 포켓몬 도감 <small>${d.met.size} / ${d.all.length}종</small>
    <button type="button" class="dex-close">닫기</button></h2><div class="dex-grid">${d.all.map(([dex, name]) => {
      const p = d.met.get(dex);
      return p ? `<div class="dex-cell met"><img loading="lazy" src="${DAD_SPRITE(dex, p.shiny)}" alt="${escapeHtml(name)}"><span>${escapeHtml(name)}${p.shiny ? " ✨" : ""}</span></div>`
        : `<div class="dex-cell"><img loading="lazy" class="silhouette" src="${POKE_SPRITE(dex)}" alt="미발견"><span>?</span></div>`;
    }).join("")}</div></div>`;
  const trigger = document.activeElement;
  const close = () => { bg.remove(); document.removeEventListener("keydown", key); trigger?.focus(); };
  const key = ev => { if (ev.key === "Escape") close(); };
  bg.addEventListener("click", ev => { if (ev.target === bg || ev.target.closest(".dex-close")) close(); });
  document.addEventListener("keydown", key);
  document.body.appendChild(bg);
  bg.querySelector(".dex-close").focus();
}
document.addEventListener("click", ev => { const b = ev.target.closest("[data-dad-dex]"); if (b) openDadDex(b.dataset.dadDex || "아빠"); });
