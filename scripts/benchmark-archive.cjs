#!/usr/bin/env node
// Logic-side benchmark only; no device, storage, network or cloud mutation.
const { performance } = require('node:perf_hooks');
const { buildArchiveView, HISTORY_PAGE_SIZE } = require('../utils/archive-view.js');
const counts = process.argv.slice(2).map(Number);
if (counts.some(count => !Number.isInteger(count) || count < 0 || count > 100000)) {
  console.error('Usage: node scripts/benchmark-archive.cjs [record counts from 0 to 100000]');
  process.exitCode = 1;
} else {
  const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const rows = (counts.length ? counts : [100, 1000, 4000]).map(count => {
    const records = Array.from({ length: count }, (_, index) => ({
      id: `benchmark-${index}`, testId: 'mbti', testVersion: '1', scoringVersion: '2',
      completedAt: new Date(Date.UTC(2026, 0, 1, 0, count - index)).toISOString(),
      resultType: 'INFP', lifeContext: 'ordinary', scores: { EI: -2, SN: -2, TF: -2, JP: -2 },
      answers: Array.from({ length: 28 }, (_, item) => ({ questionId: item + 1, optionIndex: item % 2 })),
      treeSnapshot: { name: '探索之树', stage: { id: 'sprout', name: '初芽' } }
    }));
    const durations = [];
    let view;
    for (let run = 0; run < 21; run++) {
      const start = performance.now();
      view = buildArchiveView(records);
      durations.push(performance.now() - start);
    }
    const expanded = view.history('mbti', HISTORY_PAGE_SIZE);
    return {
      records: count, initialGroupsBytes: Buffer.byteLength(JSON.stringify(view.groups)),
      initialHistoryRows: view.groups.reduce((total, group) => total + group.history.length, 0),
      firstExpandedRows: expanded.length, firstExpandedBytes: Buffer.byteLength(JSON.stringify(expanded)),
      buildMedianMs: Number(median(durations).toFixed(3))
    };
  });
  console.log(JSON.stringify({ note: 'Synthetic MBTI repeats, Node logic only; not WeChat device timing.', rows }, null, 2));
}
