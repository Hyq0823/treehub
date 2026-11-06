const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('../packages/reports/rewarded-video.js');
let createRewardedVideo;

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function nativeAd({ show = [], load = [] } = {}) {
  const listeners = { load: new Set(), error: new Set(), close: new Set() };
  const stats = { creates: 0, show: 0, load: 0, destroy: 0 };
  let destroyed = false;
  const respond = value => typeof value === 'function' ? value() : value || Promise.resolve();
  const ad = {
    stats, listeners,
    show() {
      if (destroyed) return Promise.reject(new Error('video-ad has been destroyed'));
      return respond(show[stats.show++]);
    },
    load() {
      if (destroyed) return Promise.reject(new Error('video-ad has been destroyed'));
      return respond(load[stats.load++]);
    },
    onLoad: callback => listeners.load.add(callback),
    onError: callback => listeners.error.add(callback),
    onClose: callback => listeners.close.add(callback),
    offLoad: callback => listeners.load.delete(callback),
    offError: callback => listeners.error.delete(callback),
    offClose: callback => listeners.close.delete(callback),
    destroy() { stats.destroy++; destroyed = true; },
    emit(event, value) { for (const callback of [...listeners[event]]) callback(value); }
  };
  // Model the SDK returning the same native instance for the same ad unit.
  // A destroyed instance really fails future calls, unlike permissive old mocks.
  global.wx = { createRewardedVideoAd(options) {
    assert.equal(options.adUnitId, 'adunit-c4b863e073c10066');
    stats.creates++;
    return ad;
  } };
  return ad;
}

function owner() {
  const states = [], completed = [], partial = [], errors = [];
  const video = createRewardedVideo({
    onState: value => states.push(value),
    onComplete: id => completed.push(id),
    onPartial: id => partial.push(id),
    onError: error => errors.push(error)
  });
  return { video, states, completed, partial, errors };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  delete require.cache[modulePath];
  ({ createRewardedVideo } = require(modulePath));
});

test('native video is created lazily and reused after close across page controllers', async () => {
  const ad = nativeAd();
  const first = owner(), second = owner();
  assert.equal(ad.stats.creates, 0);
  await first.video.play('report-a');
  ad.emit('close', { isEnded: false });
  await first.video.play('report-a');
  ad.emit('close', { isEnded: true });
  first.video.dispose();
  await second.video.play('report-b');
  ad.emit('close', { isEnded: true });
  second.video.dispose();
  assert.equal(ad.stats.creates, 1);
  assert.equal(ad.stats.show, 3);
  assert.equal(ad.stats.destroy, 0);
  assert.deepEqual(first.completed, ['report-a']);
  assert.deepEqual(second.completed, ['report-b']);
});

test('only a strict completed native close grants the captured target', async () => {
  const ad = nativeAd();
  const controller = owner();
  for (const result of [undefined, {}, { isEnded: false }, { isEnded: 1 }]) {
    await controller.video.play('report-a');
    ad.emit('close', result);
  }
  assert.deepEqual(controller.completed, []);
  await controller.video.play('report-b');
  ad.emit('close', { isEnded: true });
  ad.emit('close', { isEnded: true });
  assert.deepEqual(controller.completed, ['report-b']);
  assert.equal(ad.stats.destroy, 0);
});

test('repeated taps and another page cannot replace the active report target', async () => {
  const ad = nativeAd();
  const first = owner(), second = owner();
  await first.video.play('report-a');
  assert.equal(await first.video.play('report-other'), false);
  assert.equal(await second.video.play('report-b'), false);
  assert.equal(ad.stats.show, 1);
  ad.emit('close', { isEnded: true });
  assert.deepEqual(first.completed, ['report-a']);
  assert.deepEqual(second.completed, []);
});

test('disposing the displayed owner waits for native close without destroying or granting', async () => {
  const ad = nativeAd();
  const first = owner(), second = owner();
  await first.video.play('report-a');
  first.video.dispose();
  const stateCount = first.states.length;
  assert.equal(await second.video.play('report-b'), false);
  ad.emit('load');
  ad.emit('close', { isEnded: true });
  assert.equal(first.states.length, stateCount);
  assert.deepEqual(first.completed, []);
  assert.deepEqual(second.completed, []);
  await second.video.play('report-b');
  ad.emit('close', { isEnded: true });
  assert.deepEqual(second.completed, ['report-b']);
  assert.equal(ad.stats.destroy, 0);
});

