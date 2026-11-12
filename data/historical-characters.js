// Original cultural archetypes and display details. This module does not load
// questionnaires, fetch assets, or claim to measure historical personalities.
const ADDITIONAL_PROFILES = [
  {
    type: 'wuzetian', title: '武则天式·自主开路者',
    vector: { expression: 89, curiosity: 44, resolve: 100, empathy: 22 },
    summary: '你想走的路，愿意先为自己迈出一步。',
    description: '这次选择里，你较愿意明确表达立场，并通过行动确认自己的方向。你与“武则天式”的文化意象相遇：看重的是为选择负责的主动感，而不是必须掌控一切，或把日子过成一场竞争。',
    advice: '自主也可以包含求助与改主意。为一个重要选择写下自己的需要、现实边界和可撤回的一步，比逼自己永远果断更有帮助。',
    tagline: '我的方向，可以由我认真决定。',
    strengths: '你可能较容易从犹豫里找出可以推进的部分，也愿意把自己的偏好讲清楚。把这种主动感用在一个具体而可控的小选择上，会更容易看见实际反馈。',
    watchout: '想尽快推进时，留意是否把“自己来”变成了唯一选项。听取意见和调整计划，不会让你的选择失去主体性。',
    relationship: '你可能更喜欢清楚、直接的沟通。重要对话里，先说明自己的需要，再问对方在意什么，能让自主和相互尊重同时存在。',
    actions: ['挑一件一直交给别人决定的小事，认真说出自己的偏好。', '为一个想推进的选择写下时间、资源和可调整的边界。', '向一个信任的人请教，再自己决定哪些建议适合当下。']
  },
  {
    type: 'banzhao', title: '班昭式·沉静求知者',
    vector: { expression: 22, curiosity: 78, resolve: 67, empathy: 89 },
    summary: '你愿意把问题读深，也把理解慢慢递给别人。',
    description: '这次选择里，你较愿意安静了解一个问题，也关注知识能怎样帮助彼此理解。你与“班昭式”的文化意象相遇：借用的是整理、学习与传递的耐心，不要求你接受任何古代的生活规范。',
    advice: '学习不需要等到完全掌握才有意义。试着把一件刚弄明白的事，用自己的话解释清楚，同时保留“这部分我还不确定”。',
    tagline: '慢慢读懂，也慢慢把世界讲清楚。',
    strengths: '你可能较愿意梳理线索、补充背景，再形成自己的理解。把复杂内容整理成一份清楚的小笔记，也是在为自己和别人搭一座桥。',
    watchout: '整理得很认真时，留意是否一直在为别人准备答案，却没有留意自己真正好奇什么。允许笔记不完整，也允许把时间留给自己的问题。',
    relationship: '你可能习惯通过认真倾听和提供信息表达在乎。先问对方需要陪伴还是建议，再分享自己的理解，会让用心更容易被接住。',
    actions: ['选一个真正好奇的问题，读两种不同来源并记下分歧。', '把新学到的一点内容，用三句话说给愿意听的人。', '为自己的问题留一页笔记，不急着写成可以交付的答案。']
  },
  {
    type: 'xiedaoyun', title: '谢道韫式·灵动对话家',
    vector: { expression: 89, curiosity: 56, resolve: 44, empathy: 56 },
    summary: '一个平常的话题，你也想添上自己的新角度。',
    description: '这次选择里，你较愿意把感受和想法说出来，也会给回应留一点思考空间。你与“谢道韫式”的文化意象相遇：是一份从容参与对话、提出独特联想的兴趣，不是要求自己随时机敏或妙语连珠。',
    advice: '一句真实的话，比每次都说得漂亮更重要。碰到在意的话题，先表达一个具体观察，再让对话自然继续。',
    tagline: '我有自己的比喻，也有不急着说完的话。',
    strengths: '你可能喜欢在交流里交换视角，也愿意把一个体验换成更鲜活的说法。用一个具体例子说明观点，往往能让新的角度更容易被理解。',
    watchout: '享受表达时，留意是否把“回应得好”变成了压力。允许停顿、询问和暂时没有答案，交流不需要一直由你带来亮点。',
    relationship: '你可能珍惜能彼此启发的相处。既可以分享自己的联想，也问一句“你当时是什么感觉”，让不同的表达方式都能留在对话里。',
    actions: ['把一件日常小事，用自己的比喻写成一句话。', '下一次聊天中提出一个真正好奇的问题，听完再回应。', '在一个安全的交流场景里，说出还没完全想好的看法。']
  },
  {
    type: 'wangwei', title: '王维式·山水留白家',
    vector: { expression: 11, curiosity: 44, resolve: 22, empathy: 44 },
    summary: '你想给生活留一点安静，听见自己真正需要什么。',
    description: '这次选择里，你更愿意安静感受、慢一点确认自己的节奏。你与“王维式”的文化意象相遇：借山水与留白表达对空间感的珍惜，不等于远离关系，也不要求你时时平静。',
    advice: '安静可以是恢复的方式，也可以和一个小小的行动并存。休息之后，选一件不费力的事开始，让留白成为能继续生活的余地。',
    tagline: '把一点留白，还给自己的日常。',
    strengths: '你可能较愿意留意环境中的声音、光线和细微变化，也知道连续安静的时间对自己很珍贵。把这种需要落实到日常安排，会比等到很累时再休息更舒服。',
    watchout: '需要空间时，留意是否让重要的人只能猜测你的状态。休息没有问题，给出一个简单说明和可回应的时间，会让自己更安心。',
    relationship: '你可能喜欢不必一直说话也自在的陪伴。可以直接告诉对方什么样的安静让你舒服，也问问对方怎样会更有连接感。',
    actions: ['留十分钟不刷手机，听听身边的声音或看看窗外。', '把一段想保留的独处时间，提前说明给重要的人。', '休息后完成一个很小的动作，给今天留一个轻轻的开始。']
  },
  {
    type: 'shenkuo', title: '沈括式·好奇观察家',
    vector: { expression: 33, curiosity: 100, resolve: 56, empathy: 11 },
    summary: '一个不起眼的“为什么”，也值得你认真看一眼。',
    description: '这次选择里，你对陌生线索较有兴趣，也倾向先观察、找依据，再形成判断。你与“沈括式”的文化意象相遇：是一种愿意追问和记录的习惯，不等于学术能力或智力高低。',
    advice: '好奇可以先落在一个很小的问题上。把观察到的事实、自己的猜想和验证办法分开写，允许结果与最初预想不同。',
    tagline: '世界的小细节，都可以有一个为什么。',
    strengths: '你可能喜欢比较线索、寻找联系，也愿意为一个问题多看一点资料。把发现整理成可回看的记录，有助于让好奇变成持续的理解。',
    watchout: '不断补充信息时，留意是否把每个新问题都变成了必须弄懂的任务。为一次追问设一个时间边界，也允许有些答案暂时空着。',
    relationship: '你可能习惯用分析问题表达关心。涉及感受的对话里，先确认对方是否想一起找原因，给感受本身留一点被理解的空间。',
    actions: ['从今天的日常里选一个小问题，记下事实和自己的猜想。', '用一个低成本、可撤回的办法验证其中一点。', '把一次发现和一个仍然不确定的地方一起记录下来。']
  },
  {
    type: 'xinqiji', title: '辛弃疾式·热忱行动家',
    vector: { expression: 89, curiosity: 33, resolve: 89, empathy: 78 },
    summary: '真正放在心上的事，你愿意用行动认真回应。',
    description: '这次选择里，你较愿意表达在乎、守住认可的方向，也倾向通过行动回应重要的人和事。你与“辛弃疾式”的文化意象相遇：借用的是热忱与投入，不要求你永远坚强或承担超出余量的责任。',
    advice: '热忱可以有边界，认真也可以有休息。先确认今天能做多少，再完成一个承诺，让持续投入比一时用尽力气更重要。',
    tagline: '把在乎的事，认真放进今天。',
    strengths: '你可能较容易被明确的在乎推动，也愿意为熟悉的方向持续付出。把大目标拆成眼前的一小段，可以让投入变得更可持续。',
    watchout: '很想保护重要的人和事时，留意是否把所有责任都接到自己身上。先商量分工，再决定自己的部分，同样是可靠的回应。',
    relationship: '你可能更愿意直接表达关切，也重视言行一致。重要关系里，问清对方需要怎样的支持，会比替对方决定更能让彼此靠近。',
    actions: ['写下一件真正放在心上的事，以及今天能做的一小步。', '为一项投入安排结束和休息时间，让认真留有余量。', '和重要的人商量一次分工，明确哪些事可以一起承担。']
  }
];

