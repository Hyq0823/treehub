// Lightweight metadata for pages that list tests but never render questions.
// Keep this file free of imports from data/tests so the hall can paint before
// the full question and report modules are evaluated.
const catalog = [
  {
    id: 'firstreaction', name: '第一反应排序测试', icon: '✦',
    description: '五件日常小事同时发生，你会先接住哪一件？排出此刻的处理顺序，看看忙乱时你本能先保护什么。',
    time: '约1分钟', questionsCount: 1
  },
  {
    id: 'historicalecho', name: '你像哪位古人', icon: '✒',
    description: '如果把此刻的你写进一页古书，会遇见谁的生活意象？从表达、求知、行动与共情四个角度，找到一份跨时空的共鸣。',
    time: '约3分钟', questionsCount: 12
  },
  {
    id: 'lifepath', name: '轨道还是旷野', icon: '⌁',
    description: '现在的你，更需要清晰路线，还是自由探索？从秩序、探索、自主与连接四个角度，看看适合当下的生活配方。',
    time: '约3分钟', questionsCount: 12
  },
  {
    id: 'hiddentalent', name: '你的隐藏天赋', icon: '✧',
    description: '有些事你做着顺手，却很少认真夸过自己。用十个生活场景，观察洞察、表达、创造、协作和落地五种自评偏好。',
    time: '约2分钟', questionsCount: 10
  },
  {
    id: 'sbti', name: 'SBTI人格测试', icon: '🎭',
    description: 'MBTI已经过时，SBTI来了。一种更有趣、更贴合现代年轻人的人格测试。',
    time: '3-5分钟', questionsCount: 30
  },
  {
    id: 'mbti', name: '16型人格测试', icon: '🧠',
    description: '基于荣格心理类型理论，通过四个维度评估人格类型：外向(E)/内向(I)、感觉(S)/直觉(N)、思考(T)/情感(F)、判断(J)/知觉(P)。',
    time: '5-8分钟', questionsCount: 28
  },
  {
    id: 'enneagram', name: '九型人格测试', icon: '🌟',
    description: '九型人格是一种深层次了解人的方法和学问，它按照人们的思维、情绪和行为，将人分为九种类型。',
    time: '8-10分钟', questionsCount: 36
  },
  {
    id: 'bigfive', name: '大五人格测试', icon: '🔍',
    description: '大五人格模型是目前心理学中最广泛使用的人格理论，通过五个维度评估人格：开放性、责任心、外向性、宜人性、神经质。',
    time: '10-12分钟', questionsCount: 40
  },
  {
    id: 'shadow', name: '阴影人格测试', icon: '🌑',
    description: '阴影人格是指我们内心深处被压抑的、不被接受的部分。通过测试，你可以了解自己的阴影人格，从而更好地认识自己。',
    time: '6-8分钟', questionsCount: 20
  },
  {
    id: 'ie', name: 'i人/e人测试', icon: '👥',
    description: 'i人/e人测试是基于MBTI理论中的外向(E)/内向(I)维度，评估你是内向型还是外向型人格。',
    time: '3-5分钟', questionsCount: 15
  }
];

