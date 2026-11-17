/* ════════════════════════════════════════════════════════════════
   구글 캘린더(iCal .ics) 읽기
   ────────────────────────────────────────────────────────────────
   - parse(text)  : .ics 글자 → 일정 목록 (반복 규칙 포함 원본)
   - expand(list, from, to) : 기간 안의 실제 일정들로 펼친다 (매주 반복 → 날짜별)
   지원하는 반복: 매일 · 매주(요일 지정) · 매월(같은 날 / 둘째 일요일 같은 n번째 요일) · 매년,
                 간격(INTERVAL) · 횟수(COUNT) · 종료일(UNTIL) · 제외 날짜(EXDATE) · 한 번만 바꾼 일정(RECURRENCE-ID)
                 · 날짜 목록(RDATE — 음력 생신처럼 해마다 날짜가 다른 일정)
   시간대: 'Z'(UTC)는 정확히 바꾸고, 그 밖의 시각은 이 기기 시간(한국이면 KST)으로 본다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const DAY = 86400000;
  const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  // "20260302T134000Z" · "20260302T134000" · "20260302" → { d: Date, allDay }
  function parseDate(v, params) {
    v = (v || "").trim();
    let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m || /DATE/i.test(params.VALUE || "") && (m = v.match(/^(\d{4})(\d{2})(\d{2})/)))
      return { d: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };
    m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return null;
    const a = m.slice(1, 7).map(Number);
    return { d: m[7] ? new Date(Date.UTC(a[0], a[1] - 1, a[2], a[3], a[4], a[5])) : new Date(a[0], a[1] - 1, a[2], a[3], a[4], a[5]), allDay: false };
  }
  const unescape = (s) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

  function parse(text) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");   // 접힌 줄 펴기
    const out = [];
    let ev = null;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") { ev = { exdates: [], rdates: [] }; continue; }
      if (line === "END:VEVENT") { if (ev && ev.start) out.push(ev); ev = null; continue; }
      if (!ev) continue;
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...ps] = line.slice(0, i).split(";");
      const params = {};
      for (const p of ps) { const [k, val] = p.split("="); params[k.toUpperCase()] = val; }
      const val = line.slice(i + 1);
      switch (name.toUpperCase()) {
        case "UID": ev.uid = val; break;
        case "SUMMARY": ev.title = unescape(val); break;
        case "STATUS": ev.status = val.toUpperCase(); break;
        case "DTSTART": { const r = parseDate(val, params); if (r) { ev.start = r.d; ev.allDay = r.allDay; } break; }
        case "DTEND": { const r = parseDate(val, params); if (r) ev.end = r.d; break; }
        case "RRULE": ev.rrule = Object.fromEntries(val.split(";").map((kv) => kv.split("="))); break;
        case "RDATE": for (const x of val.split(",")) { const r = parseDate(x, params); if (r) ev.rdates.push(r.d.getTime()); } break;
        case "EXDATE": for (const x of val.split(",")) { const r = parseDate(x, params); if (r) ev.exdates.push(r.d.getTime()); } break;
        case "RECURRENCE-ID": { const r = parseDate(val, params); if (r) ev.recurrenceId = r.d.getTime(); break; }
      }
    }
    for (const e of out) {
      if (!e.end) e.end = new Date(e.start.getTime() + (e.allDay ? DAY : 0));
      e.title = e.title || "(제목 없음)";
    }
    return out;
  }

  // 같은 시각(시·분·초)을 유지한 채 날짜만 바꾼 Date
  const withDate = (base, y, mo, d) => new Date(y, mo, d, base.getHours(), base.getMinutes(), base.getSeconds());
  // 그 달의 n번째 요일 (n<0이면 끝에서부터)
  function nthWeekday(y, mo, wd, n) {
    if (n > 0) { const first = new Date(y, mo, 1).getDay(); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; }
    const lastDate = new Date(y, mo + 1, 0).getDate(), last = new Date(y, mo, lastDate).getDay();
    return lastDate - ((last - wd + 7) % 7) + (n + 1) * 7;
  }

  // 반복 일정 하나 → 시작 시각들 (기간 끝까지, 최대 3000번)
  function occurrences(e, to) {
    const r = e.rrule, s = e.start;
    const freq = (r.FREQ || "").toUpperCase();
    const interval = Math.max(1, +(r.INTERVAL || 1));
    const count = r.COUNT ? +r.COUNT : Infinity;
    const until = r.UNTIL ? parseDate(r.UNTIL, {}).d : null;
    const days = (r.BYDAY || "").split(",").filter(Boolean).map((t) => { const m = t.match(/^([+-]?\d*)([A-Z]{2})$/); return m ? { n: m[1] ? +m[1] : 0, wd: WD[m[2]] } : null; }).filter(Boolean);
    const res = [];
    let n = 0;
    const push = (d) => {
      if (d < s) return true;
      if (until && d > until) return false;
      if (n >= count) return false;
      n++; res.push(d);
      return d <= to;
    };
    for (let k = 0; k < 3000; k++) {
      let cands = [];
      if (freq === "DAILY") cands = [withDate(s, s.getFullYear(), s.getMonth(), s.getDate() + k * interval)];
      else if (freq === "WEEKLY") {
        const monday = s.getDate() - ((s.getDay() + 6) % 7) + k * 7 * interval;
        const wds = days.length ? days.map((x) => x.wd) : [s.getDay()];
        cands = wds.map((wd) => withDate(s, s.getFullYear(), s.getMonth(), monday + ((wd + 6) % 7))).sort((a, b) => a - b);
      } else if (freq === "MONTHLY") {
        const y = s.getFullYear(), mo = s.getMonth() + k * interval;
        const first = new Date(y, mo, 1);
        if (days.length && days[0].n) cands = days.map((x) => withDate(s, first.getFullYear(), first.getMonth(), nthWeekday(first.getFullYear(), first.getMonth(), x.wd, x.n)));
        else { const d = withDate(s, first.getFullYear(), first.getMonth(), s.getDate()); if (d.getDate() === s.getDate()) cands = [d]; }   // 31일 없는 달은 건너뜀
      } else if (freq === "YEARLY") {
        const d = withDate(s, s.getFullYear() + k * interval, s.getMonth(), s.getDate());
        if (d.getMonth() === s.getMonth()) cands = [d];   // 2월 29일 → 평년은 건너뜀
      } else return [s];
      for (const d of cands) if (!push(d)) return res;
      if (cands.length && cands[0] > to) return res;
    }
    return res;
  }

  // 기간 [from, to] 안의 실제 일정들 → [{ title, start, end, allDay }]
  function expand(list, from, to) {
    const overrides = new Set(list.filter((e) => e.recurrenceId).map((e) => e.uid + "|" + e.recurrenceId));
    const out = [];
    const add = (e, st) => {
      const en = new Date(st.getTime() + (e.end - e.start));
      if (st < to && en > from) out.push({ title: e.title, start: st, end: en, allDay: e.allDay });
    };
    for (const e of list) {
      if (e.status === "CANCELLED") continue;
      if (e.recurrenceId || (!e.rrule && !e.rdates.length)) { add(e, e.start); continue; }
      const starts = e.rrule ? [...occurrences(e, to)] : [e.start];
      const seen = new Set(starts.map((d) => d.getTime()));
      for (const t of e.rdates) if (!seen.has(t)) { seen.add(t); starts.push(new Date(t)); }
      for (const st of starts) {
        if (e.exdates.includes(st.getTime())) continue;
        if (overrides.has(e.uid + "|" + st.getTime())) continue;   // 이 회차는 따로 바뀐 일정이 대신한다
        add(e, st);
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  window.CalendarICS = { parse, expand };
})();
