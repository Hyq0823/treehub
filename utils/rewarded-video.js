const AD_UNIT_ID = 'adunit-c4b863e073c10066';

// One controller belongs to one visible page and one explicit user request.
// A completed video is routed only to that captured target; it never grants reports.
function createRewardedVideo(options = {}) {
  let active = null, disposed = false;
  const update = state => { if (!disposed && options.onState) options.onState(state); };
  const current = attempt => !!attempt && !disposed && active === attempt;
  function retire(attempt) {
    if (active === attempt) active = null;
    const ad = attempt && attempt.ad;
    if (!ad) return;
    if (ad.offLoad) ad.offLoad(attempt.onLoad);
    if (ad.offError) ad.offError(attempt.onError);
    if (ad.offClose) ad.offClose(attempt.onClose);
    if (ad.destroy) ad.destroy();
    attempt.ad = null;
  }
  async function play(targetId) {
    if (disposed || active || typeof targetId !== 'string' || !targetId) return false;
    if (!wx.createRewardedVideoAd) {
      update({ ready: false, error: '当前微信版本暂不支持激励视频，请升级微信后重试。' });
      return false;
    }
    const attempt = { targetId, ad: null, phase: 'showing' };
    active = attempt;
    update({ busy: true, error: '' });
    try {
      // Every request owns both its instance and callbacks. A late callback from
      // a retired display can never be routed to a subsequently selected theme.
      const ad = wx.createRewardedVideoAd({ adUnitId: options.adUnitId || AD_UNIT_ID });
      attempt.ad = ad;
      attempt.onLoad = () => { if (current(attempt)) update({ ready: true, error: '' }); };
      attempt.onError = error => {
        if (!current(attempt)) return;
        update({ ready: false, error: '视频暂时没有准备好，请稍后重试。' });
        if (attempt.phase === 'displayed') {
          retire(attempt);
          update({ busy: false });
          if (options.onError) options.onError(error);
        }
      };
      attempt.onClose = result => {
        if (!current(attempt)) return;
        retire(attempt);
        update({ busy: false });
        if (result && result.isEnded === true) {
          if (options.onComplete) options.onComplete(attempt.targetId);
        } else if (options.onPartial) options.onPartial(attempt.targetId);
      };
      ad.onLoad(attempt.onLoad); ad.onError(attempt.onError); ad.onClose(attempt.onClose);
      try { await ad.show(); }
      catch (error) {
        if (!current(attempt)) return false;
        attempt.phase = 'loading';
        await ad.load();
        if (!current(attempt)) return false;
        attempt.phase = 'showing';
        await ad.show();
      }
      if (current(attempt)) attempt.phase = 'displayed';
      return current(attempt);
    } catch (error) {
      if (!current(attempt)) return false;
      retire(attempt);
      update({ busy: false, ready: false, error: '视频暂时无法播放，请稍后再试。' });
      if (options.onError) options.onError(error);
      return false;
    }
  }
  function dispose() {
    disposed = true;
    if (active) retire(active);
  }
  return { play, dispose, isBusy: () => !!active };
}
module.exports = { AD_UNIT_ID, createRewardedVideo };
