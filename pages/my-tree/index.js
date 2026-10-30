const archive = require('../../utils/archive.js');
const themes = require('../../utils/themes.js');
const { getTheme } = require('../../data/themes.js');
const { createRewardedVideo } = require('../../utils/rewarded-video.js');
const assets = require('../../utils/theme-assets.js');

function dateLabel(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` : '早期记录';
}
function truncate(context, text, width) {
  let next = text;
  while (next.length > 1 && context.measureText(next).width > width) next = next.slice(0, -1);
  return next === text ? next : next.slice(0, -1) + '…';
}

Page({
  data: {
    loaded: false, error: '', state: null, current: null, gallery: [], tab: 'themes',
    heroUrl: '', imageLoading: false, assetError: false, busy: false, adError: '',
    pendingSave: false, saving: false, saveError: '', visitorPreview: false,
    history: [], leaves: [], nextReward: '', posterBusy: false, companionSprite: ''
  },
  onLoad(options = {}) {
    this._disposed = false;
    this._hidden = false;
    this._previewThemeId = getTheme(options.theme) ? options.theme : '';
    this._assetRequest = 0;
    this._galleryRequest = 0;
    this._galleryUrls = {};
    this._posterRequest = 0;
    this.setupVideo();
  },
  setupVideo() {
    if (this._ad || this._disposed || this._hidden) return;
    this._ad = createRewardedVideo({
      onState: state => {
        if (this._disposed || this._hidden) return;
        const update = {};
        if (state.busy !== undefined) update.busy = state.busy;
        if (state.error !== undefined) update.adError = state.error;
        this.setData(update);
      },
      onComplete: themeId => this.completeThemeUnlock(themeId),
      onPartial: () => wx.showToast({ title: '完整看完视频才能解锁这套主题', icon: 'none' }),
      onError: () => wx.showToast({ title: '视频暂时无法播放', icon: 'none' })
    });
  },
  onShow() {
    this._hidden = false;
    this.setupVideo();
    this.setData({ busy: false, posterBusy: false });
    this.loadCollection();
    if (this.data.current && themes.getPendingGrant(this.data.current.id)) this.retryThemeSave({ silent: true });
  },
  loadCollection(previewId) {
    try {
      const records = archive.getRecords();
      const state = themes.getState(records);
      const id = (typeof previewId === 'string' && previewId) || this._previewThemeId || state.selectedId;
      const current = state.catalog.find(theme => theme.id === id) || state.catalog[0];
      const history = records.slice(0, 12).map((record, index) => ({
        id: record.id, date: dateLabel(record.completedAt), title: record.migrated ? '早期成长记录' : `第 ${records.length - index} 次探索`,
        initial: index === records.length - 1, testId: record.testId
      }));
      const count = state.uniqueCount;
      this.setData({
        loaded: true, error: '', state, current, gallery: state.catalog.map(theme => Object.assign({}, theme, { thumbnailUrl: theme.discovered && this._galleryUrls[theme.id] || '' })),
        visitorPreview: !!this._previewThemeId, history,
        pendingSave: !!themes.getPendingGrant(current.id),
        leaves: Array.from({ length: Math.min(state.catalogCount, 12) }, (_, index) => ({ index, collected: index < count })),
        nextReward: count === 0 ? '完成首测，免费领取一套基础主题与伙伴' :
          count < 5 ? `再探索 ${5 - count} 类不同测试，发现隐藏的极光` :
            '极光水镜已发现，去主题图鉴看看吧'
      });
      if (current.hidden && !current.discovered) {
        this._assetRequest++;
        this.setData({ heroUrl: '', imageLoading: false, assetError: false });
      } else this.loadHero(current.id);
      this.loadGalleryAssets(state.catalog);
      if (this.data.tab === 'companions' && current.discovered) this.loadCompanionSprite();
    } catch (error) {
      this.setData({ loaded: true, error: error.message || '暂时无法读取你的主题收藏。' });
    }
  },
  async loadGalleryAssets(catalog) {
    const request = ++this._galleryRequest;
    await Promise.all(catalog.filter(theme => theme.discovered).map(async theme => {
      try {
        const url = await assets.resolveThemeAsset(theme.id);
        if (this._disposed || this._hidden || request !== this._galleryRequest || !url) return;
        this._galleryUrls[theme.id] = url;
        this.setData({ gallery: this.data.gallery.map(item => item.id === theme.id ? Object.assign({}, item, { thumbnailUrl: url }) : item) });
      } catch (error) { /* Keep the compact companion preview when offline. */ }
    }));
  },
  async loadHero(themeId) {
    const request = ++this._assetRequest;
    this.setData({ heroUrl: '', imageLoading: true, assetError: false });
    try {
      const heroUrl = await assets.resolveThemeAsset(themeId);
      if (this._disposed || this._hidden || request !== this._assetRequest) return;
      this.setData({ heroUrl: heroUrl || '', imageLoading: false });
    } catch (error) {
      if (!this._disposed && !this._hidden && request === this._assetRequest) this.setData({ heroUrl: '', imageLoading: false, assetError: true });
    }
  },
  onHeroError() { this.setData({ heroUrl: '', assetError: true, imageLoading: false }); },
  async loadCompanionSprite() {
    if (this.data.companionSprite || this._companionLoading) return;
    this._companionLoading = true;
    try {
      const url = await assets.resolveThemeAsset('companions');
      if (!this._disposed && !this._hidden && url) this.setData({ companionSprite: url });
    } catch (error) {
      // Artwork can be retried on the next visit; the user's collection remains.
    } finally { this._companionLoading = false; }
  },
  onCompanionError() { this.setData({ companionSprite: '' }); },
  selectTab(event) {
    const tab = event.currentTarget.dataset.tab;
    if (['themes', 'companions', 'history'].includes(tab)) this.setData({ tab });
    if (tab === 'companions' && this.data.current && this.data.current.discovered) this.loadCompanionSprite();
  },
  inspectTheme(event) {
    if (this.data.busy || this.data.saving) return;
    const id = event.currentTarget.dataset.id;
    const theme = this.data.gallery.find(item => item.id === id);
    if (!theme) return;
    this._previewThemeId = '';
    this.setData({ visitorPreview: false, saveError: '', adError: '' });
    this.loadCollection(id);
  },
  async useOrUnlockTheme() {
    const theme = this.data.current;
    if (!theme || this.data.busy || this.data.saving) return;
    if (themes.getPendingGrant(theme.id)) { this.retryThemeSave(); return; }
    try {
      if (theme.unlocked) {
        themes.selectTheme(theme.id);
        this._previewThemeId = '';
        this.loadCollection(theme.id);
        wx.showToast({ title: '伙伴已经住进你的树', icon: 'success' });
        return;
      }
      if (!theme.discovered) {
        wx.showModal({ title: '极光还在生长', content: `完成 5 类不同测试后，就能发现隐藏主题。你已探索 ${this.data.state.uniqueCount} 类。`, confirmText: '继续探索', success: result => { if (result.confirm) this.explore(); } });
        return;
      }
      if (theme.starter && !this.data.state.starterClaimed) {
        if (!this.data.state.uniqueCount) { this.explore(); return; }
        themes.claimStarter(theme.id);
        this._previewThemeId = '';
        this.loadCollection(theme.id);
        wx.showToast({ title: '树与伙伴已领取', icon: 'success' });
        return;
      }
      wx.showModal({
        title: `解锁${theme.name}`, content: '完整观看 1 次激励视频，即可长期使用这套主题与两位伙伴。只解锁当前主题，深度报告需单独解锁。', confirmText: '看视频解锁',
        success: result => { if (result.confirm && !this._disposed && !this._hidden && !this.data.busy && this._ad) this._ad.play(theme.id); }
      });
    } catch (error) { wx.showToast({ title: error.message || '暂时无法保存主题', icon: 'none' }); }
  },
  completeThemeUnlock(themeId) {
    if (this._disposed || this._hidden) return;
    try {
      themes.rememberCompletedGrant(themeId);
      this._pendingThemeId = themeId;
      this.setData({ pendingSave: true, saveError: '' });
      this.retryThemeSave();
    } catch (error) {
      this.setData({ saveError: error.message || '解锁凭据暂未保存，请稍后重试。' });
    }
  },
  retryThemeSave(options = {}) {
    if (this._disposed || this.data.saving) return;
    const themeId = this._pendingThemeId || this.data.current && this.data.current.id;
    if (!themeId || !themes.getPendingGrant(themeId)) return;
    this.setData({ saving: true });
    try {
      themes.persistPendingGrant(themeId);
      this._pendingThemeId = '';
      this._previewThemeId = '';
      this.setData({ pendingSave: false, saving: false, saveError: '' });
      this.loadCollection(themeId);
      if (!options.silent) wx.showToast({ title: '主题与伙伴已解锁', icon: 'success' });
    } catch (error) {
      this.setData({ saving: false, pendingSave: true, saveError: error.message || '主题待保存，恢复空间后可直接重试。' });
    }
  },
  explore() { wx.switchTab({ url: '/pages/test-hall/index' }); },
  openHistory() { wx.navigateTo({ url: '/pages/tree-history/index' }); },
  onHide() {
    this._hidden = true;
    this._assetRequest++;
    this._galleryRequest++;
    this._posterRequest++;
    if (this._ad) this._ad.dispose();
    this._ad = null;
  },
  onUnload() {
    this._disposed = true;
    this.onHide();
  },
  onShareAppMessage() {
    const theme = this.data.current || getTheme('adventurer');
    return { title: `${theme.name}｜你的树，会是什么样？`, path: `/pages/my-tree/index?theme=${encodeURIComponent(theme.id)}` };
  },
  onShareTimeline() {
    const theme = this.data.current || getTheme('adventurer');
    return { title: `${theme.name} · ${theme.quote}`, query: `theme=${encodeURIComponent(theme.id)}` };
  },
  async createPoster() {
    if (this.data.posterBusy || !this.data.current) return;
    const theme = this.data.current;
    if (!theme.unlocked || !theme.discovered) {
      wx.showModal({
        title: theme.hidden && !theme.discovered ? '隐藏的极光，还在等你发现' : '先收藏这套树与伙伴',
        content: theme.hidden && !theme.discovered ? '完成 5 类不同测试后发现隐藏主题，再看视频解锁，就能生成自己的极光海报。' : '解锁主题后，可以生成自己的树与伙伴海报。普通主题可以先预览，也可以把主题入口分享给朋友。',
        confirmText: theme.hidden && !theme.discovered ? '继续探索' : '去解锁',
        success: result => { if (result.confirm && !this._disposed && !this._hidden) this.useOrUnlockTheme(); }
      });
      return;
    }
    this.setData({ posterBusy: true });
    const heroUrl = this.data.heroUrl;
    const request = ++this._posterRequest;
    const isCurrent = () => !this._disposed && !this._hidden && request === this._posterRequest;
    try {
      const query = wx.createSelectorQuery();
      const canvas = await new Promise((resolve, reject) => query.select('#posterCanvas').fields({ node: true, size: true }).exec(result => result && result[0] && result[0].node ? resolve(result[0].node) : reject(new Error('海报画布暂时不可用'))));
      if (!isCurrent()) return;
      canvas.width = 750; canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      const background = ctx.createLinearGradient(0, 0, 750, 1200);
      background.addColorStop(0, theme.pale); background.addColorStop(1, '#ffffff');
      ctx.fillStyle = background; ctx.fillRect(0, 0, 750, 1200);
      ctx.fillStyle = '#173457'; ctx.font = 'bold 26px sans-serif'; ctx.fillText('人格测试树 · 我的树与伙伴', 54, 68);
      let loadedImage = false;
      if (heroUrl) {
        try {
          const image = canvas.createImage();
          await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = heroUrl; });
          if (!isCurrent()) return;
          const scale = Math.min(660 / image.width, 660 / image.height);
          ctx.drawImage(image, (750 - image.width * scale) / 2, 100 + (660 - image.height * scale) / 2, image.width * scale, image.height * scale);
          loadedImage = true;
        } catch (error) { /* A useful poster is still available while offline. */ }
      }
      if (!loadedImage) {
        const gradient = ctx.createRadialGradient(375, 390, 20, 375, 390, 300);
        gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, theme.pale);
        ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(375, 390, 270, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#91aed0'; ctx.lineWidth = 16; ctx.lineCap = 'round';
        [[375, 620, 375, 270], [375, 450, 255, 340], [375, 370, 495, 250], [375, 520, 515, 430]].forEach(line => { ctx.beginPath(); ctx.moveTo(line[0], line[1]); ctx.lineTo(line[2], line[3]); ctx.stroke(); });
        ctx.fillStyle = theme.color;
        [[290, 315], [365, 255], [485, 240], [510, 410], [260, 390], [430, 330]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x, y, 45, 65, .5, 0, Math.PI * 2); ctx.fill(); });
        ctx.font = '64px sans-serif'; ctx.fillText(theme.companions[0].emoji, 190, 620); ctx.fillText(theme.companions[1].emoji, 470, 620);
      }
      ctx.textAlign = 'center'; ctx.fillStyle = '#173457'; ctx.font = 'bold 48px sans-serif'; ctx.fillText(theme.name, 375, 815);
      ctx.fillStyle = theme.color; ctx.font = '22px sans-serif'; ctx.fillText(theme.english, 375, 856);
      ctx.fillStyle = '#506d90'; ctx.font = '26px sans-serif'; ctx.fillText(truncate(ctx, theme.quote, 650), 375, 926);
      ctx.fillStyle = theme.color; ctx.font = '24px sans-serif'; ctx.fillText(theme.tags.join('   ·   '), 375, 986);
      ctx.strokeStyle = '#dce7f5'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(70, 1030); ctx.lineTo(680, 1030); ctx.stroke();
      ctx.fillStyle = '#71869f'; ctx.font = '23px sans-serif'; ctx.fillText('你的树，会是什么样？', 375, 1084);
      ctx.font = '18px sans-serif'; ctx.fillText('主题是自我探索的视觉意象，不作心理诊断', 375, 1135);
      const output = await new Promise((resolve, reject) => wx.canvasToTempFilePath({ canvas, fileType: 'png', success: resolve, fail: reject }, this));
      if (isCurrent()) wx.previewImage({ current: output.tempFilePath, urls: [output.tempFilePath] });
    } catch (error) {
      if (isCurrent()) wx.showToast({ title: error.message || '海报暂时未能生成，请稍后重试', icon: 'none' });
    } finally { if (isCurrent()) this.setData({ posterBusy: false }); }
  }
});
