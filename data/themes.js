// 主题是可自由切换的视觉意象，不表示人格优劣或心理诊断。
const THEMES = [
  { id: 'adventurer', name: '柔软的冒险家', english: 'Soft Adventurer', quote: '我带着柔软，去见更大的世界。', description: '把好奇装进背包，让云朵陪你慢慢出发。', color: '#318aff', pale: '#e9f5ff', accent: '#ffd56b', tags: ['好奇', '真诚', '自由'], starter: true, companions: [{ name: '云朵小狗', emoji: '🐶', line: '带上柔软，也带上勇气。' }, { name: '地图精灵', emoji: '☁️', line: '绕一点路，也会遇到新的风景。' }] },
  { id: 'moon', name: '月光守护者', english: 'Moonlight Keeper', quote: '我的温柔，也有照亮自己的力量。', description: '月兔浇着树，星鲸把你的愿望轻轻托起。', color: '#6984eb', pale: '#edf0ff', accent: '#e2d9ff', companions: [{ name: '月兔', emoji: '🐰', line: '今天，也记得照顾自己的感受。' }, { name: '漂浮星鲸', emoji: '🐳', line: '你的光，有自己的时区。' }], tags: ['细腻', '陪伴', '内在坚定'] },
  { id: 'romantic', name: '慢热的浪漫家', english: 'Slow Romantic', quote: '慢一点，也会遇到懂我的风景。', description: '在银杏树下收一封信，把小小的喜欢认真收藏。', color: '#578bd4', pale: '#fff8eb', accent: '#f0ce7b', starter: true, companions: [{ name: '信使猫', emoji: '🐱', line: '心里的话，可以慢慢说。' }, { name: '信笺小鸟', emoji: '🐦', line: '这里有一封，写给你的来信。' }], tags: ['真挚', '细腻', '热爱生活'] },
  { id: 'dreamer', name: '好奇的造梦师', english: 'Curious Dreamer', quote: '我的脑海里，有一座正在长大的宇宙。', description: '把灵感放进梦泡，让小梦龙替你守住想象力。', color: '#8c80e9', pale: '#f3efff', accent: '#ffd782', companions: [{ name: '星梦龙', emoji: '🐉', line: '再奇妙的念头，也值得被听见。' }, { name: '睡帽精灵', emoji: '🌙', line: '休息一下，梦会接着生长。' }], tags: ['创造', '好奇', '灵感'] },
  { id: 'wanderer', name: '自由的漫游者', english: 'Free Wanderer', quote: '我有自己的方向，也允许自己绕路。', description: '风卷小狐展开地图，云栖燕子带来远方的信。', color: '#339eca', pale: '#edf9fb', accent: '#ecd391', companions: [{ name: '风卷小狐', emoji: '🦊', line: '喜欢的方向，就是值得走的方向。' }, { name: '云栖燕子', emoji: '🕊️', line: '出发和停留，都由你决定。' }], tags: ['独立', '开放', '自在'] },
  { id: 'listener', name: '温柔的倾听者', english: 'Gentle Listener', quote: '我接住别人的情绪，也记得抱抱自己。', description: '和海獭听听贝壳里的声音，给心留一处浅海。', color: '#46a7ce', pale: '#edfaff', accent: '#efcdb7', companions: [{ name: '小汐海獭', emoji: '🦦', line: '我在听，也愿意等你慢慢说。' }, { name: '泡泡海豹', emoji: '🦭', line: '不必总是坚强，靠一会儿也好。' }], tags: ['共情', '包容', '温柔有界'] },
  { id: 'collector', name: '闪光的收藏家', english: 'Spark Collector', quote: '原来，我值得被收藏的瞬间有这么多。', description: '让企鹅和星灵替你收好，每一枚成长的叶片。', color: '#657de0', pale: '#f0f3ff', accent: '#e7c479', companions: [{ name: '围巾企鹅', emoji: '🐧', line: '今天的小进步，也替你好好收着。' }, { name: '星星精灵', emoji: '⭐', line: '平凡的一天，也有闪光的地方。' }], tags: ['珍惜', '热爱', '发现美好'] },
  { id: 'observer', name: '安静的观察者', english: 'Quiet Observer', quote: '我慢慢观察，也慢慢长成自己的样子。', description: '树影猫头鹰翻着书，星叶刺猬抱着一片落叶。', color: '#759ab8', pale: '#eff7fb', accent: '#c3d8b8', companions: [{ name: '树影猫头鹰', emoji: '🦉', line: '慢慢看，也是在认真生活。' }, { name: '星叶刺猬', emoji: '🦔', line: '安静的生长，也会被看见。' }], tags: ['洞察', '专注', '自洽'] },
  { id: 'aurora', name: '极光水镜', english: 'Aura Glass', quote: '在更了解自己的那一刻，我遇见了极光。', description: '玻璃叶精灵与极光鹿，在水镜里迎接新的你。', color: '#6bade8', pale: '#edfaff', accent: '#e4cc8c', hidden: true, requiredTests: 5, companions: [{ name: '极光小鹿', emoji: '🦌', line: '每一步了解，都会留下新的光。' }, { name: '银杏精灵', emoji: '🍃', line: '我收藏着你一路生长的折射。' }], tags: ['独特', '细腻', '持续探索'] }
];

// Public cloud atlas: three columns, six rows; pairs follow the theme order.
THEMES.forEach((theme, themeIndex) => {
  theme.companions = theme.companions.map((companion, index) => Object.assign({}, companion, {
    spriteColumn: (themeIndex * 2 + index) % 3,
    spriteRow: Math.floor((themeIndex * 2 + index) / 3)
  }));
});
function getTheme(id) { return THEMES.find(theme => theme.id === id) || null; }
module.exports = { THEMES, getTheme };
