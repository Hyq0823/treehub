const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function fixture(resolve = ids => Object.fromEntries(ids.map(id => [id, `https://cloud.example/${id}.webp`]))) {
  const file = path.resolve(__dirname, '../pages/test-hall/index.js');
  const nativeRequire = createRequire(file);
  const calls = [], invalidations = [], changes = [];
  let page;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, wx: {}, console, setTimeout, clearTimeout,
    require(id) {
      if (id.endsWith('/archive.js')) return { getArchive: () => ({ seed: 'test', records: [] }) };
      if (id.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (id.endsWith('/tab-bar.js')) return { syncTabBar() {} };
      if (id === '../../utils/themes.js') return { getState: () => ({ selectedId: 'adventurer' }) };
      if (id.endsWith('/theme-assets.js')) return {
        resolveThemeAsset: async () => '',
        resolveThemeAssets(ids) { calls.push(Array.from(ids)); return resolve(ids); },
        invalidateThemeAsset(id) { invalidations.push(id); }
      };
      if (id.endsWith('/public-assets.js')) return {
        resolvePublicAssets(ids) { calls.push(Array.from(ids)); return resolve(ids); },
        invalidatePublicAsset(id) { invalidations.push(id); }
      };
      return nativeRequire(id);
    }
  }, { filename: file });
  page.data = structuredClone(page.data);
  page.setData = update => { changes.push(update); Object.assign(page.data, update); };
  page.data.cards = [
    { id: 'mbti', artThemeId: 'adventurer', category: 'personality', image: '' },
    { id: 'firstreaction', assetPath: 'tests/first-reaction/cover.webp', image: '' }
  ];
  page.data.filteredCards = page.data.cards;
  const current = id => page.data.cards.find(card => card.id === id);
  const event = (id, source = current(id).image) => ({ currentTarget: { dataset: { id, source } } });
  return { page, calls, invalidations, changes, current, event };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a permanently broken remote card retries once, then stops native errors and visibility callbacks from looping', async () => {
  const env = fixture();
  env.page.loadCardImage('mbti'); await settle();
  assert.equal(env.calls.length, 1);
  env.page.cardImageFailed(env.event('mbti')); await settle();
  assert.equal(env.calls.length, 2);
  env.page.cardImageFailed(env.event('mbti')); await settle();
  for (let index = 0; index < 20; index++) {
    env.page.cardImageFailed(env.event('mbti'));
    env.page.loadCardImage('mbti');
  }
  await settle();
  assert.equal(env.calls.length, 2);
  assert.equal(env.current('mbti').image, '');
  assert.equal(env.page.data.cardImagesFailed, true);
  assert.equal(env.invalidations.length, 2);
});

test('explicit retry coalesces repeated taps and successful image load clears its retry notice', async () => {
  const env = fixture();
  env.page.loadCardImage('mbti'); await settle();
  env.page.cardImageFailed(env.event('mbti')); await settle();
  env.page.cardImageFailed(env.event('mbti')); await settle();
  env.page.retryCardImages(); env.page.retryCardImages(); await settle();
  assert.equal(env.calls.length, 3);
  env.page.cardImageLoaded(env.event('mbti'));
  assert.equal(env.page.data.cardImagesFailed, false);
  env.page.retryCardImages(); await settle();
  assert.equal(env.calls.length, 3);
});

test('stale image errors and loads do not clear a replacement or its failure notice', async () => {
  const env = fixture();
  env.page.loadCardImage('mbti'); await settle();
  const stale = env.event('mbti', 'https://cloud.example/old.webp');
  const initialChanges = env.changes.length;
  env.page.cardImageFailed(stale);
  env.page.cardImageFailed(env.event('mbti', ''));
  assert.equal(env.changes.length, initialChanges);
  env.page.markCardImageFailed('mbti');
  env.page.cardImageLoaded(stale);
  assert.equal(env.page.data.cardImagesFailed, true);
  env.page.cardImageLoaded(env.event('mbti'));
  assert.equal(env.page.data.cardImagesFailed, false);
});

test('an image failing while hidden is invalidated without view updates and can recover on return', async () => {
  const env = fixture();
  env.page.loadCardImage('mbti'); await settle();
  const failed = env.event('mbti');
  env.page.onHide();
  const count = env.changes.length;
  env.page.cardImageFailed(failed);
  assert.equal(env.changes.length, count);
  assert.deepEqual(env.invalidations, ['adventurer']);
  env.page.onShow(); await settle();
  assert.equal(env.current('mbti').image, '');
  assert.equal(env.page.data.cardImagesFailed, true);
  env.page.loadCardImage('mbti'); await settle();
  assert.equal(env.calls.length, 2);
  env.page.cardImageLoaded(env.event('mbti'));
  assert.equal(env.page.data.cardImagesFailed, false);
  env.page.onUnload();
});

test('leaving hall cancels an automatic error retry and ignores late native callbacks', async () => {
  const env = fixture();
  env.page.loadCardImage('mbti'); await settle();
  const failed = env.event('mbti');
  env.page.cardImageFailed(failed);
  env.page.onHide();
  const count = env.changes.length;
  env.page.cardImageFailed(failed); env.page.cardImageLoaded(failed); env.page.retryCardImages();
  env.page._hidden = false;
  await settle();
  assert.equal(env.calls.length, 1);
  assert.equal(env.changes.length, count);
});

test('missing or rejected URL resolutions have a bounded budget, reset on the next visit', async () => {
  for (const resolve of [() => ({}), () => Promise.reject(new Error('offline'))]) {
    const env = fixture(resolve);
    for (let index = 0; index < 6; index++) { env.page.loadCardImage('mbti'); await settle(); }
    assert.equal(env.calls.length, 2);
    assert.equal(env.current('mbti').image, '');
    assert.equal(env.page.data.cardImagesFailed, true);
    env.page.onHide(); env.page.onShow(); await settle();
    env.page.loadCardImage('mbti'); await settle();
    assert.equal(env.calls.length, 3);
    env.page.onUnload();
  }
});

test('first-reaction artwork uses the same remote retry bound without a local image fallback', async () => {
  const env = fixture();
  env.page.loadCardImage('firstreaction'); await settle();
  env.page.cardImageFailed(env.event('firstreaction')); await settle();
  env.page.cardImageFailed(env.event('firstreaction')); await settle();
  assert.equal(env.calls.length, 2);
  assert.equal(env.current('firstreaction').image, '');
  assert.ok(env.invalidations.every(value => value === 'tests/first-reaction/cover.webp'));
});
