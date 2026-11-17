/* 가족 대시보드 — 1. 날짜 도우미 · 2. 마크다운 읽기
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* ════════════════════════════════════════════════════════════════
   1. 날짜 도우미 — 날짜는 모두 이 기기의 시간(한국이면 KST) 기준
   ════════════════════════════════════════════════════════════════ */
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
// "2026-11-12" 같은 글자 → Date. 형식이 아니면 null (틀린 날짜를 지어내지 않기 위해)
function parseYMD(s) {
  const m = String(s || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;   // 2월 30일 같은 잘못된 날짜 거르기
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ════════════════════════════════════════════════════════════════
   2. 마크다운 읽기 — 위키 문서에서 표·목록·머리말(frontmatter)을 뽑는다
   ════════════════════════════════════════════════════════════════ */
// 맨 위 --- 사이의 "키: 값"을 객체로
function splitFrontmatter(md) {
  md = md.replace(/\r\n/g, "\n");
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) for (const line of m[1].split("\n")) {
    const kv = line.match(/^([^:#]+):\s*(.*)$/);
    if (kv) meta[kv[1].trim()] = kv[2].trim();
  }
  return { meta, body: m ? md.slice(m[0].length) : md };
}
// "## 제목" 아래 줄들 (다음 ## 제목 전까지). title이 null이면 문서 전체
function sectionLines(body, title) {
  const lines = body.split("\n");
  if (title == null) return lines;
  const out = []; let inside = false;
  for (const l of lines) {
    if (/^#{1,2}\s/.test(l)) { inside = l.replace(/^#+\s*/, "").includes(title); continue; }
    if (inside) out.push(l);
  }
  return out;
}
// 마크다운 표 → [[칸, 칸, ...], ...] (머리줄·구분줄 제외)
function parseTable(lines) {
  const rows = lines.map((l) => l.trim()).filter((l) => l.startsWith("|"));
  return rows.slice(1)
    .filter((l) => !/^\|\s*:?-{2,}/.test(l))
    .map((l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
}
// "- 내용 ~10/25 (부탁한 사람)" 또는 "- [x] 내용" → { text, who, due, done }
function parseItems(lines) {
  return lines.filter((l) => /^\s*[-*]\s+\S/.test(l)).map((l) => {
    let t = l.replace(/^\s*[-*]\s+/, "");
    let done = false;
    const box = t.match(/^\[([ xX])\]\s*/);
    if (box) { done = box[1].toLowerCase() === "x"; t = t.slice(box[0].length); }
    let who = "";
    const w = t.match(/\(([^()]+)\)\s*$/);
    if (w) { who = w[1].trim(); t = t.slice(0, w.index).trim(); }
    let due = "";
    const dd = t.match(/~\s*(\d{1,2}\/\d{1,2})/);
    if (dd) { due = dd[1]; t = (t.slice(0, dd.index) + t.slice(dd.index + dd[0].length)).trim(); }
    return { text: t, who, due, done };
  }).filter((it) => it.text);
}

