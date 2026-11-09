const { report, EVENTS } = require('../../utils/track.js');
const { scoreTest, SCORING_VERSION, TEST_VERSION } = require('../../utils/scoring.js');
const archive = require('../../utils/archive.js');
const { getContext } = require('../../utils/life-context.js');

Page({
  data: {
    test: {}, question: null, currentQuestionIndex: 0, selectedOption: -1,
    submitted: false, submitting: false, revealingResult: false, error: '',
    progressPercent: 0, answeredCount: 0, motionKey: 0, autoAdvancing: false,
    themeHeroUrl: '', interactionType: 'single', rankingItems: [], rankingSelected: [],
    rankingComplete: false, rankingHelper: '', rankingSaveError: '',
    revealTitle: '正在收集你的答案', revealCopy: '让这些选择，慢慢长成属于你的画像'
  },
  onLoad(options) {
    this._unloaded = false;
    this._lifeContext = getContext(options && options.context) ? options.context : '';
    report(EVENTS.TEST_START, { testId: options.id });
    this.loadTestData(options.id);
    this.loadThemeWorld();
  },
  async loadThemeWorld() {
    try {
      const themes = require('../../utils/themes.js');
      const assets = require('../../utils/theme-assets.js');
      const state = themes.getState();
      const current = state.catalog.find(item => item.id === state.selectedId);
      if (!current || !current.discovered) return;
      const themeHeroUrl = await assets.resolveThemeAsset(current.id);
      if (!this._unloaded && themeHeroUrl) this.setData({ themeHeroUrl });
    } catch (error) {
      // Theme artwork is decorative; answering always remains available offline.
    }
  },
  onUnload() {
    this._unloaded = true;
    this._assetRequest = (this._assetRequest || 0) + 1;
    this.clearAdvance();
    this.clearReveal();
    if (!this.data.submitted && this.data.test.id) {
      report(EVENTS.TEST_ABORT, {
        testId: this.data.test.id, reachedIndex: this.data.currentQuestionIndex,
        totalCount: (this._questions || []).length
      });
    }
  },
  clearAdvance() {
    if (this._advanceTimer) clearTimeout(this._advanceTimer);
    this._advanceTimer = null;
  },
  clearReveal() {
    if (this._revealTimer) clearTimeout(this._revealTimer);
    this._revealTimer = null;
  },
  loadTestData(testId) {
    try {
      const imported = require('../../data/tests/index.js');
      const test = (imported.default || imported).find(item => item.id === testId);
      if (!test) throw new Error('没有找到这项测试，请返回大厅重新选择');
      this._test = test;
      const clonedQuestions = test.questions.map(question => Object.assign({}, question, {
        options: question.options.map(option => Object.assign({}, option))
      }));
      const questions = testId === 'sbti' ? this.shuffleArray(clonedQuestions) : clonedQuestions;
      this._questions = questions;
      this._answers = questions.map(question => question.type === 'ranking' ? [] : -1);
      const interaction = test.interaction || {};
      this.setData({
        test: { id: test.id, name: test.name, questionsCount: test.questionsCount }, error: '',
        interactionType: interaction.type || 'single', rankingHelper: interaction.helper || '',
        revealTitle: interaction.revealTitle || '正在收集你的答案',
        revealCopy: interaction.revealCopy || '让这些选择，慢慢长成属于你的画像'
      });
      this.updateQuestion();
      this.loadQuestionAssets();
    } catch (error) {
      this.setData({ error: error.message || '测试加载失败，请返回大厅重试' });
    }
  },
  async loadQuestionAssets() {
    const questions = this._questions || [];
    const found = new Set();
    questions.forEach(question => question.options.forEach(option => { if (option.assetPath) found.add(option.assetPath); }));
    const paths = Array.from(found);
    if (!paths.length) return;
    const request = this._assetRequest = (this._assetRequest || 0) + 1;
    try {
      const urls = await require('../../utils/public-assets.js').resolvePublicAssets(paths);
      if (this._unloaded || request !== this._assetRequest) return;
      questions.forEach(question => question.options.forEach(option => {
        if (option.assetPath && urls[option.assetPath]) option.image = urls[option.assetPath];
      }));
      this.updateQuestion({ animate: false });
    } catch (error) { /* Bundled fallback artwork remains available. */ }
  },
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },
  updateQuestion(options = {}) {
    const questions = this._questions || [];
    const answers = this._answers || [];
    const question = questions[this.data.currentQuestionIndex];
    if (!question) return;
    const ranking = question.type === 'ranking' && Array.isArray(answers[this.data.currentQuestionIndex])
      ? answers[this.data.currentQuestionIndex] : [];
    const isRanking = question.type === 'ranking';
    const answeredCount = isRanking
      ? ranking.length
      : answers.filter(answer => answer !== -1).length;
    const rankingItems = isRanking ? question.options.map((option, index) => Object.assign({}, option, {
      rank: ranking.indexOf(index) + 1
    })) : [];
    const rankingSelected = isRanking ? ranking.map(index => Object.assign({}, question.options[index], {
      rank: ranking.indexOf(index) + 1
    })) : [];
    const completedShare = isRanking ? ranking.length / Math.max(1, question.options.length) : 1;
    this.setData({
      question: Object.assign({}, question, {
        options: isRanking ? [] : question.options.map((option, index) => Object.assign({}, option, { letter: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index] }))
      }),
      selectedOption: isRanking ? -1 : answers[this.data.currentQuestionIndex],
      progressPercent: Math.round((this.data.currentQuestionIndex + completedShare) / questions.length * 100),
      answeredCount,
      motionKey: options.animate === false ? this.data.motionKey : this.data.motionKey ? 0 : 1,
      autoAdvancing: false,
      interactionType: isRanking ? 'ranking' : 'single',
      rankingItems, rankingSelected, rankingComplete: isRanking && ranking.length === question.options.length
    });
  },
  selectOption(event) {
    if (this.data.submitted || this.data.submitting) return;
    const index = Number(event.currentTarget.dataset.index);
    const current = this.data.currentQuestionIndex;
    const questions = this._questions || [];
    if (!Number.isInteger(index) || !questions[current] || !questions[current].options[index]) return;
    this.clearAdvance();
    const answers = (this._answers || []).slice();
    answers[current] = index;
    this._answers = answers;
    this.setData({ selectedOption: index, answeredCount: answers.filter(answer => answer !== -1).length, autoAdvancing: true });
    // Auto-advance only the question on which the tap occurred.
    this._advanceTimer = setTimeout(() => {
      this._advanceTimer = null;
      if (!this._unloaded && this.data.currentQuestionIndex === current) this.nextQuestion();
    }, 300);
  },
  changeRanking(event) {
    if (this.data.submitted || this.data.submitting || this.data.rankingComplete) return;
    const index = Number(event.detail && event.detail.index);
    const current = this.data.currentQuestionIndex;
    const question = (this._questions || [])[current];
    if (!question || question.type !== 'ranking' || !Number.isInteger(index) || !question.options[index]) return;
    this.clearAdvance();
    const order = Array.isArray(this._answers[current]) ? this._answers[current].slice() : [];
    const existing = order.indexOf(index);
    if (existing >= 0) order.splice(existing, 1); else order.push(index);
    this._answers[current] = order;
    this.updateQuestion({ animate: false });
    if (order.length === question.options.length) {
      this.setData({ rankingComplete: true, autoAdvancing: true });
      this._advanceTimer = setTimeout(() => {
        this._advanceTimer = null;
        if (!this._unloaded && this.data.currentQuestionIndex === current) this.nextQuestion();
      }, 650);
    }
  },
  undoRanking() {
    if (this.data.submitting || this.data.submitted) return;
    this.clearAdvance();
    const current = this.data.currentQuestionIndex;
    const order = Array.isArray(this._answers[current]) ? this._answers[current].slice() : [];
    order.pop();
    this._answers[current] = order;
    if (this.data.rankingSaveError) this.setData({ rankingSaveError: '' });
    this.updateQuestion({ animate: false });
  },
  resetRanking() {
    if (this.data.submitting || this.data.submitted) return;
    this.clearAdvance();
    this._answers[this.data.currentQuestionIndex] = [];
    if (this.data.rankingSaveError) this.setData({ rankingSaveError: '' });
    this.updateQuestion({ animate: false });
  },
  prevQuestion() {
    this.clearAdvance();
    if (this.data.submitting || this.data.submitted) return;
    if (this.data.currentQuestionIndex > 0) {
      this.setData({ currentQuestionIndex: this.data.currentQuestionIndex - 1 });
      this.updateQuestion();
    }
  },
  nextQuestion() {
    this.clearAdvance();
    if (this.data.submitting || this.data.submitted) return;
    const currentQuestion = (this._questions || [])[this.data.currentQuestionIndex];
    const currentAnswer = (this._answers || [])[this.data.currentQuestionIndex];
    const complete = currentQuestion && currentQuestion.type === 'ranking'
      ? Array.isArray(currentAnswer) && currentAnswer.length === currentQuestion.options.length
      : this.data.selectedOption !== -1;
    if (!complete) {
      wx.showToast({ title: '请选择答案', icon: 'none' });
      return;
    }
    if (this.data.currentQuestionIndex < (this._questions || []).length - 1) {
      this.setData({ currentQuestionIndex: this.data.currentQuestionIndex + 1 });
      this.updateQuestion();
    } else {
      this.submitTest();
    }
  },
  submitTest() {
    if (this.data.submitting || this.data.submitted) return;
    this.clearAdvance();
    const questions = this._questions || [];
    const answers = this._answers || [];
    const missing = answers.findIndex((answer, index) => questions[index].type === 'ranking'
      ? !Array.isArray(answer) || answer.length !== questions[index].options.length
      : answer === -1);
    if (missing !== -1) {
      this.setData({ currentQuestionIndex: missing });
      this.updateQuestion();
      wx.showToast({ title: '还有题目未完成', icon: 'none' });
      return;
    }
    this.setData({ submitting: true, revealingResult: true, rankingSaveError: '' });
    try {
      const result = scoreTest(this._test, questions, answers);
      const saved = archive.saveResult(Object.assign({
        testId: this.data.test.id, testVersion: TEST_VERSION, scoringVersion: SCORING_VERSION,
        lifeContext: this._lifeContext || undefined,
        // Store canonical question IDs because SBTI question order is shuffled.
        answers: questions.map((question, index) => question.type === 'ranking'
          ? {
              questionId: question.id,
              ranking: answers[index].map(optionIndex => String(question.options[optionIndex].id || question.options[optionIndex].value))
            }
          : { questionId: question.id, optionIndex: answers[index] })
      }, result));
      this.setData({ submitted: true });
      report(EVENTS.TEST_SUBMIT, { testId: saved.testId, resultType: saved.resultType, unanswered: 0 });
      this._revealTimer = setTimeout(() => {
        this._revealTimer = null;
        if (this._unloaded) return;
        wx.redirectTo({
          url: `/packages/reports/index?id=${encodeURIComponent(saved.testId)}&recordId=${encodeURIComponent(saved.id)}`,
          fail: () => wx.showModal({
            title: '报告已保存', content: '页面暂时未能打开，可以在“我的档案”查看这次记录。',
            showCancel: false, success: () => wx.switchTab({ url: '/pages/user-center/index' })
          })
        });
      }, 1100);
    } catch (error) {
      const message = error.message || '请检查设备存储空间后重试，本次答案仍保留在页面中。';
      const rankingSaveError = this.data.interactionType === 'ranking' ? '报告还没有保存，顺序已为你保留。' : '';
      this.setData({ submitting: false, revealingResult: false, rankingSaveError });
      if (rankingSaveError) wx.showToast({ title: '保存未完成，可直接重试', icon: 'none' });
      else wx.showModal({ title: '暂时无法保存', content: message, showCancel: false });
    }
  },
  retryRanking() {
    if (!this.data.rankingSaveError || this.data.submitting || this.data.submitted) return;
    this.submitTest();
  },
  calculateScores() {
    return scoreTest(this._test, this._questions || [], this._answers || []).scores;
  },
  goToHome() { wx.switchTab({ url: '/pages/test-hall/index' }); }
});
