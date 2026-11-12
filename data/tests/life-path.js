import profileScoring from '../../utils/profile-scoring.js';
const { createProfileTest } = profileScoring;

export default createProfileTest({
  id: 'lifepath',
  name: '轨道还是旷野',
  icon: '⌁',
  description: '现在的你，更需要清晰路线，还是自由探索？从秩序、探索、自主与连接四个角度，看看适合当下的生活配方。',
  time: '约3分钟',
  format: { value: '12题', label: '找到此刻的生活配方' },
  interaction: {
    revealTitle: '正在铺开你的生活地图',
    revealCopy: '不替你选人生，只看看这段时间的你需要什么',
    shareTitle: '你更适合轨道，还是旷野？｜生活偏好测试',
    timelineTitle: '轨道还是旷野｜记录此刻需要的生活节奏'
  },
  note: '原创趣味自评，呈现近期生活偏好。轨道与旷野没有高下，不是职业、离职、搬家或其他重大人生决策建议。',
  dimensionMeta: [
    { id: 'structure', label: '秩序需求', left: '留白随行', right: '路线清晰' },
    { id: 'exploration', label: '探索需求', left: '熟悉深耕', right: '未知尝试' },
    { id: 'autonomy', label: '自主需求', left: '共同商量', right: '自主决定' },
    { id: 'connection', label: '连接需求', left: '独立空间', right: '稳定陪伴' }
  ],
  questions: [
    { id: 1, dim: 'structure', text: '想象一个完全属于你的周末，你更喜欢：', options: [
      { text: '先定两件想做的事，其他留白', value: 2 },
      { text: '把时间和安排排好，心里更踏实', value: 4 },
      { text: '睡醒再看心情，顺着当天走', value: 1 },
      { text: '提前有个大致计划，再灵活调整', value: 3 }
    ] },
    { id: 2, dim: 'exploration', text: '可以选择一个月的小体验，你更想：', options: [
      { text: '试一个从没接触过的领域', value: 4 },
      { text: '把已有爱好做得更深一点', value: 1 },
      { text: '在熟悉爱好里换一种新玩法', value: 2 },
      { text: '尝试感兴趣、但还不太熟悉的事', value: 3 }
    ] },
    { id: 3, dim: 'autonomy', text: '一项安排有几种都不错的方案，你希望：', options: [
      { text: '大家商量好后，我按共同决定来', value: 1 },
      { text: '自己决定关键部分，其他可以协商', value: 3 },
      { text: '充分听取意见，再一起敲定', value: 2 },
      { text: '自己对选择负责，也拥有最后决定权', value: 4 }
    ] },
    { id: 4, dim: 'connection', text: '经历疲惫的一周，什么最能让你安定下来：', options: [
      { text: '和熟悉的人待在一起，哪怕什么也不做', value: 4 },
      { text: '留一整段不被打扰的个人时间', value: 1 },
      { text: '先独处恢复，再和朋友短暂聊聊', value: 2 },
      { text: '和信任的人吃顿饭，彼此说说近况', value: 3 }
    ] },
    { id: 5, dim: 'structure', text: '开始一个新任务时，你通常更需要：', options: [
      { text: '知道目标就好，过程可以边走边看', value: 1 },
      { text: '有几个关键节点，让进展看得见', value: 3 },
      { text: '明确的步骤、标准和时间安排', value: 4 },
      { text: '先有一个简单起点，其他逐步确定', value: 2 }
    ] },
    { id: 6, dim: 'exploration', text: '来到一个新地方，空闲时你更愿意：', options: [
      { text: '先找到几家喜欢的小店，建立熟悉感', value: 1 },
      { text: '多走几条没走过的街，寻找意外发现', value: 3 },
      { text: '每天换个方向，看看还有哪些可能', value: 4 },
      { text: '以熟悉路线为主，偶尔探索一小段', value: 2 }
    ] },
    { id: 7, dim: 'autonomy', text: '别人给了一个很完善的方案，你最在意：', options: [
      { text: '我能不能按自己的判断调整核心部分', value: 4 },
      { text: '大家是否都理解并认可这份安排', value: 1 },
      { text: '在共同框架里，我有多少可调整空间', value: 2 },
      { text: '关键做法能否由我选择，结果由我负责', value: 3 }
    ] },
    { id: 8, dim: 'connection', text: '如果换到一个全新的生活环境，你更希望先拥有：', options: [
      { text: '一个完全属于自己的安静角落', value: 1 },
      { text: '几个能日常见面、互相照应的人', value: 4 },
      { text: '一两个可以慢慢熟起来的连接', value: 3 },
      { text: '足够的独处时间，再自然认识别人', value: 2 }
    ] },
    { id: 9, dim: 'structure', text: '面对暂时还不确定的下个月，你更接近：', options: [
      { text: '想先确定重要安排，再安心享受当下', value: 4 },
      { text: '确认必要事项，余下愿意留给变化', value: 2 },
      { text: '有个轮廓和备用方案，会比较舒服', value: 3 },
      { text: '保持开放，不急着把每个空格填上', value: 1 }
    ] },
    { id: 10, dim: 'exploration', text: '同样可以获得一段充实时光，你更倾向：', options: [
      { text: '继续在擅长的事情里精进', value: 1 },
      { text: '进入新领域，容许自己重新当新手', value: 4 },
      { text: '选一个与现有经验相邻的新挑战', value: 3 },
      { text: '保留熟悉主线，偶尔加一点新鲜内容', value: 2 }
    ] },
    { id: 11, dim: 'autonomy', text: '一天过得很顺时，你最喜欢哪种感觉：', options: [
      { text: '和身边的人步调一致，事情配合得很好', value: 1 },
      { text: '重要选择主要由自己做主', value: 3 },
      { text: '按自己的节奏安排，不必不断解释', value: 4 },
      { text: '既有共同安排，也保留一点个人选择', value: 2 }
    ] },
    { id: 12, dim: 'connection', text: '理想的一周里，你希望与重要的人：', options: [
      { text: '常常见面或联系，分享细小日常', value: 4 },
      { text: '各自生活，有需要时知道彼此在就好', value: 1 },
      { text: '保留几次固定相处，连接有稳定节奏', value: 3 },
      { text: '不必固定联系，想起对方时自然聊聊', value: 2 }
    ] }
  ],
  profiles: [
    {
      type: 'track', title: '轨道筑梦者',
      vector: { structure: 89, exploration: 33, autonomy: 56, connection: 78 },
      summary: '路线清晰一点，你反而能走得更自在。',
      description: '这次选择里，明确的安排、熟悉的积累和稳定的连接更能支持你。你可能喜欢看见一件事逐步推进，也愿意在可靠的环境里认真投入。轨道对你更像一条能借力的路，不必是一套永远不能改的答案。',
      advice: '保留支持你的规律，也为自己留一个可调整的空格。稳定和变化可以并存，不必为了证明自由而推翻已经喜欢的生活。',
      tagline: '有方向可依，也有自己的步幅。',
      strengths: '你可能偏好明确目标和可见进度，适合用小里程碑积累成就感。熟悉的伙伴、规律和资源，也可能是你安心探索的底座。',
      watchout: '计划变化时，先区分真正的损失和对不确定的不适。一个安排需要重写，不意味着此前的努力失去意义。',
      relationship: '你可能重视稳定回应和可预期的相处。可以直接约定联系节奏，也给彼此偶尔变化的空间。',
      actions: ['写下目前最能支持自己的三个稳定安排。', '给下周计划留半小时，做一件没有绩效目标的小事。', '选一个不影响生活的小变化，看看自己实际是否适应。']
    },
    {
      type: 'wild', title: '旷野漫游者',
      vector: { structure: 22, exploration: 89, autonomy: 78, connection: 44 },
      summary: '有些答案，你想留到路上再遇见。',
      description: '这次选择里，你对新经验、自主选择和开放的过程更有兴趣。你可能需要一点未被安排的空间，让好奇心参与生活。旷野对你更像保有可能性的方式，并不要求你现在离开任何地方。',
      advice: '开放也需要一个安全底座。先留出时间、预算和可撤回的选择，再让好奇心带你多走一点。',
      tagline: '留一点未知，给还会变化的自己。',
      strengths: '你可能更愿意面对新线索和试错，也能容纳暂时没有定论的过程。短周期、低成本的探索，会比一次性押上全部更适合验证偏好。',
      watchout: '选项很多时，留意是否每次遇到困难就换一条路。为一个尝试设定结束点，才能分清不适合和还没来得及适应。',
      relationship: '你可能珍惜个人空间和灵活安排。提前说明计划与可联系的时间，可以让自由与可靠同时存在。',
      actions: ['挑一个低成本的新体验，把它安排在两周内。', '为尝试写下预算、时长和停止条件。', '尝试结束后记录：喜欢的是新鲜感，还是这件事本身？']
    },
    {
      type: 'dual', title: '双栖探索家',
      vector: { structure: 56, exploration: 67, autonomy: 56, connection: 89 },
      summary: '你想看看远方，也想有人一起说说沿途。',
      description: '这次选择里，你既想保留探索空间，也珍惜稳定的连接和适度安排。你可能喜欢“有地方回来”的自由：不必在轨道和旷野之间二选一，而是根据阶段调整两者的比例。',
      advice: '不必每次都同时满足所有期待。先说清这段时间最重要的一项，再和身边的人商量可以调整的部分。',
      tagline: '向外看世界，也为关系留一盏灯。',
      strengths: '你可能愿意在新体验与熟悉支持之间搭桥，也能通过交流校准选择。固定一个稳定支点，再安排一小段探索，有助于减少来回摇摆。',
      watchout: '想兼顾很多方向时，留意有没有把自己的时间排满。兼容不等于全部都要，取舍也可以很温柔。',
      relationship: '你可能更喜欢能分享体验、又不必绑在一起的关系。把“我想一起”和“我想自己试试”分别说清楚，会减少误会。',
      actions: ['把下周安排分成稳定支点和自由留白，各选一项。', '邀请一个重要的人，尝试一件双方都好奇的小事。', '写下一件本周可以暂时不兼顾的事，给自己减一点量。']
    },
    {
      type: 'builder', title: '自由建造师',
      vector: { structure: 78, exploration: 78, autonomy: 100, connection: 33 },
      summary: '你想按自己的判断，把想去的路一点点搭出来。',
      description: '这次选择里，你同时重视自主、新尝试和可执行的结构。你可能不排斥计划，只是更希望计划能服务自己的目标。自由对你更像拥有选择权，并愿意把选择变成实际安排。',
      advice: '自主不必等于独自承担全部。为自己保留决定权，也可以借用信息、协作和可靠支持，把路修得更稳。',
      tagline: '我想要的自由，也由我慢慢搭建。',
      strengths: '你可能喜欢自己定方向，再拆成具体步骤。把想法转成一个能在有限时间内完成的小版本，会帮助你检验它是否值得继续投入。',
      watchout: '想把每个环节都握在手里时，留意精力和信息是否够用。区分必须亲自决定的事与可以协作的事，自主才更可持续。',
      relationship: '你可能需要较明确的个人边界。说明哪些事希望自主决定、哪些事愿意共同商量，会比先硬扛再解释更轻松。',
      actions: ['为一个自己的小目标，写出两周内能完成的最小版本。', '把任务分成自己决定、可请教、可协作三类。', '每完成一步，检查一次精力与投入，允许调整路线。']
    }
  ]
});
