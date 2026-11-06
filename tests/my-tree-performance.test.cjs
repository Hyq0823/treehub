const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'pages/my-tree/index.js');

function fixture() {
  const nativeRequire = createRequire(pagePath);
  const { THEMES } = require('../data/themes.js');
  const catalog = THEMES.map(theme => Object.assign({}, theme, {
    unlocked: theme.id === 'adventurer',
    discovered: !theme.hidden,
    selected: theme.id === 'adventurer',
    earned: false,
    pending: false,
    recommended: theme.id === 'adventurer'
  }));
  const state = {
    selectedId: 'adventurer', starterClaimed: true, uniqueCount: 1,
    catalogCount: catalog.length, recommendation: 'adventurer', catalog
  };
  const timerEntries = new Map();
  const heroRequests = [];
  const galleryBatches = [];
  let nextTimer = 0;
  let shareBuilds = 0;
  let page;

  const wx = {
    setNavigationBarColor() {},
    switchTab() {},
    showToast() {},
    showModal() {}
  };
  vm.runInNewContext(fs.readFileSync(pagePath, 'utf8'), {
    Page(value) { page = value; },
    wx,
    console,
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timerEntries.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timerEntries.delete(id); },
    require(specifier) {
      if (specifier.endsWith('/archive.js')) return { getRecords: () => [] };
      if (specifier === '../../utils/themes.js') {
        return { getState: () => state, getPendingGrant: () => null };
      }
      if (specifier.endsWith('/theme-assets.js')) {
        return {
          async resolveThemeAsset(id) {
            heroRequests.push(id);
            return `https://cloud.example/${id}.webp`;
          },
          async resolveThemeAssets(ids) {
            galleryBatches.push(ids.slice());
            return Object.fromEntries(ids.map(id => [id, `https://cloud.example/${id}.webp`]));
          },
          invalidateThemeAsset() {}
        };
      }
      if (specifier.endsWith('/share-card.js')) {
        return {
          DEFAULT_SHARE_IMAGE: '/assets/share-cover.webp',
          async buildShareCard() {
            shareBuilds++;
            return `/tmp/tree-share-${shareBuilds}.png`;
          }
        };
      }
      if (specifier.endsWith('/tab-bar.js')) return { syncTabBar() {} };
      return nativeRequire(specifier);
    }
  }, { filename: pagePath });

  page.data = structuredClone(page.data);
  page.setData = changes => Object.assign(page.data, changes);
  return {
    page, timerEntries, heroRequests, galleryBatches,
    shareBuilds: () => shareBuilds
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('my-tree batches visible atlas URLs and reuses its hero and share card on return', async () => {
  const env = fixture();
  env.page.onLoad({});
  env.page.onShow();
  await settle();

  assert.deepEqual(env.heroRequests, ['adventurer']);
  assert.equal(env.galleryBatches.length, 1);
  assert.deepEqual(Array.from(env.galleryBatches[0]), ['adventurer', 'moon', 'romantic']);
  assert.equal(env.shareBuilds(), 0, 'Canvas work must stay out of the first paint');
  assert.equal(env.timerEntries.size, 1);
  const pending = [...env.timerEntries.values()][0];
  assert.equal(pending.delay, 1500);

  env.timerEntries.clear();
  pending.callback();
  await settle();
  assert.equal(env.shareBuilds(), 1);
  assert.equal(env.page.data.shareImagePath, '/tmp/tree-share-1.png');

  env.page.onHide();
  env.page.onShow();
  await settle();
  assert.deepEqual(env.heroRequests, ['adventurer'], 'the same hero URL is reused after a tab return');
  assert.equal(env.shareBuilds(), 1, 'the cached share card is reused after a tab return');
  assert.equal(env.timerEntries.size, 0);
  env.page.onUnload();
});

test('leaving my-tree cancels deferred share Canvas work', async () => {
  const env = fixture();
  env.page.onLoad({});
  env.page.onShow();
  await settle();
  const pending = [...env.timerEntries.values()][0];
  assert.ok(pending);

  env.page.onHide();
  assert.equal(env.timerEntries.size, 0);
  pending.callback();
  await settle();
  assert.equal(env.shareBuilds(), 0);
  assert.equal(env.page.data.shareImagePath, '/assets/share-cover.webp');
  env.page.onUnload();
});
