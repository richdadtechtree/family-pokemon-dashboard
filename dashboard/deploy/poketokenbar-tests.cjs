// PokeTokenBar-Windows 파서/성장 테스트 — node test/run-tests.js (프레임워크 없음)
'use strict';
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  parseClaudeFile, parseCodexRollout, resolveCodexRollouts,
  aggregateDaily, scanAll,
} = require('../src/tokenReader');
// Configurable growth boundary tests
const { HATCH_AT, EVOLVE_2_AT, GRADUATE_AT, hatchCompanion, companionStatus, LINES, LEGENDARIES } = require('../src/pokemon');
const { estimateCost } = require('../src/pricing');
const { buildDadCompanionExport, writeDadCompanionExport } = require('../src/dadExport');

const FIX = path.join(__dirname, 'fixtures');
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ---------- Claude ----------
// 픽스처: msg-1 (중복 라인: output 500→800, keep-max로 total 2300만 1회),
//         msg-2 total 3000 (11/13), msg-3 total 1000 (11/12),
//         cost-state costUSD 0.05 (sonnet 모델).
check('Claude: 중복 message.id는 keep-max로 1회만 집계 (msg-1 total 2300)', () => {
  const entries = parseClaudeFile(path.join(FIX, 'claude-sample.jsonl'));
  assert.strictEqual(entries.length, 3);
  const total = entries.reduce((a, e) => a + e.input + e.output + e.cacheWrite + e.cacheRead, 0);
  assert.strictEqual(total, 2300 + 3000 + 1000); // = 6300
  const m1 = entries.find((e) => e.id.startsWith('msg-1|'));
  assert.strictEqual(m1.output, 800);
  assert.strictEqual(m1.input + m1.output + m1.cacheWrite + m1.cacheRead, 2300);
});

check('Claude: cost-state costUSD 0.05가 보고 비용으로 배분됨', () => {
  const entries = parseClaudeFile(path.join(FIX, 'claude-sample.jsonl'));
  const sum = entries.reduce((a, e) => a + (e.explicitCost || 0), 0);
  assert.ok(Math.abs(sum - 0.05) < 1e-9, `합계 ${sum} ≠ 0.05`);
});

check('Claude: 날짜별 집계 (11/13 = 5300, 11/12 = 1000)', () => {
  const entries = parseClaudeFile(path.join(FIX, 'claude-sample.jsonl'));
  const agg = aggregateDaily(entries);
  assert.strictEqual(agg.byDay['2026-11-13'].claude, 5300);
  assert.strictEqual(agg.byDay['2026-11-12'].claude, 1000);
  assert.strictEqual(agg.totalTokens, 6300);
});

// ---------- Codex ----------
// 부모: 턴 델타 10500 + 5300 = 15800. 자식 포크: 앞 2개 이벤트 replay 제거, 신규 턴 2400만 소유.
// 합계 15800 + 2400 = 18200.
check('Codex: 부모 rollout 델타 합계 15800', () => {
  const r = parseCodexRollout(path.join(FIX, 'rollout-parent.jsonl'));
  assert.strictEqual(r.sessionID, 'sess-parent-001');
  assert.strictEqual(r.events.length, 2);
  const total = r.events.reduce((a, ev) => a + ev.entry.input + ev.entry.output + ev.entry.cacheRead, 0);
  assert.strictEqual(total, 15800);
});

check('Codex: 포크 replay 제거 — 부모+자식 합계 18200 (중복 15800 제외)', () => {
  const parent = parseCodexRollout(path.join(FIX, 'rollout-parent.jsonl'));
  const child = parseCodexRollout(path.join(FIX, 'rollout-child.jsonl'));
  assert.strictEqual(child.parentSessionID, 'sess-parent-001');
  const entries = resolveCodexRollouts([parent, child], [parent.path, child.path]);
  const total = entries.reduce((a, e) => a + e.input + e.output + e.cacheWrite + e.cacheRead, 0);
  assert.strictEqual(total, 18200);
  // 자식 소유는 신규 턴 1개뿐
  const childOwned = entries.filter((e) => e.id.includes('sess-child-002'));
  assert.strictEqual(childOwned.length, 1);
  assert.strictEqual(childOwned[0].input + childOwned[0].output + childOwned[0].cacheRead, 2400);
});

