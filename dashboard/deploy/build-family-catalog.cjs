// The dashboard catalogue is the source of truth for both applications.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pokemon.js'), 'utf8') + ';this.catalog = POKE_ALL;', context);
const catalog = context.catalog.flatMap(e => {
  let chains = [[]];
  for (const stage of e.chain) {
    const choices = Array.isArray(stage[0]) ? stage : [stage];
    chains = chains.flatMap(chain => choices.map(([dex, ko]) => [...chain, {dex, ko, en: ''}]));
  }
  return chains.map(chain => ({legendary: e.legendary, chain}));
});
fs.writeFileSync(path.join(__dirname, 'family-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Shared catalogue: ${new Set(catalog.flatMap(e => e.chain.map(p => p.dex))).size} species`);
