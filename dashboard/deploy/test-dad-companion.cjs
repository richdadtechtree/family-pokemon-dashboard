'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({document: {addEventListener() {}}, escapeHtml: s => String(s).replace(/[<>&"]/g, '_')});
for (const name of ['pokemon', 'dex', 'dad']) vm.runInContext(fs.readFileSync(path.join(root, `js/${name}.js`), 'utf8'), context);
const evaluate = code => vm.runInContext(code, context);
assert.equal(evaluate('DEX_ALL.length'), 164);
assert.equal(evaluate('new Set(DEX_ALL.map(x => x[0])).size'), 164);
assert.equal(evaluate('dadDexOf({}).met.size'), 0);
assert.equal(evaluate('dadDexOf({dadCompanion:{companion:{dex:null,ko:"알"}}}).met.size'), 0);
assert.equal(evaluate('dadDexOf({dadCompanion:{pokedex:[{dex:260,ko:"대짱이"},{dex:260,ko:"대짱이",shiny:true}],companion:{dex:260,ko:"대짱이"}}}).met.size'), 1);
assert.equal(evaluate('dadDexOf({dadCompanion:{pokedex:[{dex:260,ko:"대짱이",shiny:true}],companion:{dex:260,ko:"대짱이"}}}).met.get(260).shiny'), true);
assert.equal(evaluate('dadDexOf({pokeCounts:{첫째:100},dadCompanion:{met:[{dex:1,ko:"이상해씨"}],companion:{dex:null}}}).met.size'), 1);
assert.equal(evaluate('dadDexOf({dadCompanion:{pokedex:[{dex:"<script>",ko:"bad"},{dex:-1,ko:"bad"}]}}).met.size'), 0);
// 아빠/포켓몬-동료.json 은 이제 서버에서만 만든다(GitHub에 없음). 이 PC에 있을 때만 검사한다.
const snapPath = path.join(root, '../아빠/포켓몬-동료.json');
const snapshot = fs.existsSync(snapPath) ? JSON.parse(fs.readFileSync(snapPath, 'utf8')) : null;
if (snapshot) {
assert.ok(snapshot.companion);
assert.ok(snapshot.pokedex.length >= 1);
assert.ok(!JSON.stringify(snapshot).match(/cost|apiKey|claudeRoots|codexRoots|line"/));
if (snapshot.companion.stageIndex === 0) {
  assert.equal(snapshot.companion.dex, null);
  assert.deepEqual(snapshot.met, []);
}
}
console.log('Passed: catalogue union, egg privacy, duplicate species, shiny preservation, separate records, invalid entries, live export.');
