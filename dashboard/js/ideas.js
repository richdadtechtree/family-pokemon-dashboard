/* 가족 대시보드 — 11-2. 가족회의 아이디어 · 이번 주 화이트보드 (2026-11-15 아빠 요청)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 위키 가족회의/아이디어.md: ## 이번 주 주제(하나) · ## 이번 주 의견(- 이름: 내용) · ## 아이디어(- 주제 (누구) · 날짜) · ## 지난 주제
   - 아래 메뉴 '💡 회의 아이디어'(#ideas): 누구나 아이디어·의견을 적는다(아이도, 비밀번호 없음).
     '이번 주 주제로' 고르기 · 회의 끝 · ✕ 지우기는 엄마·아빠만(서버가 엄마·아빠 메뉴 쿠키 확인).
   - 이번 주 주제는 도트(픽셀) 화이트보드로 '🗣️ 가족회의' 창(오늘 회의) 맨 위에 크게 보인다 — 거기서 의견을 붙인다.
     대시보드 화면에는 넣지 않는다(2026-11-15 아빠 결정).
   - 저장은 serve.py /api/ideas {act: add|del|pick|opinion|opdel|done, text, who}. */
"use strict";
let ideaWho = "";
const ideaPeople = (data) => ["아빠", "엄마", ...data.kids.map((k) => k.name)];

// 도트 화이트보드 — 가족회의 창 맨 위(의견 적기 칸·회의 끝 포함)
function whiteboardHtml(data, big) {
  const I = data.ideas || {};
  const t = I.topic;
  const people = ideaPeople(data);
  ideaWho ||= people[0];
  const note = (o, i) => {
    const c = colorOf(o.who);
    return `<div class="wb-note" style="--c:${c};--r:${((i * 37) % 7) - 3}deg"><b>${escapeHtml(o.who || "?")}</b><span>${escapeHtml(o.text)}</span>
      ${big ? `<button type="button" class="wb-x" data-idea="opdel" data-text="${escapeHtml(o.raw)}" title="지우기(엄마·아빠)">✕</button>` : ""}</div>`;
  };
  const board = t
    ? `<div class="wb-topic-label">이번 주 주제</div>
       <div class="wb-topic">${escapeHtml(t.text)}</div>
       <div class="wb-by">${t.by ? `💡 ${escapeHtml(t.by)}의 아이디어` : ""}${t.date ? ` · ${escapeHtml(t.date.slice(5).replace("-", "/"))} 고름` : ""}</div>
       <div class="wb-notes">${(I.opinions || []).length ? I.opinions.map(note).join("") : `<div class="wb-empty">아직 의견이 없어요 — 먼저 적어 볼까요?</div>`}</div>`
    : `<div class="wb-topic-label">이번 주 주제</div><div class="wb-topic wb-none">아직 안 정했어요</div>
       <div class="wb-by">${big ? "아래 아이디어에서 엄마·아빠가 '이번 주 주제로'를 눌러 골라요" : ""}</div>`;
  const input = big && t
    ? `<div class="stk-reasons wb-who"><span class="label">누구 의견?</span>${people.map((p) => `<button type="button" class="stk-rs ${p === ideaWho ? "on" : ""}" data-idea-who="${escapeHtml(p)}" style="--c:${colorOf(p)}">${escapeHtml(p)}</button>`).join("")}</div>
       <div class="set-add"><input data-idea-in="opinion" maxlength="50" placeholder="${escapeHtml(ideaWho)}의 생각"><button type="button" data-idea="opinion">보드에 붙이기</button></div>`
    : "";
  const done = big && t ? `<div class="idea-done"><button type="button" class="stk-rs" data-idea="done">🏁 회의 끝 (지난 주제로 보내기)</button></div>` : "";
  return `<div class="wb${big ? " big" : ""}"><div class="wb-inner">${board}</div><div class="wb-tray"><i></i><i></i><i></i><i></i></div></div>${input}${done}`;
}

