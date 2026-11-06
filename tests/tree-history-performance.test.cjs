const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');

function loadHistoryPage(records) {
  const file = path.join(root, 'pages/tree-history/index.js');
  const nativeRequire = createRequire(file);
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: definition => { page = definition; },
    require: specifier => specifier.endsWith('/archive.js') ? { getRecords: () => records } : nativeRequire(specifier),
    wx: {}, console
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = changes => Object.assign(page.data, changes);
  return page;
}

function record(index) {
  return {
    id: `record-${index}`, testId: index % 2 ? 'mbti' : 'ie', testVersion: '1', scoringVersion: '2',
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    treeSnapshot: { name: 'test tree', stage: { id: 'sprout', name: 'sprout' }, uniqueCount: 1 }
  };
}

test('growth history renders eight records first and loads the rest in stable batches', () => {
  const page = loadHistoryPage(Array.from({ length: 19 }, (_, index) => record(index)));
  page.onShow();
  assert.equal(page.data.totalCount, 19);
  assert.equal(page.data.snapshots.length, 8);
  assert.equal(page.data.snapshots[0].number, 19);
  assert.equal(page.data.hasMore, true);
  page.loadMore();
  assert.equal(page.data.snapshots.length, 16);
  assert.equal(page.data.hasMore, true);
  page.onShow();
  assert.equal(page.data.snapshots.length, 16, 'returning from a report keeps the expanded history window');
  assert.equal(page.data.hasMore, true);
  page.loadMore();
  assert.equal(page.data.snapshots.length, 19);
  assert.equal(page.data.snapshots.at(-1).number, 1);
  assert.equal(page.data.hasMore, false);
});

test('history trees are static while the reusable tree component remains animated by default', () => {
  const history = fs.readFileSync(path.join(root, 'pages/tree-history/index.wxml'), 'utf8');
  assert.match(history, /animated="\{\{false\}\}"/);
  const file = path.join(root, 'components/personality-tree/index.js');
  let component;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Component: definition => { component = definition; } }, { filename: file });
  assert.equal(component.properties.animated.value, true);
});
