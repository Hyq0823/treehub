const archive = require('../../utils/archive.js');
const catalogModule = require('../../data/tests/index.js');
const catalog = catalogModule.default || catalogModule;
const { getContextLabel } = require('../../utils/life-context.js');
function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '早期测评记录';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
Page({
  data: { snapshots: [], error: '', loaded: false },
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
      this.setData({ snapshots, error: '', loaded: true });
    } catch (error) {
      this.setData({ error: error.message || '暂时无法读取成长记录。', loaded: true });
    }
  },
  openReport(event) {
    const { id, testId } = event.currentTarget.dataset;
    if (id && testId) wx.navigateTo({ url: `/packages/reports/index?id=${encodeURIComponent(testId)}&recordId=${encodeURIComponent(id)}` });
  },
  explore() { wx.switchTab({ url: '/pages/test-hall/index' }); }
});
