export default {
  id: 'shadow',
  name: '阴影人格测试',
  icon: '🌑',
  description: '阴影人格是指我们内心深处被压抑的、不被接受的部分。通过测试，你可以了解自己的阴影人格，从而更好地认识自己。',
  time: '6-8分钟',
  questionsCount: 20,
  questions: [
    {
      id: 1,
      text: '当你感到愤怒时，你会：',
      type: 'single',
      options: [
        { text: '压抑自己的情绪', value: '1' },
        { text: '表达自己的情绪', value: '2' }
      ]
    },
    {
      id: 2,
      text: '当你遇到困难时，你会：',
      type: 'single',
      options: [
        { text: '独自面对', value: '1' },
        { text: '寻求帮助', value: '2' }
      ]
    },
    {
      id: 3,
      text: '当你看到他人成功时，你会：',
      type: 'single',
      options: [
        { text: '感到嫉妒', value: '1' },
        { text: '感到高兴', value: '2' }
      ]
    },
    {
      id: 4,
      text: '当你犯错时，你会：',
      type: 'single',
      options: [
        { text: '自责', value: '1' },
        { text: '吸取教训', value: '2' }
      ]
    },
    {
      id: 5,
      text: '当你面对权威时，你会：',
      type: 'single',
      options: [
        { text: '服从', value: '1' },
        { text: '挑战', value: '2' }
      ]
    },
    {
      id: 6,
      text: '当你感到孤独时，你会：',
      type: 'single',
      options: [
        { text: '沉浸在孤独中', value: '1' },
        { text: '寻找社交活动', value: '2' }
      ]
    },
    {
      id: 7,
      text: '当你面对批评时，你会：',
      type: 'single',
      options: [
        { text: '感到受伤', value: '1' },
        { text: '接受批评', value: '2' }
      ]
    },
    {
      id: 8,
      text: '当你有欲望时，你会：',
      type: 'single',
      options: [
        { text: '压抑欲望', value: '1' },
        { text: '追求欲望', value: '2' }
      ]
    },
    {
      id: 9,
      text: '当你与他人意见不合时，你会：',
      type: 'single',
      options: [
        { text: '妥协', value: '1' },
        { text: '坚持己见', value: '2' }
      ]
    },
    {
      id: 10,
      text: '当你感到恐惧时，你会：',
      type: 'single',
      options: [
        { text: '逃避', value: '1' },
        { text: '面对', value: '2' }
      ]
    },
    {
      id: 11,
      text: '当你感到自卑时，你会：',
      type: 'single',
      options: [
        { text: '隐藏自己', value: '1' },
        { text: '提升自己', value: '2' }
      ]
    },
    {
      id: 12,
      text: '当你面对诱惑时，你会：',
      type: 'single',
      options: [
        { text: '抵制诱惑', value: '1' },
        { text: '屈服于诱惑', value: '2' }
      ]
    },
    {
      id: 13,
      text: '当你感到疲惫时，你会：',
      type: 'single',
      options: [
        { text: '继续工作', value: '1' },
        { text: '休息', value: '2' }
      ]
    },
    {
      id: 14,
      text: '当你面对冲突时，你会：',
      type: 'single',
      options: [
        { text: '避免冲突', value: '1' },
        { text: '解决冲突', value: '2' }
      ]
    },
    {
      id: 15,
      text: '当你感到焦虑时，你会：',
      type: 'single',
      options: [
        { text: '担心', value: '1' },
        { text: '采取行动', value: '2' }
      ]
    },
    {
      id: 16,
      text: '当你面对失败时，你会：',
      type: 'single',
      options: [
        { text: '感到沮丧', value: '1' },
        { text: '重新开始', value: '2' }
      ]
    },
    {
      id: 17,
      text: '当你感到压力时，你会：',
      type: 'single',
      options: [
        { text: '承受压力', value: '1' },
        { text: '释放压力', value: '2' }
      ]
    },
    {
      id: 18,
      text: '当你面对变化时，你会：',
      type: 'single',
      options: [
        { text: '抵抗变化', value: '1' },
        { text: '适应变化', value: '2' }
      ]
    },
    {
      id: 19,
      text: '当你感到不满时，你会：',
      type: 'single',
      options: [
        { text: '抱怨', value: '1' },
        { text: '采取行动', value: '2' }
      ]
    },
    {
      id: 20,
      text: '当你面对未知时，你会：',
      type: 'single',
      options: [
        { text: '感到恐惧', value: '1' },
        { text: '感到兴奋', value: '2' }
      ]
    }
  ],
  scoring: {
    dimensions: ['shadow'],
    mapping: [
      { q: 1, dim: 'shadow', direction: 1 },
      { q: 2, dim: 'shadow', direction: 1 },
      { q: 3, dim: 'shadow', direction: 1 },
      { q: 4, dim: 'shadow', direction: 1 },
      { q: 5, dim: 'shadow', direction: 1 },
      { q: 6, dim: 'shadow', direction: 1 },
      { q: 7, dim: 'shadow', direction: 1 },
      { q: 8, dim: 'shadow', direction: 1 },
      { q: 9, dim: 'shadow', direction: 1 },
      { q: 10, dim: 'shadow', direction: 1 },
      { q: 11, dim: 'shadow', direction: 1 },
      { q: 12, dim: 'shadow', direction: 1 },
      { q: 13, dim: 'shadow', direction: 1 },
      { q: 14, dim: 'shadow', direction: 1 },
      { q: 15, dim: 'shadow', direction: 1 },
      { q: 16, dim: 'shadow', direction: 1 },
      { q: 17, dim: 'shadow', direction: 1 },
      { q: 18, dim: 'shadow', direction: 1 },
      { q: 19, dim: 'shadow', direction: 1 },
      { q: 20, dim: 'shadow', direction: 1 }
    ],
    resultRule: (scores) => {
      const total = scores.shadow;
      if (total <= 20) return 'low';
      if (total <= 30) return 'medium';
      return 'high';
    }
  },
  reports: [
    {
      type: 'low',
      title: '阴影人格低',
      summary: '你善于面对自己的阴影，内心比较平衡。',
      description: '你能够接受自己的负面情绪和缺点，善于面对自己的阴影。你内心比较平衡，能够健康地处理自己的情绪和欲望。',
      advice: '继续保持这种状态，学会更加深入地了解自己。'
    },
    {
      type: 'medium',
      title: '阴影人格中等',
      summary: '你有一定的阴影人格，需要注意自我觉察。',
      description: '你有一定的阴影人格，有时会压抑自己的情绪和欲望。你需要更加注意自我觉察，学会接纳自己的负面情绪和缺点。',
      advice: '尝试更加开放地面对自己的阴影，学会表达自己的情绪和欲望。'
    },
    {
      type: 'high',
      title: '阴影人格高',
      summary: '你有较多的阴影人格，需要深入探索自己。',
      description: '你有较多的阴影人格，经常压抑自己的情绪和欲望。你需要深入探索自己的内心，学会接纳和整合自己的阴影。',
      advice: '寻求专业心理咨询，或者通过冥想、 journaling 等方式深入探索自己的内心。'
    }
  ]
}