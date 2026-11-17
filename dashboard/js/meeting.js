/* 가족 대시보드 — 11. 가족회의록 (상단 메뉴 '🗣️ 가족회의', 주소 #meeting · #meeting-2026-11-13)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 위키 가족회의/YYYY-MM-DD.md: ## 주제 · ## 의견(- 이름: 내용) · ## 정한 것 · ## 할 일(- 내용 (누구))
   - 누구나 쓴다(아이도, 비밀번호 없음). ✕ 지우기는 엄마·아빠만(서버가 메뉴 쿠키 확인). 할 일은 '📝 할 일로 보내기'.
   - 날짜 목록은 serve.py /api/meetings(날짜·주제 앞 2줄), 내용은 위키 파일을 그대로 읽는다.
   - 주제 입력 칸은 뺐다(2026-11-15 아빠 결정 — 주제는 '💡 회의 아이디어'에서 정하고 위 화이트보드에 보인다). 예전에 적힌 ## 주제 줄은 한 줄로 보여 준다.
   - 지난 회의 보기(2026-11-14 아빠 요청): ◀ 이전 회의 · 날짜 고르기 · 다음 회의 ▶ · 오늘, 아래 '📚 지난 회의' 목록(누르면 그날로). */
"use strict";
const MEET_SECTIONS = [["주제", "💡"], ["의견", "🙋"], ["정한 것", "✅"], ["할 일", "📝"]];
let meetDates = [], meetItems = [], meetDoc = {}, meetDay = "", meetWho = "";
const demoMeet = {};
async function loadMeeting(day) {
  meetDay = day;
  if (DEMO) {
    meetDates = Object.keys(demoMeet).filter((d) => Object.values(demoMeet[d]).some((l) => l.length)).sort().reverse();
    meetItems = meetDates.map((d) => ({ date: d, topics: (demoMeet[d]["주제"] || []).slice(0, 2), n: Object.values(demoMeet[d]).reduce((a, l) => a + l.length, 0) }));
    meetDoc = demoMeet[day] || {}; return;
  }
  try {
    const j = await (await fetch("/api/meetings", { cache: "no-store" })).json();
    meetDates = j.dates || [];
    meetItems = j.items || meetDates.map((d) => ({ date: d, topics: [], n: 0 }));
  } catch (e) { meetDates = []; meetItems = []; }
  meetDoc = {};
  try {
    const res = await fetch(CONFIG.wikiRoot + ["가족회의", `${day}.md`].map(encodeURIComponent).join("/"), { cache: "no-store" });
    if (res.ok) {
      const body = splitFrontmatter(await res.text()).body;
      for (const [s] of MEET_SECTIONS) meetDoc[s] = sectionLines(body, s).filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, "").trim());
    }
  } catch (e) { /* 아직 없는 날 */ }
}
function meetingHtml(data) {
  const today = ymd(new Date());
  const people = ["아빠", "엄마", ...data.kids.map((k) => k.name)];
  meetWho ||= people[0];
  const dows = ["일", "월", "화", "수", "목", "금", "토"];
  const nice = (d) => { const x = parseYMD(d); return `${x.getMonth() + 1}월 ${x.getDate()}일 (${dows[x.getDay()]})`; };
  const older = meetDates.filter((d) => d < meetDay).sort().reverse()[0];       // 기록이 있는 바로 앞 회의
  const newer = meetDates.filter((d) => d > meetDay).sort()[0];
  const past = meetItems.filter((it) => it.date !== meetDay);
  const pastHtml = past.length ? `<div class="meet-past"><h3>📚 지난 회의 <small>${past.length}번</small></h3>${past.map((it) =>
      `<a class="meet-past-row" href="#meeting-${it.date}"><b>${it.date === today ? "오늘" : nice(it.date)}</b><span>${it.topics.length ? it.topics.map(escapeHtml).join(" · ") : "주제 없음"}</span><small>${it.n}줄</small></a>`).join("")}</div>`
    : `<div class="meet-past"><h3>📚 지난 회의</h3><div class="empty">아직 지난 회의가 없어요</div></div>`;
  const sec = ([s, ic]) => {
    const items = meetDoc[s] || [];
    const isTodo = s === "할 일";
    return `<div class="meet-sec"><h3>${ic} ${s}</h3>${items.length ? items.map((t) => `<div class="stk-row"><span>${escapeHtml(t)}</span>
        ${isTodo ? `<button type="button" data-meet-send="${escapeHtml(t)}">📝 할 일로 보내기</button>` : ""}<button type="button" data-meet-del="${escapeHtml(s)}" data-text="${escapeHtml(t)}" title="지우기(엄마·아빠)">✕</button></div>`).join("") : `<div class="empty">아직 없어요</div>`}
      <div class="set-add"><input data-meet-in="${escapeHtml(s)}" maxlength="70" placeholder="${s === "의견" ? `${meetWho}의 생각` : s === "할 일" ? `할 일 (${meetWho})` : s === "주제" ? "오늘 이야기할 것" : "함께 정한 것"}"><button type="button" data-meet-add="${escapeHtml(s)}">적기</button></div></div>`;
  };
  return `<h2>🗣️ 가족회의 <small>${meetDay === today ? "오늘" : nice(meetDay)}${meetDay < today ? ` <span class="meet-old">지난 회의</span>` : ""}</small></h2>
    ${meetDay === today ? whiteboardHtml(data, true) : ""}
    <div class="meet-nav">
      ${older ? `<a class="stk-rs" href="#meeting-${older}">◀ 이전 회의</a>` : `<span class="stk-rs off">◀ 이전 회의</span>`}
      <input type="date" data-meet-date value="${meetDay}" max="${today}" aria-label="회의 날짜 고르기">
      ${newer ? `<a class="stk-rs" href="#meeting-${newer}">다음 회의 ▶</a>` : `<span class="stk-rs off">다음 회의 ▶</span>`}
      ${meetDay !== today ? `<a class="stk-rs on" href="#meeting">오늘로</a>` : ""}
    </div>
    <div class="stk-reasons"><span class="label">누가 적어요?</span>${people.map((p) => `<button type="button" class="stk-rs ${p === meetWho ? "on" : ""}" data-meet-who="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join("")}</div>
    ${(meetDoc["주제"] || []).length ? `<div class="meet-oldtopic">💡 이날 적힌 주제: ${meetDoc["주제"].map(escapeHtml).join(" · ")}</div>` : ""}
    <div class="meet-grid">${MEET_SECTIONS.filter(([s]) => s !== "주제").map(sec).join("")}</div>
    ${pastHtml}
    <div class="kid-tip">누구나 적을 수 있어요. 지우기(✕)는 엄마·아빠 메뉴에 들어가 있을 때만 돼요.</div>`;
}
async function renderMeeting(data, day) {
  const el = $("meeting");
  if (document.activeElement && el.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.type !== "date") return;   // 쓰는 중이면 그대로
  if (day !== meetDay || !meetDates.length) await loadMeeting(day);
  el.innerHTML = meetingHtml(data);
}
async function meetPost(body) {
  if (DEMO) {
    const doc = (demoMeet[body.date] ||= {});
    if (body.act === "send") return { ok: true };
    const list = (doc[body.section] ||= []);
    if (body.del) { const i = list.indexOf(body.text); if (i >= 0) list.splice(i, 1); } else list.push(body.text);
    return { ok: true };
  }
  return post("/api/meeting", body);
}
document.addEventListener("click", async (ev) => {
  if (currentView().kind !== "meeting" || !lastData) return;
  const t = ev.target;
  const who = t.closest("[data-meet-who]"), add = t.closest("[data-meet-add]"), del = t.closest("[data-meet-del]"), send = t.closest("[data-meet-send]");
  try {
    if (who) { meetWho = who.dataset.meetWho; $("meeting").innerHTML = meetingHtml(lastData); return; }
    if (add) {
      const s = add.dataset.meetAdd, inp = document.querySelector(`[data-meet-in="${s}"]`), v = inp.value.trim();
      if (!v) return;
      const text = s === "의견" ? `${meetWho}: ${v}` : s === "할 일" ? `${v} (${meetWho})` : v;
      await meetPost({ date: meetDay, section: s, text });
      inp.value = ""; inp.blur(); SFX.ding();
    } else if (del) {
      if (!confirm(`'${del.dataset.text}' 줄을 지울까요?`)) return;
      await meetPost({ date: meetDay, section: del.dataset.meetDel, text: del.dataset.text, del: true });
    } else if (send) {
      const m = send.dataset.meetSend.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
      await meetPost({ act: "send", text: m ? m[1] : send.dataset.meetSend, who: m ? m[2] : "가족" });
      toast("할 일 목록에 보냈어요 📝", "lv");
      if (!DEMO) await refreshWiki();
      return;
    } else return;
    await loadMeeting(meetDay);
    $("meeting").innerHTML = meetingHtml(lastData);
  } catch (e) { toast("⚠️ " + e.message); }
});
document.addEventListener("change", (ev) => {                  // 날짜 고르기 → 그날 회의로
  const d = ev.target.closest && ev.target.closest("[data-meet-date]");
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d.value)) d.blur(), location.hash = d.value === ymd(new Date()) ? "#meeting" : `#meeting-${d.value}`;
});
document.addEventListener("keydown", (ev) => {                 // 입력 칸에서 엔터 = 적기
  const inp = ev.target.closest && ev.target.closest("[data-meet-in]");
  if (inp && ev.key === "Enter") document.querySelector(`[data-meet-add="${inp.dataset.meetIn}"]`)?.click();
});
