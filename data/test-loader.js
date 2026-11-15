// Literal requires let WeChat include every registered questionnaire while
// deferring its evaluation until that particular test is opened.
const loaders = {
  firstreaction: () => require('./tests/first-reaction.js'),
  cityvibe: () => require('./tests/city-vibe.js'),
  historicalecho: () => require('./tests/historical-echo.js'),
  lifepath: () => require('./tests/life-path.js'),
  hiddentalent: () => require('./tests/hidden-talent.js'),
  relationshiprhythm: () => require('./tests/relationship-rhythm.js'),
  gentleboundaries: () => require('./tests/gentle-boundaries.js'),
  emotionalrecharge: () => require('./tests/emotional-recharge.js'),
  sbti: () => require('./tests/sbti.js'),
  mbti: () => require('./tests/mbti.js'),
  enneagram: () => require('./tests/enneagram.js'),
  bigfive: () => require('./tests/bigfive.js'),
  shadow: () => require('./tests/shadow.js'),
  ie: () => require('./tests/ie.js')
};
const registeredIds = Object.freeze(Object.keys(loaders));
const cache = Object.create(null);

function getTest(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(loaders, id)) return null;
  if (Object.prototype.hasOwnProperty.call(cache, id)) return cache[id];
  const imported = loaders[id]();
  const test = imported && (imported.default || imported);
  if (!test || test.id !== id) throw new Error('测试配置不一致，请返回探索页重试。');
  cache[id] = test;
  return test;
}

module.exports = { getTest, registeredIds };
