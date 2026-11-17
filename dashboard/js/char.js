/* 가족 대시보드 — 14. 👕 옷 갈아입기 · 🛍️ 상점
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 아이 할 일 화면의 👕 옷 갈아입기 버튼으로 여는 창. 옷·머리·신발·원피스·패딩을 고르고, 안 산 옷은 토큰으로 산다.
   - 코디(옷·머리·신발 묶음) 5벌 — 1 = 기본. 2·3은 무료, 4·5는 남자 아이만 상점에서 산다(4번 농구 유니폼·5번 공룡 후드티, 5토큰).
     위키 아이들/캐릭터.md 에 아이마다 한 줄.
   - 💇 머리(여자 아이만) 2가지 — 1 = 기본 단발. 위키 아이들/머리.md
   - 👗 상의·하의(여자 아이만) 3개씩 — 위키 아이들/상의.md·아이들/하의.md. 모두 무료.
   - 옷은 글자 카드로만 보인다(캐릭터 그림 없음). 옷 이름·가격은 config.js SHOP. */
"use strict";
/* 👕 코디(옷·머리·신발 묶음) 5벌 — 1 = 기본. 2·3은 무료, 4·5는 남자 아이만 상점에서 산다(4번 농구 유니폼·5번 공룡 후드티, 5토큰).
   위키 아이들/캐릭터.md 에 아이마다 한 줄.
   💇 머리(여자 아이만) 2가지 — 1 = 기본 단발. 위키 아이들/머리.md
   👗 상의·하의(여자 아이만) 3개씩 — 위키 아이들/상의.md·아이들/하의.md. (1,1)은 기본 옷, (2,2)는 티+치마. */
