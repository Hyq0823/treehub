// Configuration-driven light quizzes. Positions describe self-reported
// preferences; prototype distance is never exposed as accuracy or probability.
const key = id => String(id).replace(/^q/, '');

function fail() { throw new Error('探索评分配置或记录无效，请重新进入测试'); }

function rangesFor(test) {
  const scoring = test && test.scoring;
  if (!scoring || !Array.isArray(scoring.dimensions) || !scoring.dimensions.length ||
      new Set(scoring.dimensions).size !== scoring.dimensions.length ||
      !Array.isArray(scoring.mapping) || scoring.mapping.length !== test.questions.length) fail();
  const questions = new Map(test.questions.map(question => [key(question.id), question]));
  if (questions.size !== test.questions.length) fail();
  const ranges = Object.fromEntries(scoring.dimensions.map(id => [id, { min: 0, max: 0, totals: new Set([0]), count: 0 }]));
  const mapped = new Set();
  scoring.mapping.forEach(item => {
    const question = questions.get(key(item.q));
    const range = ranges[item.dim];
    if (!question || !range || mapped.has(key(item.q)) || !Array.isArray(question.options) || question.options.length < 2) fail();
    mapped.add(key(item.q));
    const values = question.options.map(option => Number(option.value) * (item.direction === -1 ? -1 : 1));
    if (values.some(value => !Number.isInteger(value) || Math.abs(value) > 10)) fail();
    range.min += Math.min(...values);
    range.max += Math.max(...values);
    range.count++;
    const totals = new Set();
    range.totals.forEach(total => values.forEach(value => totals.add(total + value)));
    if (totals.size > 10000) fail();
    range.totals = totals;
  });
  if (Object.values(ranges).some(range => !range.count || range.min === range.max)) fail();
  return ranges;
}

function profileDimensions(test, scores) {
  const ranges = rangesFor(test);
  const ids = test.scoring.dimensions;
  const meta = test.scoring.dimensionMeta;
  if (!scores || Object.keys(scores).length !== ids.length || Object.keys(scores).some(id => !ids.includes(id)) ||
      !Array.isArray(meta) || meta.length !== ids.length || new Set(meta.map(item => item.id)).size !== ids.length) fail();
  return ids.map(id => {
    const range = ranges[id];
    const labels = meta.find(item => item.id === id);
    if (!labels || !labels.label || !labels.left || !labels.right || !range.totals.has(scores[id])) fail();
    const percent = Math.round((scores[id] - range.min) / (range.max - range.min) * 100);
    return {
      id, label: labels.label, left: labels.left, right: labels.right, percent,
      scoreText: `${percent}%`,
      detail: `本次自评位置 ${percent} / 100，左端为「${labels.left}」，右端为「${labels.right}」。`,
      summary: percent > 60 ? `这次更靠近「${labels.right}」。` : percent < 40
        ? `这次更靠近「${labels.left}」。` : '本次处于中间区域，可能随具体情境调整。'
    };
  });
}

function matchProfile(test, scores) {
  const dimensions = profileDimensions(test, scores);
  const profiles = test.scoring.profiles;
  if (!Array.isArray(profiles) || !profiles.length || new Set(profiles.map(item => item.type)).size !== profiles.length) fail();
  const distances = profiles.map(profile => {
    const vector = profile.vector;
    if (!profile.type || !vector || Object.keys(vector).length !== dimensions.length) fail();
    let distance = 0;
    dimensions.forEach(item => {
      const value = vector[item.id];
      if (!Number.isFinite(value) || value < 0 || value > 100) fail();
      distance += (item.percent - value) ** 2;
    });
    return { type: profile.type, distance };
  });
  const minimum = Math.min(...distances.map(item => item.distance));
  const ties = distances.filter(item => item.distance === minimum).map(item => item.type);
  return { type: ties[0], ties, dimensions };
}

function scoreProfile(test, questions, answers) {
  rangesFor(test);
  const canonical = new Map(test.questions.map(question => [key(question.id), question]));
  const selections = new Map();
  questions.forEach((question, index) => {
    const original = canonical.get(key(question.id));
    const answer = answers[index];
    if (!original || selections.has(key(question.id)) || !Number.isInteger(answer) || answer < 0 ||
        !original.options[answer] || question.options.length !== original.options.length ||
        question.options.some((option, i) => option.value !== original.options[i].value)) fail();
    selections.set(key(question.id), original.options[answer]);
  });
  if (selections.size !== canonical.size) fail();
  const scores = Object.fromEntries(test.scoring.dimensions.map(id => [id, 0]));
  test.scoring.mapping.forEach(item => {
    scores[item.dim] += Number(selections.get(key(item.q)).value) * (item.direction === -1 ? -1 : 1);
  });
  return { scores, resultType: matchProfile(test, scores).type };
}

function resolveProfileVersion(test, version) {
  const requested = version || '1';
  if (!test || !test.scoring || test.scoring.strategy !== 'profile' || typeof requested !== 'string') return null;
  if ((test.testVersion || '1') === requested) return test;
  const versions = test.retainedVersions;
  if (!versions || !Object.prototype.hasOwnProperty.call(versions, requested)) return null;
  const retained = versions[requested];
  return retained && retained.id === test.id && retained.testVersion === requested &&
    retained.scoring && retained.scoring.strategy === 'profile' ? retained : null;
}

function createProfileTest(config) {
  const { dimensionMeta, profiles, retainedVersions, ...metadata } = config;
  const result = Object.assign({}, metadata, {
    testVersion: String(config.testVersion || '1'),
    questionsCount: config.questions.length,
    questions: config.questions.map(question => Object.assign({ type: 'single' }, question)),
    scoring: {
      strategy: 'profile',
      dimensions: dimensionMeta.map(item => item.id), dimensionMeta,
      mapping: config.questions.map(question => ({ q: question.id, dim: question.dim, direction: question.direction === -1 ? -1 : 1 })),
      profiles: profiles.map(profile => ({ type: profile.type, vector: profile.vector }))
    },
    reports: profiles.map(({ vector, ...report }) => report)
  });
  if (retainedVersions !== undefined) {
    if (!retainedVersions || typeof retainedVersions !== 'object' || Array.isArray(retainedVersions)) fail();
    const versions = Object.create(null);
    Object.keys(retainedVersions).forEach(version => {
      const retained = retainedVersions[version];
      if (version === result.testVersion || !retained || retained.id !== result.id ||
          retained.testVersion !== version || !retained.scoring || retained.scoring.strategy !== 'profile') fail();
      versions[version] = retained;
    });
    result.retainedVersions = versions;
  }
  result.scoring.resultRule = scores => matchProfile(result, scores).type;
  rangesFor(result);
  // Validate every prototype and label once when the questionnaire is loaded.
  const middle = Object.fromEntries(Object.entries(rangesFor(result)).map(([id, range]) => [id, Array.from(range.totals)[Math.floor(range.totals.size / 2)]]));
  matchProfile(result, middle);
  return result;
}

module.exports = { createProfileTest, scoreProfile, matchProfile, profileDimensions, resolveProfileVersion };