function ideasHtml(data) {
  const I = data.ideas || { list: [], past: [] };
  const people = ideaPeople(data);
  ideaWho ||= people[0];
  const row = (it) => `<div class="stk-row idea-row"><span>${escapeHtml(it.text)}<small>${it.by ? ` ${escapeHtml(it.by)}` : ""}${it.date ? ` · ${escapeHtml(it.date.slice(5).replace("-", "/"))}` : ""}</small></span>
      <button type="button" data-idea="pick" data-text="${escapeHtml(it.raw)}" title="이번 주 주제로 (엄마·아빠)">📌 이번 주 주제로</button><button type="button" data-idea="del" data-text="${escapeHtml(it.raw)}" title="지우기(엄마·아빠)">✕</button></div>`;
  return `<h2>💡 가족회의 아이디어 <small>이야기하고 싶은 걸 미리 적어 둬요</small></h2>
    <div class="idea-now">📌 이번 주 주제: ${I.topic ? `<b>${escapeHtml(I.topic.text)}</b> <a class="stk-rs on" href="#meeting">🗣️ 가족회의 화이트보드에서 의견 붙이기</a>` : `<span>아직 안 정했어요 — 아래에서 엄마·아빠가 '📌 이번 주 주제로'를 눌러 골라요</span>`}</div>
    <div class="meet-grid">
      <div class="meet-sec"><h3>📝 아이디어 <small>${(I.list || []).length}개</small></h3>
        ${(I.list || []).length ? I.list.map(row).join("") : `<div class="empty">아직 없어요</div>`}
        <div class="stk-reasons"><span class="label">누가 적어요?</span>${people.map((p) => `<button type="button" class="stk-rs ${p === ideaWho ? "on" : ""}" data-idea-who="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join("")}</div>
        <div class="set-add"><input data-idea-in="add" maxlength="50" placeholder="회의에서 이야기하고 싶은 것"><button type="button" data-idea="add">적기</button></div></div>
      <div class="meet-sec"><h3>📚 지난 주제</h3>
        ${(I.past || []).length ? I.past.slice(0, 20).map((p) => `<div class="idea-past">${escapeHtml(p)}</div>`).join("") : `<div class="empty">아직 없어요</div>`}</div>
    </div>
    <div class="kid-tip">아이디어와 의견은 누구나 적어요. 이번 주 주제 고르기·회의 끝·지우기(✕)는 엄마·아빠 메뉴에 들어가 있을 때만 돼요.</div>`;
}
function renderIdeas(data) {
  const el = $("ideas");
  if (document.activeElement && el.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;   // 쓰는 중이면 그대로
  el.innerHTML = ideasHtml(data);
}

document.addEventListener("click", async (ev) => {
  const kind = currentView().kind;
  if ((kind !== "ideas" && kind !== "meeting") || !lastData) return;    // 화이트보드는 가족회의 창, 아이디어 목록은 아이디어 창
  const who = ev.target.closest("[data-idea-who]"), b = ev.target.closest("[data-idea]");
  if (who) { ideaWho = who.dataset.ideaWho; if (kind === "ideas") $("ideas").innerHTML = ideasHtml(lastData); else $("meeting").innerHTML = meetingHtml(lastData); return; }
  if (!b) return;
  const act = b.dataset.idea;
  let text = b.dataset.text || "";
  if (act === "add" || act === "opinion") {
    const inp = document.querySelector(`[data-idea-in="${act}"]`);
    text = inp.value.trim();
    if (!text) return inp.focus();
    inp.value = ""; inp.blur();
  }
  if (act === "del" && !confirm("이 아이디어를 지울까요?")) return;
  if (act === "opdel" && !confirm("이 의견을 지울까요?")) return;
  if (act === "pick" && lastData.ideas && lastData.ideas.topic && !confirm(`지금 주제 '${lastData.ideas.topic.text}'와 의견은 '지난 주제'로 옮겨져요. 바꿀까요?`)) return;
  if (act === "done" && !confirm("회의를 마치고 이번 주 주제와 의견을 '지난 주제'로 보낼까요?")) return;
  try {
    b.disabled = true;
    await post("/api/ideas", { act, text, who: ideaWho });
    SFX.ding();
    if (act === "pick") toast("📌 이번 주 주제로 골랐어요", "lv");
    await refreshWiki();
  } catch (e) { toast("⚠️ " + e.message); b.disabled = false; }
});
document.addEventListener("keydown", (ev) => {                 // 입력 칸에서 엔터 = 적기
  const inp = ev.target.closest && ev.target.closest("[data-idea-in]");
  if (inp && ev.key === "Enter" && !ev.isComposing) document.querySelector(`[data-idea="${inp.dataset.ideaIn}"]`)?.click();
});
