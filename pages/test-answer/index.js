Page({
  data: {
    test: {},
    questions: [],
    currentQuestionIndex: 0,
    selectedOption: -1,
    answers: []
  },
  onLoad(options) {
    const testId = options.id;
    this.loadTestData(testId);
  },
  loadTestData(testId) {
    try {
      // 尝试直接导入测试数据
      const tests = require('../../data/tests/index.js');
      // 处理不同的导出格式
      const testList = tests.default || tests;
      const test = testList.find(t => t.id === testId);
      
      if (test) {
        let questions = test.questions;
        // 对SBTI测试的题目进行随机排序
        if (testId === 'sbti') {
          questions = this.shuffleArray([...questions]);
        }
        
        this.setData({
          test: test,
          questions: questions,
          answers: new Array(questions.length).fill(-1)
        });
        this.updateQuestion();
      } else {
        console.error('Test not found:', testId);
        wx.showToast({
          title: '测试数据加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('Error loading test data:', error);
      wx.showToast({
        title: '数据加载错误',
        icon: 'none'
      });
    }
  },
  // 随机打乱数组
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },
  updateQuestion() {
    const question = this.data.questions[this.data.currentQuestionIndex];
    const selectedOption = this.data.answers[this.data.currentQuestionIndex];
    this.setData({
      question: question,
      selectedOption: selectedOption
    });
  },
  selectOption(e) {
    const index = e.currentTarget.dataset.index;
    const answers = this.data.answers;
    answers[this.data.currentQuestionIndex] = index;
    this.setData({
      selectedOption: index,
      answers: answers
    });
    
    // 延迟300ms后自动跳转到下一题
    setTimeout(() => {
      this.nextQuestion(true);
    }, 300);
  },
  prevQuestion() {
    if (this.data.currentQuestionIndex > 0) {
      this.setData({
        currentQuestionIndex: this.data.currentQuestionIndex - 1
      });
      this.updateQuestion();
    }
  },
  nextQuestion(isAuto = false) {
    if (!isAuto && this.data.selectedOption === -1) {
      wx.showToast({
        title: '请选择答案',
        icon: 'none'
      });
      return;
    }
    
    if (this.data.currentQuestionIndex < this.data.test.questionsCount - 1) {
      this.setData({
        currentQuestionIndex: this.data.currentQuestionIndex + 1
      });
      this.updateQuestion();
      // 在更新问题后，重置选中状态
      setTimeout(() => {
        this.setData({
          selectedOption: -1
        });
      }, 100);
    } else {
      this.submitTest();
    }
  },
  submitTest() {
    // 计算分数
    const scores = this.calculateScores();
    // 获取结果类型
    const resultType = this.data.test.scoring.resultRule(scores);
    // 保存结果
    wx.setStorageSync('testResult', {
      testId: this.data.test.id,
      scores: scores,
      resultType: resultType
    });
    // 跳转到结果页
    wx.navigateTo({
      url: `/pages/test-result/index?id=${this.data.test.id}`
    });
  },
  calculateScores() {
    const scores = {};
    const mapping = this.data.test.scoring.mapping;
    const questions = this.data.questions;
    const answers = this.data.answers;
    
    mapping.forEach(item => {
      // 找到对应id的问题索引
      const questionId = `q${item.q}`;
      const qIndex = questions.findIndex(q => q.id === questionId);
      
      if (qIndex !== -1) {
        const dim = item.dim;
        const direction = item.direction;
        const selectedAnswer = answers[qIndex];
        
        if (selectedAnswer !== -1) {
          const option = questions[qIndex].options[selectedAnswer];
          if (option && option.value) {
            const value = option.value;
            
            if (!scores[dim]) {
              scores[dim] = 0;
            }
            
            if (typeof value === 'number') {
              scores[dim] += value * direction;
            } else if (value === 'E' || value === 'S' || value === 'T' || value === 'J') {
              scores[dim] += 1 * direction;
            } else if (value === 'I' || value === 'N' || value === 'F' || value === 'P') {
              scores[dim] -= 1 * direction;
            }
          }
        }
      }
    });
    
    return scores;
  }
})