const CHARACTER_DETAILS = {
  liqingzhao: {
    id: 'liqingzhao', name: '李清照', era: '宋代文化意象', female: true, motif: '🌸', role: '词人', shortTitle: '细腻收藏家',
    scene: '海棠窗边的小书案，花瓣落在半展的词笺上', token: '海棠与词笺',
    pose: '侧坐书案，轻拈一片花瓣，带着专注而轻松的神情', attire: '藕粉与浅青宋风衣裙，简洁发髻',
    accent: '#bc8195', pale: '#fff0f3', keywords: ['细腻', '表达', '珍藏']
  },
  sushi: {
    id: 'sushi', name: '苏轼', era: '宋代文化意象', female: false, motif: '🍵', role: '诗人', shortTitle: '旷达生活家',
    scene: '江边清风的小茶席，远处有一叶小舟与柔和月色', token: '竹杖与茶盏',
    pose: '坐在石凳上轻举茶盏，肩边停着一只小鸟，笑意自然', attire: '浅蓝灰长袍与朴素巾帽',
    accent: '#719cbb', pale: '#eaf5fc', keywords: ['旷达', '连接', '生活']
  },
  wangyangming: {
    id: 'wangyangming', name: '王阳明', era: '明代文化意象', female: false, motif: '📜', role: '思想者', shortTitle: '笃行思考家',
    scene: '竹林边的青石小径，案上一本打开的书正被微风翻页', token: '书卷与行路石',
    pose: '持卷站在小径起点，一手轻扶衣袖，目光平和坚定', attire: '青绿长衫与深色方巾',
    accent: '#739c8b', pale: '#edf7f0', keywords: ['笃行', '思考', '验证']
  },
  libai: {
    id: 'libai', name: '李白', era: '唐代文化意象', female: false, motif: '🖌', role: '诗人', shortTitle: '自由表达家',
    scene: '云边月下的花间小亭，轻盈的纸页像风一样舒展', token: '明月与长笔',
    pose: '衣袖随风轻扬，持笔向空白纸页落下一笔，神情舒展', attire: '月白长袍，浅蓝披帛与简洁束发',
    accent: '#839fd0', pale: '#eff3ff', keywords: ['自由', '鲜明', '灵感']
  },
  xuxiake: {
    id: 'xuxiake', name: '徐霞客', era: '明代文化意象', female: false, motif: '🧭', role: '行旅者', shortTitle: '远方探索家',
    scene: '浅蓝山峦间的石桥与溪流，脚边铺着一张小小的手绘地图', token: '行囊与地图',
    pose: '背着小行囊，站在石桥边翻看地图，眼神充满好奇', attire: '浅棕旅行长衫，蓝绿腰带与轻便竹帽',
    accent: '#70a3a6', pale: '#eaf8f6', keywords: ['探索', '亲历', '远方']
  },
  taoyuanming: {
    id: 'taoyuanming', name: '陶渊明', era: '东晋文化意象', female: false, motif: '🌼', role: '诗人', shortTitle: '自洽栖居者',
    scene: '篱边的白菊与一小片菜园，远山和木屋安静相望', token: '菊花与竹篮',
    pose: '抱着几枝白菊坐在木阶上，小猫倚在身旁，姿态自在', attire: '米白麻衣与浅褐披衫，朴素束发',
    accent: '#9aa578', pale: '#f5f8e9', keywords: ['自洽', '安定', '深耕']
  },
  wuzetian: {
    id: 'wuzetian', name: '武则天', era: '唐代文化意象', female: true, motif: '🌺', role: '开路者', shortTitle: '自主开路者',
    scene: '晨光中的高窗与牡丹书案，展开的纸页留着清楚的一条路线', token: '牡丹与玉笔',
    pose: '站在案边轻握玉笔，一手展开纸页，目光从容而有主见', attire: '杏金与浅绛唐风宽袖衣裙，精简金色花钗',
    accent: '#ba9270', pale: '#fff5e8', keywords: ['自主', '立场', '开路']
  },
  banzhao: {
    id: 'banzhao', name: '班昭', era: '东汉文化意象', female: true, motif: '📚', role: '学者', shortTitle: '沉静求知者',
    scene: '温暖书阁里的矮案和整齐书卷，窗外一枝新竹探进来', token: '竹简与书签',
    pose: '端坐案前整理书简，手边留着小小批注，神情专注温和', attire: '烟蓝与米白交领长衣，朴素高髻',
    accent: '#8094af', pale: '#f0f4fb', keywords: ['求知', '整理', '传递']
  },
  xiedaoyun: {
    id: 'xiedaoyun', name: '谢道韫', era: '东晋文化意象', female: true, motif: '❄', role: '诗人', shortTitle: '灵动对话家',
    scene: '飘着细雪的庭前雅席，一枝柳条与几片纸笺轻轻相映', token: '雪花与柳枝',
    pose: '倚着小几微微侧身，手持柳枝指向窗外，像在分享一个新比喻', attire: '浅紫与月白宽袖衣裙，轻巧玉簪',
    accent: '#9a8fbb', pale: '#f4f0ff', keywords: ['灵动', '对话', '联想']
  },
  wangwei: {
    id: 'wangwei', name: '王维', era: '唐代文化意象', female: false, motif: '🎶', role: '诗人', shortTitle: '山水留白家',
    scene: '松影下的小溪与空亭，案上铺着一张只落了几笔的山水纸', token: '山水画与古琴',
    pose: '坐在竹席上轻按琴弦，侧耳听溪流，神情安静松弛', attire: '浅青灰长袍与白色内衫，简洁束发',
    accent: '#7d9f9a', pale: '#edf7f5', keywords: ['留白', '感受', '空间']
  },
  shenkuo: {
    id: 'shenkuo', name: '沈括', era: '宋代文化意象', female: false, motif: '🔍', role: '观察者', shortTitle: '好奇观察家',
    scene: '摆着小石头、叶片和观察笔记的窗边木桌，桌旁有一只小小指南针', token: '观察册与指南针',
    pose: '俯身观察一片叶子，在小册子上记下一笔，神情认真而好奇', attire: '浅褐与湖蓝长衫，朴素巾帽',
    accent: '#8a9fb0', pale: '#edf5fb', keywords: ['追问', '线索', '观察']
  },
  xinqiji: {
    id: 'xinqiji', name: '辛弃疾', era: '宋代文化意象', female: false, motif: '🏮', role: '词人', shortTitle: '热忱行动家',
    scene: '暖阳中的小书亭，桌上词稿与一盏热茶相伴，窗外远山清朗', token: '词稿与青灯',
    pose: '一手收好词稿，一手轻扶栏杆，目光热忱，姿态稳稳向前', attire: '青蓝长袍与暖褐外衫，简洁束发',
    accent: '#819bb8', pale: '#eef4fc', keywords: ['热忱', '投入', '回应']
  }
};

module.exports = { ADDITIONAL_PROFILES, CHARACTER_DETAILS };
