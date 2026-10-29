const MBTI_DIMENSIONS = [
  { id: 'EI', left: '内向 I', right: '外向 E' },
  { id: 'SN', left: '直觉 N', right: '实感 S' },
  { id: 'TF', left: '情感 F', right: '思考 T' },
  { id: 'JP', left: '感知 P', right: '判断 J' }
];

const BIG_FIVE_LABELS = {
  openness: ['开放性', '偏好熟悉', '探索新知'],
  conscientiousness: ['尽责性', '灵活随性', '计划推进'],
  extraversion: ['外向性', '独处充电', '互动充电'],
  agreeableness: ['宜人性', '独立直接', '合作体谅'],
  neuroticism: ['情绪敏感性', '情绪平稳', '感受敏锐']
};

const BIG_FIVE_GUIDANCE = {
  openness: {
    low: ['偏好熟悉', '你可能更愿意从已有经验出发，在稳定做法中积累可靠性。', '遇到陌生方案时，留意是否在了解之前就把它排除。', '选一件熟悉的小事，只改变其中一个步骤，观察实际感受。'],
    high: ['探索新知', '你可能更容易被新想法吸引，适合在探索和联想中寻找可能性。', '新鲜感增加时，留意是否忽略了验证细节和完成收尾。', '为一个新想法安排十分钟小实验，先验证再扩大投入。']
  },
  conscientiousness: {
    low: ['灵活随性', '你可能更能容纳临时调整，在开放的节奏中找到自己的做法。', '任务需要持续推进时，留意是否缺少可见的下一步。', '为一件正在拖延的小事写下唯一的下一步，并安排开始时间。'],
    high: ['计划推进', '你可能更习惯用计划和承诺组织行动，在明确目标下持续推进。', '计划被打断时，留意是否对自己或他人提出过紧的要求。', '给今天的计划留一段缓冲时间，允许根据新信息调整。']
  },
  extraversion: {
    low: ['独处充电', '你可能更习惯在安静空间里恢复精力，适合给思考留出连续时间。', '需要合作时，留意是否让别人只能猜测你的想法。', '重要讨论前写下一个观点，选择适合自己的方式表达。'],
    high: ['互动充电', '你可能更容易通过互动激发想法，在交流与协作中获得动力。', '互动密集时，留意是否挤掉了自己的恢复时间或别人的表达空间。', '下一次讨论中先听完对方，再留十分钟独处整理想法。']
  },
  agreeableness: {
    low: ['独立直接', '你可能更愿意明确表达立场，在需要辨别分歧时保持独立判断。', '表达不同意见时，留意语气是否掩盖了你真正想解决的问题。', '提出一个不同意见时，先复述对方关心的事，再说明自己的依据。'],
    high: ['合作体谅', '你可能较容易照顾不同感受，在协作中寻找共同点。', '维护关系时，留意是否把自己的需要一再放到最后。', '在一个低风险场景里，明确说出自己的偏好或可接受的边界。']
  },
  neuroticism: {
    low: ['情绪平稳', '你在这次自评中呈现较平稳的情绪体验，可能更容易在压力情境里保持节奏。', '感受较平稳并不等于没有压力，仍值得留意身体信号和他人的感受。', '给今天的身体状态和情绪各写一个词，检查是否有被忽略的需要。'],
    high: ['感受敏锐', '你在这次自评中更容易注意到情绪和压力信号，这些线索可以帮助你及早安排支持。', '感受强烈时，留意是否把预想的风险当成了已经发生的事实。', '把一次担忧分成已知事实、自己的解释和眼下可做的一步。']
  }
};

const ENNEAGRAM_COPY = {
  '1': ['原则与改进', '认真、负责，善于发现可以完善之处。', '标准过高时，容易把“还可以更好”变成持续的自我压力。', '每周刻意保留一件“做到够好就停下”的小事。'],
  '2': ['连接与被需要', '能感知他人的需要，也愿意主动提供支持。', '忙着照顾别人时，自己的需求可能被放到最后。', '帮助别人之前，先问自己：我现在还有多少余量？'],
  '3': ['目标与成就', '善于调动资源、推进目标并适应不同场合。', '过度追求成果时，可能忽略真实感受和休息。', '给一个目标补上过程指标，而不只看最终结果。'],
  '4': ['独特与真实', '情感细腻，重视真实体验与个人表达。', '情绪强烈时，容易放大缺失感或与他人比较。', '把一种感受写成事实、解释、需要三句话。'],
  '5': ['理解与边界', '观察深入，善于独立思考并积累知识。', '准备太久时，可能把行动推迟到“完全弄懂以后”。', '选一件事，用最小可行版本先行动十分钟。'],
  '6': ['安全与责任', '能预见风险，重视承诺与可靠关系。', '不确定性增加时，可能反复验证或预想最坏结果。', '把担忧分为可行动、待观察、无法控制三类。'],
  '7': ['可能与体验', '乐于探索新机会，能为环境带来活力。', '选项过多时，可能避开不舒服的感受或难以收尾。', '本周只选一个最重要的新想法完成闭环。'],
  '8': ['力量与保护', '敢于行动、表达立场，也愿意保护重要的人。', '推进过快时，强度可能让他人来不及表达。', '重要对话中先问一个问题，再给自己的结论。'],
  '9': ['和谐与接纳', '能看见不同立场，常为关系提供稳定空间。', '避免冲突时，自己的优先级可能变得模糊。', '每天明确说出一个小偏好，从低风险表达开始。']
};

