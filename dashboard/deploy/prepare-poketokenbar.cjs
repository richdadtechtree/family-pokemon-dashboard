// Prepare and test an app patch in this repository before installing it externally.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const appDir = process.argv[2] || 'D:/PokeTokenBar/poketokenbar-windows-source/poketokenbar-windows';
const original = fs.readFileSync(path.join(appDir, 'src/pokemon.js'), 'utf8');
let code = original;
const growth = JSON.parse(fs.readFileSync(path.join(__dirname, 'dad-growth.json'), 'utf8'));
assert.ok(growth.hatchAt > 0 && growth.evolveAt > growth.hatchAt && growth.graduateAt > growth.evolveAt);
code = code.slice(code.indexOf("'use strict';"));
code = `// Family catalogue integration. Token milestones: ${growth.hatchAt} / ${growth.evolveAt} / ${growth.graduateAt}.\n` + code;
code = code.replace(/const HATCH_AT = \d+;/, `const HATCH_AT = ${growth.hatchAt};`)
  .replace(/const EVOLVE_2_AT = \d+;/, `const EVOLVE_2_AT = ${growth.evolveAt};`)
  .replace(/const GRADUATE_AT = \d+;/, `const GRADUATE_AT = ${growth.graduateAt};`)
  .replace('졸업은 누적 45,000,000', '졸업은 GRADUATE_AT');
if (!code.includes('FAMILY_CATALOG')) {
  if (!code.includes('const LINES = [') || !code.includes('const LEGENDARIES = [')) throw new Error('Unexpected app source.');
  code = code.replace('const LINES = [', 'const BASE_LINES = [').replace('const LEGENDARIES = [', 'const BASE_LEGENDARIES = [');
  code = code.replace('const RARITY_WEIGHT =', `// Shared 164-species catalogue; existing companions keep their saved evolution chain.
const FAMILY_CATALOG = require('./family-catalog.json');
const oldNames = new Map([...BASE_LINES.flatMap(e => e.chain), ...BASE_LEGENDARIES].map(p => [p.dex, p]));
const oldRarity = new Map(BASE_LINES.map(e => [e.chain[0].dex, e.rarity]));
const species = p => ({...p, en: oldNames.get(p.dex)?.en || p.ko});
const LINES = FAMILY_CATALOG.filter(e => !e.legendary).map(e => ({
  rarity: oldRarity.get(e.chain[0].dex) || 'common', chain: e.chain.map(species)
}));
const LEGENDARIES = FAMILY_CATALOG.filter(e => e.legendary).map(e => species(e.chain[0]));

const RARITY_WEIGHT =`);
  code = code.replace('if (lineLength <= 1) return [HATCH_AT, GRADUATE_AT];', 'if (lineLength <= 2) return [HATCH_AT, GRADUATE_AT];');
}
// Preserve original ordering for deterministic draws and existing regression fixtures.
code = code.replace("const LINES = FAMILY_CATALOG.filter(e => !e.legendary).map(e => ({",
  "const LINES = FAMILY_CATALOG.filter(e => !e.legendary).sort((a, b) => { const rank = e => { const i = BASE_LINES.findIndex(l => l.chain[0].dex === e.chain[0].dex); return i < 0 ? 1000 : i; }; return rank(a) - rank(b); }).map(e => ({");
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'family-catalog.json'), 'utf8'));
const box = {module: {exports: {}}, require: name => { assert.equal(name, './family-catalog.json'); return catalog; }};
vm.runInNewContext(code, box);
const p = box.module.exports;
assert.equal(new Set([...p.LINES.flatMap(e => e.chain), ...p.LEGENDARIES].map(s => s.dex)).size, 164);
for (const n of [1, 2, 3]) {
  const companion = {line: Array.from({length:n}, (_, i) => ({dex:i+1, ko:`test${i}`}))};
  assert.equal(p.companionStatus(companion, p.HATCH_AT - 1).current, null);
  assert.equal(p.companionStatus(companion, p.GRADUATE_AT - 1).graduated, false);
  assert.equal(p.companionStatus(companion, p.GRADUATE_AT).current.dex, n);
}
assert.equal(p.HATCH_AT, growth.hatchAt);
assert.equal(p.GRADUATE_AT, growth.graduateAt);
const target = path.join(__dirname, 'poketokenbar-pokemon.cjs');
fs.writeFileSync(target, code);
let tests = fs.readFileSync(path.join(appDir, 'test/run-tests.js'), 'utf8');
tests = tests.replace("check('포켓몬: 라인 20개(60종) + 전설 10종', () => {", "check('포켓몬: 가족 공통 164종 + 전설 10종', () => {")
  .replace('assert.strictEqual(LINES.length, 20);', 'assert.ok(LINES.length >= 20);')
  .replace('assert.strictEqual(LINES.reduce((a, l) => a + l.chain.length, 0), 60);', 'assert.strictEqual(new Set([...LINES.flatMap(l => l.chain), ...LEGENDARIES].map(p => p.dex)).size, 164);')
  .replace('for (const l of LINES) assert.strictEqual(l.chain.length, 3);', 'for (const l of LINES) assert.ok(l.chain.length >= 1 && l.chain.length <= 3);');
if (!tests.includes('// Configurable growth boundary tests')) {
  tests = tests.replace("const { hatchCompanion, companionStatus, LINES, LEGENDARIES }", "// Configurable growth boundary tests\nconst { HATCH_AT, EVOLVE_2_AT, GRADUATE_AT, hatchCompanion, companionStatus, LINES, LEGENDARIES }");
  const values = {'78000000':'HATCH_AT','156000000':'EVOLVE_2_AT','234000000':'GRADUATE_AT',
    '77999999':'(HATCH_AT - 1)','233999999':'(GRADUATE_AT - 1)',
    '123500000':'(HATCH_AT + 45500000)','123400000':'(HATCH_AT + 45400000)','200000000':'(HATCH_AT + 122000000)'};
  tests = tests.replace(/\b(78000000|156000000|234000000|77999999|233999999|123500000|123400000|200000000)\b/g, n => values[n]);
  tests = tests.replaceAll('78M','HATCH_AT').replaceAll('156M','EVOLVE_2_AT').replaceAll('234M','GRADUATE_AT').replace(' (하루 ~39M 기준, 단계마다 약 2일)','');
}
fs.writeFileSync(path.join(__dirname, 'poketokenbar-tests.cjs'), tests);
console.log('Prepared app patch; 164 species, egg privacy and 1/2/3-stage graduation checks passed.');
