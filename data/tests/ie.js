export default {
  id: 'ie',
  name: 'i人/e人测试',
  icon: '👥',
  description: 'i人/e人测试是基于MBTI理论中的外向(E)/内向(I)维度，评估你是内向型还是外向型人格。',
  time: '3-5分钟',
  questionsCount: 15,
  questions: [
    {
      id: 1,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '和朋友一起聚会', value: 'E' },
        { text: '独自在家休息', value: 'I' }
      ]
    },
    {
      id: 2,
      text: '在社交场合，你通常：',
      type: 'single',
      options: [
        { text: '主动与人交流', value: 'E' },
        { text: '等待别人主动交流', value: 'I' }
      ]
    },
    {
      id: 3,
      text: '你获取能量的方式是：',
      type: 'single',
      options: [
        { text: '与他人互动', value: 'E' },
        { text: '独自思考', value: 'I' }
      ]
    },
    {
      id: 4,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '热闹的环境', value: 'E' },
        { text: '安静的环境', value: 'I' }
      ]
    },
    {
      id: 5,
      text: '你在团队中通常：',
      type: 'single',
      options: [
        { text: '积极参与讨论', value: 'E' },
        { text: '倾听他人意见', value: 'I' }
      ]
    },
    {
      id: 6,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '表达自己的想法', value: 'E' },
        { text: '思考自己的想法', value: 'I' }
      ]
    },
    {
      id: 7,
      text: '你在空闲时间通常：',
      type: 'single',
      options: [
        { text: '参加社交活动', value: 'E' },
        { text: '阅读或做自己喜欢的事情', value: 'I' }
      ]
    },
    {
      id: 8,
      text: '你对新认识的人通常：',
      type: 'single',
      options: [
        { text: '主动接近', value: 'E' },
        { text: '保持距离', value: 'I' }
      ]
    },
    {
      id: 9,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '多人活动', value: 'E' },
        { text: '一对一活动', value: 'I' }
      ]
    },
    {
      id: 10,
      text: '你在压力下通常：',
      type: 'single',
      options: [
        { text: '寻求他人支持', value: 'E' },
        { text: '独自面对', value: 'I' }
      ]
    },
    {
      id: 11,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '行动', value: 'E' },
        { text: '思考', value: 'I' }
      ]
    },
    {
      id: 12,
      text: '你在社交后通常：',
      type: 'single',
      options: [
        { text: '感到精力充沛', value: 'E' },
        { text: '感到疲惫', value: 'I' }
      ]
    },
    {
      id: 13,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '外部世界', value: 'E' },
        { text: '内心世界', value: 'I' }
      ]
    },
    {
      id: 14,
      text: '你在会议中通常：',
      type: 'single',
      options: [
        { text: '积极发言', value: 'E' },
        { text: '认真倾听', value: 'I' }
      ]
    },
    {
      id: 15,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '多样性和变化', value: 'E' },
        { text: '稳定性和常规', value: 'I' }
      ]
    }
  ],
  scoring: {
    dimensions: ['EI'],
    mapping: [
      { q: 1, dim: 'EI', direction: 1 },
      { q: 2, dim: 'EI', direction: 1 },
      { q: 3, dim: 'EI', direction: 1 },
      { q: 4, dim: 'EI', direction: 1 },
      { q: 5, dim: 'EI', direction: 1 },
      { q: 6, dim: 'EI', direction: 1 },
      { q: 7, dim: 'EI', direction: 1 },
      { q: 8, dim: 'EI', direction: 1 },
      { q: 9, dim: 'EI', direction: 1 },
      { q: 10, dim: 'EI', direction: 1 },
      { q: 11, dim: 'EI', direction: 1 },
      { q: 12, dim: 'EI', direction: 1 },
      { q: 13, dim: 'EI', direction: 1 },
      { q: 14, dim: 'EI', direction: 1 },
      { q: 15, dim: 'EI', direction: 1 }
    ],
    resultRule: (scores) => {
      const eCount = scores.EI;
      const iCount = 15 - eCount;
      if (eCount > iCount) return 'E';
      if (iCount > eCount) return 'I';
      return 'E/I';
    }
  },
  reports: [
    {
      type: 'E',
      title: 'e人',
      summary: '你是一个外向型人格，喜欢与人互动。',
      description: '你是一个外向型人格，喜欢与人互动，从社交中获取能量。你善于表达自己的想法，喜欢热闹的环境，在团队中积极参与讨论。',
      advice: '继续保持你的社交能力，同时学会享受独处的时光。'
    },
    {
      type: 'I',
      title: 'i人',
      summary: '你是一个内向型人格，喜欢独自思考。',
      description: '你是一个内向型人格，喜欢独自思考，从独处中获取能量。你善于倾听他人的意见，喜欢安静的环境，在团队中认真倾听。',
      advice: '继续保持你的思考能力，同时适当参加社交活动。'
    },
    {
      type: 'E/I',
      title: '中间型',
      summary: '你是一个中间型人格，既喜欢社交也喜欢独处。',
      description: '你是一个中间型人格，既喜欢社交也喜欢独处，能够根据不同的情境调整自己的行为。你在社交和独处之间找到了平衡。',
      advice: '继续保持这种平衡，根据自己的需要调整社交和独处的时间。'
    }
  ]
}