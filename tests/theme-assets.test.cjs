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

test('multiple theme URLs are resolved in one cloud request and partial failures stay isolated', async () => {
  const ids = ['adventurer', 'moon', 'romantic'];
  const originals = Object.fromEntries(ids.map(id => [id, config.files[id]]));
  const fileIds = Object.fromEntries(ids.map(id => [id, `cloud://cloud1-d2ghbskq3663254ce.bucket/themes/v1/${id}.webp`]));
  ids.forEach(id => { config.files[id] = fileIds[id]; });
  let requests = 0;
  global.wx = {
    getStorageSync() { return ''; }, setStorageSync() {},
    cloud: {
      init() {}, callFunction() {},
      async getTempFileURL({ fileList }) {
        requests++;
        assert.deepEqual(fileList, ids.map(id => fileIds[id]));
        return { fileList: fileList.map((fileID, index) => index === 1
          ? { fileID, status: -1, errMsg: 'missing' }
          : { fileID, status: 0, tempFileURL: `https://cloud.example/${ids[index]}.webp` }) };
      }
    }
  };
  try {
    assets.clearCache();
    const urls = await assets.resolveThemeAssets(ids.concat('adventurer'));
    assert.deepEqual(urls, {
      adventurer: 'https://cloud.example/adventurer.webp',
      moon: '',
      romantic: 'https://cloud.example/romantic.webp'
    });
    assert.equal(requests, 1);
  } finally {
    ids.forEach(id => { config.files[id] = originals[id]; });
    assets.clearCache();
  }
});

test('invalidating one theme keeps unrelated cached URLs', async () => {
  const ids = ['adventurer', 'moon'];
  const originals = Object.fromEntries(ids.map(id => [id, config.files[id]]));
  ids.forEach(id => { config.files[id] = `cloud://cloud1-d2ghbskq3663254ce.bucket/themes/v1/${id}.webp`; });
  let requests = 0;
  global.wx = {
    getStorageSync() { return ''; }, setStorageSync() {},
    cloud: {
      init() {}, callFunction() {},
      async getTempFileURL({ fileList }) {
        requests++;
        return { fileList: fileList.map(fileID => ({ fileID, status: 0, tempFileURL: `https://cloud.example/${requests}/${fileID.split('/').pop()}` })) };
      }
    }
  };
  try {
    assets.clearCache();
    await assets.resolveThemeAssets(ids);
    assets.invalidateThemeAsset('adventurer');
    const urls = await assets.resolveThemeAssets(ids);
    assert.equal(requests, 2);
    assert.match(urls.adventurer, /\/2\/adventurer\.webp$/);
    assert.match(urls.moon, /\/1\/moon\.webp$/);
  } finally {
    ids.forEach(id => { config.files[id] = originals[id]; });
    assets.clearCache();
  }
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

test('private v2 artwork falls back to the public cloud-function allowlist', async () => {
  const ids = ['adventurer', 'companions'];
  const originals = Object.fromEntries(ids.map(id => [id, config.files[id]]));
  let directRequests = 0, functionRequests = 0;
  global.wx = {
    getStorageSync() { return ''; }, setStorageSync() {},
    cloud: {
      init() {},
      async getTempFileURL({ fileList }) {
        directRequests++;
        return { fileList: fileList.map(fileID => ({ fileID, status: -1, errMsg: 'permission denied' })) };
      },
      async callFunction({ name, data }) {
        functionRequests++;
        assert.equal(name, 'treehub-api');
        assert.equal(data.action, 'getThemeAssetUrls');
        assert.deepEqual(data.ids, ids);
        return { result: { ok: true, urls: Object.fromEntries(ids.map(id => [id, `https://cloud.example/v2/${id}.webp`])) } };
      }
    }
  };
  try {
    assets.clearCache();
    assert.deepEqual(await assets.resolveThemeAssets(ids), {
      adventurer: 'https://cloud.example/v2/adventurer.webp',
      companions: 'https://cloud.example/v2/companions.webp'
    });
    assert.equal(directRequests, 1);
    assert.equal(functionRequests, 1);
  } finally {
    ids.forEach(id => { config.files[id] = originals[id]; });
    assets.clearCache();
  }
});

test('production theme manifest maps every asset to the expected environment and path', () => {
  const expected = ['adventurer', 'moon', 'romantic', 'dreamer', 'wanderer', 'listener', 'collector', 'observer', 'aurora', 'companions'];
  assert.equal(config.assetRelease, 'v2');
  assert.deepEqual(Object.keys(config.files), expected);
  for (const id of expected) {
    assert.ok(config.files[id].startsWith(`cloud://${config.environmentId}.`), id);
    assert.ok(config.files[id].endsWith(`/themes/${config.assetRelease}/${id}.webp`), id);
  }
  assert.equal(new Set(Object.values(config.files)).size, expected.length);
});
