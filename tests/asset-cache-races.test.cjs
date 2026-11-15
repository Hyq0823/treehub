const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(kind) {
  const calls = [];
  const keys = kind === 'public'
    ? ['tests/first-reaction/cover.webp', 'tests/first-reaction/order.webp']
    : ['adventurer', 'moon'];
  const files = { adventurer: 'cloud://env.bucket/themes/v2/adventurer.webp', moon: 'cloud://env.bucket/themes/v2/moon.webp' };
  const request = items => new Promise((resolve, reject) => calls.push({ items, resolve, reject }));
  const wx = { cloud: {
    callFunction: ({ data }) => request(data.paths),
    getTempFileURL: ({ fileList }) => request(fileList)
  } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, `../utils/${kind}-assets.js`), 'utf8'), {
    module, exports: module.exports, wx,
    require(id) {
      if (id === '../config/cloud.js') return { functionName: 'treehub-api', schemaVersion: 2 };
      if (id === '../config/theme-assets.js') return { files };
      if (id === './cloud-sync.js') return { initializePublicAssets: () => true };
      throw new Error(`Unexpected dependency ${id}`);
    }
  });
  const api = module.exports;
  return {
    keys, calls,
    get: key => kind === 'public' ? api.resolvePublicAsset(key) : api.resolveThemeAsset(key),
    invalidate: key => kind === 'public' ? api.invalidatePublicAsset(key) : api.invalidateThemeAsset(key),
    clear: () => api.clearCache(),
    complete(index, prefix) {
      const call = calls[index];
      const url = item => `https://${prefix}.example/${item.split('/').pop()}`;
      call.resolve(kind === 'public'
        ? { result: { ok: true, urls: Object.fromEntries(call.items.map(item => [item, url(item)])) } }
        : { fileList: call.items.map(fileID => ({ fileID, status: 0, tempFileURL: url(fileID) })) });
    }
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

for (const kind of ['public', 'theme']) {
  test(`${kind} asset invalidation prevents an obsolete request from overwriting a newer URL`, async () => {
    const env = fixture(kind), [key] = env.keys;
    const obsolete = env.get(key);
    await settle();
    env.invalidate(key);
    const fresh = env.get(key);
    await settle();
    assert.equal(env.calls.length, 2);
    env.complete(1, 'new');
    const current = await fresh;
    env.complete(0, 'old');
    assert.match(await obsolete, /^https:\/\/old\./, 'an earlier caller can still finish normally');
    assert.equal(await env.get(key), current, 'the cache must retain the latest requested generation');
    assert.equal(env.calls.length, 2);
  });

  test(`${kind} asset obsolete completion cannot delete the pending marker of an active retry`, async () => {
    const env = fixture(kind), [key] = env.keys;
    const obsolete = env.get(key);
    await settle();
    env.invalidate(key);
    const fresh = env.get(key);
    await settle();
    env.complete(0, 'old');
    await obsolete;
    const reused = env.get(key);
    await settle();
    assert.equal(env.calls.length, 2, 'a caller arriving during the retry must reuse that cloud request');
    env.complete(1, 'new');
    assert.equal(await reused, await fresh);
    assert.match(await reused, /^https:\/\/new\./, 'the obsolete completion must not be cached');
  });

  test(`${kind} asset clearCache invalidates every outstanding cache writer`, async () => {
    const env = fixture(kind), [first, second] = env.keys;
    const oldFirst = env.get(first);
    const oldSecond = env.get(second);
    await settle();
    assert.equal(env.calls.length, 2);
    env.clear();
    const newFirst = env.get(first);
    await settle();
    env.complete(2, 'new');
    const current = await newFirst;
    env.complete(0, 'old'); env.complete(1, 'old');
    await Promise.all([oldFirst, oldSecond]);
    assert.equal(await env.get(first), current);
    const newSecond = env.get(second);
    await settle();
    assert.equal(env.calls.length, 4, 'the cleared second entry must not be resurrected by its old request');
    env.complete(3, 'new');
    assert.match(await newSecond, /^https:\/\/new\./);
  });

  test(`${kind} asset concurrent callers share one pending request after a cache clear`, async () => {
    const env = fixture(kind), [key] = env.keys;
    env.clear();
    const first = env.get(key), second = env.get(key), third = env.get(key);
    await settle();
    assert.equal(env.calls.length, 1);
    env.complete(0, 'shared');
    assert.equal(await first, await second);
    assert.equal(await second, await third);
    assert.equal(await env.get(key), await first);
    assert.equal(env.calls.length, 1);
  });
}
