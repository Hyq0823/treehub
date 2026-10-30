const config = require('../config/theme-assets.js');
const cache = new Map();
const pending = new Map();
const CACHE_MS = 40 * 60 * 1000;

function configuredFileId(id) {
  if (!Object.prototype.hasOwnProperty.call(config.files, id)) return '';
  const fileId = config.files[id];
  return typeof fileId === 'string' && fileId.startsWith('cloud://') ? fileId : '';
}

function resolveThemeAsset(id) {
  const fileId = configuredFileId(id);
  if (!fileId || typeof wx === 'undefined' || !wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve('');
  const saved = cache.get(fileId);
  if (saved && saved.expiresAt > Date.now()) return Promise.resolve(saved.url);
  if (pending.has(fileId)) return pending.get(fileId);
  const request = Promise.resolve().then(async () => {
    const sync = require('./cloud-sync.js');
    if (!sync.initializePublicAssets()) return '';
    const result = await wx.cloud.getTempFileURL({ fileList: [fileId] });
    const item = result && result.fileList && result.fileList.find(value => value.fileID === fileId);
    if (!item || item.status !== 0 || !/^https:\/\//.test(item.tempFileURL || '')) return '';
    cache.set(fileId, { url: item.tempFileURL, expiresAt: Date.now() + CACHE_MS });
    return item.tempFileURL;
  }).catch(() => '').finally(() => pending.delete(fileId));
  pending.set(fileId, request);
  return request;
}

function clearCache() { cache.clear(); pending.clear(); }
module.exports = { resolveThemeAsset, configuredFileId, clearCache };