const SBTI_GROUPS = [
  ['自我感受', ['S1', 'S2', 'S3']],
  ['关系安全', ['E1', 'E2', 'E3']],
  ['信念取向', ['A1', 'A2', 'A3']],
  ['行动方式', ['Ac1', 'Ac2', 'Ac3']],
  ['社交距离', ['So1', 'So2', 'So3']]
];

function clamp(value) { return Math.max(0, Math.min(100, Math.round(value))); }

function dimension(id, label, left, right, percent, detail) {
  const normalized = clamp(percent);
  return { id, label, left, right, percent: normalized, scoreText: `${normalized}%`, detail };
}

function mbtiDimensions(test, record) {
  return MBTI_DIMENSIONS.map(item => {
    const count = test.scoring.mapping.filter(mapping => mapping.dim === item.id).length;
    const score = Number(record.scores[item.id]) || 0;
    const percent = count ? (score / count + 1) * 50 : 50;
    const preference = percent >= 50 ? item.right : item.left;
    const strength = Math.abs(percent - 50) < 15 ? '偏好较均衡，可能随情境切换。' : `本次更靠近${preference}。`;
    return dimension(item.id, `${item.left.slice(-1)} / ${item.right.slice(-1)}`, item.left, item.right, percent, strength);
  });
}

function bigFiveDimensions(test, record) {
  return test.scoring.dimensions.map(id => {
    const count = test.scoring.mapping.filter(mapping => mapping.dim === id).length;
    const mean = count ? record.scores[id] / count : 3;
    const labels = BIG_FIVE_LABELS[id];
    const percent = (mean - 1) / 4 * 100;
    const level = mean > 3.4 ? '相对突出' : mean < 2.6 ? '相对收敛' : '处于中间区间';
    return dimension(id, labels[0], labels[1], labels[2], percent, `本次均分 ${mean.toFixed(2)} / 5，${level}。`);
  });
}

function enneagramDimensions(record) {
  const values = Object.keys(ENNEAGRAM_COPY).map(id => Number(record.scores[id]) || 0);
  const maximum = Math.max.apply(null, values.concat([1]));
  return Object.keys(ENNEAGRAM_COPY).map(id => dimension(
    id, `${id} 型`, '较少体现', '较多体现', (Number(record.scores[id]) || 0) / maximum * 100,
    `本次选择中有 ${Number(record.scores[id]) || 0} 次体现该类型动机。`
  ));
}

function sbtiDimensions(record) {
  return SBTI_GROUPS.map(([label, ids], index) => {
    const raw = ids.reduce((sum, id) => sum + (Number(record.scores[id]) || 0), 0);
    const percent = (raw - 6) / 12 * 100;
    return dimension(`sbti-${index}`, label, '低调表达', '鲜明表达', percent,
      '由三个趣味子维度合并呈现，仅用于理解本次作答风格。');
  });
}

function ieDimensions(record) {
  const percent = (Number(record.scores.EI) || 0) / 15 * 100;
  return [dimension('EI', '能量方向', '独处充电 I', '互动充电 E', percent,
    Math.abs(percent - 50) < 15 ? '你的能量方式较均衡，情境影响可能更明显。' : '你在本次作答中呈现了较清晰的能量偏好。')];
}

function shadowDimensions(record) {
  const raw = Number(record.scores.shadow) || 20;
  return [dimension('shadow', '应对表达倾向', '更多内收', '更多外显', (raw - 20) / 20 * 100,
    `本次原始分为 ${raw} / 40。它描述答题选择，不代表“阴影”好坏或临床程度。`)];
}

function strongest(dimensions) {
  return dimensions.slice().sort((a, b) => Math.abs(b.percent - 50) - Math.abs(a.percent - 50))[0];
}

