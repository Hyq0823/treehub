const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(options = {}) {
  const texts = [], rects = [], arcs = [], exports = [], timers = new Map(), selectors = [];
  let selected, exported;
  const ctx = {
    font: '16px sans-serif', textAlign: 'left', fillStyle: '',
    createLinearGradient: () => ({ addColorStop() {} }),
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {},
    fillRect(x, y, width, height) { rects.push({ x, y, width, height, color: this.fillStyle }); },
    arc(x, y, radius) { arcs.push({ x, y, radius }); },
    measureText(value) {
      const size = Number((this.font.match(/(\d+)px/) || [0, 16])[1]);
      return { width: Array.from(String(value)).reduce((total, char) => total + (char.charCodeAt(0) > 255 ? size : size * .6), 0) };
    },
    fillText(text, x, y) { texts.push({ text, x, y, align: this.textAlign,
      fontSize: Number((this.font.match(/(\d+)px/) || [0, 16])[1]), width: this.measureText(text).width }); }
  };
  const canvas = { getContext: () => options.noContext ? null : ctx };
  const wx = {
    createSelectorQuery: () => ({
      in() { return this; }, select(value) { selectors.push(value); return this; }, fields() { return this; },
      exec(callback) { selected = callback; if (!options.queryPending) callback(options.noCanvas ? [] : [{ node: canvas }]); }
    }),
    canvasToTempFilePath(value) {
      exports.push(value); exported = value;
      if (!options.exportPending) {
        if (options.exportFail) value.fail();
        else value.success(options.emptyExport ? {} : { tempFilePath: '/tmp/comparison.jpg' });
      }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../packages/reports/comparison-share-card.js'), 'utf8'), {
    module, exports: module.exports, wx,
    setTimeout(callback, delay) { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    ...module.exports, texts, rects, arcs, exports, timers, selectors, canvas,
    finishQuery() { selected([{ node: canvas }]); },
    finishExport() { exported.success({ tempFilePath: '/tmp/comparison.jpg' }); }
  };
}

function snapshot(count = 4) {
  return {
    testId: 'friendshipstyle', testName: '友情里的你',
    beforeTitle: '友情小客厅', afterTitle: '出走搭子',
    beforeDate: '2026.05.15', afterDate: '2026.11.15',
    dimensions: Array.from({ length: count }, (_, index) => ({
      id: `dimension-${index}`, label: `第${index + 1}个维度`, before: index % 2 ? 66 : 22,
      after: index % 2 ? 33 : 78, delta: 999
    })),
    note: '两次自评位置的差异，不代表能力升降。',
    recordId: 'secret-record', answers: [4, 3], lifeContext: 'secret-context', openid: 'secret-openid'
  };
}

test('comparison JPEG contains all supplied dimensions for one, two, four, five and nine dimensions inside 3:4 bounds', async () => {
  for (const count of [1, 2, 4, 5, 9]) {
    const env = fixture(), source = snapshot(count), original = structuredClone(source);
    const result = await env.buildComparisonShareCard({}, source);
    assert.equal(result.path, '/tmp/comparison.jpg');
    assert.equal(env.exports[0].destWidth, 750);
    assert.equal(env.exports[0].destHeight, 1000);
    assert.equal(env.exports[0].fileType, 'jpg');
    assert.equal(env.exports[0].width / env.exports[0].height, 3 / 4);
    assert.equal(env.selectors[0], '#comparisonShareCanvas');
    assert.ok(source.dimensions.every(row => env.texts.some(text => text.text === row.label)));
    const bars = env.rects.filter(rect => rect.width <= 552 && rect.height === 6 && rect.y >= 440);
    assert.equal(bars.length, count * 4, 'every dimension has two tracks and two fills');
    for (const rect of env.rects) {
      assert.ok(rect.x >= 0 && rect.x + rect.width <= 750);
      assert.ok(rect.y >= 0 && rect.y + rect.height <= 1000);
    }
    for (const text of env.texts) {
      const left = text.align === 'right' ? text.x - text.width : text.x;
      const right = text.align === 'right' ? text.x : text.x + text.width;
      assert.ok(left >= 20 && right <= 730, `${text.text}: ${left}..${right}`);
      assert.ok(text.y >= 20 && text.y <= 980);
    }
    assert.equal(env.arcs.length, 3, 'decorative tree rings use native Canvas only');
    assert.equal(env.timers.size, 0);
    assert.deepEqual(source, original, 'rendering does not mutate private source data');
  }
});

test('six through nine dimensional cards keep chart text and all bars in disjoint row or column regions', async () => {
  const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
  for (const count of [6, 7, 8, 9]) {
    const env = fixture(), source = snapshot(count);
    source.dimensions[0].label = '一段很长的维度说明会被安全收起';
    source.dimensions[1].before = 100;
    source.dimensions[1].after = 0;
    source.dimensions[2].before = source.dimensions[2].after = 100;
    await env.buildComparisonShareCard({}, source);
    const texts = env.texts.filter(row => row.y >= 440 && row.y < 840);
    const bars = env.rects.filter(rect => rect.height === 6 && rect.y >= 440 && rect.y < 840);
    const boxes = texts.map(row => ({
      text: row.text, x: row.align === 'right' ? row.x - row.width : row.x,
      y: row.y - row.fontSize * .85, width: row.width, height: row.fontSize
    }));
    for (const text of boxes) {
      assert.ok(bars.every(bar => !intersects(text, bar)), `${count} rows: ${text.text} overlaps a bar`);
      assert.ok(text.y + text.height < 850, 'chart text stays above the footer divider');
    }
    for (let index = 0; index < boxes.length; index++) {
      assert.ok(boxes.slice(index + 1).every(other => !intersects(boxes[index], other)),
        `${count} rows: ${boxes[index].text} overlaps another chart label`);
    }
    assert.equal(bars.length, count * 4);
    assert.ok(texts.some(row => row.text === '0 个百分点'));
    assert.ok(texts.some(row => row.text === '−100 个百分点'));
  }
});

test('change labels derive percentage points from displayed positions and do not expose private snapshot extras', async () => {
  const env = fixture(), source = snapshot(4);
  source.dimensions[2] = { id: 'stable', label: '稳定维度', before: 50, after: 50, delta: 200 };
  source.dimensions[3] = { id: 'fraction', label: '小数维度', before: 33.33, after: 44.44, delta: 200 };
  await env.buildComparisonShareCard({}, source);
  const allText = env.texts.map(item => item.text).join('\n');
  assert.match(allText, /\+56 个百分点/);
  assert.match(allText, /−33 个百分点/);
  assert.match(allText, /0 个百分点/);
  assert.match(allText, /\+11.11 个百分点/);
  assert.doesNotMatch(allText, /999|200 个百分点|secret-|能力提升|改善|更准确/);
});

test('long Chinese identities and notes stay inside two lines without punctuation starting the second row', async () => {
  const env = fixture(), source = snapshot(2);
  source.beforeTitle = '一'.repeat(11) + '。';
  source.afterTitle = '「一个很长很长的友情意象名字」用来检验真实字体下的两行边界';
  source.note = '这'.repeat(40) + '，请把这些变化放回生活中看待，不代表高低好坏。';
  await env.buildComparisonShareCard({}, source);
  const before = env.texts.filter(row => row.x === 66 && [268, 299].includes(row.y));
  assert.equal(before.map(row => row.text).join(''), source.beforeTitle);
  assert.ok(before[1].text.length >= 4);
  assert.ok(!/^[，。！？；：、）】》]/.test(before[1].text));
  const after = env.texts.filter(row => row.x === 404 && [268, 299].includes(row.y));
  assert.equal(after.length, 2);
  assert.ok(after[1].text.endsWith('…'));
  assert.ok([...before, ...after].every(row => row.width <= 280));
  assert.ok(env.texts.filter(row => [894, 918].includes(row.y)).every(row => row.width <= 654));
});

test('invalid or absent dimension sets fail before requesting a native canvas', async () => {
  const malformed = [
    null, { ...snapshot(), testName: '' }, { ...snapshot(), dimensions: [] }, snapshot(10),
    { ...snapshot(), dimensions: [{ id: 'x', label: 'bad', before: NaN, after: 40 }] },
    { ...snapshot(), dimensions: [{ id: 'x', label: 'bad', before: -1, after: 40 }] },
    { ...snapshot(), dimensions: [{ id: 'x', label: 'bad', before: 30, after: 101 }] },
    { ...snapshot(), dimensions: [snapshot(1).dimensions[0], snapshot(1).dimensions[0]] }
  ];
  for (const value of malformed) {
    const env = fixture();
    await assert.rejects(env.buildComparisonShareCard({}, value), /数据暂不完整/);
    assert.equal(env.selectors.length, 0);
  }
});

test('an unchanged free comparison stays collectible without claiming a change happened', async () => {
  const env = fixture(), source = snapshot(2);
  source.dimensions = source.dimensions.map(item => ({ ...item, after: item.before, delta: 999 }));
  await env.buildComparisonShareCard({}, source);
  const heading = env.texts.find(row => row.y === 142).text;
  assert.equal(heading, '把这两次的我，一起收藏');
  assert.ok(!env.texts.some(row => row.text.includes('有了这些变化')));
  assert.ok(env.texts.some(row => row.text.includes('0 个百分点')));
});

test('missing canvas, unsupported context and export failures expose retryable errors and clear native wait timers', async () => {
  for (const [mode, message] of [
    [{ noCanvas: true }, /画布暂时未准备好/], [{ noContext: true }, /手机微信/],
    [{ exportFail: true }, /未能导出/], [{ emptyExport: true }, /未能导出/]
  ]) {
    const env = fixture(mode);
    await assert.rejects(env.buildComparisonShareCard({}, snapshot()), message);
    assert.equal(env.timers.size, 0);
  }
});

test('native selector and export waits time out without allowing late callbacks to continue or resurrect a card', async () => {
  for (const mode of [{ queryPending: true }, { exportPending: true }]) {
    const env = fixture(mode), pending = env.buildComparisonShareCard({}, snapshot());
    await Promise.resolve();
    const task = [...env.timers.values()][0];
    assert.equal(task.delay, 6000);
    const rejected = assert.rejects(pending, /再试一次/);
    task.callback(); await rejected;
    assert.equal(env.timers.size, 0);
    if (mode.queryPending) { env.finishQuery(); await Promise.resolve(); assert.equal(env.exports.length, 0); }
    else env.finishExport();
  }
});

test('cancellation is checked before selection, after selection and when a late export completes', async () => {
  const early = fixture();
  await assert.rejects(early.buildComparisonShareCard({}, snapshot(), () => true), error => error.cancelled === true);
  assert.equal(early.selectors.length, 0);
  let cancelled = false;
  const duringQuery = fixture({ queryPending: true });
  const queried = duringQuery.buildComparisonShareCard({}, snapshot(), () => cancelled);
  const queryRejected = assert.rejects(queried, error => error.cancelled === true);
  cancelled = true; duringQuery.finishQuery(); await queryRejected;
  assert.equal(duringQuery.exports.length, 0);
  assert.equal(duringQuery.timers.size, 0);
  cancelled = false;
  const duringExport = fixture({ exportPending: true });
  const exported = duringExport.buildComparisonShareCard({}, snapshot(), () => cancelled);
  await Promise.resolve();
  const exportRejected = assert.rejects(exported, error => error.cancelled === true);
  cancelled = true; duringExport.finishExport(); await exportRejected;
  assert.equal(duringExport.timers.size, 0);
});