const resultTitles = {
  firstreaction: { order: '秩序复原师', connection: '情绪接住者', risk: '风向守门人', joy: '快乐导航员', security: '信息校准者' },
  historicalecho: { liqingzhao: '李清照式·细腻收藏家', sushi: '苏轼式·旷达生活家', wangyangming: '王阳明式·笃行思考家', libai: '李白式·自由表达家', xuxiake: '徐霞客式·远方探索家', taoyuanming: '陶渊明式·自洽栖居者', wuzetian: '武则天式·自主开路者', banzhao: '班昭式·沉静求知者', xiedaoyun: '谢道韫式·灵动对话家', wangwei: '王维式·山水留白家', shenkuo: '沈括式·好奇观察家', xinqiji: '辛弃疾式·热忱行动家' },
  lifepath: { track: '轨道筑梦者', wild: '旷野漫游者', dual: '双栖探索家', builder: '自由建造师' },
  hiddentalent: { insight: '洞察捕光者', expression: '故事翻译官', creation: '灵感造梦师', coordination: '关系连接者', execution: '行动搭建师' },
  sbti: {
    CTRL: '拿捏者', 'ATM-er': '送钱者', 'Dior-s': '屌丝', BOSS: '领导者', 'THAN-K': '感恩者',
    'OH-NO': '哦不人', GOGO: '行者', SEXY: '尤物', 'LOVE-R': '多情者', MUM: '妈妈', FAKE: '伪人',
    OJBK: '无所谓人', MALO: '吗喽', 'JOKE-R': '小丑', 'WOC!': '握草人', 'THIN-K': '思考者',
    SHIT: '愤世者', ZZZZ: '装死者', POOR: '贫困者', MONK: '僧人', IMSB: '傻者', SOLO: '孤儿',
    FUCK: '草者', DEAD: '死者', IMFW: '废物', HHHH: '傻乐者', DRUNK: '酒鬼'
  },
  mbti: {
    ISTJ: '物流师', ISFJ: '守卫者', INFJ: '提倡者', INTJ: '建筑师', ISTP: '鉴赏家', ISFP: '探险家',
    INFP: '调停者', INTP: '逻辑学家', ESTP: '企业家', ESFP: '表演者', ENFP: '竞选者', ENTP: '辩论家',
    ESTJ: '执行官', ESFJ: '领事', ENFJ: ' protagonist ', ENTJ: '指挥官'
  },
  enneagram: { '1': '完美主义者', '2': '助人者', '3': '成就者', '4': '艺术型', '5': '思考者', '6': '忠诚者', '7': '享乐者', '8': '挑战者', '9': '和平者' },
  bigfive: {
    high_openness: '开放性高', high_conscientiousness: '责任心强', high_extraversion: '外向性高',
    high_agreeableness: '宜人性高', high_neuroticism: '神经质高', low_openness: '开放性低',
    low_conscientiousness: '责任心低', low_extraversion: '外向性低', low_agreeableness: '宜人性低',
    low_neuroticism: '神经质低'
  },
  shadow: { low: '阴影人格低', medium: '阴影人格中等', high: '阴影人格高' },
  ie: { E: 'e人', I: 'i人', 'E/I': '中间型' }
};

// Visual associations are editorial choices, not psychological measurements.
// Keep these small so a newly completed light test can grow a tree without
// making listing pages evaluate the full questionnaires.
const treeAssociations = {
  historicalecho: {
    dimensions: ['expression', 'curiosity', 'resolve', 'empathy'], minimum: 3, maximum: 12,
    results: { liqingzhao: 'willow', sushi: 'olive', wangyangming: 'pine', libai: 'maple', xuxiake: 'maple', taoyuanming: 'ginkgo', wuzetian: 'pine', banzhao: 'ginkgo', xiedaoyun: 'banyan', wangwei: 'willow', shenkuo: 'maple', xinqiji: 'pine' }
  },
  lifepath: {
    dimensions: ['structure', 'exploration', 'autonomy', 'connection'], minimum: 3, maximum: 12,
    results: { track: 'pine', wild: 'maple', dual: 'olive', builder: 'ginkgo' }
  },
  hiddentalent: {
    dimensions: ['insight', 'expression', 'creation', 'coordination', 'execution'], minimum: 2, maximum: 8,
    results: { insight: 'ginkgo', expression: 'willow', creation: 'maple', coordination: 'banyan', execution: 'pine' }
  }
};

function resolveResultTitle(testId, record) {
  if (!record || record.testId !== testId) return '';
  if (record.scoringVersion !== '2' && (!record.scores || !Object.keys(record.scores).length)) return '';
  if (testId === 'bigfive') {
    const scores = record.scores || {};
    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    if (record.scoringVersion === '2') {
      return dimensions.every(id => Number.isFinite(scores[id]) && scores[id] >= 8 && scores[id] <= 40)
        ? '你的五维特质' : '';
    }
    return typeof record.resultType === 'string' ? resultTitles.bigfive[record.resultType] || '' : '';
  }
  return typeof record.resultType === 'string' && resultTitles[testId]
    ? resultTitles[testId][record.resultType] || '' : '';
}

module.exports = { catalog, resultTitles, resolveResultTitle, treeAssociations };
