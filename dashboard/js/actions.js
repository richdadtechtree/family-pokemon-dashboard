/* 가족 대시보드 — 눌러서 체크 → serve.py 에 저장 · 화면 전환
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* 눌러서 체크 → serve.py 가 위키 파일을 고친다 (예시 화면에서는 이 화면 안에서만 흉내) */
const demoState = { added: [], removed: [], picks: [], supply: {}, couponUsed: [], couponAdd: [], cheerAdd: [], cheerDel: [], growth: [], ledgerAdd: [], ledgerAdd2: [] };
function toast(msg, cls = "") {
  const t = document.createElement("div"); t.className = "toast " + cls; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
// 예시 화면: 서버의 하루 완료 보너스(apply_day_bonus)를 흉내 낸다 — 오늘 할 루틴을 다 하면 🎁 두 줄, 깨지면 뺀다
//             형제 보너스(apply_team_bonus)도 — 모두 하루 완료면 각자 🤝 한 줄, 깨지면 모두 뺀다
const BONUS_DAY = "🎁 하루 완료 보너스", BONUS_TEAM = "🤝 형제 보너스";
// 오늘 그 아이 기록 줄(이번에 누른 것까지 반영)
function demoRowsOf(kid, body) {
  const r = ((lastData.pokeRows || {})[kid] || []).filter((x) => x.date === ymd(new Date())).map((x) => x.routine);
  if (kid === body.kid) {
    if (body.done) r.push(body.routine);
    else { const i = r.lastIndexOf(body.routine); if (i >= 0) r.splice(i, 1); }
  }
  return r;
}
function demoDayDone(kid, body) {
  const need = kidRoutinesDue(lastData);
  const done = demoRowsOf(kid, body).filter((r) => !isBonusRow(r));
  return need.length > 0 && need.every((rt) => done.some((d) => sameRoutine(d, rt.name)));
}
function demoSetRows(kid, label, delta) {
  for (let i = 0; i < delta; i++) demoState.added.push({ kid, routine: label });
  for (let i = 0; i < -delta; i++) {
    const j = demoState.added.findLastIndex((x) => x.kid === kid && x.routine === label);
    if (j >= 0) demoState.added.splice(j, 1);
  }
}
function demoDayBonus(body) {
  if (!lastData) return 0;
  const delta = (demoDayDone(body.kid, body) ? 2 : 0) - demoRowsOf(body.kid, body).filter((r) => r === BONUS_DAY).length;
  demoSetRows(body.kid, BONUS_DAY, delta);
  return delta;
}
function demoTeamBonus(body) {
  if (!lastData) return {};
  const kids = lastData.kids.map((k) => k.name);
  const team = kids.length >= 2 && kids.every((k) => demoDayDone(k, body));
  const out = {};
  for (const k of kids) {
    const delta = (team ? 1 : 0) - demoRowsOf(k, body).filter((r) => r === BONUS_TEAM).length;
    demoSetRows(k, BONUS_TEAM, delta);
    if (delta) out[k] = delta;
  }
  return out;
}
async function post(url, body) {
  if (DEMO && url.endsWith("-add")) throw new Error("예시 화면에서는 저장하지 않아요");
  if (DEMO) {
    if (url === "/api/routine") {
      if (body.done) demoState.added.push(body);
      else { const i = demoState.added.findLastIndex((x) => x.kid === body.kid && x.routine === body.routine); if (i >= 0) demoState.added.splice(i, 1); else demoState.removed.push(body); }
      const bonus = demoDayBonus(body), team = demoTeamBonus(body);
      return { ok: true, changed: true, bonus, team: team[body.kid] || 0, team_all: team };
    } else if (url === "/api/coupon-use") demoState.couponUsed.push(body);
    else if (url === "/api/visit") {                                  // 예시: ?visit 이면 반드시 찾아온다(장부에 더함)
      if (!params.has("visit") || !body.candidates.length) return { ok: true, visit: null };
      const c = body.candidates[pokeHash(`${ymd(new Date())}#${body.kid}`) % body.candidates.length];
      if (!demoState.ledgerAdd.some((x) => x.kid === body.kid)) demoState.ledgerAdd.push({ kid: body.kid, dex: c.dex, name: c.name, why: body.bringer ? `${iga(body.bringer)} 데려옴` : "찾아옴" });
      const got = demoState.ledgerAdd.find((x) => x.kid === body.kid);
      return { ok: true, changed: true, visit: { dex: got.dex, name: got.name } };
    } else if (url === "/api/quiz") {                                   // 예시: 영어 스티커 한 줄 + 모두 했는지
      demoState.added.push({ kid: body.kid, routine: `⭐ 영어 퀴즈 ${body.word}` });
      const done = (k) => k === body.kid || ((lastData.pokeRows || {})[k] || []).some((r) => r.date === ymd(new Date()) && r.routine.startsWith("⭐ 영어 퀴즈"));
      return { ok: true, changed: true, all: lastData.kids.every((k) => done(k.name)) };
    } else if (url === "/api/growth") demoState.growth.push({ kid: body.kid, height: body.height ?? null, weight: body.weight ?? null });
    else if (url === "/api/cheer")(body.undo ? demoState.cheerDel : demoState.cheerAdd).push({ date: body.date, to: body.to, from: body.giver, text: body.text });
    else if (url === "/api/ladder")demoState.couponAdd.push({ kid: body.kid, name: body.prize, why: ladderWhy(body.m) });
    else if (url === "/api/egg-pick") {
      demoState.picks.push(body);
      if (body.friend) demoState.ledgerAdd.push({ kid: body.kid, sign: "-", dex: body.dex, name: body.name || `#${body.dex}`, why: "진화하러 감" });   // 10-4. 친구는 동산에서 나와 키운다
    }
    else if (url === "/api/supply-check") demoState.supply[`${body.text}|${body.who}`] = body.done;
    else demoState.removed.push(body);
    return { ok: true, changed: true };
  }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 501 || res.status === 405) throw new Error("체크하려면 serve.py 로 켜야 해요");
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(j.error || "저장하지 못했어요");
  return j;
}
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest(".rt[data-act], .chk[data-act], .item[data-act], .cpn-use[data-act], .bank-btn[data-act]");
  if (!el) return;
  const d = el.dataset;
  try {
    if (d.act === "routine") {
      const undo = d.done === "1";
      // 오늘 🎁 보너스를 받은 상태면 취소할 때 보너스도 빠진다
      const todayRows = ((lastData && lastData.pokeRows || {})[d.kid] || []).filter((r) => r.date === ymd(new Date()));
      const hadBonus = todayRows.some((r) => r.routine === BONUS_DAY), hadTeam = todayRows.some((r) => r.routine === BONUS_TEAM);
      const down = 1 + (hadBonus ? 2 : 0) + (hadTeam ? 1 : 0);
      const why = [hadBonus && "🎁 하루 완료 보너스 2", hadTeam && "🤝 형제 보너스 1"].filter(Boolean).join(" · ");
      if (undo && !confirm(`'${d.routine}' 체크를 취소할까요? 레벨이 ${down} 내려가요${why ? ` (${why} 포함)` : ""}.${hadTeam ? "\n형제들의 🤝 보너스도 함께 빠져요." : ""}`)) return;
      el.classList.add("busy");
      audio();                                                        // 누른 순간 소리를 깨워 둔다(브라우저 규칙)
      const before = ((lastData && lastData.pokeCounts) || {})[d.kid] || 0;   // 누르기 전 루틴 개수
      const r = await post("/api/routine", { kid: d.kid, routine: d.routine, done: !undo });
      const bonus = (r && r.bonus) || 0;                              // 하루 완료 보너스: 다 하면 +2, 취소로 깨지면 -2
      const team = (r && r.team) || 0;                                // 형제 보너스: 모두 다 하면 +1, 깨지면 -1
      const coupon = (r && r.coupon) || 0;                            // 주간 보상 쿠폰: 그 주 마지막 등교일에 +1, 깨지면 -1
      if (undo) {
        const lost = [bonus < 0 && `🎁 보너스 ${-bonus}`, team < 0 && "🤝 형제 보너스", coupon < 0 && "🏪 주간 쿠폰"].filter(Boolean);
        toast(lost.length ? `체크를 취소했어요 · ${lost.join(" · ")}도 빠졌어요` : "체크를 취소했어요");
      } else {
        const kid = lastData && lastData.kids.find((k) => k.name === d.kid);
        if (kid) celebrateRoutine(kid.skin, d.kid, before, bonus, team, coupon)    // 레벨업·부화·진화 (+ 🎁·🤝 보너스, 🏪 쿠폰) 축하 화면 + 소리
          .then(() => (bdaySongDue(d.kid) ? celebrate(kid.skin, { kind: "bday", name: d.kid }) : null))   // 생일이면 그날 첫 루틴 때 생일 노래
          .then(() => fxAfterRoutine(d.kid, bonus > 0));                   // 끝나면 동산 포켓몬이 달리기 / 그날 다 했으면 춤
        else toast(`잘했어요! ${d.kid} 포켓몬 레벨 +${1 + bonus + team} ✨`, "lv");
      }
    } else if (d.act === "supply") {                                  // 준비물: 확인 없이 체크 ↔ 풀기
      el.classList.add("busy");
      const done = d.done !== "1";
      await post("/api/supply-check", { text: d.text, who: d.who, due: d.due, done });
      toast(done ? `'${d.text}' 챙겼어요 🎒` : "체크를 풀었어요", done ? "lv" : ""); if (done) SFX.ding();
    } else if (d.act === "trip") {                                  // 여행 준비물: 확인 없이 체크 ↔ 풀기
      el.classList.add("busy");
      const done = d.done !== "1";
      await post("/api/trip-check", { group: d.group, text: d.text, done });
      toast(done ? `'${d.text}' 챙겼어요 🧳` : "체크를 풀었어요", done ? "lv" : ""); if (done) SFX.ding();
    } else if (d.act === "bank-deposit") {                          // 🏦 은행 예금 — 맡길 토큰을 적고 기간 버튼을 누른다 (만기 = 원금+이자, 단리)
      const amt = Math.floor(+($("bankAmt")?.value || 0));
      const term = +d.term || 0, rate = (typeof BANK_RATES !== "undefined" && BANK_RATES[term]) || 0;
      if (!amt || amt <= 0) { toast("맡길 토큰을 적어 주세요"); return; }
      if (!term || !rate) { toast("기간을 골라 주세요"); return; }
      const total = amt + Math.floor(amt * rate * term / 100);
      if (!confirm(`${amt}토큰을 ${term}일 동안 은행에 맡길까요?\n일 ${rate}% · 만기 ${total}토큰 (이자 ${total - amt}토큰)`)) return;
      el.classList.add("busy");
      await post("/api/bank-deposit", { kid: d.kid, amount: amt, term });
      toast(`🏦 ${amt}토큰을 ${term}일 동안 맡겼어요`, "lv"); SFX.ding();
    } else if (d.act === "bank-withdraw") {                         // 🏦 은행 만기 찾기 — 원금+이자를 지갑으로 돌려받는다
      if (!confirm("만기된 예금을 찾을까요? 원금+이자가 지갑으로 들어와요.")) return;
      el.classList.add("busy");
      const j = await post("/api/bank-withdraw", { kid: d.kid, id: +d.id });
      toast(`🏦 예금을 찾았어요! +${j.total || ""}토큰`, "lv"); SFX.ding();
    } else if (d.act === "coupon") {                                  // 쿠폰 사용 → 쿠폰.md '쓴 날'을 채운다(줄은 남는다)
      if (!confirm(`'${d.name}' 쿠폰을 정말 쓸까요?\n쓰면 쿠폰함에서 사라져요.`)) return;
      el.classList.add("busy");
      await post("/api/coupon-use", { kid: d.kid, got: d.got, name: d.name, why: d.why });
      toast("쿠폰을 썼어요! 즐거운 시간 보내요 🎉", "lv");
    } else if (d.act === "shop") {                                  // 장보기: 확인 없이 체크 ↔ 풀기 (체크한 건 다음 날부터 안 뜬다)
      el.classList.add("busy");
      const done = d.done !== "1";
      await post("/api/shop-check", { text: d.text, who: d.who, done });
      toast(done ? `'${d.text}' 샀어요 🛒` : "체크를 풀었어요", done ? "lv" : ""); if (done) SFX.ding();
    } else {
      if (!confirm(`'${d.text}' 다 했어요?`)) return;
      el.classList.add("busy");
      await post("/api/todo-done", { text: d.text, who: d.who });
      toast("할 일 완료! 목록에서 지웠어요", "lv"); SFX.ding();
    }
    await refreshWiki();
    if ((d.act === "bank-deposit" || d.act === "bank-withdraw") && typeof refreshBankSheet === "function") refreshBankSheet(d.kid);  // 은행 팝업이 열려 있으면 내용(잔액·예금)도 다시 그린다
  } catch (e) { el.classList.remove("busy"); toast("⚠️ " + e.message); }
});