// ---------- scanAll (env override) ----------
check('scanAll: env 루트 override로 양쪽 로그 통합 (Claude 6300 + Codex 18200 = 24500)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptb-test-'));
  const claudeDir = path.join(tmp, 'claude', 'proj1');
  const codexDir = path.join(tmp, 'codex', 'sessions');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(codexDir, { recursive: true });
  fs.copyFileSync(path.join(FIX, 'claude-sample.jsonl'), path.join(claudeDir, 'session.jsonl'));
  fs.copyFileSync(path.join(FIX, 'rollout-parent.jsonl'), path.join(codexDir, 'rollout-parent.jsonl'));
  fs.copyFileSync(path.join(FIX, 'rollout-child.jsonl'), path.join(codexDir, 'rollout-child.jsonl'));
  process.env.POKETOKENBAR_CLAUDE_ROOTS = path.join(tmp, 'claude');
  process.env.POKETOKENBAR_CODEX_ROOTS = path.join(tmp, 'codex');
  const { claude, codex, entries } = scanAll();
  delete process.env.POKETOKENBAR_CLAUDE_ROOTS;
  delete process.env.POKETOKENBAR_CODEX_ROOTS;
  const ct = claude.reduce((a, e) => a + e.input + e.output + e.cacheWrite + e.cacheRead, 0);
  const xt = codex.reduce((a, e) => a + e.input + e.output + e.cacheWrite + e.cacheRead, 0);
  assert.strictEqual(ct, 6300);
  assert.strictEqual(xt, 18200);
  const agg = aggregateDaily(entries);
  assert.strictEqual(agg.totalTokens, 24500);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------- 가격 ----------
check('가격: Sonnet 5 요율로 1M input+1M output 추정 = $12', () => {
  const est = estimateCost('claude-sonnet-5', { input: 1e6, output: 1e6, cacheWrite: 0, cacheRead: 0 });
  assert.ok(est && Math.abs(est.usd - 12) < 1e-9);
});

// ---------- 포켓몬 성장 ----------
check('포켓몬: 가족 공통 164종 + 전설 10종', () => {
  assert.ok(LINES.length >= 20);
  assert.strictEqual(new Set([...LINES.flatMap(l => l.chain), ...LEGENDARIES].map(p => p.dex)).size, 164);
  assert.strictEqual(LEGENDARIES.length, 10);
  for (const l of LINES) assert.ok(l.chain.length >= 1 && l.chain.length <= 3);
});

function fixedCompanion() {
  return { line: LINES[0].chain.map((s) => ({ ...s })), rarity: 'common', shiny: false };
}
check('포켓몬: 임계값 — 0 알 / HATCH_AT 부화 / EVOLVE_2_AT 2단계 / GRADUATE_AT 졸업', () => {
  const c = fixedCompanion();
  assert.strictEqual(companionStatus(c, 0).stage, 0);
  assert.strictEqual(companionStatus(c, (HATCH_AT - 1)).stage, 0);
  const h = companionStatus(c, HATCH_AT);
  assert.strictEqual(h.stage, 1);
  assert.strictEqual(h.current.ko, '이상해씨');
  assert.strictEqual(h.nextLabel, '진화');
  assert.strictEqual(h.nextAt, EVOLVE_2_AT);
  const e2 = companionStatus(c, EVOLVE_2_AT);
  assert.strictEqual(e2.stage, 2);
  assert.strictEqual(e2.current.ko, '이상해풀');
  assert.strictEqual(e2.nextAt, GRADUATE_AT);
  assert.strictEqual(e2.nextLabel, '졸업');
  const g = companionStatus(c, GRADUATE_AT);
  assert.strictEqual(g.stage, 3);
  assert.strictEqual(g.graduated, true);
  assert.strictEqual(g.current.ko, '이상해꽃');
  assert.strictEqual(g.nextAt, null);
});

check('포켓몬: 전설은 부화 즉시 최종형, 졸업 GRADUATE_AT', () => {
  const c = { line: [{ ...LEGENDARIES[1] }], rarity: 'legendary', shiny: false };
  assert.strictEqual(companionStatus(c, HATCH_AT).current.ko, '뮤');
  assert.strictEqual(companionStatus(c, (GRADUATE_AT - 1)).graduated, false);
  assert.strictEqual(companionStatus(c, GRADUATE_AT).graduated, true);
});

function seqRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
check('포켓몬: hatchCompanion은 고정 rng로 결정적 (이상이 라인, shiny 아님)', () => {
  const c = hatchCompanion(seqRng([0.001, 0.5])); // 첫 값=뽑기, 둘째=이로치 판정
  assert.strictEqual(c.line[0].ko, '이상해씨');
  assert.strictEqual(c.shiny, false);
  const shiny = hatchCompanion(seqRng([0.999, 0.001])); // 전설 구간 + 이로치
  assert.strictEqual(shiny.rarity, 'legendary');
  assert.strictEqual(shiny.shiny, true);
});

