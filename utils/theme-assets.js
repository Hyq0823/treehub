const config = require('../config/theme-assets.js');
const cloudConfig = require('../config/cloud.js');
const cache = new Map();
const pending = new Map();
const CACHE_MS = 40 * 60 * 1000;
const BATCH_SIZE = 50;

function configuredFileId(id) {
  if (!Object.prototype.hasOwnProperty.call(config.files, id)) return '';
  const fileId = config.files[id];
  return typeof fileId === 'string' && fileId.startsWith('cloud://') ? fileId : '';
}

function resolveThemeAssets(ids) {
  const requested = Array.from(new Set(Array.isArray(ids) ? ids : []));
  const output = {};
  const waiters = [];
  const fresh = [];
  for (const id of requested) {
    const fileId = configuredFileId(id);
    if (!fileId) { output[id] = ''; continue; }
    const saved = cache.get(fileId);
    if (saved && saved.expiresAt > Date.now()) { output[id] = saved.url; continue; }
    if (pending.has(fileId)) {
      waiters.push(pending.get(fileId).then(url => { output[id] = url; }));
    } else fresh.push({ id, fileId });
  }
  if (fresh.length && typeof wx !== 'undefined' && wx.cloud && (wx.cloud.getTempFileURL || wx.cloud.callFunction)) {
    const batch = Promise.resolve().then(async () => {
      const sync = require('./cloud-sync.js');
      if (!sync.initializePublicAssets()) return new Map();
      const resolved = new Map();
      for (let offset = 0; offset < fresh.length; offset += BATCH_SIZE) {
        const group = fresh.slice(offset, offset + BATCH_SIZE);
        const fileList = group.map(item => item.fileId);
        if (wx.cloud.getTempFileURL) {
          try {
            const result = await wx.cloud.getTempFileURL({ fileList });
            for (const item of result && result.fileList || []) {
              const url = item && item.status === 0 && /^https:\/\//.test(item.tempFileURL || '') ? item.tempFileURL : '';
              if (url) resolved.set(item.fileID, url);
            }
          } catch (error) {}
        }
        const unresolved = group.filter(item => !resolved.has(item.fileId));
        if (unresolved.length && wx.cloud.callFunction) {
          try {
            const response = await wx.cloud.callFunction({
              name: cloudConfig.functionName,
              data: { action: 'getThemeAssetUrls', clientSchemaVersion: cloudConfig.schemaVersion, ids: unresolved.map(item => item.id) }
            });
            const urls = response && response.result && response.result.ok === true && response.result.urls || {};
            unresolved.forEach(item => {
              const url = typeof urls[item.id] === 'string' && /^https:\/\//.test(urls[item.id]) ? urls[item.id] : '';
              if (url) resolved.set(item.fileId, url);
            });
          } catch (error) {}
        }
      }
      resolved.forEach((url, fileId) => cache.set(fileId, { url, expiresAt: Date.now() + CACHE_MS }));
      return resolved;
    }).catch(() => new Map());
    for (const item of fresh) {
      const request = batch.then(resolved => resolved.get(item.fileId) || '').finally(() => pending.delete(item.fileId));
      pending.set(item.fileId, request);
      waiters.push(request.then(url => { output[item.id] = url; }));
    }
  } else fresh.forEach(item => { output[item.id] = ''; });
  return Promise.all(waiters).then(() => output);
}

function resolveThemeAsset(id) { return resolveThemeAssets([id]).then(urls => urls[id] || ''); }

function invalidateThemeAsset(id) {
  const fileId = configuredFileId(id);
  if (!fileId) return;
  cache.delete(fileId);
  pending.delete(fileId);
}

function clearCache() { cache.clear(); pending.clear(); }
module.exports = { resolveThemeAsset, resolveThemeAssets, configuredFileId, invalidateThemeAsset, clearCache };
