#!/usr/bin/env node
/* Layout-only bridge for native WXML/WXSS. It does not emulate WeChat, ads,
 * permissions or cloud deployment. All fixture records stay in an isolated Map;
 * artwork is injected only into these preview documents, never production config.
 * Dependencies are installed OUTSIDE the mini-program:
 * npm install --prefix /tmp/treehub-ui-tools miniprogram-compiler@0.2.3 playwright-core
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const toolsRoot = path.resolve(flag('--tools', '/tmp/treehub-ui-tools'));
const out = path.resolve(flag('--out', path.join(root, '..', 'treehub-review', 'fidelity', 'after')));
const artRoot = path.resolve(flag('--art-root', path.join(root, '..', 'treehub-cloud-assets', 'themes', 'v1')));
const widths = flag('--widths', '360,390,430').split(',').map(Number).filter(value => value >= 320 && value <= 1024);
const selected = flag('--screens', '').split(',').filter(Boolean);
const compiler = require(path.join(toolsRoot, 'node_modules', 'miniprogram-compiler'));
const chromiumPath = flag('--chrome', '/usr/bin/chromium');
const skillRoot = path.resolve(flag('--skill', '/tmp/treehub-taste-skill/skills/taste-skill'));
fs.mkdirSync(out, { recursive: true });

function preserveBefore() {
  const prior = path.join(root, '..', 'treehub-review');
  const before = path.join(prior, 'fidelity', 'before');
  fs.mkdirSync(before, { recursive: true });
  for (const name of fs.readdirSync(prior)) {
    if (!/^blue-.*\.(png|html)$/.test(name)) continue;
    const target = path.join(before, name);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(prior, name), target);
  }
}
preserveBefore();

const render = vm.runInNewContext('(function(global){' + compiler.wxmlToJs(root) + '})({})', { window: {}, console });
const memory = new Map();
const fixtureApp = { globalData: {} };
const fakeWx = {
  getStorageSync: key => memory.has(key) ? structuredClone(memory.get(key)) : '',
  setStorageSync: (key, value) => memory.set(key, structuredClone(value)),
  removeStorageSync: key => memory.delete(key),
  showToast() {}, showModal() {}, navigateTo() {}, navigateBack() {}, redirectTo() {}, switchTab() {},
  setNavigationBarTitle() {}, setNavigationBarColor() {},
  getEnterOptionsSync: () => ({ scene: 1001, path: 'pages/test-hall/index', query: {} }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 1 }),
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 1 })
};
global.wx = fakeWx;
global.getApp = () => fixtureApp;
const archive = require(path.join(root, 'utils/archive.js'));
const themes = require(path.join(root, 'utils/themes.js'));
const scoring = require(path.join(root, 'utils/scoring.js'));
const imported = require(path.join(root, 'data/tests/index.js'));
const catalog = imported.default || imported;
const themeList = require(path.join(root, 'data/themes.js')).THEMES;

function page(route) {
  const file = path.join(root, route + '.js');
  let instance;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: createRequire(file), Page: value => { instance = value; },
    wx: fakeWx, getApp: global.getApp, getCurrentPages: () => [{ route }],
    console, setTimeout, clearTimeout
  }, { filename: file });
  instance.data = structuredClone(instance.data);
  instance.setData = update => Object.assign(instance.data, update);
  return instance;
}
function complete(testId) {
  const test = catalog.find(item => item.id === testId);
  const indices = test.questions.map((question, index) => index % question.options.length);
  return archive.saveResult({ testId, ...scoring.scoreTest(test, test.questions, indices) });
}
function localArt(id) {
  const webp = path.join(artRoot, id + '.webp');
  const png = path.join(artRoot, id + '.png');
  return fs.existsSync(webp) ? webp : fs.existsSync(png) ? png : '';
}
const imageCache = new Map();
function imageUri(value) {
  if (!value || /^(data:|https?:|cloud:)/.test(value)) return value || '';
  const file = value.startsWith('file://') ? value.slice(7) :
    value.startsWith('/workspace/') || value.startsWith('/tmp/') ? value : path.join(root, value.replace(/^\//, ''));
  if (!fs.existsSync(file)) return '';
  if (!imageCache.has(file)) {
    const ext = path.extname(file).slice(1).replace('jpg', 'jpeg');
    imageCache.set(file, `data:image/${ext};base64,${fs.readFileSync(file).toString('base64')}`);
  }
  return imageCache.get(file);
}
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rpx = value => String(value).replace(/(-?(?:\d*\.)?\d+)rpx\b/g, (_, number) => `calc(${number} * var(--rpx))`);

function componentTree(tree, size) {
  if (!tree) return '';
  let definition;
  const file = path.join(root, 'components/personality-tree/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Component: value => { definition = value; } });
  const value = { data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update); } };
  definition.methods.updateTree.call(value, tree);
  return html(render('components/personality-tree/index.wxml')({ ...value.data, tree, size: size || 'medium' }), {});
}
function radar(dimensions) {
  // The native Canvas component is represented by SVG from the SAME dimensions.
  // This is a layout stand-in; production Canvas rendering still needs DevTools.
  const list = dimensions.slice(0, 9);
  if (list.length < 3) return '';
  const p = (index, scale) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * index / list.length;
    return [150 + Math.cos(angle) * 112 * scale, 150 + Math.sin(angle) * 112 * scale];
  };
  const points = scale => list.map((_, i) => p(i, scale).join(',')).join(' ');
  const rings = [1, .75, .5, .25].map(scale => `<polygon points="${points(scale)}" fill="none" stroke="#b7ceee"/>`).join('');
  const axes = list.map((_, index) => `<line x1="150" y1="150" x2="${p(index, 1)[0]}" y2="${p(index, 1)[1]}" stroke="#c8dbf5"/>`).join('');
  const marks = list.map((item, index) => p(index, Math.max(.16, Math.min(1, Math.abs(Number(item.percent) - 50) / 50))).join(',')).join(' ');
  return `<div class="radar-shell" data-native-canvas-preview="true"><svg class="radar-canvas" viewBox="0 0 300 300" aria-label="本次倾向清晰度雷达图">${rings}${axes}<polygon points="${marks}" fill="#76a6ff66" stroke="#467fff" stroke-width="2"/></svg><div class="radar-center"><span>偏好</span><span>清晰度</span></div></div>`;
}
function html(node, data) {
  if (node === undefined || node === null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return escape(node);
  const attrs = node.attr || {};
  if (node.tag === 'wx-personality-tree') return componentTree(attrs.tree || data.record && data.record.treeSnapshot || data.tree, attrs.size);
  if (node.tag === 'wx-profile-radar') return radar(attrs.dimensions || data.deepReport && data.deepReport.dimensions || []);
  if (node.tag === 'virtual' || node.tag === 'wx-page') return (node.children || []).map(value => html(value, data)).join('');
  if (node.tag === 'wx-canvas') return ''; // hidden poster export is not a UI block
  let tag = ({ 'wx-image': 'img', 'wx-text': 'span', 'wx-button': 'button' })[node.tag] || 'div';
  const classes = String(attrs.class || '');
  if (tag === 'div' && /(?:^|\s)(?:page-title|report-heading-title|brand-title|hall-title|theme-title)(?:\s|$)/.test(classes)) tag = 'h1';
  const entries = [];
  for (let [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'disabled' || key === 'hidden') { if (value === true) entries.push(`${key}`); continue; }
    if (key === 'class' || key === 'id' || key === 'title') entries.push(`${key}="${escape(value)}"`);
    else if (key === 'style') entries.push(`style="${escape(rpx(value))}"`);
    else if (key === 'src') entries.push(`src="${escape(imageUri(value))}"`);
    else if (key === 'ariaRole') entries.push(`role="${escape(value)}"`);
    else if (key.startsWith('aria-')) entries.push(`${key}="${escape(value)}"`);
    else if (key === 'bindtap' || key === 'catchtap') entries.push(`data-native-action="${escape(value)}"`);
  }
  if (node.tag === 'wx-image') {
    const mode = attrs.mode || 'scaleToFill';
    entries.push(`data-native-mode="${escape(mode)}"`, `alt="${escape(attrs.alt || '')}"`);
    entries.push(`style="object-fit:${mode === 'aspectFit' ? 'contain' : mode === 'aspectFill' ? 'cover' : 'fill'};${escape(rpx(attrs.style || ''))}"`);
  }
  if (node.tag === 'wx-scroll-view') {
    entries.push('data-native-scroll="true"');
    if (attrs.scrollX || attrs['scroll-x']) entries.push('data-native-scroll-x="true"');
  }
  const children = (node.children || []).map(value => html(value, data)).join('');
  return `<${tag} ${entries.join(' ')}>${children}</${tag}>`;
}
function stylesheet(file, visited = new Set()) {
  const absolute = path.join(root, file);
  if (visited.has(absolute) || !fs.existsSync(absolute)) return '';
  visited.add(absolute);
  return fs.readFileSync(absolute, 'utf8').replace(/@import\s+["']([^"']+)["']\s*;/g, (_, importedFile) => {
    return stylesheet(path.relative(root, path.resolve(path.dirname(absolute), importedFile)), visited);
  });
}
function css(route) {
  const files = ['app.wxss', 'components/personality-tree/index.wxss', 'packages/reports/components/profile-radar/index.wxss', route + '.wxss'];
  return files.map(file => stylesheet(file)).join('\n')
    .replace(/(?<![-\w])page(?=\s*[{,])/g, 'body')
    .replace(/(?<![-\w])view(?=[\s.,:#>+~\[{])/g, ':is(div,h1)')
    .replace(/(?<![-\w])text(?=[\s.,:#>+~\[{])/g, 'span')
    .replace(/(?<![-\w])image(?=[\s.,:#>+~\[{])/g, 'img')
    .replace(/:host/g, '.preview-component');
}
function nativeBar(route) {
  const files = ['pages/test-hall/index', 'pages/my-tree/index', 'pages/user-center/index'];
  if (!files.includes(route) || !fs.existsSync(path.join(root, 'custom-tab-bar/index.wxml'))) return '';
  const tabs = [{ label: '探索', icon: 'home' }, { label: '我的树', icon: 'tree' }, { label: '档案', icon: 'archive' }];
  return '<div class="preview-tab-host">' + html(render('custom-tab-bar/index.wxml')({ selected: files.indexOf(route), tabs }), {}) + '</div>';
}
function output(route, name, data) {
  const mapped = rpx(css(route));
  const barCss = rpx(stylesheet('custom-tab-bar/index.wxss').replace(/:host/g, '.preview-tab-host'));
  const content = html(render(route + '.wxml')(data), data);
  const document = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(name)} · 微信布局预览</title><script>function unit(){document.documentElement.style.setProperty('--rpx',innerWidth/750+'px')}unit();addEventListener('resize',unit)</script><style>
  *{box-sizing:border-box}html{--rpx:.52px}body{margin:0;width:100%;font-family:'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased}h1{font:inherit;margin:0}button{display:block;width:100%;box-sizing:border-box;font:inherit;border:0;padding:0;margin:0;line-height:2.5556}button[disabled]{cursor:default}img{display:block}span{display:inline}svg{display:block}button::after{display:none}[data-native-scroll-x]{overflow-x:auto;overflow-y:hidden;scrollbar-width:none}[data-native-scroll-x]::-webkit-scrollbar{display:none}.preview-watermark{position:relative;z-index:1000;display:flex;justify-content:space-between;gap:10px;padding:7px 14px;background:#edf4ff;color:#4c6080;font-size:11px;line-height:1.2}.preview-tab-host{position:fixed;bottom:0;left:0;right:0;z-index:80} .preview-note{font-size:12px;color:#4c6080}
  ${mapped}\n${barCss}</style></head><body><div class="preview-watermark"><span>微信界面布局预览 · 非真机</span><span>示例记录 / 本地素材</span></div>${content}${nativeBar(route)}</body></html>`;
  fs.writeFileSync(path.join(out, name + '.html'), document);
  return { name, route, file: path.join(out, name + '.html') };
}

async function fixtures() {
  ['mbti', 'ie', 'enneagram'].forEach(complete);
  themes.claimStarter('adventurer');
  const scenarios = [];
  const add = (route, name, value) => {
    if (!selected.length || selected.includes(name)) scenarios.push(output(route, name, JSON.parse(JSON.stringify(value))));
  };
  const hall = page('pages/test-hall/index'); hall.onLoad(); hall.onShow();
  await Promise.resolve();
  hall.data.themeImage = localArt('adventurer'); hall.data.artState = 'ready';
  hall.data.cards = hall.data.cards.map(item => ({ ...item, image: localArt(item.artThemeId || 'adventurer') }));
  hall.data.filteredCards = hall.data.cards;
  add('pages/test-hall/index', 'hall', hall.data);
  const archivePage = page('pages/user-center/index'); archivePage.onShow();
  add('pages/user-center/index', 'archive', archivePage.data);
  for (const [id, name] of [['adventurer', 'my-tree'], ['moon', 'my-tree-moon'], ['romantic', 'my-tree-romantic'], ['aurora', 'my-tree-hidden']]) {
    const mine = page('pages/my-tree/index'); mine.onLoad(id === 'adventurer' ? {} : { theme: id }); mine.onShow();
    await Promise.resolve();
    if (!mine.data.current.hidden || mine.data.current.discovered) mine.data.heroUrl = localArt(id);
    mine.data.imageLoading = false;
    mine.data.gallery = mine.data.gallery.map(item => ({ ...item, thumbnailUrl: item.discovered ? localArt(item.id) : '' }));
    mine.data.companionSprite = localArt('companions');
    add('pages/my-tree/index', name, mine.data);
    if (id === 'adventurer') { mine.data.tab = 'companions'; add('pages/my-tree/index', 'companions', mine.data); }
  }
  for (const [testId, count] of [['mbti', 2], ['sbti', 3], ['bigfive', 5]]) {
    const answer = page('pages/test-answer/index'); answer.onLoad({ id: testId });
    const questionIndex = answer.data.questions.findIndex(item => item.options.length === count);
    if (questionIndex >= 0) { answer.data.currentQuestionIndex = questionIndex; answer.updateQuestion(); }
    answer.data.selectedOption = Math.min(1, answer.data.question.options.length - 1);
    add('pages/test-answer/index', 'answer-' + count, answer.data);
  }
  const detail = page('pages/test-detail/index'); detail.onLoad({ id: 'mbti' }); add('pages/test-detail/index', 'detail', detail.data);
  const result = complete('bigfive'); archive.unlockPremium(result.id);
  const report = page('packages/reports/index'); report.onLoad({ id: 'bigfive', recordId: result.id });
  await Promise.resolve();
  Object.assign(report.data, { themeHeroUrl: localArt('adventurer'), themeId: 'adventurer', themeName: '柔软的冒险家', themeQuote: themeList[0].quote, companionNames: '云朵小狗与地图精灵' });
  for (const section of ['portrait', 'insights', 'actions']) { report.data.premiumPage = section; add('packages/reports/index', 'report-' + section, report.data); }
  const policy = page('pages/privacy/index'); policy.onLoad(); add('pages/privacy/index', 'privacy', policy.data);
  return scenarios;
}

async function screenshot(scenarios) {
  const { chromium } = require(path.join(toolsRoot, 'node_modules/playwright-core'));
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const metrics = [];
  try {
    for (const scenario of scenarios) {
      const scenarioWidths = ['hall', 'my-tree', 'my-tree-moon', 'my-tree-romantic', 'my-tree-hidden', 'answer-2', 'answer-3', 'answer-5'].includes(scenario.name) ? widths : [390];
      for (const width of scenarioWidths) {
        const browserPage = await browser.newPage({ viewport: { width, height: width === 430 ? 932 : width === 360 ? 800 : 844 }, deviceScaleFactor: 1 });
        await browserPage.setContent(fs.readFileSync(scenario.file, 'utf8'), { waitUntil: 'load' });
        await browserPage.evaluate(() => document.fonts.ready);
        await browserPage.waitForTimeout(500);
        const measurement = await browserPage.evaluate(() => {
          const root = document.documentElement;
          const invalid = [...document.querySelectorAll('img')].filter(img => img.getAttribute('src') && (!img.complete || !img.naturalWidth));
          const targets = [...document.querySelectorAll('button,[data-native-action],[role=tab]')].map(el => ({ label: el.textContent.trim().slice(0, 35), rect: el.getBoundingClientRect(), disabled: el.disabled, hidden: getComputedStyle(el).display === 'none' })).filter(item => !item.hidden && !item.disabled && item.rect.width > 0 && item.rect.height > 0);
          return {
            viewport: innerWidth, pageWidth: root.scrollWidth, overflow: root.scrollWidth > innerWidth + 1,
            brokenImages: invalid.length,
            smallTargets: targets.filter(item => item.rect.height < 42 || item.rect.width < 42).map(item => ({ label: item.label, width: Math.round(item.rect.width), height: Math.round(item.rect.height) })),
            height: root.scrollHeight
          };
        });
        metrics.push({ screen: scenario.name, width, ...measurement });
        await browserPage.screenshot({ path: path.join(out, `${scenario.name}-${width}.png`), fullPage: true });
        await browserPage.close();
      }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'layout-metrics.json'), JSON.stringify(metrics, null, 2));
  return metrics;
}
function inspect(scenarios) {
  if (!args.includes('--inspect')) return;
  const script = path.join(skillRoot, 'scripts/inspect.mjs');
  if (!fs.existsSync(script)) throw new Error('taste-skill not found; supply --skill path');
  const records = [];
  // These allowances preserve the approved art direction, not geometry defects.
  const allow = flag('--allow', 'gradients,shadows,glass,icon-chips');
  for (const scenario of scenarios.filter(item => ['hall', 'my-tree'].includes(item.name))) {
    const result = spawnSync(process.execPath, [script, '--app', scenario.file, '--widths', widths.join(','), '--out', path.join(out, 'taste-' + scenario.name), '--allow', allow], { cwd: root, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
    records.push({ screen: scenario.name, status: result.status, stdout: result.stdout, stderr: result.stderr });
  }
  fs.writeFileSync(path.join(out, 'taste-checks.json'), JSON.stringify(records, null, 2));
}
async function main() {
  const scenarios = await fixtures();
  let metrics = [];
  if (!args.includes('--render-only')) metrics = await screenshot(scenarios);
  inspect(scenarios);
  fs.writeFileSync(path.join(out, 'README.md'), '# 微信界面布局辅助预览\n\n生成自真实 WXML/WXSS 与页面数据控制器；示例记录来自本机内存中的真实题库评分。\n主题图片仅为预览注入仓库外素材，未修改云配置。此工具不验证云部署、微信广告、平台权限、Canvas导出或真机排版。\n\n字号/间距使用随浏览器宽度更新的 rpx，360/390/430 宽分别拍摄。Canvas雷达图以相同维度SVG替身呈现，最终仍须微信开发者工具验收。\n');
  console.log(JSON.stringify({ output: out, scenarios: scenarios.length, screenshots: metrics.length, overflow: metrics.filter(item => item.overflow).map(item => `${item.screen}@${item.width}`), brokenImages: metrics.filter(item => item.brokenImages).map(item => `${item.screen}@${item.width}`) }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
