const archive = require('../../utils/archive.js');
const { getTree } = require('../../utils/personality-tree.js');
const { resolveReport } = require('../../utils/scoring.js');
const catalogModule = require('../../data/tests/index.js');
const catalog = catalogModule.default || catalogModule;
const STAGES = [
  { name: '初芽', threshold: 1 }, { name: '扎根', threshold: 3 },
  { name: '舒展', threshold: 5 }, { name: '繁茂', threshold: 10 },
  { name: '花冠', threshold: 20 }, { name: '星辉', threshold: 35 }
];
function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '早期测评记录';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
Page({
  data: {
    loaded: false, error: '', tree: null, groups: [], stages: [], expandedTests: {},
    totalCount: 0, uniqueCount: 0, repeatCount: 0, catalogCount: catalog.length,
    coveragePercent: 0, evidence: []
  },
  onShow() { this.loadArchive(); },
  loadArchive() {
    try {
      const saved = archive.getArchive();
      const tree = getTree(saved, catalog);
      const records = saved.records.slice().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
      const groups = catalog.map(test => {
        const history = records.filter(record => record.testId === test.id).map(record => {
          let title = '早期测评结果';
          try {
            const report = resolveReport(test, record);
            title = report && report.title || title;
          } catch (error) {
            // Preserve older records even when their scoring version has no report.
          }
          const legacy = record.scoringVersion === 'legacy' || !!record.migrated;
          return { id: record.id, testId: test.id, title, date: legacy ? '旧版导入 · 原测评时间未知' : formatDate(record.completedAt), legacy };
        });
        return { id: test.id, name: test.name, icon: test.icon, count: history.length, latest: history[0], history };
      }).filter(group => group.count);
      this.setData({
        loaded: true, error: '', tree, groups,
        stages: STAGES.map(stage => Object.assign({}, stage, { reached: tree.uniqueCount >= stage.threshold, planned: stage.threshold > catalog.length })),
        uniqueCount: tree.uniqueCount, totalCount: tree.totalCount,
        repeatCount: Math.max(0, tree.totalCount - tree.uniqueCount),
        coveragePercent: tree.progress,
        evidence: tree.evidence || []
      });
    } catch (error) {
      this.setData({ loaded: true, error: error.message || '暂时无法读取本地档案，请稍后重试。' });
    }
  },
  toggleHistory(event) {
    const id = event.currentTarget.dataset.id;
    const expandedTests = Object.assign({}, this.data.expandedTests);
    expandedTests[id] = !expandedTests[id];
    this.setData({ expandedTests });
  },
  openRecord(event) {
    const { id, recordId } = event.currentTarget.dataset;
    if (id && recordId) wx.navigateTo({ url: `/pages/test-result/index?id=${encodeURIComponent(id)}&recordId=${encodeURIComponent(recordId)}` });
  },
  retakeTest(event) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/test-answer/index?id=${encodeURIComponent(id)}` });
  },
  explore() { wx.switchTab({ url: '/pages/test-hall/index' }); },
  openGrowthHistory() { wx.navigateTo({ url: '/pages/tree-history/index' }); }
});
