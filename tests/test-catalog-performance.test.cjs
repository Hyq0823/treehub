const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const light = require('../data/test-catalog.js');

test('lightweight catalog stays aligned with the full questionnaire metadata and report titles', async () => {
  const imported = await import('../data/tests/index.js');
  const full = imported.default;
  assert.deepEqual(light.catalog, full.map(item => ({
    id: item.id, name: item.name, icon: item.icon, description: item.description,
    time: item.time, questionsCount: item.questionsCount
  })));
  full.forEach(item => {
    item.reports.forEach(report => {
      assert.equal(light.resolveResultTitle(item.id, {
        testId: item.id, scoringVersion: item.id === 'bigfive' ? 'legacy' : '2', scores: { value: 1 }, resultType: report.type
      }), report.title, `${item.id}:${report.type}`);
    });
  });
  assert.equal(light.resolveResultTitle('bigfive', {
    testId: 'bigfive', scoringVersion: '2', resultType: 'profile',
    scores: { openness: 24, conscientiousness: 24, extraversion: 24, agreeableness: 24, neuroticism: 24 }
  }), '你的五维特质');
});

test('every test is registered in display order, exploration metadata and cloud theme counting', () => {
  const ids = light.catalog.map(item => item.id);
  const display = require('../data/exploration.js');
  assert.deepEqual(Object.keys(display.tests).sort(), ids.slice().sort());
  const hallSource = fs.readFileSync(path.join(root, 'pages/test-hall/index.js'), 'utf8');
  const orderSource = hallSource.match(/const DISPLAY_ORDER = (\[[^;]+\]);/);
  assert.ok(orderSource, 'hall display order remains statically inspectable');
  assert.deepEqual(Array.from(vm.runInNewContext(orderSource[1])).sort(), ids.slice().sort());
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/treehub-api/index.js'), 'utf8');
  const cloudIdsSource = cloudSource.match(/const TEST_IDS = (\[[^;]+\]);/);
  assert.ok(cloudIdsSource, 'cloud exploration allowlist remains statically inspectable');
  assert.deepEqual(Array.from(vm.runInNewContext(cloudIdsSource[1])).sort(), ids.slice().sort());
});

function evaluateWithoutFullCatalog(relativeFile, globals = {}) {
  const file = path.join(root, relativeFile);
  const nativeRequire = createRequire(file);
  const requested = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), Object.assign({
    module, exports: module.exports, console,
    require(specifier) {
      requested.push(specifier);
      if (specifier.includes('data/tests/index.js')) throw new Error('full questionnaire loaded during first paint');
      return nativeRequire(specifier);
    }
  }, globals), { filename: file });
  assert.equal(requested.some(specifier => specifier.includes('data/tests/index.js')), false);
  return module.exports;
}

test('archive and listing pages do not load the full questionnaires', () => {
  evaluateWithoutFullCatalog('utils/archive.js');
  let page;
  evaluateWithoutFullCatalog('pages/test-hall/index.js', {
    Page(value) { page = value; },
    wx: {}, setTimeout, clearTimeout
  });
  assert.ok(page && typeof page.loadTests === 'function');
  evaluateWithoutFullCatalog('pages/user-center/index.js', {
    Page(value) { page = value; }, wx: {}, Promise, getApp() { return { globalData: {} }; }
  });
  assert.ok(page && typeof page.loadArchive === 'function');
  evaluateWithoutFullCatalog('pages/tree-history/index.js', {
    Page(value) { page = value; }, wx: {}
  });
  assert.ok(page && typeof page.loadHistory === 'function');
});

test('archive loads the full questionnaire only when validating submitted answers', () => {
  const source = fs.readFileSync(path.join(root, 'utils/archive.js'), 'utf8');
  const topLevel = source.slice(0, source.indexOf('function saveResult'));
  assert.equal(topLevel.includes("require('../data/tests/index.js')"), false);
  assert.match(source.slice(source.indexOf('function saveResult')), /require\('\.\.\/data\/tests\/index\.js'\)/);
});
