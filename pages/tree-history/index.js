const archive = require('../../utils/archive.js');
const { catalog } = require('../../data/test-catalog.js');
const { getContextLabel } = require('../../utils/life-context.js');
const { chronologicalEntries, isComparableSummary, versionKey } = require('../../utils/comparison-records.js');
const PAGE_SIZE = 8;
const testsById = new Map(catalog.map(test => [test.id, test]));
function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '早期测评记录';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
Page({
  data: { snapshots: [], totalCount: 0, hasMore: false, error: '', loaded: false },
  onShow() {
    this._hidden = false;
    this._navigating = false;
    this._navigationRequest = (this._navigationRequest || 0) + 1;
    this.loadHistory();
  },
  loadHistory() {
    if (this._hidden) return;
    try {
      const entries = chronologicalEntries(archive.getRecords());
      const rings = new Map(), olderByVersion = new Map(), seenTests = new Set();
      // The old-to-new pass pairs each ring with the actual previous record of
      // the same test and scoring version, regardless of imported array order.
      for (let index = entries.length - 1; index >= 0; index--) {
        const record = entries[index].record;
        if (!isComparableSummary(record)) continue;
        const key = versionKey(record), older = olderByVersion.get(key);
        const count = older ? older.count + 1 : 0;
        rings.set(record.id, { number: count, previousId: older ? older.id : '', versionChanged: !older && seenTests.has(record.testId) });
        olderByVersion.set(key, { id: record.id, count });
        seenTests.add(record.testId);
      }
      const snapshots = entries.map((entry, index) => {
        const record = entry.record;
        const test = testsById.get(record.testId);
        const legacy = record.scoringVersion === 'legacy' || !!record.migrated;
        const ring = rings.get(record.id);
        return {
          id: record.id, testId: record.testId, testName: test ? test.name : '测评记录',
          date: legacy ? '旧版导入 · 原测评时间未知' : formatDate(record.completedAt),
          tree: record.treeSnapshot || null, number: entries.length - index, legacy,
          isRing: !!(ring && ring.number > 0), ringNumber: ring ? ring.number : 0,
          versionChanged: !!(ring && ring.versionChanged),
          canCompare: !!(ring && ring.previousId), previousRecordId: ring ? ring.previousId : '',
          contextLabel: getContextLabel(record.lifeContext)
        };
      });
      this._allSnapshots = snapshots;
      const visibleCount = this._hasLoaded
        ? Math.min(snapshots.length, Math.max(PAGE_SIZE, this.data.snapshots.length))
        : Math.min(snapshots.length, PAGE_SIZE);
      this._hasLoaded = true;
      this.setData({
        snapshots: snapshots.slice(0, visibleCount), totalCount: snapshots.length,
        hasMore: snapshots.length > visibleCount, error: '', loaded: true
      });
    } catch (error) {
      this._allSnapshots = [];
      this.setData({ snapshots: [], totalCount: 0, hasMore: false, error: error.message || '暂时无法读取成长记录。', loaded: true });
    }
  },
  loadMore() {
    if (this._hidden) return;
    const all = this._allSnapshots || [];
    const visibleCount = Math.min(all.length, this.data.snapshots.length + PAGE_SIZE);
    this.setData({ snapshots: all.slice(0, visibleCount), hasMore: visibleCount < all.length });
  },
  openReport(event) {
    const { id, testId } = event.currentTarget.dataset;
    if (id && testId && (this._allSnapshots || []).some(item => item.id === id && item.testId === testId)) {
      this.navigateHistory(`/packages/reports/index?id=${encodeURIComponent(testId)}&recordId=${encodeURIComponent(id)}`);
    }
  },
  openComparison(event) {
    const { id, testId } = event.currentTarget.dataset;
    const snapshot = (this._allSnapshots || []).find(item => item.id === id && item.testId === testId && item.canCompare);
    if (!snapshot) return;
    this.navigateHistory(`/packages/reports/compare/index?id=${encodeURIComponent(testId)}&recordId=${encodeURIComponent(id)}&previousRecordId=${encodeURIComponent(snapshot.previousRecordId)}`);
  },
  navigateHistory(url) {
    if (this._hidden || this._navigating) return;
    this._navigating = true;
    const request = this._navigationRequest = (this._navigationRequest || 0) + 1;
    const fail = () => {
      if (request !== this._navigationRequest) return;
      this._navigating = false;
      if (!this._hidden) wx.showToast({ title: '暂时未能打开，请再试一次', icon: 'none' });
    };
    try { wx.navigateTo({ url, fail }); } catch (error) { fail(); }
  },
  onHide() { this._hidden = true; this._navigationRequest = (this._navigationRequest || 0) + 1; },
  onUnload() { this.onHide(); },
  explore() { if (!this._hidden) wx.switchTab({ url: '/pages/test-hall/index' }); }
});
