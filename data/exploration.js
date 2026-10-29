// Display metadata stays separate from questionnaire definitions and scoring versions.
module.exports = {
  categories: [
    { id: 'all', name: '全部' }, { id: 'personality', name: '性格' },
    { id: 'energy', name: '能量' }, { id: 'playful', name: '趣味' }
  ],
  tests: {
    sbti: { title: 'SBTI 趣味人格', category: 'playful', prompt: '遇见有趣的自己', symbol: '◈', art: 'mask', color: '#244466' },
    mbti: { title: 'MBTI 十六型', category: 'personality', prompt: '你如何看待世界？', symbol: '✦', art: 'facets', color: '#488d7a' },
    enneagram: { title: '九型人格', category: 'personality', prompt: '什么在驱动你？', symbol: '✺', art: 'compass', color: '#bd9143' },
    bigfive: { title: '大五人格', category: 'personality', prompt: '发现你的五种特质', symbol: '❋', art: 'leaves', color: '#689271' },
    shadow: { title: '阴影人格', category: 'playful', prompt: '看看隐藏的另一面', symbol: '☾', art: 'moon', color: '#4f5e85' },
    ie: { title: '内外向', category: 'energy', prompt: '你的能量来自哪里？', symbol: '☘', art: 'energy', color: '#6d977b' }
  }
};
