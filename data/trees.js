// 树形是测评结果的视觉意象，不表示人格优劣，也不构成心理诊断。
// 新树种只需扩展此目录和对应资源；现有用户的 seed 与历史快照保持不变。
const SPECIES = [
  { id: 'ginkgo', name: '银杏', meaning: '沉思 · 积累', message: '你像一棵慢慢舒展的银杏，习惯先观察，再形成自己的判断。成长，也可以藏在一次次认真选择里。' },
  { id: 'banyan', name: '榕树', meaning: '连接 · 包容', message: '你像一棵舒展树荫的榕树，在与他人的连接中发现力量。关心别人时，也为自己的感受留一处空间。' },
  { id: 'pine', name: '松树', meaning: '坚定 · 专注', message: '你像一棵向光生长的松树，珍惜方向与秩序，愿意把想法一步步变成行动。偶尔放慢，也是一种生长。' },
  { id: 'maple', name: '枫树', meaning: '好奇 · 表达', message: '你像一棵色彩丰富的枫树，愿意探索不同的可能，也有自己的表达。每一片新叶，都可以是一种新的尝试。' },
  { id: 'willow', name: '柳树', meaning: '细腻 · 感受', message: '你像一棵迎风舒展的柳树，留意内心的细微感受，也愿意理解不同的处境。柔软与自己的边界，可以同时存在。' },
  { id: 'olive', name: '橄榄树', meaning: '平衡 · 协作', message: '你像一棵安静生长的橄榄树，愿意看见不同的立场，在关系与自己之间寻找合适的位置。平衡不必一次完成。' }
];

const STAGES = [
  { id: 'seed', name: '待萌芽', threshold: 0, meaning: '一颗属于你的探索种子' },
  { id: 'sprout', name: '初芽', threshold: 1, meaning: '好奇开始发芽' },
  { id: 'rooted', name: '扎根', threshold: 3, meaning: '慢慢认识自己' },
  { id: 'growing', name: '舒展', threshold: 5, meaning: '看见更多可能' },
  { id: 'flourishing', name: '繁茂', threshold: 10, meaning: '容纳不同的自己' },
  { id: 'blossom', name: '花冠', threshold: 20, meaning: '让独特自然盛开' },
  { id: 'starlight', name: '星辉', threshold: 35, meaning: '珍藏一路的成长' }
];

module.exports = { SPECIES, STAGES };
