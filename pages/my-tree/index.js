const archive = require('../../utils/archive.js');
const themes = require('../../utils/themes.js');
const { getTheme } = require('../../data/themes.js');
const assets = require('../../utils/theme-assets.js');
const { DEFAULT_SHARE_IMAGE, buildShareCard } = require('../../utils/share-card.js');
const { getContextLabel } = require('../../utils/life-context.js');

function dateLabel(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` : '早期记录';
}
function truncate(context, text, width) {
  let next = text;
  while (next.length > 1 && context.measureText(next).width > width) next = next.slice(0, -1);
  return next === text ? next : next.slice(0, -1) + '…';
}
function decorateTheme(theme, selectedId, starterClaimed, thumbnailUrl) {
  const hidden = theme.hidden && !theme.discovered;
  const unlocked = !!theme.unlocked;
  let statusLabel = '继续探索长出';
  if (unlocked) statusLabel = theme.id === selectedId ? '档案当前主题' : '已由探索解锁';
  else if (hidden) statusLabel = '探索五类后发现';
  else if (theme.starter && !starterClaimed) statusLabel = '首测自动生成';
  return Object.assign({}, theme, {
    thumbnailUrl: theme.discovered ? thumbnailUrl || '' : '',
    displayName: hidden ? '隐藏的极光' : theme.name,
    statusLabel,
    tileMark: hidden ? '藏' : unlocked ? '待' : '锁',
    locked: !unlocked,
    canPreview: !!theme.discovered
  });
}

Page({
  data: {
    loaded: false, error: '', state: null, current: null, gallery: [], tab: 'themes',
    heroUrl: '', imageLoading: false, assetError: false, busy: false, adError: '',
    pendingSave: false, saving: false, saveError: '', visitorPreview: false, themePreview: false,
    history: [], leaves: [], nextReward: '', posterBusy: false, companionSprite: '',
    pickerOpen: false, worldPaused: false, shareImagePath: DEFAULT_SHARE_IMAGE
  },
  onLoad(options = {}) {
    this._disposed = false;
    this._hidden = false;
    this._previewThemeId = getTheme(options.theme) ? options.theme : '';
    this._assetRequest = 0;
    this._galleryRequest = 0;
    this._galleryUrls = {};
    this._galleryCatalog = [];
    this._galleryVisibleCount = 3;
    this._posterRequest = 0;
    this._shareRequest = 0;
    this._shareCards = {};
    this._loadedHeroId = '';
    this._loadedHeroUrl = '';
  },
  onShow() {
    this._hidden = false;
    this.setData({ busy: false, posterBusy: false, worldPaused: false });
    require('../../utils/tab-bar.js').syncTabBar(this, '/pages/my-tree/index');
    this.loadCollection();
    if (this.data.current && themes.getPendingGrant(this.data.current.id)) this.retryThemeSave({ silent: true });
  },
  loadCollection(previewId) {
    try {
      const records = archive.getRecords();
      const state = themes.getState(records);
      const id = (typeof previewId === 'string' && previewId) || this._previewThemeId || state.selectedId;
      const current = state.catalog.find(theme => theme.id === id) || state.catalog[0];
      const seen = {}, ringById = {};
      records.slice().reverse().forEach(record => {
        if (record.migrated || record.scoringVersion === 'legacy') { ringById[record.id] = 0; return; }
        const key = `${record.testId}:${record.testVersion || ''}:${record.scoringVersion}`;
        ringById[record.id] = seen[key] || 0;
        seen[key] = ringById[record.id] + 1;
      });
      const history = records.slice(0, 12).map((record, index) => {
        const ringNumber = ringById[record.id];
        const contextLabel = getContextLabel(record.lifeContext);
        return {
          id: record.id, date: dateLabel(record.completedAt), testId: record.testId,
          title: record.migrated ? '早期成长记录' : ringNumber ? `第 ${ringNumber} 圈年轮${contextLabel ? ` · ${contextLabel}` : ''}` : `第 ${records.length - index} 次探索`,
          initial: index === records.length - 1, isRing: ringNumber > 0
        };
      });
      const count = state.uniqueCount;
      this._galleryCatalog = state.catalog;
      const localPreview = typeof previewId === 'string' && !!previewId && previewId !== state.selectedId;
      const cachedShare = this._shareCards[current.id];
      const sameTheme = this.data.current && this.data.current.id === current.id;
      this.setData({
        loaded: true, error: '', state, current,
        gallery: state.catalog.map(theme => decorateTheme(theme, state.selectedId, state.starterClaimed, this._galleryUrls[theme.id])),
        visitorPreview: !!this._previewThemeId, themePreview: localPreview, history,
        shareImagePath: cachedShare ? cachedShare.path : sameTheme ? this.data.shareImagePath : DEFAULT_SHARE_IMAGE,
        pendingSave: !!themes.getPendingGrant(current.id),
        leaves: Array.from({ length: Math.min(state.catalogCount, 12) }, (_, index) => ({ index, collected: index < count })),
        nextReward: count === 0 ? '完成首测，免费领取一套基础主题与伙伴' :
          count < 3 ? '新的测试，会让树长出新主题与伙伴' :
          count < 5 ? `再探索 ${5 - count} 类不同测试，与隐藏的极光相遇` :
            '极光水镜已发现，去主题图鉴看看吧'
      });
      if (wx.setNavigationBarColor) {
        const night = current.id === 'moon';
        wx.setNavigationBarColor({ frontColor: night ? '#ffffff' : '#000000', backgroundColor: night ? '#193260' : '#d4ebff' });
      }
      if (current.hidden && !current.discovered) {
        this._assetRequest++;
        this._loadedHeroId = '';
        this._loadedHeroUrl = '';
        this.setData({ heroUrl: '', imageLoading: false, assetError: false });
      } else this.loadHero(current.id);
      this.loadGalleryAssets(state.catalog.slice(0, this._galleryVisibleCount).concat(current));
      if (this.data.tab === 'companions' && current.discovered) this.loadCompanionSprite();
    } catch (error) {
      this.setData({ loaded: true, error: error.message || '暂时无法读取你的主题收藏。' });
    }
  },
  async loadGalleryAssets(catalog) {
    const request = ++this._galleryRequest;
    const unique = Array.from(new Map(catalog.map(theme => [theme.id, theme])).values());
    const missing = unique.filter(theme => theme.discovered && !this._galleryUrls[theme.id]);
    const urls = await assets.resolveThemeAssets(missing.map(theme => theme.id));
    if (this._disposed || this._hidden || request !== this._galleryRequest) return;
    missing.forEach(theme => { if (urls[theme.id]) this._galleryUrls[theme.id] = urls[theme.id]; });
    // Update the whole atlas once. Replacing image/text branches repeatedly in
    // concurrent callbacks can trip WeChat's removeTextView renderer error.
    this.setData({ gallery: this.data.gallery.map(item => Object.assign({}, item, { thumbnailUrl: this._galleryUrls[item.id] || '' })) });
  },
  loadMoreGallery() {
    if (!this._galleryCatalog.length || this._galleryVisibleCount >= this._galleryCatalog.length) return;
    this._galleryVisibleCount = Math.min(this._galleryCatalog.length, this._galleryVisibleCount + 3);
    this.loadGalleryAssets(this._galleryCatalog.slice(0, this._galleryVisibleCount));
  },
  async loadHero(themeId) {
    if (this._loadedHeroId === themeId && this._loadedHeroUrl) {
      const changes = {};
      if (this.data.heroUrl !== this._loadedHeroUrl) changes.heroUrl = this._loadedHeroUrl;
      if (this.data.imageLoading) changes.imageLoading = false;
      if (this.data.assetError) changes.assetError = false;
      if (Object.keys(changes).length) this.setData(changes);
      this.scheduleThemeShare(themeId, this._loadedHeroUrl);
      return;
    }
    const request = ++this._assetRequest;
    this.setData({ heroUrl: '', imageLoading: true, assetError: false });
    try {
      const heroUrl = await assets.resolveThemeAsset(themeId);
      if (this._disposed || this._hidden || request !== this._assetRequest) return;
      this._loadedHeroId = heroUrl ? themeId : '';
      this._loadedHeroUrl = heroUrl || '';
      this.setData({ heroUrl: heroUrl || '', imageLoading: false });
      if (heroUrl) this.scheduleThemeShare(themeId, heroUrl);
    } catch (error) {
      if (!this._disposed && !this._hidden && request === this._assetRequest) this.setData({ heroUrl: '', imageLoading: false, assetError: true });
    }
  },
  onHeroError() {
    const current = this.data.current;
    if (current) assets.invalidateThemeAsset(current.id);
    this._loadedHeroId = '';
    this._loadedHeroUrl = '';
    this.setData({ heroUrl: '', assetError: true, imageLoading: false });
  },
  scheduleThemeShare(themeId, heroUrl) {
    if (this._shareTimer) clearTimeout(this._shareTimer);
    this._shareTimer = null;
    const cached = this._shareCards[themeId];
    if (cached && cached.heroUrl === heroUrl) {
      if (this.data.shareImagePath !== cached.path) this.setData({ shareImagePath: cached.path });
      return;
    }
    this._shareTimer = setTimeout(() => {
      this._shareTimer = null;
      const current = this.data.current;
      if (this._disposed || this._hidden || !current || current.id !== themeId || this.data.heroUrl !== heroUrl) return;
      this.prepareThemeShare(themeId, heroUrl);
    }, 1500);
  },
  async prepareThemeShare(themeId, heroUrl) {
    const cached = this._shareCards[themeId];
    if (cached && cached.heroUrl === heroUrl) {
      if (!this._disposed && !this._hidden && this.data.shareImagePath !== cached.path) this.setData({ shareImagePath: cached.path });
      return;
    }
    const request = ++this._shareRequest;
    const theme = getTheme(themeId);
    if (!theme || !heroUrl) return;
    try {
      const shareImagePath = await buildShareCard(this, {
        selector: '#shareCanvas', heroUrl, title: theme.name,
        subtitle: theme.quote, pale: theme.pale, color: theme.color
      });
      if (request !== this._shareRequest) return;
      this._shareCards[themeId] = { heroUrl, path: shareImagePath };
      if (!this._disposed && !this._hidden && this.data.current && this.data.current.id === themeId) {
        this.setData({ shareImagePath });
      }
    } catch (error) { /* The bundled 5:4 cover remains available for sharing. */ }
  },
  retryHero() {
    const current = this.data.current;
    if (!current || !current.discovered || this.data.imageLoading) return;
    assets.invalidateThemeAsset(current.id);
    this._loadedHeroId = '';
    this._loadedHeroUrl = '';
    this.loadHero(current.id);
  },
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
    if (!theme || !theme.canPreview) return;
    this._previewThemeId = '';
    this.setData({ visitorPreview: false, saveError: '', adError: '', pickerOpen: false });
    this.loadCollection(id);
  },
  openThemePicker() {
    if (!this.data.loaded || this.data.busy || this.data.saving) return;
    this.setData({ pickerOpen: true });
    if (this._galleryVisibleCount < 6) this._galleryVisibleCount = Math.min(6, this._galleryCatalog.length);
    this.loadGalleryAssets(this._galleryCatalog.slice(0, this._galleryVisibleCount));
  },
  closeThemePicker() { this.setData({ pickerOpen: false }); },
  keepPickerOpen() {},
  handleThemeAction() {
    const current = this.data.current;
    if (!current || this.data.busy || this.data.saving) return;
    if (themes.getPendingGrant(current.id)) return this.retryThemeSave();
    return this.explore();
  },
  useOrUnlockTheme() {
    const theme = this.data.current;
    if (!theme || this.data.busy || this.data.saving) return;
    if (themes.getPendingGrant(theme.id)) { this.retryThemeSave(); return; }
    this.explore();
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
    this.setData({ worldPaused: true, pickerOpen: false });
    this._assetRequest++;
    this._galleryRequest++;
    this._posterRequest++;
    this._shareRequest++;
    if (this._shareTimer) clearTimeout(this._shareTimer);
    this._shareTimer = null;
  },
  onUnload() {
    this._disposed = true;
    this.onHide();
  },
  onShareAppMessage() {
    const theme = this.data.current || getTheme('adventurer');
    return {
      title: `${theme.name}｜你的树，会是什么样？`,
      path: `/pages/my-tree/index?theme=${encodeURIComponent(theme.id)}`,
      imageUrl: this.data.shareImagePath || DEFAULT_SHARE_IMAGE
    };
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
        content: theme.hidden && !theme.discovered ? '完成 5 类不同测试后，就能与极光相遇并生成自己的主题海报。' : `${theme.unlockHint || '完成对应探索后，这套主题会自然长出。'}获得后即可生成自己的树与伙伴海报。`,
        confirmText: '继续探索',
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
