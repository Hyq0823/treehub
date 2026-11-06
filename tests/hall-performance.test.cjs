const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');

test('hall keeps the resolved hero and defers one share-card render across repeated shows', async () => {
  const file = path.join(root, 'pages/test-hall/index.js');
  const nativeRequire = createRequire(file);
  const timers = new Map();
  let nextTimer = 1;
  let definition;
  let assetRequests = 0;
  let shareRenders = 0;
  global.wx = { nextTick: callback => callback() };

  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: value => { definition = value; },
    wx: global.wx,
    console,
    clearTimeout: id => timers.delete(id),
    setTimeout: (callback, delay) => {
      assert.equal(delay, 1500);
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    require: specifier => {
      if (specifier.endsWith('/track.js')) return { report() {}, EVENTS: { HALL_VIEW: 'hall' } };
      if (specifier.endsWith('/archive.js')) return { getArchive: () => ({ seed: 'test-seed', records: [] }) };
      if (specifier === '../../utils/themes.js') return { getState: () => ({ selectedId: 'adventurer' }) };
      if (specifier.endsWith('/theme-assets.js')) return {
        resolveThemeAsset: async () => { assetRequests++; return 'https://cloud.example/adventurer.webp'; },
        resolveThemeAssets: async ids => Object.fromEntries(ids.map(id => [id, `https://cloud.example/${id}.webp`])),
        invalidateThemeAsset() {}
      };
      if (specifier.endsWith('/share-card.js')) return {
        DEFAULT_SHARE_IMAGE: '/assets/share-cover.webp',
        buildShareCard: async () => { shareRenders++; return '/tmp/hall-share.png'; }
      };
      if (specifier.endsWith('/tab-bar.js')) return { syncTabBar() {} };
      return nativeRequire(specifier);
    }
  }, { filename: file });

  definition.data = structuredClone(definition.data);
  definition.setData = changes => Object.assign(definition.data, changes);

  definition.onShow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(assetRequests, 1);
  assert.equal(shareRenders, 0, 'share canvas must not compete with first paint');
  assert.equal(definition.data.themeImage, 'https://cloud.example/adventurer.webp');
  assert.equal(timers.size, 1);

  const renderShare = [...timers.values()][0];
  timers.clear();
  renderShare();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shareRenders, 1);
  assert.equal(definition.data.shareImagePath, '/tmp/hall-share.png');

  definition.onHide();
  definition.onShow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(assetRequests, 1, 'returning to the same theme reuses its resolved image');
  assert.equal(shareRenders, 1, 'returning to the same theme reuses its share card');
  assert.equal(timers.size, 0);
  assert.equal(definition.data.themeImage, 'https://cloud.example/adventurer.webp');
});

function thumbnailPage(resolveThemeAssets) {
  const file = path.join(root, 'pages/test-hall/index.js');
  const nativeRequire = createRequire(file);
  let definition;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: value => { definition = value; },
    wx: {}, console, setTimeout, clearTimeout,
    require: specifier => {
      if (specifier.endsWith('/track.js')) return { report() {}, EVENTS: {} };
      if (specifier.endsWith('/theme-assets.js')) return {
        resolveThemeAsset: async () => '', resolveThemeAssets, invalidateThemeAsset() {}
      };
      if (specifier.endsWith('/share-card.js')) return { DEFAULT_SHARE_IMAGE: '/assets/share-cover.webp', buildShareCard: async () => '' };
      return nativeRequire(specifier);
    }
  }, { filename: file });
  definition.data = structuredClone(definition.data);
  definition.data.category = 'all';
  definition.data.cards = [
    ['mbti', 'adventurer'], ['bigfive', 'collector'], ['enneagram', 'romantic'],
    ['ie', 'observer'], ['sbti', 'dreamer'], ['shadow', 'moon']
  ].map(([id, artThemeId]) => ({ id, artThemeId, category: 'personality', image: '' }));
  definition.data.filteredCards = definition.data.cards;
  definition._hidden = false;
  let setDataCalls = 0;
  definition.setData = changes => { setDataCalls++; Object.assign(definition.data, changes); };
  return { page: definition, setDataCalls: () => setDataCalls };
}

test('visible hall cards resolve their cloud URLs in one batch and update once', async () => {
  const batches = [];
  const env = thumbnailPage(async ids => {
    batches.push(ids.slice());
    return Object.fromEntries(ids.map(id => [id, `https://cloud.example/${id}.webp`]));
  });
  env.page.data.cards.forEach(card => env.page.loadCardImage(card.id));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(batches.length, 1);
  assert.deepEqual([...batches[0]].sort(), ['adventurer', 'collector', 'dreamer', 'moon', 'observer', 'romantic']);
  assert.equal(env.setDataCalls(), 1);
  assert.ok(env.page.data.cards.every(card => card.image === `https://cloud.example/${card.artThemeId}.webp`));

  env.page.data.cards.forEach(card => env.page.loadCardImage(card.id));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(batches.length, 1, 'resolved cards are never requested again');
  assert.equal(env.setDataCalls(), 1);
});

test('a thumbnail batch finishing after the hall is hidden cannot update the page', async () => {
  let finish;
  const env = thumbnailPage(() => new Promise(resolve => { finish = resolve; }));
  env.page.loadCardImage('mbti');
  await Promise.resolve();
  env.page.onHide();
  finish({ adventurer: 'https://cloud.example/adventurer.webp' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.setDataCalls(), 0);
  assert.equal(env.page.data.cards[0].image, '');
});

test('a rapid return cannot let the previous microtask clear the new visible-card queue', async () => {
  const batches = [];
  const env = thumbnailPage(async ids => {
    batches.push([...ids]);
    return Object.fromEntries(ids.map(id => [id, `https://cloud.example/${id}.webp`]));
  });
  env.page.loadCardImage('mbti');
  env.page.onHide();
  env.page._hidden = false;
  env.page.loadCardImage('bigfive');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(batches, [['collector']]);
  assert.equal(env.page.data.cards.find(card => card.id === 'mbti').image, '');
  assert.equal(env.page.data.cards.find(card => card.id === 'bigfive').image, 'https://cloud.example/collector.webp');
});

test('a card pending across hide can be requested by the new visible generation', async () => {
  const resolvers = [];
  const env = thumbnailPage(() => new Promise(resolve => resolvers.push(resolve)));
  env.page.loadCardImage('mbti');
  await Promise.resolve();
  assert.equal(resolvers.length, 1);

  env.page.onHide();
  env.page._hidden = false;
  env.page.loadCardImage('mbti');
  await Promise.resolve();
  assert.equal(resolvers.length, 2, 'the returned page must not inherit stale pending markers');

  resolvers[1]({ adventurer: 'https://cloud.example/new.webp' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.page.data.cards[0].image, 'https://cloud.example/new.webp');
  resolvers[0]({ adventurer: 'https://cloud.example/stale.webp' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.page.data.cards[0].image, 'https://cloud.example/new.webp');
});
