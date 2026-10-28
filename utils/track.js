// 埋点。eventId 需先在小程序后台「自定义分析」登记，未登记时 wx.reportEvent 静默失败，不影响业务。
// 同时写一份本地日志，便于后台未配置期间在开发版自查漏斗。
const EVENTS = {
  HALL_VIEW: 'hall_view',
  DETAIL_VIEW: 'detail_view',
  TEST_START: 'test_start',
  TEST_ABORT: 'test_abort',
  TEST_SUBMIT: 'test_submit',
  RESULT_VIEW: 'result_view',
  RESULT_VIEW_FOREIGN: 'result_view_foreign',
  SHARE_TAP: 'share_tap'
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
  try {
    wx.reportEvent(eventId, payload);
  } catch (e) {}
}

module.exports = { EVENTS, report };
