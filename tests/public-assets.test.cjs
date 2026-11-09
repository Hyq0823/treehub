const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const assets = require('../utils/public-assets.js');

test('public assets batch, deduplicate and cache safe v2 relative paths', async () => {
  let calls = 0;
  global.wx = {
    getStorageSync() { return ''; }, setStorageSync() {},
    cloud: {
      init() {},
      async callFunction({ name, data }) {
        calls++;
        assert.equal(name, 'treehub-api');
        assert.equal(data.action, 'getPublicAssetUrls');
        assert.deepEqual(data.paths, ['tests/first-reaction/cover.webp', 'tests/first-reaction/order.webp']);
        return { result: { ok: true, urls: Object.fromEntries(data.paths.map(assetPath => [assetPath, `https://cloud.example/${assetPath}`])) } };
      }
    }
  };
  assets.clearCache();
  const urls = await assets.resolvePublicAssets([
    'tests/first-reaction/cover.webp', 'tests/first-reaction/order.webp', 'tests/first-reaction/cover.webp'
  ]);
  assert.equal(urls['tests/first-reaction/cover.webp'], 'https://cloud.example/tests/first-reaction/cover.webp');
  assert.equal(urls['tests/first-reaction/order.webp'], 'https://cloud.example/tests/first-reaction/order.webp');
  assert.equal(calls, 1);
  assert.equal(await assets.resolvePublicAsset('tests/first-reaction/cover.webp'), urls['tests/first-reaction/cover.webp']);
  assert.equal(calls, 1);
});

test('public asset resolver rejects traversal and arbitrary cloud paths before a request', async () => {
  let calls = 0;
  global.wx = { cloud: { init() {}, async callFunction() { calls++; return {}; } } };
  assets.clearCache();
  assert.equal(await assets.resolvePublicAsset('../private.webp'), '');
  assert.equal(await assets.resolvePublicAsset('tests/first-reaction/../../private.webp'), '');
  assert.equal(await assets.resolvePublicAsset('cloud://another-environment/private.webp'), '');
  assert.equal(calls, 0);
});

test('configured test artwork has a safe cloud path and a small bundled fallback', () => {
  const catalog = require('../data/tests/index.js').default;
  const root = path.resolve(__dirname, '..');
  const entries = [];
  catalog.forEach(questionnaire => {
    if (questionnaire.coverAssetPath) entries.push([questionnaire.coverAssetPath, questionnaire.cover]);
    questionnaire.questions.forEach(question => question.options.forEach(option => {
      if (option.assetPath) entries.push([option.assetPath, option.image]);
    }));
    questionnaire.reports.forEach(report => { if (report.assetPath) entries.push([report.assetPath, report.image]); });
  });
  assert.ok(entries.length >= 11);
  entries.forEach(([assetPath, fallback]) => {
    assert.equal(assets.validPath(assetPath), true, assetPath);
    assert.match(fallback, /^\/assets\//);
    const file = path.join(root, fallback.slice(1));
    assert.ok(fs.existsSync(file), fallback);
    assert.ok(fs.statSync(file).size <= 200000, fallback);
  });
});
