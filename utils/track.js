// 第一版本地记录探索事件，不发送测评结果到远程分析服务。
const EVENTS = {
  HALL_VIEW: 'hall_view',
  DETAIL_VIEW: 'detail_view',
  TEST_START: 'test_start',
  TEST_ABORT: 'test_abort',
  TEST_SUBMIT: 'test_submit',
  RESULT_VIEW: 'result_view',
  RESULT_VIEW_FOREIGN: 'result_view_foreign',
  SHARE_TAP: 'share_tap',
  PREMIUM_AD_START: 'premium_ad_start',
  PREMIUM_UNLOCK: 'premium_unlock'
};

const LOG_KEY = 'trackLog';
const MAX_LOG = 300;

function appendLocal(eventId, params) {
  try {
    const app = getApp();
    const log = wx.getStorageSync(LOG_KEY) || [];
    log.push({ e: eventId, p: params, s: app && app.globalData.enterScene || 0, t: Date.now() });
    if (log.length > MAX_LOG) log.shift();
    wx.setStorageSync(LOG_KEY, log);
  } catch (err) {}
}

function report(eventId, params) {
  const app = getApp();
  const payload = Object.assign({ enterScene: (app && app.globalData.enterScene) || 0 }, params || {});
  appendLocal(eventId, payload);

}

module.exports = { EVENTS, report };