/* 2026-11-17 스티커 팝업은 '새로 들어갈 때'만 뜬다 (아빠 요청: 주자마자 뜨지 않게).
   refreshWiki()는 2분마다, 그리고 스티커를 준 뒤에도 applyView()를 부른다. 그래서 진입 판정 없이
   applyView()마다 팝업을 부르면, 아이가 동산·할 일 화면에 앉아 있는데 아빠가 스티커를 준 뒤
   다음 자동 새로고침 때 팝업이 바로 떠 버린다. 화면(kind+idx)이 직전 applyView 때와 달라진
   경우에만 진입으로 보고, 새로고침만으로는 팝업을 부르지 않는다. 처음 열어 바로 그 화면으로
   들어온 경우는 진입이다. sessionStorage에 남겨 두면 코드 자동 새로고침(location.reload())도
   같은 자리에 앉아 있는 것으로 보고 진입으로 치지 않는다 — 새 탭으로 열면 비어 있어 진입이다. */
let lastStickerViewKey = null;
try { lastStickerViewKey = sessionStorage.getItem("stickerViewKey"); } catch (e) { /* 저장 안 되는 기기 */ }
function stickerViewEntered(v) {
  const k = v.kind + ":" + (v.idx == null ? "" : v.idx);
  const entered = k !== lastStickerViewKey;
  lastStickerViewKey = k;
  try { sessionStorage.setItem("stickerViewKey", k); } catch (e) { /* 저장 안 되는 기기 */ }
  return entered;
}

