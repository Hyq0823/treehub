export default {
  id: 'yierbubu',
  name: '你是一二还是布布？',
  icon: '🐻',
  featured: true,
  description: '11 个日常瞬间，看看你更像元气行动派一二，还是温柔慢热派布布。',
  time: '2-3分钟',
  questionsCount: 11,
  questions: [
    { id: 1, text: '朋友临时约你出门，你的第一反应是？', type: 'single', options: [{ text: '走呀，边出门边决定去哪', value: 1 }, { text: '先问清安排，再看看今天的电量', value: -1 }] },
    { id: 2, text: '遇到很喜欢的新事物，你通常会？', type: 'single', options: [{ text: '马上分享，想拉大家一起体验', value: 1 }, { text: '先悄悄收藏，确认喜欢后再分享', value: -1 }] },
    { id: 3, text: '关系里出现一点小误会时，你更容易？', type: 'single', options: [{ text: '尽快说开，不喜欢问题悬着', value: 1 }, { text: '先整理情绪，想好措辞再表达', value: -1 }] },
    { id: 4, text: '忙完很累的一天，你最想得到的是？', type: 'single', options: [{ text: '有人带我去吃好吃的，换个心情', value: 1 }, { text: '一个安静的拥抱，让我慢慢回血', value: -1 }] },
    { id: 5, text: '旅行时突然下雨，你会？', type: 'single', options: [{ text: '改路线，雨天也能发现新玩法', value: 1 }, { text: '找家舒服的小店，听雨也很好', value: -1 }] },
    { id: 6, text: '别人夸你时，你比较像哪一种？', type: 'single', options: [{ text: '开心接住，还会顺手夸回去', value: 1 }, { text: '有点害羞，但会把这句话记很久', value: -1 }] },
    { id: 7, text: '面对一个心动机会，你倾向于？', type: 'single', options: [{ text: '先试试看，行动会告诉我答案', value: 1 }, { text: '观察一阵，确定安全感再靠近', value: -1 }] },
    { id: 8, text: '在朋友群里，你更常扮演？', type: 'single', options: [{ text: '发起活动、制造快乐的人', value: 1 }, { text: '认真倾听、记住细节的人', value: -1 }] },
    { id: 9, text: '心情不太好时，你通常会？', type: 'single', options: [{ text: '做点事情，把情绪带动起来', value: 1 }, { text: '给自己一点空间，慢慢消化', value: -1 }] },
    { id: 10, text: '收到喜欢的人发来的消息，你会？', type: 'single', options: [{ text: '看到就回，快乐不需要藏着', value: 1 }, { text: '想一想怎么回，怕心意表达得不够好', value: -1 }] },
    { id: 11, text: '你希望陪伴你的小熊更像？', type: 'single', options: [{ text: '拉着我出发，给我勇气和新鲜感', value: 1 }, { text: '陪我慢下来，接住细腻的小情绪', value: -1 }] }
  ],
  scoring: {
    dimensions: ['action', 'expression', 'relation', 'emotion', 'explore'],
    mapping: [
      { q: 1, dim: 'action', direction: 1 },
      { q: 2, dim: 'expression', direction: 1 },
      { q: 3, dim: 'relation', direction: 1 },
      { q: 4, dim: 'emotion', direction: 1 },
      { q: 5, dim: 'explore', direction: 1 },
      { q: 6, dim: 'expression', direction: 1 },
      { q: 7, dim: 'action', direction: 1 },
      { q: 8, dim: 'relation', direction: 1 },
      { q: 9, dim: 'emotion', direction: 1 },
      { q: 10, dim: 'relation', direction: 1 },
      { q: 11, dim: 'explore', direction: 1 }
    ],
    resultRule: scores => Object.values(scores).reduce((sum, value) => sum + value, 0) > 0 ? 'Y' : 'B'
  },
  reports: [
    {
      type: 'Y',
      title: '元气行动派 · 一二型',
      summary: '你更像一二：热烈、直接，愿意用行动把生活点亮。',
      description: '你对世界保留着很强的好奇心。遇到喜欢的人和事，你愿意主动靠近，也擅长把轻松的能量带给身边的人。你并非没有细腻情绪，只是更习惯在行动中找到答案。',
      advice: '你的同频伙伴是元气一二熊。继续勇敢出发，也给疲惫的自己留一点慢下来的空间。'
    },
    {
      type: 'B',
      title: '温柔慢热派 · 布布型',
      summary: '你更像布布：细腻、真诚，习惯把珍贵的感受慢慢收藏。',
      description: '你拥有安静但稳定的感受力。面对关系和选择，你会先观察、确认，再认真投入。你的温柔有自己的节奏，也常常能听见别人没有说出口的那部分。',
      advice: '你的同频伙伴是温柔布布熊。尊重自己的节奏，也可以偶尔让喜欢和需要更早被看见。'
    }
  ]
};