function buildMbti(test, record, base, dimensions) {
  const type = record.resultType;
  const energy = type[0] === 'E' ? '通过互动整理想法' : '先在内部形成想法，再选择合适的方式表达';
  const information = type[1] === 'N' ? '容易先看到关联、趋势与可能性' : '更信赖具体信息、经验和可验证的细节';
  const decision = type[2] === 'F' ? '做决定时会把价值与人的感受纳入考虑' : '做决定时偏好逻辑、标准和一致性';
  const pace = type[3] === 'P' ? '保留选择空间，在变化中调整' : '建立结构与计划，倾向先把事情确定下来';
  return {
    tagline: `${type} 的四维偏好，不止一个类型标签。`, dimensions,
    sections: [
      { title: '核心模式', content: `${base.description}${energy}，${information}。` },
      { title: '优势如何发挥', content: `你的组合优势常出现在：${decision}，同时${pace}。把这种偏好放到合适场景，会比追求“像某一类型”更有价值。` },
      { title: '可能的盲区', content: `${base.advice} 维度越接近中间，越说明你可能根据情境切换；维度越靠两端，越需要主动借用另一端的视角。` },
      { title: '关系中的你', content: `${energy}；在重要关系里，先说明自己的沟通节奏和做决定的依据，能减少“对方应该懂”的误会。` }
    ],
    actions: ['遇到重要决定时，写下事实、可能性、逻辑与感受各一条。', '观察一周：什么环境最让你恢复精力？', '选一个最强偏好的相反动作，做一次低风险尝试。']
  };
}

function buildEnneagram(record, base, dimensions) {
  const copy = ENNEAGRAM_COPY[record.resultType] || ENNEAGRAM_COPY['9'];
  const ranked = dimensions.slice().sort((a, b) => b.percent - a.percent).slice(0, 3).map(item => item.label).join('、');
  return {
    tagline: `从主要动机出发，看见行为背后的“为什么”。`, dimensions,
    sections: [
      { title: '核心动机', content: `${copy[0]}：${base.description}` },
      { title: '自然优势', content: copy[1] },
      { title: '压力下的提醒', content: copy[2] },
      { title: '相邻倾向', content: `本次得分较突出的三个方向是 ${ranked}。九型更适合用来观察动机，不宜只凭最高分给自己定型。` }
    ],
    actions: [copy[3], '记录一次强烈反应：发生了什么、我在保护什么？', '下次复测时，对比最高三项的顺序是否发生变化。']
  };
}

function buildBigFive(base, dimensions) {
  // The middle band is a presentation rule for these self-ratings, not a norm or
  // diagnostic threshold. A balanced profile must not acquire an arbitrary leader.
  const directions = dimensions.map(item => ({
    dimension: item,
    distance: Math.abs(item.percent - 50),
    side: item.percent > 60 ? 'high' : item.percent < 40 ? 'low' : 'middle'
  }));
  const salient = directions.filter(item => item.side !== 'middle');
  const maxDistance = Math.max.apply(null, salient.map(item => item.distance).concat([0]));
  const leaders = salient.filter(item => item.distance === maxDistance);
  const guidance = leaders.map(item => ({
    label: item.dimension.label,
    copy: BIG_FIVE_GUIDANCE[item.dimension.id][item.side]
  }));
  const exactMiddle = directions.every(item => item.distance === 0);
  const main = !leaders.length
    ? exactMiddle
      ? '本次五个维度都位于量表中点，没有明显偏向某一端。可以结合具体场景，继续观察自己的选择。'
      : '本次五个维度都接近量表中间区间，没有明显偏离中点的主导维度。细小差异不需要被放大成固定标签。'
    : `本次偏离量表中点${leaders.length > 1 ? '同样明显、并列呈现' : '最明显'}的方向是：${guidance.map(item => `${item.label}更靠近「${item.copy[0]}」`).join('；')}。这些是本次自评倾向，没有高低优劣之分。`;
  const strength = guidance.length
    ? guidance.map(item => `${item.label}：${item.copy[1]}`).join(' ')
    : '中间位置没有指向一种固定优势。试着观察自己在哪些场景偏好稳定，在哪些场景愿意探索，再选择适合当时任务的做法。';
  const caution = guidance.length
    ? guidance.map(item => `${item.label}：${item.copy[2]}`).join(' ')
    : '不要为了得到更鲜明的画像而刻意选择极端答案。保持真实作答，比追求高分或低分更有参考价值。';
  const energy = directions.find(item => item.dimension.id === 'extraversion');
  const cooperation = directions.find(item => item.dimension.id === 'agreeableness');
  const energyCopy = energy.side === 'low'
    ? '你更靠近独处充电，可以提前说明自己需要安静思考的时间。'
    : energy.side === 'high'
      ? '你更靠近互动充电，可以主动安排交流，同时给对方留出回答空间。'
      : '你的能量偏好接近中间，可以直接商量当下更需要交流还是独处。';
  const cooperationCopy = cooperation.side === 'low'
    ? '表达分歧时，把判断依据和对方的感受一起说清楚。'
    : cooperation.side === 'high'
      ? '照顾他人时，也明确表达自己的需要和边界。'
      : '遇到分歧时，先说明双方各自在意什么，再决定如何协作。';
  return {
    tagline: '五个连续维度，呈现比单一标签更完整的你。', dimensions,
    sections: [
      { title: '画像主线', content: main },
      { title: '优势如何发挥', content: strength },
      { title: '平衡与盲区', content: caution },
      { title: '关系中的你', content: `${energyCopy}${cooperationCopy}` },
      { title: '复测怎么看', content: '优先比较同一维度的变化，并结合近期工作、关系与压力情境理解，不把一次波动当成人格彻底改变。' }
    ],
    actions: [
      guidance.length === 1 ? guidance[0].copy[3]
        : guidance.length > 1
          ? `从${guidance.map(item => item.label).join('、')}这些并列方向中任选一项，记录它最近出现的一次具体场景。`
          : '记录同一周里两次不同情境的选择，看看自己如何随场景调整。',
      guidance.length ? '选一个上述提醒对应的小场景，尝试一次新的应对方式，再记录感受。'
        : '下次作答时依据最近的具体经历选择，不必为了更鲜明的结果改变答案。',
      '30 天后在相似状态下复测，观察同一维度的变化，而非追求高分。'
    ]
  };
}

