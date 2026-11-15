const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('report shares its existing archive snapshot with both theme preparations', () => {
  const memory = new Map();
  let reads = 0;
  const archive = require('../utils/archive.js');
  global.wx = {
    getStorageSync(key) {
      if (key === archive.STORAGE_KEY) reads++;
      return memory.has(key) ? structuredClone(memory.get(key)) : '';
    },
    setStorageSync: (key, value) => memory.set(key, structuredClone(value)),
    removeStorageSync: key => memory.delete(key)
  };
  const quiz = require('../data/test-loader.js').getTest('relationshiprhythm');
  const { scoreTest } = require('../utils/scoring.js');
  const record = archive.saveResult({ testId: quiz.id, testVersion: '1', scoringVersion: '2',
    ...scoreTest(quiz, quiz.questions, quiz.questions.map(() => 0)) });
  const file = path.resolve(__dirname, '../packages/reports/index.js');
  const nativeRequire = createRequire(file);
  const themeInputs = [];
  const themes = require('../utils/themes.js');
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, wx: global.wx, console, setTimeout, clearTimeout,
    require(id) {
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id === '../../utils/themes.js') return Object.assign({}, themes, {
        getState(records) { themeInputs.push(records); return themes.getState(records); }
      });
      if (id === '../../utils/theme-assets.js') return { resolveThemeAsset: async () => '' };
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = data => Object.assign(page.data, data);
  reads = 0;
  page.onLoad({ id: quiz.id, recordId: record.id });
  assert.equal(page.data.state, 'ready');
  assert.equal(reads, 2, 'only exact-record selection and one shared history snapshot read the archive');
  assert.equal(themeInputs.length, 2);
  assert.ok(Array.isArray(themeInputs[0]));
  assert.equal(themeInputs[0], themeInputs[1], 'starter and current-theme preparation reuse the same data');
  page.onUnload();
});
