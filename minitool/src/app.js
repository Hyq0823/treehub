(function () {
  'use strict';

  var catalog = window.MINITOOL_CATALOG || [];
  var themes = window.MINITOOL_THEMES || [];
  var app = document.getElementById('app');
  var STORAGE_KEY = 'personality-tree-minitool-v1';
  var state = { view: 'home', activeTest: null, question: 0, answers: [], records: [], starterClaimed: false, selectedTheme: 'adventurer', draftTheme: '' };
  var answerAdvanceTimer = null;

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function miniTool() { return window.xhs && window.xhs.miniTool; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }
  function getTheme(id) { return themes.find(function (item) { return item.id === id; }) || themes[0]; }
  function testById(id) { return catalog.find(function (item) { return item.id === id; }); }
  function bearCompanion(type) {
    return type === 'Y' ? { name: '元气一二熊', art: './assets/companions/yier.webp', line: '拉着你出发，也提醒你照顾自己的电量。', color: '#4c9ee9' } : { name: '温柔布布熊', art: './assets/companions/bubu.webp', line: '陪你慢慢感受，也鼓励你说出真实需要。', color: '#b77bc8' };
  }
  function validRecords() { return state.records.filter(function (item) { return !!testById(item.testId); }); }
  function uniqueTests() { return Array.from(new Set(validRecords().map(function (item) { return item.testId; }))); }
  function latestRecord(testId) { return validRecords().find(function (item) { return item.testId === testId; }); }
  function earnedThemes() {
    var completed = uniqueTests();
    return themes.filter(function (theme) {
      return theme.starter || theme.unlockTest && completed.indexOf(theme.unlockTest) >= 0 || theme.requiredExplorations && completed.length >= theme.requiredExplorations;
    }).map(function (theme) { return theme.id; });
  }
  function recommendedTheme(record) {
    if (!record) return 'adventurer';
    if (record.testId === 'mbti') {
      if (record.resultType.charAt(0) === 'I' && record.resultType.charAt(2) === 'F') return 'romantic';
      if (record.resultType.charAt(0) === 'I' && record.resultType.charAt(2) === 'T') return 'observer';
    }
    if (record.testId === 'ie' && record.resultType === 'I') return 'observer';
    if (record.testId === 'enneagram' && record.resultType === '4') return 'romantic';
    return 'adventurer';
  }
  function serialize() {
    return { records: state.records.slice(0, 60), starterClaimed: state.starterClaimed, selectedTheme: state.selectedTheme };
  }
  async function saveState() {
    var data = JSON.stringify(serialize());
    var bridge = miniTool();
    if (bridge && typeof bridge.setStorage === 'function') {
      try { await bridge.setStorage({ key: STORAGE_KEY, data: data }); return true; } catch (error) {}
    }
    try { localStorage.setItem(STORAGE_KEY, data); return true; } catch (error) { return false; }
  }
  async function loadState() {
    var raw = '';
    var bridge = miniTool();
    if (bridge && typeof bridge.getStorage === 'function') {
      try { var result = await bridge.getStorage({ key: STORAGE_KEY }); raw = result && result.data || ''; } catch (error) {}
    }
    if (!raw) { try { raw = localStorage.getItem(STORAGE_KEY) || ''; } catch (error) {} }
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      if (Array.isArray(saved.records)) state.records = saved.records.filter(function (item) { return item && testById(item.testId); });
      state.starterClaimed = saved.starterClaimed === true;
      if (getTheme(saved.selectedTheme)) state.selectedTheme = saved.selectedTheme;
    } catch (error) {}
  }
  function toast(message) {
    var old = document.querySelector('.toast');
    if (old) old.parentNode.removeChild(old);
    var node = document.createElement('div'); node.className = 'toast'; node.textContent = message; document.body.appendChild(node);
    window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 2200);
  }
  function cancelAnswerAdvance() { window.clearTimeout(answerAdvanceTimer); answerAdvanceTimer = null; }
  function treeScene(theme, compact) {
    theme = theme || getTheme('adventurer');
    return '<div class="tree-scene ' + (compact ? 'compact' : '') + '">' +
      '<div class="tree-art-halo"></div><img class="theme-art" src="' + esc(theme.art) + '" alt="' + esc(theme.name) + '主题树与伙伴" />' +
      (compact ? '' : '<div class="theme-caption"><strong>' + esc(theme.name) + '</strong><span>' + esc(theme.quote) + '</span></div>') + '</div>';
  }
  function nav(active) {
    return '<nav class="bottom-nav"><button data-nav="home" class="' + (active === 'home' ? 'active' : '') + '"><b>⌂</b>探索</button><button data-nav="tree" class="' + (active === 'tree' ? 'active' : '') + '"><b>♧</b>我的树</button><button data-nav="archive" class="' + (active === 'archive' ? 'active' : '') + '"><b>◎</b>年轮</button></nav>';
  }
  function topbar(back) { return '<div class="topbar">' + (back ? '<button class="icon-button" data-action="back" aria-label="返回">‹</button>' : '<span class="eyebrow">PERSONALITY TREE</span>') + '<span class="brand">人格测试树</span><span style="width:44px"></span></div>'; }
  function renderHome() {
    var theme = getTheme(state.selectedTheme);
    var count = uniqueTests().length;
    var featuredTest = catalog.find(function (test) { return test.featured; });
    var featuredDone = featuredTest && !!latestRecord(featuredTest.id);
    var featuredCard = featuredTest ? '<button class="featured-test" data-test="' + esc(featuredTest.id) + '"><span class="featured-copy"><i>NEW · 今日 C 位测试</i><strong>' + esc(featuredTest.name) + '</strong><em>' + esc(featuredTest.description) + '</em><b>' + (featuredDone ? '再测一次，看今天的我 →' : '11 题解锁同频伙伴 →') + '</b><small>原创角色 · 非官方趣味测试</small></span><span class="featured-bears"><img class="bear-yier" src="./assets/companions/yier.webp" alt="元气一二型小熊" /><img class="bear-bubu" src="./assets/companions/bubu.webp" alt="温柔布布型小熊" /></span></button>' : '';
    var cards = catalog.filter(function (test) { return !test.featured; }).map(function (test) {
      var done = !!latestRecord(test.id);
      return '<button class="test-card" data-test="' + esc(test.id) + '"><span class="test-icon">' + esc(test.icon) + '</span><h3>' + esc(test.name) + '</h3><p>' + esc(test.description.slice(0, 48)) + '…</p><span class="test-meta"><span>' + esc(test.time) + '</span><span>' + (done ? '已留下年轮' : test.questions.length + ' 题') + '</span></span></button>';
    }).join('');
    app.innerHTML = '<main class="page">' + topbar(false) + featuredCard + '<section class="hero asset-hero"><span class="eyebrow">收集每一种独特的你</span><h1 class="hero-title">今天，也认真生活呀</h1><p class="hero-copy">从关系、情绪和性格里，看见此刻的自己。每次测试，都会让你的树长出新的主题与年轮。</p><div class="hero-tree-wrap">' + treeScene(theme, false) + '</div><button class="primary" data-action="quick-start">' + (count ? '继续探索新的自己' : '开始第一次探索') + '</button></section>' +
      '<div class="section-head"><h2>我的探索进度</h2><span>' + count + ' / ' + catalog.length + '</span></div><section class="progress-card"><div class="progress-row"><div><strong>' + (state.starterClaimed ? esc(theme.name) : '第一棵树正在等你') + '</strong><div style="color:var(--muted);font-size:12px;margin-top:5px">' + (count ? '每一份结果都保存在本地' : '首测即可免费领取完整主题') + '</div></div><span class="progress-value">' + count + '</span></div><div class="progress-track"><div class="progress-fill" style="width:' + Math.round(count / catalog.length * 100) + '%"></div></div></section>' +
      '<div class="section-head"><h2>今天想了解什么？</h2><span>全部离线测试</span></div><section class="test-grid">' + cards + '</section></main>' + nav('home');
  }
  function renderAnswer() {
    var test = state.activeTest;
    if (!test) { state.view = 'home'; return render(); }
    var question = test.questions[state.question];
    var selected = state.answers[state.question];
    var percent = Math.round((state.question + 1) / test.questions.length * 100);
    var theme = getTheme(state.selectedTheme);
    var mascot = test.id === 'yierbubu' ? '<span class="answer-duo"><img src="./assets/companions/yier.webp" alt="" /><img src="./assets/companions/bubu.webp" alt="" /></span>' : '<img class="answer-theme-icon" src="' + esc(theme.art) + '" alt="" />';
    var options = question.options.map(function (option, index) {
      var active = selected === index;
      return '<button class="answer-option ' + (active ? 'selected' : '') + '" data-answer="' + index + '" aria-pressed="' + active + '"><span class="option-letter">' + String.fromCharCode(65 + index) + '</span><span class="option-copy">' + esc(option.text) + '</span><span class="option-dot">' + (active ? '✓' : '') + '</span></button>';
    }).join('');
    app.innerHTML = '<main class="page answer-page">' + topbar(true) + '<section class="answer-status">' + mascot + '<div class="answer-status-copy"><span>' + esc(test.name) + '</span><strong>' + (state.question + 1) + ' <i>/ ' + test.questions.length + '</i></strong></div><b>' + percent + '%</b><div class="answer-progress"><div style="width:' + percent + '%"></div></div></section><section class="question-stage"><span class="question-number">QUESTION ' + String(state.question + 1).padStart(2, '0') + '</span><h1>' + esc(question.text) + '</h1><p>选择更接近你真实反应的一项</p><div class="answer-options ' + (question.options.length === 2 ? 'dual' : 'many') + '">' + options + '</div></section><img class="answer-tree-watermark" src="' + esc(theme.art) + '" alt="" /><div class="answer-controls auto"><button class="answer-prev" data-action="previous-answer" ' + (state.question === 0 ? 'disabled' : '') + '>← 上一题</button><span>' + (state.question === test.questions.length - 1 ? '选择后生成报告' : '选择后自动进入下一题 →') + '</span></div><p class="answer-note">凭第一感觉选择，没有标准答案 · 结果不作心理诊断</p></main>';
  }
  function score(test, answers) {
    var scores = {}; test.scoring.dimensions.forEach(function (dim) { scores[dim] = 0; });
    if (test.id === 'enneagram') {
      answers.forEach(function (answer, index) { var dim = String(test.questions[index].options[answer].value); scores[dim] += 1; });
    } else {
      test.scoring.mapping.forEach(function (item) {
        var index = test.questions.findIndex(function (question) { return String(question.id).replace(/^q/, '') === String(item.q).replace(/^q/, ''); });
        var value = test.questions[index].options[answers[index]].value;
        var direction = item.direction === -1 ? -1 : 1;
        var points;
        if (test.id === 'ie') points = value === 'E' ? 1 : 0;
        else if (test.id === 'mbti') points = ['E', 'S', 'T', 'J'].indexOf(value) >= 0 ? direction : -direction;
        else points = test.id === 'bigfive' && direction === -1 ? 6 - Number(value) : Number(value) * direction;
        scores[item.dim] += points;
      });
    }
    var resultType;
    if (test.id === 'mbti') resultType = (scores.EI >= 0 ? 'E' : 'I') + (scores.SN >= 0 ? 'S' : 'N') + (scores.TF >= 0 ? 'T' : 'F') + (scores.JP >= 0 ? 'J' : 'P');
    else if (test.id === 'ie') resultType = scores.EI > test.questions.length / 2 ? 'E' : scores.EI < test.questions.length / 2 ? 'I' : 'E/I';
    else if (test.id === 'yierbubu') resultType = Object.keys(scores).reduce(function (sum, key) { return sum + scores[key]; }, 0) > 0 ? 'Y' : 'B';
    else if (test.id === 'enneagram') resultType = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a] || Number(a) - Number(b); })[0];
    else if (test.id === 'shadow') resultType = scores.shadow <= 20 ? 'low' : scores.shadow <= 30 ? 'medium' : 'high';
    else resultType = 'profile';
    return { scores: scores, resultType: resultType };
  }
  function reportFor(test, record) {
    if (test.id !== 'bigfive') return test.reports.find(function (item) { return item.type === record.resultType; });
    var labels = { openness: '开放性', conscientiousness: '尽责性', extraversion: '外向性', agreeableness: '宜人性', neuroticism: '情绪敏感性' };
    var dimensions = Object.keys(labels).map(function (id) {
      var count = test.scoring.mapping.filter(function (item) { return item.dim === id; }).length;
      var mean = record.scores[id] / count;
      var level = mean > 3 ? 'high' : mean < 3 ? 'low' : 'middle';
      var detail = test.reports.find(function (item) { return item.type === level + '_' + id; });
      return { id: id, label: labels[id], score: mean.toFixed(2), percent: Math.round((mean - 1) / 4 * 100), summary: detail ? detail.summary : '这项特质处于相对均衡的位置。' };
    });
    return { type: 'profile', title: '你的五维特质', summary: '五个角度，看看此刻的自己。', description: '这是一张属于此刻的特质地图。不同维度没有高低之分，它们会在不同生活场景中发挥作用。', advice: '把结果留作一次观察，下一次复测时再看看自己发生了什么变化。', dimensions: dimensions };
  }
  function bounded(value) { return Math.max(0, Math.min(100, Math.round(value || 0))); }
  function mappedCount(test, dimension) { return test.scoring.mapping.filter(function (item) { return item.dim === dimension; }).length || 1; }
  function chartProfile(test, record, report) {
    if (test.id === 'yierbubu') {
      return [
        { id: 'action', label: '行动勇气', percent: bounded((record.scores.action + mappedCount(test, 'action')) / (mappedCount(test, 'action') * 2) * 100) },
        { id: 'expression', label: '热烈表达', percent: bounded((record.scores.expression + mappedCount(test, 'expression')) / (mappedCount(test, 'expression') * 2) * 100) },
        { id: 'explore', label: '新鲜探索', percent: bounded((record.scores.explore + mappedCount(test, 'explore')) / (mappedCount(test, 'explore') * 2) * 100) },
        { id: 'emotion', label: '情绪感知', percent: bounded(100 - (record.scores.emotion + mappedCount(test, 'emotion')) / (mappedCount(test, 'emotion') * 2) * 100) },
        { id: 'relation', label: '关系慎重', percent: bounded(100 - (record.scores.relation + mappedCount(test, 'relation')) / (mappedCount(test, 'relation') * 2) * 100) }
      ];
    }
    if (test.id === 'bigfive') return (report.dimensions || []).map(function (item) { return { id: item.id, label: item.label, percent: bounded(item.percent) }; });
    if (test.id === 'mbti') {
      return [{ id: 'EI', label: '外向能量' }, { id: 'SN', label: '现实感知' }, { id: 'TF', label: '理性决策' }, { id: 'JP', label: '计划节奏' }].map(function (item) {
        var count = mappedCount(test, item.id); return { id: item.id, label: item.label, percent: bounded((record.scores[item.id] + count) / (count * 2) * 100) };
      });
    }
    if (test.id === 'enneagram') {
      var max = Math.max.apply(Math, Object.keys(record.scores).map(function (key) { return record.scores[key]; }).concat([1]));
      return Object.keys(record.scores).sort(function (a, b) { return record.scores[b] - record.scores[a]; }).slice(0, 6).map(function (key) { return { id: key, label: key + '号倾向', percent: bounded(record.scores[key] / max * 100) }; });
    }
    if (test.id === 'ie') {
      var outward = bounded(record.scores.EI / test.questions.length * 100);
      return [{ id: 'E', label: '向外连接', percent: outward }, { id: 'I', label: '独处充电', percent: 100 - outward }];
    }
    if (test.id === 'shadow') {
      var visible = bounded((record.scores.shadow - test.questions.length) / test.questions.length * 100);
      return [{ id: 'visible', label: '主动应对', percent: visible }, { id: 'inner', label: '内在停留', percent: 100 - visible }];
    }
    return [];
  }
  function radarPoint(index, total, radius, percent) {
    var angle = -Math.PI / 2 + Math.PI * 2 * index / total;
    var distance = radius * percent / 100;
    return [120 + Math.cos(angle) * distance, 120 + Math.sin(angle) * distance];
  }
  function radarPolygon(axes, percent) { return axes.map(function (_, index) { var point = radarPoint(index, axes.length, 78, percent); return point[0].toFixed(1) + ',' + point[1].toFixed(1); }).join(' '); }
  function renderInsightChart(profile) {
    if (!profile.length) return '';
    var strongest = profile.slice().sort(function (a, b) { return b.percent - a.percent; })[0];
    var softest = profile.slice().sort(function (a, b) { return a.percent - b.percent; })[0];
    var visual;
    if (profile.length >= 3) {
      var grids = [25, 50, 75, 100].map(function (level) { return '<polygon points="' + radarPolygon(profile, level) + '"></polygon>'; }).join('');
      var lines = profile.map(function (_, index) { var point = radarPoint(index, profile.length, 78, 100); return '<line x1="120" y1="120" x2="' + point[0].toFixed(1) + '" y2="' + point[1].toFixed(1) + '"></line>'; }).join('');
      var labels = profile.map(function (item, index) { var point = radarPoint(index, profile.length, 103, 100); var anchor = point[0] < 105 ? 'end' : point[0] > 135 ? 'start' : 'middle'; return '<text x="' + point[0].toFixed(1) + '" y="' + (point[1] + 4).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(item.label) + '</text>'; }).join('');
      var valuePoints = profile.map(function (item, index) { var point = radarPoint(index, profile.length, 78, item.percent); return point[0].toFixed(1) + ',' + point[1].toFixed(1); }).join(' ');
      visual = '<div class="radar-wrap"><svg class="radar-chart" viewBox="0 0 240 240" role="img" aria-label="多维特质雷达图"><g class="radar-grid">' + grids + lines + '</g><polygon class="radar-value" points="' + valuePoints + '"></polygon><g class="radar-labels">' + labels + '</g></svg></div>';
    } else {
      visual = '<div class="spectrum-visual"><span style="width:' + profile[0].percent + '%"></span><strong>' + esc(profile[0].label) + ' ' + profile[0].percent + '%</strong><em>' + esc(profile[1].label) + ' ' + profile[1].percent + '%</em></div>';
    }
    var bars = profile.map(function (item) { return '<div class="insight-bar"><div><span>' + esc(item.label) + '</span><b>' + item.percent + '%</b></div><i><em style="width:' + item.percent + '%"></em></i></div>'; }).join('');
    return '<section class="insight-card"><div class="insight-heading"><div><span>VISUAL REPORT</span><h2>你的多维能量图</h2></div><b>适合截图分享</b></div>' + visual + '<div class="insight-chips"><span><i>最鲜明</i><strong>' + esc(strongest.label) + '</strong></span><span><i>另一面</i><strong>' + esc(softest.label) + '</strong></span></div><div class="insight-bars">' + bars + '</div><p>数值表示本次回答中的相对倾向，没有高低好坏。</p></section>';
  }
  async function completeAnswer() {
    if (state.answers[state.question] == null) { toast('先选择一个更像你的答案'); return; }
    if (state.question < state.activeTest.questions.length - 1) { state.question += 1; renderAnswer(); return; }
    var scored = score(state.activeTest, state.answers);
    var record = { id: 'r' + Date.now(), testId: state.activeTest.id, completedAt: new Date().toISOString(), scores: scored.scores, resultType: scored.resultType };
    state.records.unshift(record); state.records = state.records.slice(0, 60); state.draftTheme = state.starterClaimed ? state.selectedTheme : recommendedTheme(record);
    await saveState(); state.view = 'result'; render();
  }
  function renderResult() {
    var record = state.records[0], test = record && testById(record.testId);
    if (!test) { state.view = 'home'; return render(); }
    var report = reportFor(test, record), theme = getTheme(state.draftTheme || state.selectedTheme);
    var bear = test.id === 'yierbubu' ? bearCompanion(record.resultType) : null;
    var profile = chartProfile(test, record, report);
    var chartHtml = renderInsightChart(profile);
    var starter = '';
    if (!state.starterClaimed) {
      var starterThemes = themes.filter(function (item) { return item.starter; });
      starter = '<section class="starter-panel"><span class="eyebrow">FIRST TREE · 首测礼物</span><h2>免费领取你的第一棵树</h2><p>已根据本次结果推荐主题，也可以选择更心动的一棵。领取不需要看视频。</p><div class="theme-choices">' + starterThemes.map(function (item) { return '<button class="theme-chip ' + (item.id === theme.id ? 'selected' : '') + '" data-theme-choice="' + item.id + '"><img src="' + esc(item.art) + '" alt="" /><strong>' + esc(item.name) + '</strong><span>' + esc(item.tags.join(' · ')) + '</span></button>'; }).join('') + '</div><button class="primary" data-action="claim-theme">免费领取「' + esc(theme.name) + '」</button></section>';
    }
    var resultVisual = bear ? '<div class="unlocked-bear" style="--bear-color:' + esc(bear.color) + '"><span>已解锁 · 同频伙伴</span><img src="' + esc(bear.art) + '" alt="' + esc(bear.name) + '" /><strong>' + esc(bear.name) + '</strong><small>' + esc(bear.line) + '</small></div>' : '<div style="position:relative;height:255px;margin-top:4px">' + treeScene(theme, true) + '</div><strong>' + esc(theme.name) + '</strong><div style="color:var(--muted);font-size:12px;margin-top:5px">' + esc(theme.quote) + '</div>';
    app.innerHTML = '<main class="page">' + topbar(true) + '<section class="result-hero ' + (bear ? 'bear-result-hero' : '') + '"><span class="result-code">' + esc(test.name) + ' · 本次结果</span><h1>' + esc(report.title) + '</h1><p class="result-summary">' + esc(report.summary) + '</p>' + resultVisual + '</section>' + chartHtml + starter + '<section class="result-card"><h2>这一次，看见自己</h2><p>' + esc(report.description) + '</p><div class="advice"><strong>给自己的小提醒</strong><br>' + esc(report.advice) + '</div></section><div class="share-actions"><button class="secondary" data-action="save-card">保存结果图</button><button class="primary" data-action="post-note">去小红书晒一晒</button></div><button class="secondary" data-action="home">继续探索其他测试</button></main>';
  }
  function renderTree() {
    var current = getTheme(state.selectedTheme), earned = earnedThemes();
    var gallery = themes.map(function (theme) { var unlocked = state.starterClaimed && earned.indexOf(theme.id) >= 0; return '<button class="theme-item ' + (unlocked ? '' : 'locked') + '" data-theme="' + theme.id + '" ' + (unlocked ? '' : 'disabled') + '><span class="theme-thumb"><img src="' + esc(theme.art) + '" alt="" /><i>' + (unlocked ? '' : '未解锁') + '</i></span><strong>' + esc(theme.name) + '</strong><span>' + esc(unlocked ? theme.quote : theme.unlockTest ? '完成对应测试后长出' : '继续探索后相遇') + '</span></button>'; }).join('');
    app.innerHTML = '<main class="page">' + topbar(false) + '<section class="tree-page-scene" style="background:linear-gradient(180deg,' + esc(current.pale) + ',#fff)">' + treeScene(current, false) + '</section><div class="section-head"><h2>我的主题图鉴</h2><span>' + earned.filter(function (id) { return state.starterClaimed && earned.indexOf(id) >= 0; }).length + ' / ' + themes.length + '</span></div>' + (state.starterClaimed ? '<section class="theme-grid">' + gallery + '</section>' : '<section class="empty">完成第一次测试，就能免费领取完整的树与伙伴。<button class="primary" data-action="home">去探索</button></section>') + '</main>' + nav('tree');
  }
  function renderArchive() {
    var records = validRecords();
    var rows = records.map(function (record, index) { var test = testById(record.testId), report = reportFor(test, record); return '<div class="history-row"><div><strong>' + esc(report.title) + '</strong><span>' + esc(test.name) + ' · ' + esc(new Date(record.completedAt).toLocaleDateString('zh-CN')) + '</span></div><span class="history-badge">' + (index === records.length - 1 ? '第一片叶' : '年轮 ' + (records.length - index)) + '</span></div>'; }).join('');
    app.innerHTML = '<main class="page">' + topbar(false) + '<div class="section-head"><h2>我的年轮</h2><span>本地保存 ' + records.length + ' 次</span></div>' + (rows ? '<section class="archive-card history-list">' + rows + '</section>' : '<section class="empty">每次测试都会在这里留下一圈年轮。<button class="primary" data-action="home">开始第一次探索</button></section>') + '<p style="color:var(--muted);font-size:11px;line-height:1.7;margin:18px 4px">记录仅保存在当前小工具的本地空间。结果用于自我观察，不作心理诊断。</p></main>' + nav('archive');
  }
  function loadImage(src) {
    return new Promise(function (resolve, reject) { var image = new Image(); image.onload = function () { resolve(image); }; image.onerror = reject; image.src = src; });
  }
  function drawRadarCanvas(ctx, profile, cx, cy, radius) {
    if (profile.length < 3) {
      profile.forEach(function (item, index) {
        var y = cy - 35 + index * 70; ctx.textAlign = 'left'; ctx.fillStyle = '#587593'; ctx.font = '17px sans-serif'; ctx.fillText(item.label, cx - 125, y);
        ctx.fillStyle = '#dce9f6'; ctx.fillRect(cx - 125, y + 13, 250, 12); ctx.fillStyle = index ? '#bd82ca' : '#4c9ee9'; ctx.fillRect(cx - 125, y + 13, 250 * item.percent / 100, 12);
        ctx.textAlign = 'right'; ctx.fillStyle = '#17375f'; ctx.fillText(item.percent + '%', cx + 125, y);
      }); return;
    }
    ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = 'rgba(76,133,193,.22)'; ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(function (level) {
      ctx.beginPath(); profile.forEach(function (_, index) { var angle = -Math.PI / 2 + Math.PI * 2 * index / profile.length; var x = Math.cos(angle) * radius * level, y = Math.sin(angle) * radius * level; if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
    });
    profile.forEach(function (_, index) { var angle = -Math.PI / 2 + Math.PI * 2 * index / profile.length; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); ctx.stroke(); });
    ctx.beginPath(); profile.forEach(function (item, index) { var angle = -Math.PI / 2 + Math.PI * 2 * index / profile.length; var x = Math.cos(angle) * radius * item.percent / 100, y = Math.sin(angle) * radius * item.percent / 100; if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = 'rgba(69,145,226,.28)'; ctx.fill(); ctx.strokeStyle = '#438ddd'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#456784'; ctx.font = '15px sans-serif'; profile.forEach(function (item, index) { var angle = -Math.PI / 2 + Math.PI * 2 * index / profile.length; var x = Math.cos(angle) * (radius + 22), y = Math.sin(angle) * (radius + 22) + 5; ctx.textAlign = x < -8 ? 'right' : x > 8 ? 'left' : 'center'; ctx.fillText(item.label, x, y); }); ctx.restore(); ctx.textAlign = 'left';
  }
  async function drawShareCard() {
    var record = state.records[0], test = testById(record.testId), report = reportFor(test, record), theme = getTheme(state.draftTheme || state.selectedTheme);
    var bear = test.id === 'yierbubu' ? bearCompanion(record.resultType) : null;
    var profile = chartProfile(test, record, report);
    var canvas = document.getElementById('shareCanvas'), ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 750, 1000); gradient.addColorStop(0, theme.pale); gradient.addColorStop(1, '#ffffff'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 750, 1000);
    ctx.fillStyle = '#4278b8'; ctx.font = '24px sans-serif'; ctx.fillText('人格测试树 · ' + test.name, 55, 70);
    ctx.fillStyle = '#17375f'; ctx.font = 'bold 54px sans-serif'; ctx.fillText(report.title, 55, 145);
    ctx.fillStyle = '#5d7694'; ctx.font = '25px sans-serif'; wrapText(ctx, report.summary, 55, 198, 640, 38, 3);
    var art = await loadImage(bear ? bear.art : theme.art); ctx.save(); ctx.shadowColor = 'rgba(42,91,145,.16)'; ctx.shadowBlur = 24; ctx.drawImage(art, 42, 292, 355, 355); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.58)'; ctx.fillRect(410, 292, 300, 355); ctx.fillStyle = '#3f7fc5'; ctx.font = 'bold 19px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('我的多维能量图', 560, 326); drawRadarCanvas(ctx, profile, 560, 478, 92);
    var strongest = profile.slice().sort(function (a, b) { return b.percent - a.percent; })[0];
    ctx.textAlign = 'center'; ctx.fillStyle = '#17375f'; ctx.font = 'bold 37px sans-serif'; ctx.fillText(bear ? bear.name : theme.name, 375, 718); ctx.fillStyle = '#557391'; ctx.font = '24px sans-serif'; wrapText(ctx, bear ? bear.line : theme.quote, 375, 764, 590, 34, 2, true);
    if (strongest) { ctx.fillStyle = '#edf6ff'; ctx.fillRect(175, 834, 400, 54); ctx.fillStyle = '#3d84d4'; ctx.font = 'bold 21px sans-serif'; ctx.fillText('本次最鲜明 · ' + strongest.label + ' ' + strongest.percent + '%', 375, 868); }
    ctx.fillStyle = bear ? bear.color : '#3d84d4'; ctx.font = '20px sans-serif'; ctx.fillText(bear ? '原创熊熊人格 · 非官方趣味测试' : theme.tags.join('  ·  '), 375, 928); ctx.fillStyle = '#8295aa'; ctx.font = '17px sans-serif'; ctx.fillText('人格测试树 · 收集每一种独特的你', 375, 972); ctx.textAlign = 'left';
    return canvas.toDataURL('image/png');
  }
  function wrapText(ctx, text, x, y, width, lineHeight, maxLines, centered) {
    var line = '', row = 0; for (var i = 0; i < text.length; i += 1) { var next = line + text.charAt(i); if (line && ctx.measureText(next).width > width) { if (centered) ctx.textAlign = 'center'; ctx.fillText(line, x, y + row * lineHeight); line = text.charAt(i); row += 1; if (row >= maxLines) break; } else line = next; } if (line && row < maxLines) ctx.fillText(line, x, y + row * lineHeight);
  }
  async function saveCard() {
    var bridge = miniTool(); if (!bridge || typeof bridge.saveImageToPhotosAlbum !== 'function') return toast('请在最新版小红书中保存结果图');
    try { var data = await drawShareCard(); var filePath = data; if (typeof bridge.writeTempFile === 'function') { var written = await bridge.writeTempFile({ data: data }); filePath = written.filePath; } await bridge.saveImageToPhotosAlbum({ filePath: filePath }); toast('结果图已保存到相册'); } catch (error) { toast('保存未完成，可以稍后再试'); }
  }
  async function postNote() {
    var bridge = miniTool(); if (!bridge || typeof bridge.postNote !== 'function') return toast('请在小红书客户端中发布');
    var record = state.records[0], test = testById(record.testId), report = reportFor(test, record);
    var bear = test.id === 'yierbubu' ? bearCompanion(record.resultType) : null;
    var title = bear ? '测出来我是' + bear.name : '我的人格树是' + getTheme(state.draftTheme || state.selectedTheme).name;
    var content = bear ? '做完「你是一二还是布布」，我解锁了「' + bear.name + '」。你会和哪只熊熊同频？' : '做完「' + test.name + '」，我收到了「' + report.title + '」。你的人格树会是什么样？';
    try { var data = await drawShareCard(); var filePath = data; if (typeof bridge.writeTempFile === 'function') { var written = await bridge.writeTempFile({ data: data }); filePath = written.filePath; } await bridge.postNote({ title: title, content: content, pageType: 'photo_publish', mediaInfo: { image_resources: [{ url: filePath }] } }); } catch (error) { toast('发布页暂时没有打开，请稍后再试'); }
  }
  function render() { if (state.view === 'answer') renderAnswer(); else if (state.view === 'result') renderResult(); else if (state.view === 'tree') renderTree(); else if (state.view === 'archive') renderArchive(); else renderHome(); }
  app.addEventListener('click', function (event) {
    var target = event.target.closest('button'); if (!target) return;
    if (target.dataset.nav) { cancelAnswerAdvance(); state.view = target.dataset.nav; render(); return; }
    if (target.dataset.test) { cancelAnswerAdvance(); state.activeTest = testById(target.dataset.test); state.question = 0; state.answers = []; state.view = 'answer'; render(); return; }
    if (target.dataset.answer != null) {
      state.answers[state.question] = Number(target.dataset.answer);
      renderAnswer();
      cancelAnswerAdvance();
      answerAdvanceTimer = window.setTimeout(function () { answerAdvanceTimer = null; completeAnswer(); }, 180);
      return;
    }
    if (target.dataset.themeChoice) { state.draftTheme = target.dataset.themeChoice; renderResult(); return; }
    if (target.dataset.theme) { state.selectedTheme = target.dataset.theme; saveState(); renderTree(); return; }
    var action = target.dataset.action;
    if (action === 'quick-start') { cancelAnswerAdvance(); state.activeTest = catalog.find(function (item) { return !latestRecord(item.id); }) || catalog[0]; state.question = 0; state.answers = []; state.view = 'answer'; render(); }
    else if (action === 'back') { cancelAnswerAdvance(); state.view = state.view === 'answer' ? 'home' : state.view === 'result' ? 'home' : 'home'; render(); }
    else if (action === 'home') { cancelAnswerAdvance(); state.view = 'home'; render(); }
    else if (action === 'previous-answer' && state.question > 0) { cancelAnswerAdvance(); state.question -= 1; renderAnswer(); }
    else if (action === 'claim-theme') { state.starterClaimed = true; state.selectedTheme = state.draftTheme || 'adventurer'; saveState(); renderResult(); toast('第一棵树已经收藏'); }
    else if (action === 'save-card') saveCard();
    else if (action === 'post-note') postNote();
  });
  loadState().then(render);
}());
