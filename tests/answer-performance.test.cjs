const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const file = path.resolve(__dirname, '../pages/test-answer/index.js');

function fixture() {
  const nativeRequire = createRequire(file);
  const updates = [];
  const saved = [];
  const timers = new Map();
  let timerId = 0;
  let page;
  const wx = { showToast() {}, showModal() {}, redirectTo() {}, switchTab() {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; },
    wx,
    console,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(id) {
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id.endsWith('/archive.js')) return {
        saveResult(value) { saved.push(value); return { ...value, id: 'saved-record' }; }
      };
      if (id.endsWith('/themes.js')) return { getState: () => ({ selectedId: '', catalog: [] }) };
      if (id.endsWith('/theme-assets.js')) return { resolveThemeAsset: async () => '' };
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = value => { updates.push(value); Object.assign(page.data, value); };
  return { page, updates, saved, timers };
}

test('answer page keeps the full questionnaire and answers out of setData', async () => {
  const { page, updates } = fixture();
  page.onLoad({ id: 'ie', context: 'ordinary' });
  await Promise.resolve();

  assert.equal(Object.hasOwn(page.data, 'questions'), false);
  assert.equal(Object.hasOwn(page.data, 'answers'), false);
  assert.equal(page._questions.length, 15);
  assert.equal(page._answers.length, 15);
  assert.ok(updates.every(value => !Object.hasOwn(value, 'questions') && !Object.hasOwn(value, 'answers')));

  page.selectOption({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(page._answers[0], 1);
  assert.equal(page.data.selectedOption, 1);
  assert.ok(updates.every(value => !Object.hasOwn(value, 'questions') && !Object.hasOwn(value, 'answers')));
});

test('logic-only answers still save canonical question ids', () => {
  const { page, saved } = fixture();
  page.onLoad({ id: 'ie', context: 'work' });
  page._answers = page._questions.map(() => 0);
  page.submitTest();

  assert.equal(saved.length, 1);
  assert.equal(saved[0].answers.length, page._questions.length);
  assert.equal(saved[0].answers[0].questionId, 1);
  assert.equal(saved[0].answers[0].optionIndex, 0);
  assert.equal(saved[0].lifeContext, 'work');
});
