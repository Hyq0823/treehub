const test = require('node:test');
const assert = require('node:assert/strict');
const { catalog, resultTitles, treeAssociations } = require('../data/test-catalog.js');
const { SPECIES } = require('../data/trees.js');
const { getTree } = require('../utils/personality-tree.js');

function profileRecord(testId, resultType, overrides = {}) {
  const association = treeAssociations[testId];
  return Object.assign({
    testId, resultType, scoringVersion: '2',
    scores: Object.fromEntries(association.dimensions.map(id => [id, association.minimum]))
  }, overrides);
}

function treeFor(records) { return getTree({ seed: 'new-test-growth', records }, catalog); }

test('new result identities grow different tree species from lightweight metadata', () => {
  const validSpecies = new Set(SPECIES.map(item => item.id));
  for (const [testId, association] of Object.entries(treeAssociations)) {
    assert.ok(catalog.some(item => item.id === testId));
    assert.deepEqual(Object.keys(association.results).sort(), Object.keys(resultTitles[testId]).sort());
    for (const [resultType, speciesId] of Object.entries(association.results)) {
      assert.ok(validSpecies.has(speciesId));
      const tree = treeFor([profileRecord(testId, resultType)]);
      assert.equal(tree.speciesId, speciesId, `${testId}:${resultType}`);
      assert.equal(tree.stage.id, 'sprout');
      assert.equal(tree.evidence.length, 1);
      assert.match(tree.evidence[0], /趣味视觉对应/);
    }
  }
});

test('new summaries with invalid or legacy dimension scores add history without inferring a tree', () => {
  for (const [testId, association] of Object.entries(treeAssociations)) {
    const resultType = Object.keys(association.results)[0];
    const correct = profileRecord(testId, resultType);
    const missing = Object.assign({}, correct.scores);
    delete missing[association.dimensions[0]];
    const invalidRecords = [
      profileRecord(testId, resultType, { scoringVersion: 'legacy' }),
      profileRecord(testId, resultType, { scores: missing }),
      profileRecord(testId, resultType, { scores: Object.assign({}, correct.scores, { surprise: 4 }) }),
      profileRecord(testId, resultType, { scores: Object.assign({}, correct.scores, { [association.dimensions[0]]: association.maximum + 1 }) }),
      profileRecord(testId, 'toString'),
      profileRecord(testId, 'unknown')
    ];
    for (const record of invalidRecords) {
      const tree = treeFor([record]);
      assert.equal(tree.speciesId, 'seed');
      assert.equal(tree.stage.id, 'sprout');
      assert.deepEqual(tree.evidence, []);
    }
  }
});

test('repeating a new test changes its tree signal without awarding another growth level', () => {
  const first = profileRecord('lifepath', 'track');
  const recent = profileRecord('lifepath', 'wild');
  const tree = treeFor([recent, first]);
  assert.equal(tree.speciesId, 'maple');
  assert.equal(tree.uniqueCount, 1);
  assert.equal(tree.totalCount, 2);
  assert.equal(tree.evidence.length, 1);
});

test('lightweight tree guards stay aligned with the actual new questionnaires', async () => {
  const { default: full } = await import('../data/tests/index.js');
  for (const [testId, association] of Object.entries(treeAssociations)) {
    const questionnaire = full.find(item => item.id === testId);
    assert.ok(questionnaire);
    assert.deepEqual(association.dimensions.slice().sort(), questionnaire.scoring.dimensions.slice().sort());
    assert.deepEqual(Object.keys(association.results).sort(), questionnaire.reports.map(item => item.type).sort());
    for (const id of association.dimensions) {
      const mappings = questionnaire.scoring.mapping.filter(item => item.dim === id);
      const endpoints = mappings.map(mapping => {
        const question = questionnaire.questions.find(item => String(item.id) === String(mapping.q));
        const values = question.options.map(option => Number(option.value) * (mapping.direction === -1 ? -1 : 1));
        return [Math.min(...values), Math.max(...values)];
      });
      assert.equal(endpoints.reduce((sum, item) => sum + item[0], 0), association.minimum);
      assert.equal(endpoints.reduce((sum, item) => sum + item[1], 0), association.maximum);
    }
  }
});