// ---------- 아빠 동료 내보내기 (가족 대시보드용) ----------
function dadState(companion, startTokens, pokedex) {
  return { companion, companionStartTokens: startTokens, pokedex: pokedex || [] };
}
function dadAgg(total, today) {
  return { today: { total: today || 0 }, totalTokens: total };
}
check('아빠 내보내기: 알일 때는 종을 드러내지 않는다 (dex null, 부화 HATCH_AT)', () => {
  const ex = buildDadCompanionExport(dadState(fixedCompanion(), 100000), dadAgg(101200, 1200));
  assert.strictEqual(ex.version, 1);
  assert.strictEqual(ex.companion.dex, null);
  assert.strictEqual(ex.companion.ko, '알');
  assert.strictEqual(ex.companion.stageLabel, '알');
  assert.strictEqual(ex.sinceStartTokens, 1200);
  assert.strictEqual(ex.nextAt, HATCH_AT);
  assert.strictEqual(ex.nextLabel, '부화');
  assert.ok(Math.abs(ex.progress - 1200 / HATCH_AT) < 1e-9);
  assert.strictEqual(ex.todayTokens, 1200);
  assert.strictEqual(ex.pokedexCount, 0);
  assert.ok(!('cost' in ex) && !('costUSD' in ex), '비용은 내보내지 않는다');
});

check('아빠 내보내기: 1단계 — 이상해씨, 진화까지 EVOLVE_2_AT', () => {
  const ex = buildDadCompanionExport(dadState(fixedCompanion(), 100000), dadAgg((HATCH_AT + 45500000), 2340));
  assert.strictEqual(ex.companion.dex, 1);
  assert.strictEqual(ex.companion.ko, '이상해씨');
  assert.strictEqual(ex.companion.stageIndex, 1);
  assert.strictEqual(ex.companion.stageLabel, '1단계');
  assert.strictEqual(ex.nextAt, EVOLVE_2_AT);
  assert.strictEqual(ex.nextLabel, '진화');
  assert.strictEqual(ex.sinceStartTokens, (HATCH_AT + 45400000));
});

check('아빠 내보내기: 전설은 부화 즉시 최종형, 졸업 GRADUATE_AT', () => {
  const leg = { line: [{ ...LEGENDARIES[1] }], rarity: 'legendary', shiny: true, hatchedAt: '2026-11-13T00:00:00Z' };
  const ex = buildDadCompanionExport(dadState(leg, 0), dadAgg((HATCH_AT + 122000000), 1000));
  assert.strictEqual(ex.companion.dex, 151);
  assert.strictEqual(ex.companion.ko, '뮤');
  assert.strictEqual(ex.companion.stageLabel, '최종');
  assert.strictEqual(ex.companion.shiny, true);
  assert.strictEqual(ex.nextAt, GRADUATE_AT);
  assert.strictEqual(ex.nextLabel, '졸업');
  assert.strictEqual(ex.pokedex[0], undefined);
});

check('아빠 내보내기: 동료 없음 → companion null, 가짜 포켓몬 없음', () => {
  const ex = buildDadCompanionExport(dadState(null, 0), dadAgg(0, 0));
  assert.strictEqual(ex.companion, null);
  assert.strictEqual(ex.sinceStartTokens, 0);
  assert.strictEqual(ex.nextAt, HATCH_AT);
});

check('아빠 내보내기: 쓰기 — 폴더가 있으면 아빠/포켓몬-동료.json, 없으면 조용히 건너뜀', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptb-dad-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(repo, '아빠'), { recursive: true });
  const ok = writeDadCompanionExport(dadState(fixedCompanion(), 100000), dadAgg((HATCH_AT + 45500000), 2340), repo);
  assert.strictEqual(ok.ok, true);
  const back = JSON.parse(fs.readFileSync(path.join(repo, '아빠', '포켓몬-동료.json'), 'utf8'));
  assert.strictEqual(back.companion.ko, '이상해씨');
  assert.strictEqual(back.nextAt, EVOLVE_2_AT);
  const missing = writeDadCompanionExport(dadState(fixedCompanion(), 0), dadAgg(0, 0), path.join(tmp, 'no-repo'));
  assert.deepStrictEqual(missing, { ok: false, reason: 'no-folder' });
  const empty = writeDadCompanionExport(dadState(fixedCompanion(), 0), dadAgg(0, 0), '');
  assert.deepStrictEqual(empty, { ok: false, reason: 'no-folder' });
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`\n모든 테스트 통과: ${passed}개`);