test('disposing during show keeps a later page blocked until the displayed video closes', async () => {
  const opening = deferred();
  const ad = nativeAd({ show: [opening.promise] });
  const first = owner(), second = owner();
  const pending = first.video.play('report-a');
  first.video.dispose();
  const stateCount = first.states.length;
  assert.equal(await second.video.play('report-b'), false);
  opening.resolve();
  await pending;
  assert.equal(await second.video.play('report-b'), false);
  ad.emit('close', { isEnded: true });
  assert.equal(first.states.length, stateCount);
  assert.deepEqual(first.completed, []);
  await second.video.play('report-b');
  ad.emit('close', { isEnded: true });
  assert.deepEqual(second.completed, ['report-b']);
  assert.equal(ad.stats.destroy, 0);
});

test('disposing during retry load blocks reuse until load settles and never retries show', async () => {
  const loading = deferred();
  const ad = nativeAd({ show: [() => Promise.reject(new Error('not ready'))], load: [loading.promise] });
  const first = owner(), second = owner();
  const pending = first.video.play('report-a');
  await flush();
  assert.equal(ad.stats.load, 1);
  first.video.dispose();
  const stateCount = first.states.length;
  assert.equal(await second.video.play('report-b'), false);
  loading.resolve();
  await pending;
  assert.equal(ad.stats.show, 1);
  assert.equal(first.states.length, stateCount);
  assert.deepEqual(first.completed, []);
  await second.video.play('report-b');
  ad.emit('close', { isEnded: true });
  assert.deepEqual(second.completed, ['report-b']);
  assert.equal(ad.stats.destroy, 0);
});

test('a show rejection after disposal does not retry load and releases the gate when settled', async () => {
  const opening = deferred();
  const ad = nativeAd({ show: [opening.promise] });
  const first = owner(), second = owner();
  const pending = first.video.play('report-a');
  first.video.dispose();
  const stateCount = first.states.length;
  assert.equal(await second.video.play('report-b'), false);
  opening.reject(new Error('show failed after page left'));
  await assert.doesNotReject(pending);
  assert.equal(ad.stats.load, 0);
  assert.equal(first.states.length, stateCount);
  await second.video.play('report-b');
  ad.emit('close', { isEnded: true });
  assert.deepEqual(first.completed, []);
  assert.deepEqual(second.completed, ['report-b']);
  assert.equal(ad.stats.destroy, 0);
});

test('terminal error during load isolates late native events from a fresh retry', async () => {
  const loading = deferred();
  const ad = nativeAd({ show: [() => Promise.reject(new Error('not ready'))], load: [loading.promise] });
  const replacement = nativeAd();
  let creates = 0;
  global.wx.createRewardedVideoAd = options => {
    assert.equal(options.multiton, true, 'failed native instances must be replaced independently');
    return ++creates === 1 ? ad : replacement;
  };
  const first = owner(), second = owner();
  const pending = first.video.play('report-a');
  await flush();
  const staleClose = [...ad.listeners.close][0];
  ad.emit('error', { errMsg: 'load error' });
  assert.equal(first.errors.length, 1);
  await second.video.play('report-b');
  assert.equal(replacement.stats.show, 1, 'retry uses a fresh native while old load is pending');
  ad.emit('close', { isEnded: true });
  staleClose({ isEnded: true });
  assert.deepEqual(second.completed, []);
  loading.resolve();
  await pending;
  assert.equal(ad.stats.show, 1);
  assert.deepEqual(first.completed, []);
  replacement.emit('close', { isEnded: true });
  assert.deepEqual(second.completed, ['report-b']);
  assert.equal(creates, 2);
  assert.equal(ad.stats.destroy, 0);
  assert.equal(replacement.stats.destroy, 0);
});

