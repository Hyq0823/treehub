const test = require('node:test');
const assert = require('node:assert/strict');
const { createProfileTest, scoreProfile, matchProfile, profileDimensions } = require('../utils/profile-scoring.js');
const { scoreTest, resolveReport } = require('../utils/scoring.js');

function fixture() {
  return createProfileTest({
    id: 'sample', questions: [
      { id: 1, dim: 'a', text: 'A', options: [{ text: '低', value: 1 }, { text: '高', value: 4 }] },
      { id: 2, dim: 'a', text: 'B', options: [{ text: '高', value: 4 }, { text: '低', value: 1 }] },
      { id: 3, dim: 'b', text: 'C', options: [{ text: '低', value: 1 }, { text: '高', value: 4 }] }
    ],
    dimensionMeta: ['a', 'b'].map(id => ({ id, label: id, left: '低', right: '高' })),
    profiles: [
      { type: 'low', title: '低向意象', vector: { a: 0, b: 0 } },
      { type: 'high', title: '高向意象', vector: { a: 100, b: 100 } }
    ]
  });
}

test('profile scores use each item value and its dimension range, independent of question order', () => {
  const quiz = fixture();
  const expected = { scores: { a: 2, b: 1 }, resultType: 'low' };
  assert.deepEqual(scoreTest(quiz, quiz.questions, [0, 1, 0]), expected);
  assert.deepEqual(scoreProfile(quiz, quiz.questions.slice().reverse(), [0, 1, 0]), expected);
  const high = scoreTest(quiz, quiz.questions, [1, 0, 1]);
  assert.equal(high.resultType, 'high');
  assert.deepEqual(profileDimensions(quiz, high.scores).map(item => item.percent), [100, 100]);
  assert.deepEqual(profileDimensions(quiz, expected.scores).map(item => item.percent), [0, 0]);
});

test('profile restore rejects forged scores, unreachable sums, missing dimensions and mismatched labels', () => {
  const quiz = fixture();
  const record = { testId: quiz.id, scoringVersion: '2', scores: { a: 2, b: 1 }, resultType: 'low' };
  assert.ok(resolveReport(quiz, record));
  for (const patch of [
    { scores: { a: 3, b: 1 } }, { scores: { a: 2 } }, { scores: { a: 2, b: 1, unexpected: 1 } },
    { scores: { a: '2', b: 1 } }, { scores: { a: 99, b: 1 } }, { resultType: 'high' }, { scoringVersion: 'legacy' },
    { testVersion: 'unknown-future' }
  ]) assert.equal(resolveReport(quiz, { ...record, ...patch }), null);
  const mutated = structuredClone(quiz.questions);
  mutated[0].options[0].value = 9;
  assert.throws(() => scoreTest(quiz, mutated, [0, 1, 0]));
  assert.throws(() => scoreTest(quiz, [quiz.questions[0], quiz.questions[0], quiz.questions[2]], [0, 0, 0]));
});

// Solve each independent dimension as a tiny bounded sum. This checks that
// every published result can actually be reached by answering the real items.
function answersNearVector(quiz, vector) {
  const indices = quiz.questions.map(() => 0);
  quiz.scoring.dimensions.forEach(id => {
    const positions = quiz.questions.map((q, i) => q.dim === id ? i : -1).filter(i => i >= 0);
    let totals = new Map([[0, []]]);
    positions.forEach(index => {
      const next = new Map();
      totals.forEach((answers, total) => quiz.questions[index].options.forEach((option, answer) => {
        next.set(total + option.value, [...answers, answer]);
      }));
      totals = next;
    });
    const low = Math.min(...totals.keys());
    const high = Math.max(...totals.keys());
    const target = low + (high - low) * vector[id] / 100;
    const sum = [...totals.keys()].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    totals.get(sum).forEach((answer, i) => { indices[positions[i]] = answer; });
  });
  return indices;
}

test('every new quiz profile is reachable and restores with complete free dimensions', () => {
  const quizzes = require('../data/tests/index.js').default.filter(item => item.scoring.strategy === 'profile');
  assert.equal(quizzes.length, 3);
  for (const quiz of quizzes) {
    assert.ok(quiz.questions.length >= 10 && quiz.questions.length <= 12);
    for (const profile of quiz.scoring.profiles) {
      const scored = scoreTest(quiz, quiz.questions, answersNearVector(quiz, profile.vector));
      assert.equal(scored.resultType, profile.type, `${quiz.id}:${profile.type} must be reachable`);
      const report = resolveReport(quiz, { ...scored, testId: quiz.id, scoringVersion: '2' });
      assert.equal(report.dimensions.length, quiz.scoring.dimensions.length);
      assert.ok(report.dimensions.every(item => item.percent >= 0 && item.percent <= 100));
      assert.equal(report.image, undefined, 'no local business artwork is introduced');
      assert.ok(report.tagline && report.advice);
    }
  }
});

test('equal prototype distance is deterministic and explicitly disclosed on restored reports', () => {
  const quiz = fixture();
  quiz.scoring.profiles[1].vector = { a: 0, b: 0 };
  const match = matchProfile(quiz, { a: 2, b: 1 });
  assert.deepEqual(match.ties, ['low', 'high']);
  const report = resolveReport(quiz, { testId: quiz.id, scoringVersion: '2', scores: { a: 2, b: 1 }, resultType: 'low' });
  assert.match(report.note, /多个意象同样接近/);
});

test('a flat talent self-rating describes multiple interests rather than a sole advantage', () => {
  const quiz = require('../data/tests/index.js').default.find(item => item.id === 'hiddentalent');
  for (const value of [1, 2, 3, 4]) {
    const answers = quiz.questions.map(question => question.options.findIndex(option => option.value === value));
    const result = scoreTest(quiz, quiz.questions, answers);
    const report = resolveReport(quiz, { ...result, testId: quiz.id, scoringVersion: '2', testVersion: '1' });
    assert.match(report.summary, /暂时没有特别突出的单一方向/);
    assert.match(report.profileNotice, /不代表你的唯一优势/);
  }
});
