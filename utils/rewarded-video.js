const AD_UNIT_ID = 'adunit-c4b863e073c10066';

const slots = new Map();

// Share a native instance across report pages. Never destroy it from a page or
// native callback: the SDK can still be dispatching events when a page leaves.
// Failed instances are detached and replaced with a fresh multiton instance so
// late events from a failed display cannot complete a later request.
function createRewardedVideo(options = {}) {
  const adUnitId = options.adUnitId || AD_UNIT_ID;
  if (!slots.has(adUnitId)) slots.set(adUnitId, { ad: null, active: null });
  const slot = slots.get(adUnitId);
  const owner = { disposed: false };
  const update = state => { if (!owner.disposed && options.onState) options.onState(state); };
  const current = attempt => slot.active === attempt && !attempt.terminal;
  const canContinue = attempt => current(attempt) && !owner.disposed;

  function detach(attempt) {
    const ad = attempt && attempt.ad;
    if (!ad) return;
    if (ad.offLoad) ad.offLoad(attempt.onLoad);
    if (ad.offError) ad.offError(attempt.onError);
    if (ad.offClose) ad.offClose(attempt.onClose);
  }
  function finish(attempt, failed = false) {
    if (!current(attempt)) return;
    attempt.terminal = true;
    detach(attempt);
    // A close can precede resolution of show(). Keep the shared instance busy
    // until that operation settles; a failed instance will never be reused.
    if (failed && slot.ad === attempt.ad) slot.ad = null;
    if (failed || !attempt.pending) slot.active = null;
  }
  function fail(attempt, error) {
    if (!current(attempt)) return;
    finish(attempt, true);
    update({ busy: false, ready: false, error: '视频暂时无法播放，请稍后再试。' });
    if (!owner.disposed && options.onError) options.onError(error);
  }
  async function play(targetId) {
    if (owner.disposed || typeof targetId !== 'string' || !targetId) return false;
    if (slot.active) {
      if (slot.active.owner !== owner) update({ busy: false, error: '上一段视频尚未结束，请关闭后重试。' });
      return false;
    }
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) {
      update({ busy: false, ready: false, error: '当前微信版本暂不支持激励视频，请升级微信后重试。' });
      return false;
    }
    const attempt = { owner, targetId, ad: null, phase: 'showing', pending: true, terminal: false };
    slot.active = attempt;
    update({ busy: true, error: '' });
    try {
      if (!slot.ad) slot.ad = wx.createRewardedVideoAd({ adUnitId, multiton: true });
      const ad = attempt.ad = slot.ad;
      attempt.onLoad = () => { if (canContinue(attempt)) update({ ready: true, error: '' }); };
      attempt.onError = error => fail(attempt, error);
      attempt.onClose = result => {
        if (!current(attempt) || attempt.phase === 'loading') return;
        finish(attempt);
        update({ busy: false });
        if (owner.disposed) return;
        if (result && result.isEnded === true) {
          if (options.onComplete) options.onComplete(attempt.targetId);
        } else if (options.onPartial) options.onPartial(attempt.targetId);
      };
      ad.onLoad(attempt.onLoad);
      ad.onError(attempt.onError);
      ad.onClose(attempt.onClose);
      try { await ad.show(); }
      catch (error) {
        if (!canContinue(attempt)) {
          if (current(attempt)) finish(attempt, true);
          return false;
        }
        attempt.phase = 'loading';
        await ad.load();
        if (!canContinue(attempt)) {
          if (current(attempt)) finish(attempt, true);
          return false;
        }
        attempt.phase = 'showing';
        await ad.show();
      }
      if (current(attempt)) {
        attempt.phase = 'displayed';
        update({ busy: true, ready: true, error: '' });
      }
      return canContinue(attempt);
    } catch (error) {
      fail(attempt, error);
      return false;
    } finally {
      attempt.pending = false;
      if (slot.active === attempt && attempt.terminal) slot.active = null;
    }
  }
  function dispose() {
    // Keep a pending/displayed native video occupied until it closes or fails.
    // A new page can never inherit the departing page's completion callback.
    owner.disposed = true;
  }
  return { play, dispose, isBusy: () => !owner.disposed && !!slot.active && slot.active.owner === owner && !slot.active.terminal };
}
module.exports = { AD_UNIT_ID, createRewardedVideo };
