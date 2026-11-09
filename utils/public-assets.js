const cloudConfig = require('../config/cloud.js');
const cache = new Map();
const pending = new Map();
const CACHE_MS = 40 * 60 * 1000;
const BATCH_SIZE = 50;
const VALID_PATH = /^(?:tests|shared)\/[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9._-]{0,95}\.(?:webp|png|jpe?g)$/;

function validPath(value) { return typeof value === 'string' && VALID_PATH.test(value); }

async function requestBatch(paths) {
  const sync = require('./cloud-sync.js');
  if (!sync.initializePublicAssets()) return {};
  const response = await wx.cloud.callFunction({
    name: cloudConfig.functionName,
    data: { action: 'getPublicAssetUrls', clientSchemaVersion: cloudConfig.schemaVersion, paths }
  });
  const result = response && response.result;
  return result && result.ok === true && result.urls && typeof result.urls === 'object' ? result.urls : {};
}

function resolvePublicAssets(input) {
  const paths = Array.from(new Set(Array.isArray(input) ? input.filter(validPath) : []));
  const output = {};
  const waiters = [];
  const fresh = [];
  for (const assetPath of paths) {
    const saved = cache.get(assetPath);
    if (saved && saved.expiresAt > Date.now()) { output[assetPath] = saved.url; continue; }
    if (pending.has(assetPath)) waiters.push(pending.get(assetPath).then(url => { output[assetPath] = url; }));
    else fresh.push(assetPath);
  }
  for (let offset = 0; offset < fresh.length; offset += BATCH_SIZE) {
    const group = fresh.slice(offset, offset + BATCH_SIZE);
    const batch = Promise.resolve().then(() => requestBatch(group)).catch(() => ({}));
    group.forEach(assetPath => {
      const request = batch.then(urls => {
        const url = typeof urls[assetPath] === 'string' && /^https:\/\//.test(urls[assetPath]) ? urls[assetPath] : '';
        if (url) cache.set(assetPath, { url, expiresAt: Date.now() + CACHE_MS });
        return url;
      }).finally(() => pending.delete(assetPath));
      pending.set(assetPath, request);
      waiters.push(request.then(url => { output[assetPath] = url; }));
    });
  }
  return Promise.all(waiters).then(() => output);
}

function resolvePublicAsset(assetPath) {
  if (!validPath(assetPath)) return Promise.resolve('');
  return resolvePublicAssets([assetPath]).then(urls => urls[assetPath] || '');
}

function invalidatePublicAsset(assetPath) {
  if (!validPath(assetPath)) return;
  cache.delete(assetPath);
  pending.delete(assetPath);
}

function clearCache() { cache.clear(); pending.clear(); }

module.exports = { resolvePublicAsset, resolvePublicAssets, invalidatePublicAsset, clearCache, validPath };