function buildSimple(test, record, base, dimensions) {
  const lead = strongest(dimensions);
  const playful = test.id === 'sbti';
  const shadow = test.id === 'shadow';
  return {
    tagline: playful ? '把趣味标签拆开，看见构成它的五组作答风格。' :
      shadow ? '观察你面对情绪、压力和冲突时的回答方式。' : '从能量来源出发，理解你的社交与独处节奏。',
    dimensions,
    sections: [
      { title: '本次主线', content: `${base.description} 在当前维度中，“${lead.label}”离中点相对更远。` },
      { title: '可以保留的优势', content: playful ? '趣味结果的价值在于提供谈论自己的入口，而不是定义真实能力。' : '知道自己的自然倾向，可以更早安排恢复方式与沟通边界。' },
      { title: '需要留意的时刻', content: shadow ? '这些选择不等于心理问题。如果某种情绪持续影响生活，优先寻求可信赖的人或专业支持。' : base.advice },
      { title: '关系中的应用', content: '把需要说成具体请求，例如“我想先安静半小时，再继续聊”，通常比让对方猜测更有效。' }
    ],
    actions: ['记录一个最有共鸣的维度，以及它出现的具体场景。', '尝试一次与惯常偏好相反的小行动。', '复测时先回看这次记录，再比较变化。']
  };
}

function buildDeepReport(test, record, base) {
  if (!test || !record || !base || record.scoringVersion !== '2') return null;
  let dimensions;
  if (test.id === 'mbti') dimensions = mbtiDimensions(test, record);
  else if (test.id === 'bigfive') dimensions = bigFiveDimensions(test, record);
  else if (test.id === 'enneagram') dimensions = enneagramDimensions(record);
  else if (test.id === 'sbti') dimensions = sbtiDimensions(record);
  else if (test.id === 'ie') dimensions = ieDimensions(record);
  else if (test.id === 'shadow') dimensions = shadowDimensions(record);
  else return null;

  let report;
  if (test.id === 'mbti') report = buildMbti(test, record, base, dimensions);
  else if (test.id === 'enneagram') report = buildEnneagram(record, base, dimensions);
  else if (test.id === 'bigfive') report = buildBigFive(base, dimensions);
  else report = buildSimple(test, record, base, dimensions);
  return Object.assign(report, {
    title: 'VIP 深度报告',
    note: '深度解读依据本次自评生成，用于自我探索，不构成心理诊断或能力评价。'
  });
}

function basicDimensions(result) {
  if (!result || !Array.isArray(result.dimensions)) return [];
  return result.dimensions.slice().sort((a, b) =>
    Math.abs(Number(b.percent) - 50) - Math.abs(Number(a.percent) - 50)
  ).slice(0, 2);
}

module.exports = { buildDeepReport, basicDimensions };
