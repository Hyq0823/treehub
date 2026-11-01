const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config/theme-assets.js');
const assets = require('../utils/theme-assets.js');

test('unknown or deliberately unconfigured theme assets do not contact the cloud', async () => {
  const original = config.files.adventurer;
  let calls = 0;
  global.wx = { cloud: { getTempFileURL() { calls++; } } };
  try {
    config.files.adventurer = '';
    assert.equal(await assets.resolveThemeAsset('../private-records'), '');
    assert.equal(await assets.resolveThemeAsset('adventurer'), '');
    assert.equal(calls, 0);
  } finally { config.files.adventurer = original; assets.clearCache(); }
});

test('public theme artwork deduplicates downloads without uploading any assessment', async () => {
  const original = config.files.adventurer;
  const fileId = 'cloud://cloud1-d2ghbskq3663254ce.bucket/themes/v1/adventurer.webp';
  config.files.adventurer = fileId;
  let images = 0, privateCalls = 0, options;
  global.wx = {
    getStorageSync() { return ''; }, setStorageSync() {},
    cloud: {
      init(value) { options = value; },
      async callFunction() { privateCalls++; throw new Error('not allowed'); },
      async getTempFileURL() {
        images++;
        return { fileList: [{ fileID: fileId, status: 0, tempFileURL: 'https://cloud.example/theme.webp' }] };
      }
    }
  };
  try {
    assets.clearCache();
    const urls = await Promise.all([assets.resolveThemeAsset('adventurer'), assets.resolveThemeAsset('adventurer')]);
    assert.deepEqual(urls, ['https://cloud.example/theme.webp', 'https://cloud.example/theme.webp']);
    assert.equal(images, 1);
    assert.equal(privateCalls, 0);
    assert.equal(options.traceUser, false);
    assert.equal(await assets.resolveThemeAsset('adventurer'), urls[0]);
    assert.equal(images, 1);
  } finally { config.files.adventurer = original; assets.clearCache(); }
});

test('an unavailable cloud asset remains recoverable on the next request', async () => {
  const original = config.files.moon;
  const fileId = 'cloud://cloud1-d2ghbskq3663254ce.bucket/themes/v1/moon.webp';
  config.files.moon = fileId;
  let requests = 0;
  wx.cloud.getTempFileURL = async () => {
    if (++requests === 1) throw new Error('offline');
    return { fileList: [{ fileID: fileId, status: 0, tempFileURL: 'https://cloud.example/moon.webp' }] };
  };
  try {
    assert.equal(await assets.resolveThemeAsset('moon'), '');
    assert.equal(await assets.resolveThemeAsset('moon'), 'https://cloud.example/moon.webp');
    assert.equal(requests, 2);
  } finally { config.files.moon = original; assets.clearCache(); }
});

test('production theme manifest maps every asset to the expected environment and path', () => {
  const expected = ['adventurer', 'moon', 'romantic', 'dreamer', 'wanderer', 'listener', 'collector', 'observer', 'aurora', 'companions'];
  assert.deepEqual(Object.keys(config.files), expected);
  for (const id of expected) {
    assert.ok(config.files[id].startsWith(`cloud://${config.environmentId}.`), id);
    assert.ok(config.files[id].endsWith(`/themes/v1/${id}.webp`), id);
  }
  assert.equal(new Set(Object.values(config.files)).size, expected.length);
});
