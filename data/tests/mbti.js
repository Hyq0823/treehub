export default {
  id: 'mbti',
  name: '16型人格测试',
  icon: '🧠',
  description: '基于荣格心理类型理论，通过四个维度评估人格类型：外向(E)/内向(I)、感觉(S)/直觉(N)、思考(T)/情感(F)、判断(J)/知觉(P)。',
  time: '5-8分钟',
  questionsCount: 28,
  questions: [
    {
      id: 1,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '和朋友一起度过周末', value: 'E' },
        { text: '独自度过周末', value: 'I' }
      ]
    },
    {
      id: 2,
      text: '你更关注：',
      type: 'single',
      options: [
        { text: '具体的事实和细节', value: 'S' },
        { text: '抽象的概念和可能性', value: 'N' }
      ]
    },
    {
      id: 3,
      text: '做决定时，你更依赖：',
      type: 'single',
      options: [
        { text: '逻辑和分析', value: 'T' },
        { text: '情感和价值观', value: 'F' }
      ]
    },
    {
      id: 4,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '有计划、有组织的生活', value: 'J' },
        { text: '灵活、即兴的生活', value: 'P' }
      ]
    },
    {
      id: 5,
      text: '在社交场合，你通常：',
      type: 'single',
      options: [
        { text: '主动与人交流', value: 'E' },
        { text: '等待别人主动交流', value: 'I' }
      ]
    },
    {
      id: 6,
      text: '学习新事物时，你更倾向于：',
      type: 'single',
      options: [
        { text: '通过实践和经验', value: 'S' },
        { text: '通过理论和概念', value: 'N' }
      ]
    },
    {
      id: 7,
      text: '面对冲突时，你更倾向于：',
      type: 'single',
      options: [
        { text: '直接解决问题', value: 'T' },
        { text: '考虑他人感受', value: 'F' }
      ]
    },
    {
      id: 8,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '提前计划好事情', value: 'J' },
        { text: '随遇而安', value: 'P' }
      ]
    },
    {
      id: 9,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '参加热闹的聚会', value: 'E' },
        { text: '在家安静地读书', value: 'I' }
      ]
    },
    {
      id: 10,
      text: '你更关注：',
      type: 'single',
      options: [
        { text: '现在的情况', value: 'S' },
        { text: '未来的可能性', value: 'N' }
      ]
    },
    {
      id: 11,
      text: '做决定时，你更注重：',
      type: 'single',
      options: [
        { text: '客观事实', value: 'T' },
        { text: '主观感受', value: 'F' }
      ]
    },
    {
      id: 12,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '把事情做完再玩', value: 'J' },
        { text: '玩够了再做事', value: 'P' }
      ]
    },
    {
      id: 13,
      text: '你更擅长：',
      type: 'single',
      options: [
        { text: '与他人合作', value: 'E' },
        { text: '独立完成任务', value: 'I' }
      ]
    },
    {
      id: 14,
      text: '你更相信：',
      type: 'single',
      options: [
        { text: '自己的经验', value: 'S' },
        { text: '自己的直觉', value: 'N' }
      ]
    },
    {
      id: 15,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '理性思考', value: 'T' },
        { text: '感性思考', value: 'F' }
      ]
    },
    {
      id: 16,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '有规律的生活', value: 'J' },
        { text: '自由随意的生活', value: 'P' }
      ]
    },
    {
      id: 17,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '表达自己的想法', value: 'E' },
        { text: '倾听他人的想法', value: 'I' }
      ]
    },
    {
      id: 18,
      text: '你更关注：',
      type: 'single',
      options: [
        { text: '细节', value: 'S' },
        { text: '整体', value: 'N' }
      ]
    },
    {
      id: 19,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '批评他人', value: 'T' },
        { text: '表扬他人', value: 'F' }
      ]
    },
    {
      id: 20,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '准时', value: 'J' },
        { text: '灵活', value: 'P' }
      ]
    },
    {
      id: 21,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '与人交往', value: 'E' },
        { text: '独处', value: 'I' }
      ]
    },
    {
      id: 22,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '实际', value: 'S' },
        { text: '想象', value: 'N' }
      ]
    },
    {
      id: 23,
      text: '你更注重：',
      type: 'single',
      options: [
        { text: '公平', value: 'T' },
        { text: '和谐', value: 'F' }
      ]
    },
    {
      id: 24,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '有组织', value: 'J' },
        { text: '随意', value: 'P' }
      ]
    },
    {
      id: 25,
      text: '你更擅长：',
      type: 'single',
      options: [
        { text: '演讲', value: 'E' },
        { text: '写作', value: 'I' }
      ]
    },
    {
      id: 26,
      text: '你更关注：',
      type: 'single',
      options: [
        { text: '现实', value: 'S' },
        { text: '理想', value: 'N' }
      ]
    },
    {
      id: 27,
      text: '你更倾向于：',
      type: 'single',
      options: [
        { text: '逻辑', value: 'T' },
        { text: '情感', value: 'F' }
      ]
    },
    {
      id: 28,
      text: '你更喜欢：',
      type: 'single',
      options: [
        { text: '计划', value: 'J' },
        { text: '即兴', value: 'P' }
      ]
    }
  ],
  scoring: {
    dimensions: ['EI','SN','TF','JP'],
    mapping: [
      { q: 1, dim: 'EI', direction: 1 },
      { q: 2, dim: 'SN', direction: 1 },
      { q: 3, dim: 'TF', direction: 1 },
      { q: 4, dim: 'JP', direction: 1 },
      { q: 5, dim: 'EI', direction: 1 },
      { q: 6, dim: 'SN', direction: 1 },
      { q: 7, dim: 'TF', direction: 1 },
      { q: 8, dim: 'JP', direction: 1 },
      { q: 9, dim: 'EI', direction: 1 },
      { q: 10, dim: 'SN', direction: 1 },
      { q: 11, dim: 'TF', direction: 1 },
      { q: 12, dim: 'JP', direction: 1 },
      { q: 13, dim: 'EI', direction: 1 },
      { q: 14, dim: 'SN', direction: 1 },
      { q: 15, dim: 'TF', direction: 1 },
      { q: 16, dim: 'JP', direction: 1 },
      { q: 17, dim: 'EI', direction: 1 },
      { q: 18, dim: 'SN', direction: 1 },
      { q: 19, dim: 'TF', direction: 1 },
      { q: 20, dim: 'JP', direction: 1 },
      { q: 21, dim: 'EI', direction: 1 },
      { q: 22, dim: 'SN', direction: 1 },
      { q: 23, dim: 'TF', direction: 1 },
      { q: 24, dim: 'JP', direction: 1 },
      { q: 25, dim: 'EI', direction: 1 },
      { q: 26, dim: 'SN', direction: 1 },
      { q: 27, dim: 'TF', direction: 1 },
      { q: 28, dim: 'JP', direction: 1 }
    ],
    resultRule: (scores) => {
      let type = '';
      type += scores.EI > 0 ? 'E' : 'I';
      type += scores.SN > 0 ? 'S' : 'N';
      type += scores.TF > 0 ? 'T' : 'F';
      type += scores.JP > 0 ? 'J' : 'P';
      return type;
    }
  },
  reports: [
    {
      type: 'ISTJ',
      title: '物流师',
      summary: '务实、有序、可靠，重视传统和规则。',
      description: '你是一个务实、有序、可靠的人，重视传统和规则。你喜欢按照计划行事，注重细节，善于组织和管理。你是一个负责任的人，会认真完成自己的任务。',
      advice: '尝试更加灵活，接受变化，学会放松自己。'
    },
    {
      type: 'ISFJ',
      title: '守卫者',
      summary: '温暖、体贴、有责任感，重视家庭和传统。',
      description: '你是一个温暖、体贴、有责任感的人，重视家庭和传统。你善于照顾他人，注重和谐，是一个可靠的朋友和家人。',
      advice: '学会表达自己的需求，不要总是牺牲自己来满足他人。'
    },
    {
      type: 'INFJ',
      title: '提倡者',
      summary: '理想主义、有洞察力、有责任感，致力于帮助他人。',
      description: '你是一个理想主义、有洞察力、有责任感的人，致力于帮助他人。你善于理解他人的情感和需求，是一个有远见的思考者。',
      advice: '学会照顾自己，不要过度投入他人的问题。'
    },
    {
      type: 'INTJ',
      title: '建筑师',
      summary: '理性、独立、有远见，善于分析和规划。',
      description: '你是一个理性、独立、有远见的人，善于分析和规划。你是一个战略性思考者，注重效率和结果。',
      advice: '学会倾听他人的意见，不要过于固执己见。'
    },
    {
      type: 'ISTP',
      title: '鉴赏家',
      summary: '灵活、实际、善于解决问题，喜欢探索和体验。',
      description: '你是一个灵活、实际、善于解决问题的人，喜欢探索和体验。你是一个动手能力强的人，善于应对突发情况。',
      advice: '学会坚持完成任务，不要轻易放弃。'
    },
    {
      type: 'ISFP',
      title: '探险家',
      summary: '敏感、灵活、有艺术气质，重视个人价值观。',
      description: '你是一个敏感、灵活、有艺术气质的人，重视个人价值观。你善于表达自己的情感，是一个有创造力的人。',
      advice: '学会面对现实，不要逃避困难。'
    },
    {
      type: 'INFP',
      title: '调停者',
      summary: '理想主义、敏感、有创造力，重视个人价值和意义。',
      description: '你是一个理想主义、敏感、有创造力的人，重视个人价值和意义。你善于理解他人的情感，是一个有同理心的人。',
      advice: '学会设定边界，不要过度为他人着想。'
    },
    {
      type: 'INTP',
      title: '逻辑学家',
      summary: '理性、好奇、善于分析，喜欢探索抽象概念。',
      description: '你是一个理性、好奇、善于分析的人，喜欢探索抽象概念。你是一个独立思考者，善于解决复杂问题。',
      advice: '学会关注现实，不要过于沉浸在理论中。'
    },
    {
      type: 'ESTP',
      title: '企业家',
      summary: '热情、实际、善于社交，喜欢冒险和挑战。',
      description: '你是一个热情、实际、善于社交的人，喜欢冒险和挑战。你是一个行动派，善于把握机会。',
      advice: '学会规划未来，不要过于冲动。'
    },
    {
      type: 'ESFP',
      title: '表演者',
      summary: '热情、友好、善于表达，喜欢享受生活。',
      description: '你是一个热情、友好、善于表达的人，喜欢享受生活。你是一个社交达人，善于与人相处。',
      advice: '学会考虑后果，不要过于追求即时满足。'
    },
    {
      type: 'ENFP',
      title: '竞选者',
      summary: '热情、理想主义、有创造力，善于激励他人。',
      description: '你是一个热情、理想主义、有创造力的人，善于激励他人。你是一个充满活力的人，喜欢探索新的可能性。',
      advice: '学会专注，不要同时做太多事情。'
    },
    {
      type: 'ENTP',
      title: '辩论家',
      summary: '聪明、好奇、善于辩论，喜欢挑战传统。',
      description: '你是一个聪明、好奇、善于辩论的人，喜欢挑战传统。你是一个创新者，善于提出新的想法。',
      advice: '学会耐心，不要过于急于反驳他人。'
    },
    {
      type: 'ESTJ',
      title: '执行官',
      summary: '务实、组织力强、有责任感，重视秩序和效率。',
      description: '你是一个务实、组织力强、有责任感的人，重视秩序和效率。你是一个领导者，善于管理和协调。',
      advice: '学会倾听他人的意见，不要过于专制。'
    },
    {
      type: 'ESFJ',
      title: '领事',
      summary: '热情、友好、有责任感，重视和谐和传统。',
      description: '你是一个热情、友好、有责任感的人，重视和谐和传统。你是一个善于照顾他人的人，喜欢帮助他人。',
      advice: '学会照顾自己，不要过度为他人付出。'
    },
    {
      type: 'ENFJ',
      title: ' protagonist ',
      summary: '热情、理想主义、有领导力，善于激励他人。',
      description: '你是一个热情、理想主义、有领导力的人，善于激励他人。你是一个有远见的人，致力于实现共同的目标。',
      advice: '学会接受批评，不要过于在意他人的看法。'
    },
    {
      type: 'ENTJ',
      title: '指挥官',
      summary: '理性、果断、有领导力，善于规划和组织。',
      description: '你是一个理性、果断、有领导力的人，善于规划和组织。你是一个战略家，善于制定和执行计划。',
      advice: '学会倾听他人的意见，不要过于自信。'
    }
  ]
}