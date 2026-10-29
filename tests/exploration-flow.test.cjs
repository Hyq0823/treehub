const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const archive = require('../utils/archive.js');
const imported = require('../data/tests/index.js');
const catalog = imported.default || imported;
let memory, navigation, notifications, networkCalls;
beforeEach(() => {
  memory = new Map(); navigation = []; notifications = []; networkCalls = 0;
  global.wx = {
    getStorageSync: key => memory.has(key) ? structuredClone(memory.get(key)) : '',
    setStorageSync: (key, value) => memory.set(key, structuredClone(value)),
    navigateTo: args => navigation.push(args.url), redirectTo: args => navigation.push(args.url),
    switchTab: args => navigation.push(args.url),
    showToast: args => notifications.push(args), showModal: args => notifications.push(args),
    reportEvent: () => networkCalls++
  };
  global.getApp = () => ({ globalData: { enterScene: 1001 } });
});
function page(route) {
  let value;
  const file = path.join(root, route, 'index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: object => { value = object; }, require: createRequire(file),
    wx: global.wx, getApp: global.getApp, console, setTimeout, clearTimeout
  }, { filename: file });
  value.data = structuredClone(value.data);
  value.setData = changes => Object.assign(value.data, changes);
  return value;
}
function complete(id, choice = 0) {
  const answer = page('pages/test-answer');
  answer.onLoad({ id });
  answer.data.answers = answer.data.questions.map(q => Math.min(choice, q.options.length - 1));
  answer.submitTest();
  assert.equal(answer.data.submitted, true, `${id} persisted`);
  const record = archive.getLatest(id);
  const report = page('packages/reports');
  report.onLoad({ id, recordId: record.id });
  assert.equal(report.data.state, 'ready', `${id} report rendered`);
  assert.ok(report.data.result.title);
  answer.onUnload();
  return record;
}
test('real page flow: first exploration, grow through five tests, repeat, reload, read exact historical record', () => {
  const hall = page('pages/test-hall'); hall.onLoad(); hall.onShow();
  assert.equal(hall.data.tree.stage.id, 'seed');
  assert.equal(hall.data.cards.length, 6);
  assert.ok(hall.data.cards.every(c => !c.collected));
  const first = complete('mbti', 0);
  hall.onShow();
  assert.equal(hall.data.tree.uniqueCount, 1);
  assert.equal(hall.data.tree.stage.id, 'sprout');
  assert.equal(hall.data.cards.find(c => c.id === 'mbti').collected, true);
  const original = structuredClone(first.treeSnapshot);
  archive.unlockPremium(first.id);
  ['ie', 'enneagram', 'bigfive', 'shadow'].forEach(id => complete(id));
  hall.onShow();
  assert.equal(hall.data.tree.stage.id, 'growing');
  assert.equal(hall.data.tree.uniqueCount, 5);
  assert.equal(hall.data.tree.nextStage, null, 'do not advertise unavailable tenth test');
  const again = complete('mbti', 1);
  const reload = page('pages/test-hall'); reload.onShow();
  assert.equal(reload.data.tree.uniqueCount, 5);
  assert.equal(reload.data.tree.totalCount, 6);
  assert.equal(reload.data.cards.find(c => c.id === 'mbti').recordId, again.id);
  assert.deepEqual(archive.getRecord(first.id).treeSnapshot, original);
  const historical = page('packages/reports'); historical.onLoad({ id: 'mbti', recordId: first.id });
  assert.equal(historical.data.result.type, first.resultType);
  const personal = page('pages/user-center'); personal.onShow();
  assert.equal(personal.data.totalCount, 6);
  assert.equal(personal.data.repeatCount, 1);
  assert.equal(personal.data.groups.find(g => g.id === 'mbti').count, 2);
  assert.equal(personal.data.groups.find(g => g.id === 'mbti').history[1].premiumUnlocked, true);
  const journal = page('pages/tree-history'); journal.onShow();
  assert.equal(journal.data.snapshots.length, 6);
  assert.equal(journal.data.snapshots[journal.data.snapshots.length - 1].tree.stage.id, 'sprout');
  assert.equal(networkCalls, 0, 'local-only analytics never upload results');
  assert.equal(notifications.length, 0);
});
test('all six tests can be collected and revisited; filtering and navigation stay functional', () => {
  catalog.forEach(t => complete(t.id));
  const hall = page('pages/test-hall'); hall.onShow();
  assert.equal(hall.data.tree.uniqueCount, 6);
  assert.equal(hall.data.recommendation, null);
  hall.selectCategory({ currentTarget: { dataset: { id: 'playful' } } });
  assert.deepEqual(Array.from(hall.data.filteredCards, c => c.id), ['sbti', 'shadow']);
  hall.openTest({ currentTarget: { dataset: { id: 'sbti' } } });
  assert.match(navigation.at(-1), /^\/packages\/reports\/index\?.*recordId=/);
  hall.exploreNext();
  assert.equal(navigation.at(-1), '/pages/user-center/index');
});
test('hall preserves invalid local archive and renders recoverable state', () => {
  memory.set(archive.STORAGE_KEY, { broken: 'preserve me' });
  const hall = page('pages/test-hall'); hall.onShow();
  assert.ok(hall.data.error);
  assert.deepEqual(memory.get(archive.STORAGE_KEY), { broken: 'preserve me' });
  const personal = page('pages/user-center'); personal.onShow();
  assert.ok(personal.data.error);
});
test('all registered pages, components and packaged assets exist within main-package budget', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json')));
  assert.equal(config.tabBar.list.length, 2);
  assert.equal(config.lazyCodeLoading, 'requiredComponents');
  const subPackages = config.subPackages || config.subpackages || [];
  const subRoutes = subPackages.flatMap(subPackage => subPackage.pages.map(route => `${subPackage.root}/${route}`));
  assert.ok(subRoutes.includes('packages/reports/index'), 'report page belongs to its downloaded subpackage');
  for (const route of [...config.pages, ...subRoutes]) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(root, route + '.' + ext)), route + ext);
    const pageConfig = JSON.parse(fs.readFileSync(path.join(root, route + '.json')));
    for (const component of Object.values(pageConfig.usingComponents || {})) {
      for (const ext of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(root, component + '.' + ext)));
    }
  }
  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')));
  const excluded = ['.git', ...project.packOptions.ignore.map(item => item.value)];
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      if (excluded.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`))) continue;
      if (entry.isDirectory()) visit(target); else files.push({ relative, bytes: fs.statSync(target).size });
    }
  }
  visit(root);
  const subRoots = subPackages.map(subPackage => subPackage.root.replace(/\/$/, ''));
  const inSubpackage = file => subRoots.some(prefix => file.relative.startsWith(`${prefix}/`));
  const mainBytes = files.filter(file => !inSubpackage(file)).reduce((sum, file) => sum + file.bytes, 0);
  assert.ok(mainBytes <= 1400000, `${mainBytes} bytes exceed the 1.4MB source budget reserved for the 1.5MB main-package check`);
  for (const subRoot of subRoots) {
    const bytes = files.filter(file => file.relative.startsWith(`${subRoot}/`)).reduce((sum, file) => sum + file.bytes, 0);
    assert.ok(bytes > 0 && bytes < 2 * 1024 * 1024, `${subRoot}: ${bytes} bytes exceed subpackage budget`);
  }
  for (const file of files.filter(file => /\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|aac|m4a)$/i.test(file.relative))) {
    assert.ok(file.bytes <= 200000, `${file.relative}: ${file.bytes} bytes exceed the 200KB media budget`);
  }
  assert.ok(fs.statSync(path.join(root, 'assets/trees/species.png')).size > 10000);
});

test('all SBTI result images resolve inside the report subpackage with no duplicated runtime originals', () => {
  const sbti = catalog.find(item => item.id === 'sbti');
  const images = sbti.reports.map(report => report.image);
  assert.equal(images.length, 27);
  assert.equal(new Set(images).size, 27);
  for (const image of images) {
    assert.match(image, /^\/packages\/reports\/images\//);
    const asset = path.join(root, image);
    assert.ok(fs.existsSync(asset), `${image} must exist in the downloaded report package`);
    assert.ok(fs.statSync(asset).size > 0);
  }
  function containsFiles(directory) {
    if (!fs.existsSync(directory)) return false;
    return fs.readdirSync(directory, { withFileTypes: true }).some(entry =>
      !entry.isDirectory() || containsFiles(path.join(directory, entry.name))
    );
  }
  assert.equal(containsFiles(path.join(root, 'data/tests/images')), false, 'old originals must not remain in the main package');
});

test('legacy report links preserve the record identity and encode query characters safely', () => {
  const bridge = page('pages/test-result');
  const recordId = 'record?x=1&汉字=#%';
  bridge.onLoad({ id: 'mbti', recordId, unrelated: 'discard-me' });
  const destination = new URL(navigation.at(-1), 'https://example.invalid');
  assert.equal(destination.pathname, '/packages/reports/index');
  assert.equal(destination.searchParams.get('id'), 'mbti');
  assert.equal(destination.searchParams.get('recordId'), recordId);
  assert.equal(destination.searchParams.has('unrelated'), false);
});

test('legacy bridge displays a retry state when the report package fails to open', () => {
  let attempts = 0;
  global.wx.redirectTo = options => {
    attempts++;
    if (attempts === 1) options.fail({ errMsg: 'subpackage unavailable' });
    else navigation.push(options.url);
  };
  const bridge = page('pages/test-result');
  bridge.onLoad({ id: 'ie', recordId: 'saved-record' });
  assert.ok(bridge.data.error, 'network failure must not leave an indefinite loading state');
  bridge.openReport();
  assert.equal(attempts, 2);
  assert.match(navigation.at(-1), /^\/packages\/reports\/index\?id=ie&recordId=saved-record$/);
  bridge.goToHome();
  assert.equal(navigation.at(-1), '/pages/test-hall/index');
});