const HAIR_N = 2;
const OUTFIT_N = 5;
const OUTFIT_SHOP = [4, 5];
const TOP_N = 3;
const BOTTOM_N = 3;
const outfitLocal = {};
const outfitOf = (data, kid) => outfitLocal[kid] || (data.outfits || {})[kid] || 1;
const outfitName = (kid, n) => ((SHOP.outfitNames[kidIsGirl(kid) ? "girl" : "boy"] || [])[n - 1]) || (n === 1 ? "기본 옷" : `코디 ${n}`);
const hairLocal = {};
const hairOf = (data, kid) => hairLocal[kid] || (data.hairs || {})[kid] || 1;
const hairName = (kid, h) => ((SHOP.hairNames[kidIsGirl(kid) ? "girl" : "boy"] || [])[h - 1]) || (h === 1 ? "기본 머리" : `머리 ${h}`);
/* 👗 상의·하의 (여자 아이만, 모두 무료) — 위키 아이들/상의.md·아이들/하의.md */
const topLocal = {};
const topOf = (data, kid) => topLocal[kid] || (data.tops || {})[kid] || 1;
const topName = (kid, t) => ((SHOP.topNames[kidIsGirl(kid) ? "girl" : "boy"] || [])[t - 1]) || `상의 ${t}`;
const bottomLocal = {};
const bottomOf = (data, kid) => bottomLocal[kid] || (data.bottoms || {})[kid] || 1;
const bottomName = (kid, b) => ((SHOP.bottomNames[kidIsGirl(kid) ? "girl" : "boy"] || [])[b - 1]) || `하의 ${b}`;
/* 🛍️ 상점 — 원피스(여자 아이만, 1번 분홍 무료·2~4번 5토큰) · 신발(5토큰: 여자 아이 빨간 운동화·검정 구두, 남자 아이 파란 운동화·노란 운동화) · 검정 패딩(남자·여자 다, 6토큰) · 남자 코디(남자 아이만, 4번 농구 유니폼·5번 공룡 후드티, 5토큰). 위키 아이들/원피스.md·신발.md·패딩.md·코디.md. shopTest 동안은 전부 무료 */
const DRESS_N = 4;
const SHOE_N = 2;
const dressLocal = {};
const dressOf = (data, kid) => dressLocal[kid] ?? (data.dresses || {})[kid] ?? 0;   // 0 = 안 입음(상의·하의)
const dressName = (kid, n) => ((SHOP.dressNames[kidIsGirl(kid) ? "girl" : "boy"] || [])[n - 1]) || `원피스 ${n}`;
const dressFree = () => (SHOP.dressFree || 1);                    // 무료 원피스 번호(1번 분홍)
const dressesOwned = (data, kid) => { const o = (data.dressesOwned || {})[kid] || []; return o.includes(dressFree()) ? o : [...o, dressFree()]; };
const outfitsOwned = (data, kid) => { const o = (data.outfitsOwned || {})[kid]; return o && o.length ? o : [1, 2, 3]; };  // 코디 1~3은 무료라서 언제나 가진 것
const outfitPrice = () => (SHOP.outfitPrice || 5);
const shoesLocal = {};
const shoesOf = (data, kid) => shoesLocal[kid] ?? (data.shoesWorn || {})[kid] ?? 0; // 0 = 기본 신발
const shoeName = (kid, n) => ((SHOP.shoeNames[kidIsGirl(kid) ? "girl" : "boy"] || [])[n - 1]) || `신발 ${n}`;
const shoesOwned = (data, kid) => (data.shoesOwned || {})[kid] || [];
const paddingLocal = {};
const paddingOf = (data, kid) => paddingLocal[kid] ?? ((data.paddingWorn || {})[kid] ? 1 : 0); // 1 = 입음
const paddingOwned = (data, kid) => !!((data.paddingOwned || {})[kid]);
const shopTest = () => !!SHOP.shopTest;
const shopPriceText = (price) => shopTest() ? (price > 0 ? `테스트 중 무료 (원래 ${price}토큰)` : "무료") : (price > 0 ? `${price}토큰` : "무료");
/* 👕 옷 갈아입기 창 — 코디 3벌. 그림 없이 글자 카드로 보인다 */
// 산 옷(무료·유료)은 👕 옷 목록으로, 안 산 옷은 🛍️ 상점으로 — 카드 한 장씩 만든다. 라벨은 가진 옷이면 "누르면 입어요", 안 산 옷이면 가격
const dressCardHtml = (kid, d) => {
  const curD = dressOf(lastData, kid);
  const owned = dressesOwned(lastData, kid).includes(d);
  return `<button type="button" class="dress-card${d === curD ? " on" : ""}" data-dress-item="${d}" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">👗</span>
        <b>${escapeHtml(dressName(kid, d))}</b><small>${d === curD ? "지금 입은 원피스" : owned ? "누르면 입어요" : shopPriceText(SHOP.dressPrice || 5)}</small></button>`;
};
const shoeCardHtml = (kid, n) => {
  const curS = shoesOf(lastData, kid);
  const owned = shoesOwned(lastData, kid).includes(n);
  return `<button type="button" class="dress-card${n === curS ? " on" : ""}" data-shoe="${n}" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">👟</span>
        <b>${escapeHtml(shoeName(kid, n))}</b><small>${n === curS ? "지금 신은 신발" : owned ? "누르면 신어요" : shopPriceText(SHOP.shoePrice || 5)}</small></button>`;
};
const outfitCardHtml = (kid, n) => {
  const cur = outfitOf(lastData, kid);
  const owned = outfitsOwned(lastData, kid).includes(n);
  return `<button type="button" class="dress-card${n === cur ? " on" : ""}" data-outfit="${n}" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">👕</span>
        <b>${escapeHtml(outfitName(kid, n))}</b><small>${n === cur ? "지금 입은 옷" : owned ? "누르면 입어요" : shopPriceText(outfitPrice())}</small></button>`;
};
const paddingCardHtml = (kid) => `<button type="button" class="dress-card${paddingOf(lastData, kid) === 1 ? " on" : ""}" data-padding="1" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">🧥</span>
        <b>검정 패딩</b><small>${paddingOf(lastData, kid) === 1 ? "지금 입은 패딩 · 누르면 벗어요" : paddingOwned(lastData, kid) ? "누르면 입어요" : shopPriceText(SHOP.paddingPrice || 6)}</small></button>`;
