const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'data/test-loader.js');

function instrumentLoader(style = 'esm') {
  const requested = [];
  const value = { id: 'ie', questions: [{ id: 1 }] };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports,
    require(specifier) {
      requested.push(specifier);
      assert.equal(specifier, './tests/ie.js', 'opening one test must not ask for another questionnaire');
      return style === 'esm' ? { default: value } : value;
    }
  }, { filename: file });
  return { loader: module.exports, requested, value };
}

test('loader initially evaluates no questionnaires, then requests only the selected static module once', () => {
  const { loader, requested, value } = instrumentLoader();
  assert.deepEqual(requested, []);
  assert.equal(loader.getTest('ie'), value);
  assert.equal(loader.getTest('ie'), value);
  assert.deepEqual(requested, ['./tests/ie.js']);
});

test('loader also accepts WeChat CommonJS exports without an ESM default wrapper', () => {
  const { loader, requested, value } = instrumentLoader('cjs');
  assert.equal(loader.getTest('ie'), value);
  assert.deepEqual(requested, ['./tests/ie.js']);
});

test('unknown IDs, traversal and inherited properties cannot trigger a module load', () => {
  const { loader, requested } = instrumentLoader();
  for (const id of ['unknown', '__proto__', 'constructor', 'toString', '../tests/ie', 'ie.js', '', null, undefined, {}, []]) {
    assert.equal(loader.getTest(id), null);
  }
  assert.deepEqual(requested, []);
});

test('lazy registration stays aligned with the lightweight catalog and literal files', () => {
  const { registeredIds } = require('../data/test-loader.js');
  const { catalog } = require('../data/test-catalog.js');
  assert.deepEqual(registeredIds.slice().sort(), catalog.map(item => item.id).sort());
  const { dependencies } = require('../scripts/runtime-dependencies.cjs');
  const files = dependencies(fs.readFileSync(file, 'utf8'));
  assert.equal(files.length, registeredIds.length);
  assert.ok(files.every(specifier => /^\.\/tests\/[a-z-]+\.js$/.test(specifier)));
  files.forEach(specifier => assert.ok(fs.existsSync(path.resolve(path.dirname(file), specifier)), specifier));
});

test('a fresh process opens a single real questionnaire without evaluating the all-test index', () => {
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const index = require.resolve('./data/tests/index.js');
    const loader = require('./data/test-loader.js');
    assert.equal(require.cache[index], undefined);
    const selected = loader.getTest('ie');
    assert.equal(selected.id, 'ie');
    assert.equal(selected.questions.length, 15);
    assert.equal(loader.getTest('ie'), selected);
    assert.equal(require.cache[index], undefined);
    console.log(JSON.stringify({ id: selected.id, count: selected.questions.length }));
  `], { cwd: root, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.trim()), { id: 'ie', count: 15 });
});

test('runtime consumers use lazy selection and exclude the developer-only all-test index from the package', () => {
  for (const name of ['pages/test-detail/index.js', 'pages/test-answer/index.js', 'packages/reports/index.js', 'utils/archive.js']) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert.equal(source.includes('data/tests/index.js'), false, name);
    assert.match(source, /require\('[^']*data\/test-loader\.js'\)\.getTest\(/, name);
  }
  const project = require('../project.config.json');
  assert.ok(project.packOptions.ignore.some(item => item.type === 'file' && item.value === 'data/tests/index.js'));
});
