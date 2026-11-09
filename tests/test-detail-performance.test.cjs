const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPage() {
  const file = path.resolve(__dirname, '../pages/test-detail/index.js');
  const fullTest = {
    id: 'large-test', name: '完整题库', icon: '✦', description: '页面摘要',
    questionsCount: 40, time: '5分钟', questions: [{ id: 1 }],
    reports: [{ type: 'sample' }], scoring: { dimensions: ['sample'] }
  };
  let page;
  const navigations = [];
  const wx = {
    setNavigationBarTitle() {},
    navigateTo(value) { navigations.push(value); }
  };
  const dependencies = {
    '../../utils/track.js': { report() {}, EVENTS: {} },
    '../../data/exploration.js': { tests: { 'large-test': { title: '展示名称' } } },
    '../../utils/share-card.js': { DEFAULT_SHARE_IMAGE: '/assets/share-cover.webp' },
    '../../utils/archive.js': { getRecords() { return []; } },
    '../../utils/life-context.js': {
      OPTIONS: [{ id: 'ordinary' }],
      getContext(id) { return id === 'ordinary' ? { id } : null; }
    },
    '../../data/tests/index.js': { default: [fullTest] }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; },
    require(specifier) {
      if (!Object.prototype.hasOwnProperty.call(dependencies, specifier)) throw new Error(`Unexpected dependency: ${specifier}`);
      return dependencies[specifier];
    },
    wx
  }, { filename: file });
  page.setData = value => Object.assign(page.data, value);
  return { page, navigations };
}

test('test detail sends only its rendered summary through setData', () => {
  const { page, navigations } = loadPage();
  page.onLoad({ id: 'large-test' });

  assert.deepEqual(Object.keys(page.data.test).sort(), [
    'cover', 'coverAssetPath', 'description', 'displayName', 'formatLabel', 'formatValue', 'icon', 'id', 'name', 'questionsCount', 'shareTitle', 'time', 'timelineTitle'
  ]);
  assert.equal(page.data.test.questions, undefined);
  assert.equal(page.data.test.reports, undefined);
  assert.equal(page.data.test.scoring, undefined);

  page.startTest();
  assert.equal(navigations[0].url, '/pages/test-answer/index?id=large-test&context=ordinary');
});