function applyView(data) {
  if (!data) return;
  const v = currentView();
  const viewEntered = stickerViewEntered(v);   // 이 applyView가 화면 진입인지, 같은 화면의 새로고침인지
  const kid = (v.kind === "garden" || v.kind === "todo") && data.kids[v.idx];
  const meeting = v.kind === "meeting", ideas = v.kind === "ideas", playroom = v.kind === "playroom";
  document.body.classList.toggle("kid-mode", !!kid || meeting || ideas || playroom);   // 대시보드 카드를 숨기고 .view 만 보인다(가족회의도 같은 자리)
  renderTabs(data);
  renderBirthday(data);                                            // 5-1. 오늘 생일인 아이가 있으면 배너·풍선 (화면마다 말이 다르다)
  if (!kid && !meeting && !ideas && !playroom) return;
  $("garden").style.display = v.kind === "garden" ? "" : "none";
  $("kidTodo").style.display = v.kind === "todo" ? "" : "none";
  $("meeting").style.display = meeting ? "" : "none";
  if (meeting) renderMeeting(data, v.date);
  $("ideas").style.display = ideas ? "" : "none";
  if (ideas) renderIdeas(data);
  $("playroom").style.display = playroom ? "" : "none";
  if (playroom && typeof renderPlayroom === "function") renderPlayroom(data);
  $("garden").querySelectorAll(".garden-child").forEach((el, j) => el.classList.toggle("show", j === v.idx));
  if (v.kind === "todo") renderKidTodo(data, v.idx);
  if (kid) maybeAutoLadder(data, v.idx);                           // 동산 5마리마다 사다리 — 아이 화면을 열면 한 번 저절로
  if (kid && typeof checkVisit === "function") checkVisit(kid.name);   // 10-3. 오늘 포켓몬이 친구를 데려왔는지(하루 한 번 뽑기)
  if (kid && v.kind === "garden" && typeof showFriendPopups === "function") showFriendPopups(kid.name);   // 데려온 친구는 동산 메뉴에서 팝업
  if (kid && v.kind === "garden" && viewEntered && typeof showQuizHeardPopups === "function") showQuizHeardPopups(kid.name);   // 9-1. '들었어요' 영어 스티커는 동산 메뉴에 새로 들어갈 때만 팝업(스티커 → 레벨업 순) — 새로고침만으론 안 뜬다
  if (kid && v.kind === "todo" && viewEntered && typeof showStickerPopups === "function") showStickerPopups(kid.name);   // 14-7. 아직 안 본 예전 칭찬 스티커 팝업(스티커 → 레벨업 순) — 새로 들어갈 때만, 새로고침만으론 안 뜬다
}
window.addEventListener("hashchange", () => { applyView(lastData); window.scrollTo(0, 0); });

