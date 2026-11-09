const DIMENSIONS = [
  { id: 'order', label: '秩序闭环', short: '小蛋糕计时器', image: '/assets/tests/first-reaction/order.webp' },
  { id: 'connection', label: '关系回应', short: '好友的情绪消息', image: '/assets/tests/first-reaction/connection.webp' },
  { id: 'risk', label: '风险预警', short: '雨中的床单', image: '/assets/tests/first-reaction/risk.webp' },
  { id: 'joy', label: '愉悦补给', short: '期待已久的快递', image: '/assets/tests/first-reaction/joy.webp' },
  { id: 'security', label: '信息续航', short: '低电量的重要消息', image: '/assets/tests/first-reaction/security.webp' }
];

export default {
  id: 'firstreaction',
  name: '第一反应排序测试',
  icon: '✦',
  cover: '/assets/tests/first-reaction/cover.webp',
  description: '五件日常小事同时发生，你会先接住哪一件？排出此刻的处理顺序，看看忙乱时你本能先保护什么。',
  time: '约1分钟',
  questionsCount: 1,
  format: { value: '5件事', label: '按直觉排序' },
  interaction: {
    type: 'ranking',
    helper: '没有标准答案，按第一反应依次点完 5 张卡',
    revealTitle: '正在读取你的第一反应',
    revealCopy: '把这条处理路径，慢慢展开成此刻的优先级画像',
    shareTitle: '5件事一起发生，你会先处理哪一件？｜第一反应测试',
    timelineTitle: '第一反应排序测试｜看看忙乱时你先保护什么'
  },
  questions: [
    {
      id: 'daily-rush-1',
      type: 'ranking',
      text: '五件事一起发生，你会先接住哪一件？',
      context: '从最想先处理的开始，依次点到最后一件。',
      options: [
        {
          id: 'order', value: 'order', dimension: 'order',
          text: '刚烤好的小蛋糕，计时器响了', short: '取出小蛋糕',
          image: '/assets/tests/first-reaction/order.webp'
        },
        {
          id: 'connection', value: 'connection', dimension: 'connection',
          text: '好友发来消息：“今天有点难过”', short: '回应好友',
          image: '/assets/tests/first-reaction/connection.webp'
        },
        {
          id: 'risk', value: 'risk', dimension: 'risk',
          text: '窗外突然下雨，床单还晾在阳台', short: '收回床单',
          image: '/assets/tests/first-reaction/risk.webp'
        },
        {
          id: 'joy', value: 'joy', dimension: 'joy',
          text: '门铃响了，期待很久的快递到了', short: '拿期待的快递',
          image: '/assets/tests/first-reaction/joy.webp'
        },
        {
          id: 'security', value: 'security', dimension: 'security',
          text: '手机只剩 1%，同时弹出一条重要消息', short: '确认消息并充电',
          image: '/assets/tests/first-reaction/security.webp'
        }
      ]
    }
  ],
  scoring: {
    strategy: 'weighted-ranking',
    dimensions: DIMENSIONS.map(item => item.id),
    dimensionMeta: DIMENSIONS,
    weights: [100, 78, 56, 34, 18],
    resultRule(scores) {
      return DIMENSIONS.map(item => item.id).sort((first, second) =>
        scores[second] - scores[first] || DIMENSIONS.findIndex(item => item.id === first) - DIMENSIONS.findIndex(item => item.id === second)
      )[0];
    }
  },
  reports: [
    {
      type: 'order', title: '秩序复原师', image: '/assets/tests/first-reaction/order.webp',
      summary: '忙乱一来，你会先关掉一个明确的“未完成”。',
      description: '你更容易通过完成一件具体的事，让周围重新变得可控。行动和收尾会给你清晰感，也帮助你从混乱中找回节奏。',
      advice: '事情很多时，先列出“必须立刻处理”和“稍后也来得及”，别让每个未完成都同时占住注意力。'
    },
    {
      type: 'connection', title: '情绪接住者', image: '/assets/tests/first-reaction/connection.webp',
      summary: '重要的人发来信号，你很难假装没看见。',
      description: '你会很快捕捉关系里的情绪变化，并本能地给出回应。被需要会唤起你的责任感，也让你重视彼此是否仍然连接。',
      advice: '接住别人之前，也可以先确认自己的余量。一句“我看见了，晚一点认真陪你聊”同样是温柔的回应。'
    },
    {
      type: 'risk', title: '风向守门人', image: '/assets/tests/first-reaction/risk.webp',
      summary: '你会先看见那个可能继续扩大的损失。',
      description: '面对多件突发小事，你的注意力容易先落在风险和后果上。你擅长提前补位、及时止损，让局面不要变得更难收拾。',
      advice: '风险意识是优势，也可以给自己设一条停止线：处理到“已经足够安全”，就允许注意力回到当下。'
    },
    {
      type: 'joy', title: '快乐导航员', image: '/assets/tests/first-reaction/joy.webp',
      summary: '你会先抓住那件能让自己亮起来的小事。',
      description: '你知道积极感受也能提供行动能量。忙乱时，你可能会先选择一个有期待感的入口，让自己重新启动，再去面对其他事项。',
      advice: '把快乐放进优先级并不等于逃避。享受片刻后，为下一件必须处理的事留一个明确开始时间。'
    },
    {
      type: 'security', title: '信息校准者', image: '/assets/tests/first-reaction/security.webp',
      summary: '面对混乱，你倾向先确认信息和可用资源。',
      description: '你会在行动前检查关键消息、剩余能量与可连接状态。信息明确、资源可用，会让你更安心地判断接下来做什么。',
      advice: '确认信息能减少不确定感，也要留意别陷入反复检查。拿到足够信息后，给自己一个可以立刻执行的小步骤。'
    }
  ]
};
