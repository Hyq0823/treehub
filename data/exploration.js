// Display metadata stays separate from questionnaire definitions and scoring versions.
module.exports = {
  categories: [
    { id: 'all', name: '全部' }, { id: 'personality', name: '性格' },
    { id: 'emotion', name: '情绪' }, { id: 'energy', name: '能量' }, { id: 'playful', name: '趣味' }
  ],
  tests: {
    firstreaction: { title: '第一反应排序测试', category: 'emotion', prompt: '五件事一起发生，你本能会先保护什么？', symbol: '✦', art: 'compass', color: '#778eea', assetPath: 'tests/first-reaction/cover.webp', quickStart: true },
    historicalecho: { title: '你像哪位古人', category: 'playful', prompt: '在古人的生活切片里，找到与你共鸣的性格底色', symbol: '✧', art: 'leaves', color: '#82a9a0' },
    lifepath: { title: '轨道还是旷野', category: 'energy', prompt: '稳定与自由之间，你更想怎样安排自己的生活？', symbol: '⌁', art: 'compass', color: '#719dcc' },
    hiddentalent: { title: '隐藏天赋探索', category: 'energy', prompt: '那些你做起来不费力的小事，也许藏着你的闪光点', symbol: '✺', art: 'facets', color: '#a18dd4' },
    sbti: { title: 'SBTI 趣味人格测试', category: 'playful', prompt: '遇见有趣的自己，收集一份轻松的自我观察', symbol: '◈', art: 'mask', color: '#6e82db' },
    mbti: { title: 'MBTI 性格测试', category: 'personality', prompt: '探索十六型偏好，看见你的思考与生活方式', symbol: '✦', art: 'facets', color: '#548bfa' },
    enneagram: { title: '九型人格测试', category: 'personality', prompt: '了解内在动机，是什么在温柔地驱动你', symbol: '✺', art: 'compass', color: '#cda45e' },
    bigfive: { title: '大五人格测试', category: 'personality', prompt: '从五种性格特质，认识此刻更完整的自己', symbol: '❋', art: 'leaves', color: '#69a0d8' },
    shadow: { title: '阴影人格趣味测试', category: 'playful', prompt: '用一份趣味探索，看看平常不常表达的另一面', symbol: '☾', art: 'moon', color: '#8c83cf' },
    ie: { title: '内向外向测试', category: 'energy', prompt: '发现你的社交能量，找到舒服的相处节奏', symbol: '☘', art: 'energy', color: '#71a9cb' }
  }
};
