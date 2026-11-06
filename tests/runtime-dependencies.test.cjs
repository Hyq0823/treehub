const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateRuntimeDependencies } = require('../scripts/runtime-dependencies.cjs');

function fixture(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'treehub-dependencies-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  write('app.json', { pages: ['pages/home/index'] });
  write('app.js', 'App({});');
  write('pages/home/index.js', 'Page({});');
  Object.entries(files).forEach(([name, value]) => write(name, value));
  return { root, write };
}

test('runtime graph finds a missing test imported by the catalog without scanning authoring files', t => {
  const { root } = fixture(t, {
    'pages/home/index.js': "require('../../data/tests/index.js');",
    'data/tests/index.js': "import bear from './yierbubu.js'; export default [bear];",
    '.agents/skills/minitool-zip-builder/helper.js': "require('./references/cross-platform-h5.md');",
    'scripts/non-runtime.js': "require('./absent-build-script.js');",
    'data/tests/unused.js': "import './absent-unused-test.js';",
    'cloudfunctions/api/index.js': "require('./missing-server-sdk.js');"
  });
  assert.deepEqual(validateRuntimeDependencies(root), ['缺少运行依赖：data/tests/index.js → ./yierbubu.js']);
});

test('runtime graph follows side effects, re-exports, extensionless modules and JSON without executing them', t => {
  const { root } = fixture(t, {
    'app.js': "import './utils/setup'; throw new Error('must never execute');",
    'utils/setup.js': "export { ready } from './ready/index.js';",
    'utils/ready/index.js': "const config = require('../../config/settings'); module.exports = config;",
    'config/settings.json': { enabled: true }
  });
  assert.deepEqual(validateRuntimeDependencies(root), []);
});

test('registered subpackages, global components, nested components and custom tabs are runtime entries', t => {
  const { root } = fixture(t, {
    'app.json': {
      pages: ['pages/home/index'], subPackages: [{ root: 'packages/report', pages: ['index'] }],
      usingComponents: { world: '/components/world/index' }, tabBar: { custom: true }
    },
    'components/world/index.js': 'Component({});',
    'components/world/index.json': { usingComponents: { leaf: './leaf/index' } },
    'components/world/leaf/index.js': "import './missing-leaf.js';",
    'packages/report/index.js': "require('./missing-report.js');",
    'custom-tab-bar/index.js': "require('./missing-tab.js');"
  });
  assert.deepEqual(validateRuntimeDependencies(root).sort(), [
    '缺少运行依赖：components/world/leaf/index.js → ./missing-leaf.js',
    '缺少运行依赖：custom-tab-bar/index.js → ./missing-tab.js',
    '缺少运行依赖：packages/report/index.js → ./missing-report.js'
  ].sort());
});

test('examples in comments and quoted text do not become runtime dependencies', t => {
  const { root } = fixture(t, {
    'app.js': `// require('./absent-comment.js');\n/* import './absent-comment2.js'; */\nconst note = "require('./absent-string.js')";\nconst template = \`import './absent-template.js'\`;\nApp({});`
  });
  assert.deepEqual(validateRuntimeDependencies(root), []);
});

test('the current WeChat app has no missing runtime dependencies', () => {
  assert.deepEqual(validateRuntimeDependencies(path.resolve(__dirname, '..')), []);
});
