/* 가족 대시보드 — 10-4. 포켓몬 교환 (동산 포켓몬끼리)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 아이 동산 '🔄 교환': 내 포켓몬 → 형제 → 형제 포켓몬을 골라 '바꾸자!' (serve.py /api/trade propose)
   - 받는 아이 동산에 '○○가 바꾸자고 해요' → 좋아요 / 싫어요.  제안한 아이는 취소할 수 있다.
   - 엄마·아빠 메뉴 '🔄 교환 승인' → 승인하면 서버가 동산 장부에 네 줄(각자 -1 +1)을 적는다. 승인 전에는 안 바뀐다.
   - 대기 목록은 /api/trades (위키 밖 trades.json). 예시 화면은 이 화면 안에서만 흉내. */
"use strict";
let TRADES = [];
const demoTrades = [];
async function loadTrades() {
  if (DEMO) { TRADES = demoTrades; return; }
  try { const r = await fetch("/api/trades", { cache: "no-store" }); const j = await r.json(); if (j.ok) TRADES = j.trades; } catch (e) { /* 예전 serve.py */ }
}
async function tradeAct(body) {
  if (DEMO) {                                                   // 예시: 같은 규칙을 화면 안에서
    if (body.act === "propose") demoTrades.push({ id: String(Date.now()), date: ymd(new Date()), ...body, status: "제안" });
    else {
      const t = demoTrades.find((x) => x.id === body.id);
      const next = { like: "좋아요", no: "싫어요", cancel: "취소", approve: "승인", reject: "거절" }[body.act];
      if (t) {
        t.status = next;
        if (body.act === "approve") demoState.ledgerAdd2.push(t);
      }
    }
    return { ok: true };
  }
  return post("/api/trade", body);
}
const pending = (t) => t.status === "제안" || t.status === "좋아요";
let trDraft = null;                         // { a, a_dex, a_name, b, b_dex, b_name } 고르는 중
function tradeCardHtml(data, k) {
  const mine = pokeState(k.name, (data.pokeCounts || {})[k.name] || 0).garden;
  const sibs = data.kids.filter((x) => x.name !== k.name);
  const rows = TRADES.filter((t) => pending(t) && (t.a === k.name || t.b === k.name)).map((t) => {
    const from = t.a === k.name;
    const what = `${escapeHtml(t.a_name)} ↔ ${escapeHtml(t.b_name)}`;
    if (from) return `<div class="stk-row"><span>${escapeHtml(t.b)}에게 ${what} <small>${t.status === "좋아요" ? "엄마·아빠 승인 기다려요" : "좋아요 기다려요"}</small></span><button type="button" data-tr="cancel" data-id="${t.id}">취소</button></div>`;
    return `<div class="stk-row"><span><b>${escapeHtml(iga(t.a))}</b> 내 ${escapeHtml(t.b_name)}랑 ${escapeHtml(t.a_name)}를 바꾸자고 해요 <small>${t.status === "좋아요" ? "엄마·아빠 승인 기다려요" : ""}</small></span>
      ${t.status === "제안" ? `<button type="button" data-tr="like" data-id="${t.id}">좋아요</button><button type="button" data-tr="no" data-id="${t.id}">싫어요</button>` : ""}</div>`;
  }).join("");
  const can = mine.length && sibs.some((s) => pokeState(s.name, (data.pokeCounts || {})[s.name] || 0).garden.length);
  return `<div class="gc-card trade-card"><h3>🔄 ${escapeHtml(k.name)} 교환</h3>${rows || ""}
    ${can ? `<button type="button" class="weight-go" data-tr-open="${escapeHtml(k.name)}">🔄 바꾸자고 제안하기</button>`
      : `<div class="empty">${mine.length ? "형제 동산에 포켓몬이 생기면" : "동산에 포켓몬이 생기면"} 바꿀 수 있어요</div>`}</div>`;
}
// 고르기 창: 내 포켓몬 → 형제 → 형제 포켓몬
function openTrade(kidName) {
  trDraft = { a: kidName };
  drawTrade();
}
function drawTrade() {
  document.querySelector(".sheet-bg.trade")?.remove();
  if (!trDraft || !lastData) return;
  const d = trDraft, data = lastData;
  const gardenOf = (n) => pokeState(n, (data.pokeCounts || {})[n] || 0).garden;
  const pick = (list, who, side) => list.map((g) => `<button type="button" class="tr-poke ${d[side + "_dex"] === g.dex ? "on" : ""}" data-tr-pick="${side}" data-dex="${g.dex}" data-name="${escapeHtml(g.name)}"><img src="${POKE_SPRITE(g.dex)}" alt=""><span>${escapeHtml(g.name)}</span></button>`).join("");
  const sibs = data.kids.filter((x) => x.name !== d.a && gardenOf(x.name).length);
  const bg = document.createElement("div");
  bg.className = "sheet-bg trade";
  bg.innerHTML = `<div class="sheet"><h2>🔄 바꾸자고 제안하기</h2>
    <h3>① 내(${escapeHtml(d.a)}) 포켓몬</h3><div class="tr-grid">${pick(gardenOf(d.a), d.a, "a")}</div>
    <h3>② 누구랑?</h3><div class="stk-kids">${sibs.map((s) => `<button type="button" class="stk-kid ${d.b === s.name ? "on" : ""}" data-tr-sib="${escapeHtml(s.name)}" style="--c:${s.skin.bar}">${escapeHtml(s.name)}</button>`).join("")}</div>
    ${d.b ? `<h3>③ ${escapeHtml(d.b)}의 포켓몬</h3><div class="tr-grid">${pick(gardenOf(d.b), d.b, "b")}</div>` : ""}
    <div class="wp-btns"><button type="button" class="wp-cancel" data-tr-close>닫기</button><button type="button" class="wp-ok" data-tr-send ${d.a_dex && d.b_dex ? "" : "disabled"}>바꾸자!</button></div></div>`;
  document.body.appendChild(bg);
}
document.addEventListener("click", async (ev) => {
  const t = ev.target;
  if (t.closest("[data-tr-open]")) return openTrade(t.closest("[data-tr-open]").dataset.trOpen);
  if (t.closest(".sheet-bg.trade") && (t.classList.contains("sheet-bg") || t.closest("[data-tr-close]"))) { trDraft = null; return document.querySelector(".sheet-bg.trade")?.remove(); }
  const p = t.closest("[data-tr-pick]");
  if (p && trDraft) { trDraft[p.dataset.trPick + "_dex"] = +p.dataset.dex; trDraft[p.dataset.trPick + "_name"] = p.dataset.name; return drawTrade(); }
  const s = t.closest("[data-tr-sib]");
  if (s && trDraft) { trDraft.b = s.dataset.trSib; delete trDraft.b_dex; delete trDraft.b_name; return drawTrade(); }
  if (t.closest("[data-tr-send]") && trDraft && trDraft.a_dex && trDraft.b_dex) {
    try { await tradeAct({ act: "propose", ...trDraft }); toast(`${trDraft.b}에게 제안했어요! 좋아요를 기다려요`, "lv"); }
    catch (e) { toast("⚠️ " + e.message); }
    trDraft = null; document.querySelector(".sheet-bg.trade")?.remove();
    await loadTrades(); return refreshWiki();
  }
  const a = t.closest("[data-tr]");
  if (a) {
    const act = a.dataset.tr;
    if ((act === "approve" || act === "reject" || act === "cancel") && !confirm(act === "approve" ? "이 교환을 승인할까요? 서로 바뀌어요." : act === "reject" ? "이 교환을 거절할까요?" : "제안을 취소할까요?")) return;
    try {
      await tradeAct({ act, id: a.dataset.id });
      toast({ like: "좋아요! 엄마·아빠 승인을 기다려요", no: "싫다고 했어요", cancel: "제안을 취소했어요", approve: "교환 완료! 🔄", reject: "교환을 거절했어요" }[act], act === "approve" || act === "like" ? "lv" : "");
      if (act === "approve") SFX.fanfare();
    } catch (e) { toast("⚠️ " + e.message); if (/엄마·아빠/.test(e.message) && typeof parentRefresh === "function") parentRefresh(); }
    await loadTrades(); return refreshWiki();
  }
});
// 엄마·아빠 메뉴: 승인 기다리는 교환
function tradeApproveHtml() {
  const list = TRADES.filter(pending);
  if (!list.length) return `<div class="empty">기다리는 교환이 없어요</div>`;
  return `<div class="stk-today">${list.map((t) => `<div class="stk-row"><span><b>${escapeHtml(t.a)}</b> ${escapeHtml(t.a_name)} ↔ <b>${escapeHtml(t.b)}</b> ${escapeHtml(t.b_name)}
    <small>${t.status === "좋아요" ? "둘 다 좋대요" : `${escapeHtml(t.b)} 대답 기다림`}</small></span>
    ${t.status === "좋아요" ? `<button type="button" data-tr="approve" data-id="${t.id}">승인</button>` : ""}<button type="button" data-tr="reject" data-id="${t.id}">거절</button></div>`).join("")}</div>`;
}