test('failed show and retry load recover with a fresh independent native without destroying either', async () => {
  const ad = nativeAd({
    show: [() => Promise.reject(new Error('not ready'))],
    load: [() => Promise.reject(new Error('network unavailable'))]
  });
  const replacement = nativeAd();
  let creates = 0;
  global.wx.createRewardedVideoAd = options => {
    assert.equal(options.multiton, true);
    return ++creates === 1 ? ad : replacement;
  };
  const controller = owner();
  assert.equal(await controller.video.play('report-a'), false);
  assert.equal(controller.video.isBusy(), false);
  assert.deepEqual(controller.completed, []);
  await controller.video.play('report-a');
  ad.emit('close', { isEnded: true });
  assert.deepEqual(controller.completed, []);
  replacement.emit('close', { isEnded: true });
  assert.deepEqual(controller.completed, ['report-a']);
  assert.equal(creates, 2);
  assert.equal(ad.stats.destroy, 0);
  assert.equal(replacement.stats.destroy, 0);
});

test('a native error after display releases the owner without destroying the instance', async () => {
  const ad = nativeAd();
  const replacement = nativeAd();
  let creates = 0;
  global.wx.createRewardedVideoAd = options => {
    assert.equal(options.multiton, true);
    return ++creates === 1 ? ad : replacement;
  };
  const controller = owner();
  await controller.video.play('report-a');
  const staleClose = [...ad.listeners.close][0];
  ad.emit('error', { errMsg: 'display interrupted' });
  assert.equal(controller.video.isBusy(), false);
  assert.equal(controller.errors.length, 1);
  assert.deepEqual(controller.completed, []);
  await controller.video.play('report-b');
  ad.emit('close', { isEnded: true });
  staleClose({ isEnded: true });
  assert.deepEqual(controller.completed, []);
  replacement.emit('close', { isEnded: true });
  assert.deepEqual(controller.completed, ['report-b']);
  assert.equal(creates, 2);
  assert.equal(ad.stats.destroy, 0);
  assert.equal(replacement.stats.destroy, 0);
});

test('native close before show resolves does not allow reuse until that operation settles', async () => {
  const opening = deferred();
  const ad = nativeAd({ show: [opening.promise] });
  const first = owner(), second = owner();
  const pending = first.video.play('report-a');
  ad.emit('close', { isEnded: true });
  assert.deepEqual(first.completed, ['report-a']);
  assert.equal(await second.video.play('report-b'), false);
  opening.resolve();
  await pending;
  await second.video.play('report-b');
  ad.emit('close', { isEnded: true });
  assert.deepEqual(second.completed, ['report-b']);
  assert.equal(ad.stats.creates, 1);
  assert.equal(ad.stats.destroy, 0);
});

test('saved callbacks from a completed view cannot grant a subsequent target on the same native', async () => {
  const ad = nativeAd();
  const controller = owner();
  await controller.video.play('report-a');
  const obsoleteClose = [...ad.listeners.close][0];
  ad.emit('close', { isEnded: false });
  await controller.video.play('report-b');
  obsoleteClose({ isEnded: true });
  assert.deepEqual(controller.completed, []);
  ad.emit('close', { isEnded: true });
  assert.deepEqual(controller.completed, ['report-b']);
  assert.equal(ad.stats.creates, 1);
});

test('native creation failure clears the gate and a later explicit retry can recover', async () => {
  const ad = nativeAd();
  let creates = 0;
  global.wx.createRewardedVideoAd = () => {
    if (++creates === 1) throw new Error('native initialization failed');
    return ad;
  };
  const controller = owner();
  assert.equal(await controller.video.play('report-a'), false);
  assert.equal(controller.video.isBusy(), false);
  assert.equal(controller.errors.length, 1);
  assert.deepEqual(controller.completed, []);
  await controller.video.play('report-b');
  ad.emit('close', { isEnded: true });
  assert.deepEqual(controller.completed, ['report-b']);
  assert.equal(creates, 2);
  assert.equal(ad.stats.destroy, 0);
});

test('a close event while retry loading cannot grant before the next display', async () => {
  const loading = deferred();
  const ad = nativeAd({ show: [() => Promise.reject(new Error('not ready'))], load: [loading.promise] });
  const controller = owner();
  const pending = controller.video.play('report-a');
  await flush();
  assert.equal(ad.stats.load, 1);
  ad.emit('close', { isEnded: true });
  assert.deepEqual(controller.completed, []);
  assert.equal(controller.video.isBusy(), true);
  loading.resolve();
  await pending;
  assert.equal(ad.stats.show, 2);
  ad.emit('close', { isEnded: true });
  assert.deepEqual(controller.completed, ['report-a']);
});