// 옷 창 안의 내용 — 고른 뒤 창을 닫지 않고 이 내용만 다시 그린다(내린 위치는 그대로)
function dressSheetHtml(kid) {
  const cur = outfitOf(lastData, kid);
  // 산 옷(무료·유료)은 👕 옷 목록에, 안 산 옷은 🛍️ 상점에
  const ownedD = [...Array(DRESS_N)].map((_, j) => j + 1).filter((d) => dressesOwned(lastData, kid).includes(d));
  const shopD = [...Array(DRESS_N)].map((_, j) => j + 1).filter((d) => !dressesOwned(lastData, kid).includes(d));
  const ownedS = [...Array(SHOE_N)].map((_, j) => j + 1).filter((n) => shoesOwned(lastData, kid).includes(n));
  const shopS = [...Array(SHOE_N)].map((_, j) => j + 1).filter((n) => !shoesOwned(lastData, kid).includes(n));
  const ownedO = [...Array(OUTFIT_N)].map((_, j) => j + 1).filter((n) => outfitsOwned(lastData, kid).includes(n));
  const shopO = OUTFIT_SHOP.filter((n) => !outfitsOwned(lastData, kid).includes(n));
  const ownedP = paddingOwned(lastData, kid);
  const shopEmpty = (kidIsGirl(kid) ? shopD.length + shopS.length : shopO.length + shopS.length) + (ownedP ? 0 : 1) === 0;
  return `<h2>👕 ${escapeHtml(kid)} 옷 갈아입기 <button type="button" class="dex-close">닫기</button></h2>
    ${kidIsGirl(kid) ? `<h3 class="dress-sub">👚 ${escapeHtml(kid)} 상의</h3>
    <div class="dress-grid">${[...Array(TOP_N)].map((_, j) => {
      const t = j + 1;
      const curT = topOf(lastData, kid), curB = bottomOf(lastData, kid);
      return `<button type="button" class="dress-card${t === curT ? " on" : ""}" data-top="${t}" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">👚</span>
        <b>${escapeHtml(topName(kid, t))}</b>${t === curT ? "<small>지금 입은 상의</small>" : ""}</button>`;
    }).join("")}</div>
    <h3 class="dress-sub">👖 ${escapeHtml(kid)} 하의</h3>
    <div class="dress-grid">${[...Array(BOTTOM_N)].map((_, j) => {
      const b = j + 1;
      const curT = topOf(lastData, kid), curB = bottomOf(lastData, kid);
      return `<button type="button" class="dress-card${b === curB ? " on" : ""}" data-bottom="${b}" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">👖</span>
        <b>${escapeHtml(bottomName(kid, b))}</b>${b === curB ? "<small>지금 입은 하의</small>" : ""}</button>`;
    }).join("")}</div>` : `<div class="dress-grid">${ownedO.map((n) => outfitCardHtml(kid, n)).join("")}</div>`}
    ${kidIsGirl(kid) ? `<h3 class="dress-sub">💇 ${escapeHtml(kid)} 머리</h3>
    <div class="dress-grid">${[...Array(HAIR_N)].map((_, j) => {
      const h = j + 1;
      return `<button type="button" class="dress-card${h === hairOf(lastData, kid) ? " on" : ""}" data-hair="${h}" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">💇</span>
        <b>${escapeHtml(hairName(kid, h))}</b>${h === hairOf(lastData, kid) ? "<small>지금 머리</small>" : ""}</button>`;
    }).join("")}</div>` : ""}
    <h3 class="dress-sub">👕 ${escapeHtml(kid)} 옷 목록</h3>
    ${kidIsGirl(kid) ? `<h3 class="dress-sub">👗 ${escapeHtml(kid)} 원피스</h3>
    <div class="dress-grid">${ownedD.map((d) => dressCardHtml(kid, d)).join("")}${dressOf(lastData, kid) > 0 ? `<button type="button" class="dress-card" data-dress-item="0" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">👕</span>
        <b>상의·하의</b><small>원피스 벗기</small></button>` : ""}</div>` : ""}
    <h3 class="dress-sub">👟 ${escapeHtml(kid)} 신발</h3>
    <div class="dress-grid">${ownedS.map((n) => shoeCardHtml(kid, n)).join("")}<button type="button" class="dress-card${shoesOf(lastData, kid) === 0 ? " on" : ""}" data-shoe="0" data-kid="${escapeHtml(kid)}">
        <span class="dress-pic" aria-hidden="true">👟</span>
        <b>기본 신발</b><small>${shoesOf(lastData, kid) === 0 ? "지금 신은 신발" : "무료"}</small></button></div>
    ${ownedP ? `<h3 class="dress-sub">🧥 검정 패딩</h3>
    <div class="dress-grid">${paddingCardHtml(kid)}</div>` : ""}
    <h3 class="dress-sub">🛍️ 상점 — 🪙 ${((lastData.tokens || {})[kid] || 0)}토큰${shopTest() ? " · 테스트 동안 전부 무료" : ""}</h3>
    ${shopEmpty ? `<div class="empty">다 샀어요! 살 게 없어요.</div>` : ""}
    ${kidIsGirl(kid) && shopD.length ? `<h3 class="dress-sub">👗 ${escapeHtml(kid)} 원피스</h3>
    <div class="dress-grid">${shopD.map((d) => dressCardHtml(kid, d)).join("")}</div>` : ""}
    ${!kidIsGirl(kid) && shopO.length ? `<h3 class="dress-sub">👕 ${escapeHtml(kid)} 코디</h3>
    <div class="dress-grid">${shopO.map((n) => outfitCardHtml(kid, n)).join("")}</div>` : ""}
    ${shopS.length ? `<h3 class="dress-sub">👟 ${escapeHtml(kid)} 신발</h3>
    <div class="dress-grid">${shopS.map((n) => shoeCardHtml(kid, n)).join("")}</div>` : ""}
    ${!ownedP ? `<h3 class="dress-sub">🧥 검정 패딩</h3>
    <div class="dress-grid">${paddingCardHtml(kid)}</div>` : ""}
    <div class="empty">골라도 창은 안 닫혀요. 다 고르면 닫기를 눌러요. 산 옷(무료든 토큰으로 산 거든)은 👕 옷 목록으로 가고, 상점에는 안 산 옷만 남아요. ${kidIsGirl(kid) ? "여자 아이는 상의·하의를 따로 골라요 (모두 무료). 원피스를 입으면 상의·하의 대신 원피스가 보여요. 상의·하의를 고르면 원피스가 벗겨져요. 머리도 따로 골라요." : "옷·신발을 한 벌로 묶은 코디예요. 머리는 여자 아이만 따로 골라요."}${shopTest() ? " 상점은 지금 테스트 중이라 전부 무료예요." : " 상점에서 산 옷은 토큰이 빠져요."}</div>`;
}
// 고른 뒤 창 안의 표시(지금 입은 옷·가진 것·토큰)만 다시 그린다 — 창은 닫지 않고, 내린 위치도 그대로
function refreshDressSheet(kid) {
  const bg = document.querySelector(".sheet-bg.dress");
  if (!bg) return;
  const sheet = bg.querySelector(".sheet");
  if (!sheet) return;
  const top = sheet.scrollTop;
  sheet.innerHTML = dressSheetHtml(kid);
  sheet.scrollTop = top;
}
function openDress(kid) {
  if (!lastData) return;
  document.querySelector(".sheet-bg.dress")?.remove();
  const bg = document.createElement("div");
  bg.className = "sheet-bg dress";
  bg.innerHTML = `<div class="sheet">${dressSheetHtml(kid)}</div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", async (ev) => {
    if (ev.target === bg || ev.target.closest(".dex-close")) return bg.remove();
    const hc = ev.target.closest("[data-hair]");
    if (hc) {
      const h = +hc.dataset.hair;
      if (h === hairOf(lastData, kid)) return;
      hairLocal[kid] = h;
      refreshDressSheet(kid);
      SFX.ding();
      try {
        await post("/api/hair", { kid, h });
        if (!DEMO) await refreshWiki();
      } catch (e) { toast("⚠️ " + e.message); }
      if (!DEMO) delete hairLocal[kid];
      refreshDressSheet(kid);
      return;
    }
    const tc = ev.target.closest("[data-top]");
    if (tc) {
      const t = +tc.dataset.top;
      if (t === topOf(lastData, kid)) return;
      const wasDress = dressOf(lastData, kid) > 0;   // 원피스를 입고 있었으면 상의를 고를 때 원피스가 벗겨진다
      if (wasDress) dressLocal[kid] = 0;
      topLocal[kid] = t;
      refreshDressSheet(kid);
      SFX.ding();
      if (wasDress) toast("👗 원피스를 벗었어요. 바지를 골라주세요");
      try {
        await post("/api/top", { kid, n: t });
        if (!DEMO) await refreshWiki();
      } catch (e) { toast("⚠️ " + e.message); }
      if (!DEMO) { delete topLocal[kid]; delete dressLocal[kid]; }
      refreshDressSheet(kid);
      return;
    }
    const bc = ev.target.closest("[data-bottom]");
    if (bc) {
      const b = +bc.dataset.bottom;
      if (b === bottomOf(lastData, kid)) return;
      if (dressOf(lastData, kid) > 0) dressLocal[kid] = 0;   // 하의를 고르면 원피스가 벗겨진다
      bottomLocal[kid] = b;
      refreshDressSheet(kid);
      SFX.ding();
      try {
        await post("/api/bottom", { kid, n: b });
        if (!DEMO) await refreshWiki();
      } catch (e) { toast("⚠️ " + e.message); }
      if (!DEMO) { delete bottomLocal[kid]; delete dressLocal[kid]; }
      refreshDressSheet(kid);
      return;
    }
    const dc = ev.target.closest("[data-dress-item]");   // 🛍️ 상점 원피스 (여자 아이만, 1번 분홍 무료·2~4번 5토큰) — 안 산 건 사기 전에 물어본다
    if (dc) {
      const n = +dc.dataset.dressItem;
      if (n === dressOf(lastData, kid)) return;
      if (n > 0 && !dressesOwned(lastData, kid).includes(n)) {
        const price = shopTest() ? 0 : (SHOP.dressPrice || 5);
        const bal = (lastData.tokens || {})[kid] || 0;
        if (price > 0 && bal < price) { toast(`🪙 토큰이 부족해요 (지금 ${bal}토큰, ${price}토큰 필요)`); return; }
        if (!confirm(`'${dressName(kid, n)}' ${price > 0 ? `${price}토큰에 살까요? (지금 ${bal}토큰)` : "테스트 중 무료로 살까요?"}\n사면 바로 입어요.`)) return;
        try { await post("/api/buy-dress", { kid, n }); }
        catch (e) { toast("⚠️ " + e.message); return; }
        if (!DEMO) await refreshWiki();   // 산 뒤 토큰·가진 원피스를 새로 읽는다
      }
      dressLocal[kid] = n;
      refreshDressSheet(kid);
      SFX.ding();
      try {
        await post("/api/dress", { kid, n });
        if (!DEMO) await refreshWiki();
      } catch (e) { toast("⚠️ " + e.message); }
      if (!DEMO) delete dressLocal[kid];
      refreshDressSheet(kid);
      return;
    }
    const sc = ev.target.closest("[data-shoe]");   // 🛍️ 상점 신발 — 안 산 건 사기 전에 물어본다
    if (sc) {
      const n = +sc.dataset.shoe;
      if (n === shoesOf(lastData, kid)) return;
      if (n > 0 && !shoesOwned(lastData, kid).includes(n)) {
        const price = shopTest() ? 0 : (SHOP.shoePrice || 5);
        const bal = (lastData.tokens || {})[kid] || 0;
        if (price > 0 && bal < price) { toast(`🪙 토큰이 부족해요 (지금 ${bal}토큰, ${price}토큰 필요)`); return; }
        if (!confirm(`'${shoeName(kid, n)}' ${price > 0 ? `${price}토큰에 살까요? (지금 ${bal}토큰)` : "테스트 중 무료로 살까요?"}\n사면 바로 신어요.`)) return;
        try { await post("/api/buy-shoes", { kid, n }); }
        catch (e) { toast("⚠️ " + e.message); return; }
        if (!DEMO) await refreshWiki();   // 산 뒤 토큰·가진 신발을 새로 읽는다
      }
      shoesLocal[kid] = n;
      refreshDressSheet(kid);
      SFX.ding();
      try {
        await post("/api/wear-shoes", { kid, n });
        if (!DEMO) await refreshWiki();
      } catch (e) { toast("⚠️ " + e.message); }
      if (!DEMO) delete shoesLocal[kid];
      refreshDressSheet(kid);
      return;
    }
    const pc = ev.target.closest("[data-padding]");   // 🛍️ 상점 검정 패딩 — 안 산 건 사기 전에 물어본다, 입은 패딩을 누르면 벗는다
    if (pc) {
      const on = paddingOf(lastData, kid) === 1 ? 0 : 1;
      if (on === 1 && !paddingOwned(lastData, kid)) {
        const price = shopTest() ? 0 : (SHOP.paddingPrice || 6);
        const bal = (lastData.tokens || {})[kid] || 0;
        if (price > 0 && bal < price) { toast(`🪙 토큰이 부족해요 (지금 ${bal}토큰, ${price}토큰 필요)`); return; }
        if (!confirm(`'검정 패딩' ${price > 0 ? `${price}토큰에 살까요? (지금 ${bal}토큰)` : "테스트 중 무료로 살까요?"}\n사면 바로 입어요.`)) return;
        try { await post("/api/buy-padding", { kid }); }
        catch (e) { toast("⚠️ " + e.message); return; }
        if (!DEMO) await refreshWiki();   // 산 뒤 토큰·가진 패딩을 새로 읽는다
      }
      paddingLocal[kid] = on;
      refreshDressSheet(kid);
      SFX.ding();
      try {
        await post("/api/wear-padding", { kid, on });
        if (!DEMO) await refreshWiki();
      } catch (e) { toast("⚠️ " + e.message); }
      if (!DEMO) delete paddingLocal[kid];
      refreshDressSheet(kid);
      return;
    }
    const c = ev.target.closest("[data-outfit]");
    if (!c) return;
    const n = +c.dataset.outfit;
    if (n === outfitOf(lastData, kid)) return;
    if (OUTFIT_SHOP.includes(n) && !outfitsOwned(lastData, kid).includes(n)) {   // 🛍️ 상점 코디 (남자 4·5번) — 안 산 건 사기 전에 물어본다
      const price = shopTest() ? 0 : outfitPrice();
      const bal = (lastData.tokens || {})[kid] || 0;
      if (price > 0 && bal < price) { toast(`🪙 토큰이 부족해요 (지금 ${bal}토큰, ${price}토큰 필요)`); return; }
      if (!confirm(`'${outfitName(kid, n)}' ${price > 0 ? `${price}토큰에 살까요? (지금 ${bal}토큰)` : "테스트 중 무료로 살까요?"}\n사면 바로 입어요.`)) return;
      try { await post("/api/buy-outfit", { kid, n }); }
      catch (e) { toast("⚠️ " + e.message); return; }
      if (!DEMO) await refreshWiki();   // 산 뒤 토큰·가진 코디를 새로 읽는다
    }
    outfitLocal[kid] = n;
    refreshDressSheet(kid);
    SFX.ding();
    try {
      await post("/api/outfit", { kid, n });
      if (!DEMO) await refreshWiki();
    } catch (e) { toast("⚠️ " + e.message); }
    if (!DEMO) delete outfitLocal[kid];
    refreshDressSheet(kid);
  });
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-dress]");
  if (b) openDress(b.dataset.dress);
});
