const archive = require('../../utils/archive.js');
const { catalog } = require('../../data/test-catalog.js');
const { getContextLabel } = require('../../utils/life-context.js');
const PAGE_SIZE = 8;
function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '早期测评记录';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
Page({
  data: { snapshots: [], totalCount: 0, hasMore: false, error: '', loaded: false },
  onShow() { this.loadHistory(); },
  loadHistory() {
    try {
      const records = archive.getRecords();
      const ringById = {};
      const seen = {};
      records.slice().reverse().forEach(record => {
        if (record.migrated || record.scoringVersion === 'legacy') { ringById[record.id] = 0; return; }
        const key = `${record.testId}:${record.testVersion || ''}:${record.scoringVersion}`;
        ringById[record.id] = seen[key] || 0;
        seen[key] = ringById[record.id] + 1;
      });
      const snapshots = records.map((record, index) => {
        const test = catalog.find(item => item.id === record.testId);
        const legacy = record.scoringVersion === 'legacy' || !!record.migrated;
        return {
          id: record.id, testId: record.testId, testName: test ? test.name : '测评记录',
          date: legacy ? '旧版导入 · 原测评时间未知' : formatDate(record.completedAt),
          tree: record.treeSnapshot || null, number: records.length - index, legacy,
          isRing: !legacy && ringById[record.id] > 0, ringNumber: ringById[record.id],
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
    const all = this._allSnapshots || [];
    const visibleCount = Math.min(all.length, this.data.snapshots.length + PAGE_SIZE);
    this.setData({ snapshots: all.slice(0, visibleCount), hasMore: visibleCount < all.length });
  },
  openReport(event) {
    const { id, testId } = event.currentTarget.dataset;
    if (id && testId) wx.navigateTo({ url: `/packages/reports/index?id=${encodeURIComponent(testId)}&recordId=${encodeURIComponent(id)}` });
  },
  explore() { wx.switchTab({ url: '/pages/test-hall/index' }); }
});
