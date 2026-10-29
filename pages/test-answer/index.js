const { report, EVENTS } = require('../../utils/track.js');
const { scoreTest, SCORING_VERSION, TEST_VERSION } = require('../../utils/scoring.js');
const archive = require('../../utils/archive.js');

Page({
  data: {
    test: {}, questions: [], currentQuestionIndex: 0, selectedOption: -1,
    answers: [], submitted: false, submitting: false, error: ''
  },
  onLoad(options) {
    this._unloaded = false;
    report(EVENTS.TEST_START, { testId: options.id });
    this.loadTestData(options.id);
  },
  onUnload() {
    this._unloaded = true;
    this.clearAdvance();
    if (!this.data.submitted && this.data.test.id) {
      report(EVENTS.TEST_ABORT, {
        testId: this.data.test.id, reachedIndex: this.data.currentQuestionIndex,
        totalCount: this.data.questions.length
      });
    }
  },
  clearAdvance() {
    if (this._advanceTimer) clearTimeout(this._advanceTimer);
    this._advanceTimer = null;
  },
  loadTestData(testId) {
    try {
      const imported = require('../../data/tests/index.js');
      const test = (imported.default || imported).find(item => item.id === testId);
      if (!test) throw new Error('没有找到这项测试，请返回大厅重新选择');
      this._test = test;
      const questions = testId === 'sbti' ? this.shuffleArray(test.questions.slice()) : test.questions;
      this.setData({ test: { id: test.id, name: test.name, questionsCount: test.questionsCount }, questions, answers: new Array(questions.length).fill(-1), error: '' });
      this.updateQuestion();
    } catch (error) {
      this.setData({ error: error.message || '测试加载失败，请返回大厅重试' });
    }
  },
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },
  updateQuestion() {
    const question = this.data.questions[this.data.currentQuestionIndex];
    this.setData({
      question: Object.assign({}, question, {
        options: question.options.map((option, index) => Object.assign({}, option, { letter: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index] }))
      }),
      selectedOption: this.data.answers[this.data.currentQuestionIndex]
    });
  },
  selectOption(event) {
    if (this.data.submitted || this.data.submitting) return;
    const index = Number(event.currentTarget.dataset.index);
    const current = this.data.currentQuestionIndex;
    if (!Number.isInteger(index) || !this.data.questions[current].options[index]) return;
    this.clearAdvance();
    const answers = this.data.answers.slice();
    answers[current] = index;
    this.setData({ selectedOption: index, answers });
    // Auto-advance only the question on which the tap occurred.
    this._advanceTimer = setTimeout(() => {
      this._advanceTimer = null;
      if (!this._unloaded && this.data.currentQuestionIndex === current) this.nextQuestion();
    }, 300);
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
    if (this.data.selectedOption === -1) {
      wx.showToast({ title: '请选择答案', icon: 'none' });
      return;
    }
    if (this.data.currentQuestionIndex < this.data.questions.length - 1) {
      this.setData({ currentQuestionIndex: this.data.currentQuestionIndex + 1 });
      this.updateQuestion();
    } else {
      this.submitTest();
    }
  },
  submitTest() {
    if (this.data.submitting || this.data.submitted) return;
    this.clearAdvance();
    const missing = this.data.answers.findIndex(answer => answer === -1);
    if (missing !== -1) {
      this.setData({ currentQuestionIndex: missing });
      this.updateQuestion();
      wx.showToast({ title: '还有题目未完成', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const result = scoreTest(this._test, this.data.questions, this.data.answers);
      const saved = archive.saveResult(Object.assign({
        testId: this.data.test.id, testVersion: TEST_VERSION, scoringVersion: SCORING_VERSION,
        // Store canonical question IDs because SBTI question order is shuffled.
        answers: this.data.questions.map((question, index) => ({ questionId: question.id, optionIndex: this.data.answers[index] }))
      }, result));
      this.setData({ submitted: true, submitting: false });
      report(EVENTS.TEST_SUBMIT, { testId: saved.testId, resultType: saved.resultType, unanswered: 0 });
      wx.redirectTo({
        url: `/pages/test-result/index?id=${encodeURIComponent(saved.testId)}&recordId=${encodeURIComponent(saved.id)}`,
        fail: () => wx.showModal({
          title: '报告已保存', content: '页面暂时未能打开，可以在“我的档案”查看这次记录。',
          showCancel: false, success: () => wx.switchTab({ url: '/pages/user-center/index' })
        })
      });
    } catch (error) {
      this.setData({ submitting: false });
      wx.showModal({ title: '暂时无法保存', content: error.message || '请检查设备存储空间后重试，本次答案仍保留在页面中。', showCancel: false });
    }
  },
  calculateScores() {
    return scoreTest(this._test, this.data.questions, this.data.answers).scores;
  },
  goToHome() { wx.switchTab({ url: '/pages/test-hall/index' }); }
});
