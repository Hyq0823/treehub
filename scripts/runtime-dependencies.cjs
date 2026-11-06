const fs = require('node:fs');
const path = require('node:path');

// Read literal dependencies without executing application code. Quoted text and
// comments are tokens so examples inside them are not mistaken for imports.
function dependencies(source) {
  const tokens = [...source.matchAll(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[$A-Z_a-z][$\w]*|[(){};.,*]/g)]
    .map(match => match[0]).filter(token => !token.startsWith('//') && !token.startsWith('/*'));
  const result = new Set();
  const literal = token => token && /^(?:"|'|`)/.test(token);
  const add = token => {
    if (!literal(token)) return;
    const value = token.slice(1, -1);
    if (/^\.{1,2}\//.test(value)) result.add(value);
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === 'require' && tokens[index - 1] !== '.' && tokens[index + 1] === '(' && tokens[index + 3] === ')') add(tokens[index + 2]);
    if (token !== 'import' && token !== 'export') continue;
    if (token === 'import' && literal(tokens[index + 1])) add(tokens[index + 1]);
    else if (token === 'import' && tokens[index + 1] === '(' && tokens[index + 3] === ')') add(tokens[index + 2]);
    else {
      for (let next = index + 1; next < tokens.length; next++) {
        if ([';', 'import', 'export'].includes(tokens[next])) break;
        if (tokens[next] === 'from' && literal(tokens[next + 1])) { add(tokens[next + 1]); break; }
      }
    }
  }
  return [...result];
}

function validateRuntimeDependencies(directory) {
  const root = path.resolve(directory);
  const issues = [], scripts = [], configs = [], seenScripts = new Set(), seenConfigs = new Set();
  const relative = file => path.relative(root, file).split(path.sep).join('/');
  const inside = file => file === root || !path.relative(root, file).startsWith('..' + path.sep) && path.relative(root, file) !== '..';
  const isFile = file => { try { return fs.statSync(file).isFile(); } catch (error) { return false; } };
  function readConfig(file, required) {
    if (seenConfigs.has(file)) return null;
    seenConfigs.add(file);
    if (!isFile(file)) {
      if (required) issues.push(`缺少运行配置：${relative(file)}`);
      return null;
    }
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { issues.push(`运行配置无法解析：${relative(file)}`); return null; }
  }
  function componentPaths(config, file) {
    for (const specifier of Object.values(config.usingComponents || {})) {
      if (typeof specifier !== 'string' || !/^[./]/.test(specifier)) continue;
      const base = specifier.startsWith('/') ? path.resolve(root, '.' + specifier) : path.resolve(path.dirname(file), specifier);
      if (!inside(base)) { issues.push(`组件路径越出小程序目录：${relative(file)} → ${specifier}`); continue; }
      scripts.push(base + '.js');
      configs.push(base + '.json');
    }
  }
  const appPath = path.join(root, 'app.json');
  const app = readConfig(appPath, true);
  if (!app) return issues;
  scripts.push(path.join(root, 'app.js'));
  const routes = [...(app.pages || [])];
  for (const group of app.subPackages || app.subpackages || []) {
    for (const route of group.pages || []) routes.push(path.posix.join(group.root, route));
  }
  for (const route of routes) {
    const base = path.resolve(root, route);
    if (!inside(base)) { issues.push(`页面路径越出小程序目录：${route}`); continue; }
    scripts.push(base + '.js');
    configs.push(base + '.json');
  }
  if (app.tabBar && app.tabBar.custom) {
    scripts.push(path.join(root, 'custom-tab-bar/index.js'));
    configs.push(path.join(root, 'custom-tab-bar/index.json'));
  }
  componentPaths(app, appPath);
  while (configs.length) {
    const file = configs.shift();
    const config = readConfig(file, false);
    if (config) componentPaths(config, file);
  }
  while (scripts.length) {
    const file = scripts.shift();
    if (seenScripts.has(file)) continue;
    seenScripts.add(file);
    if (!isFile(file)) { issues.push(`缺少运行脚本：${relative(file)}`); continue; }
    if (path.extname(file) !== '.js') continue;
    for (const specifier of dependencies(fs.readFileSync(file, 'utf8'))) {
      const base = path.resolve(path.dirname(file), specifier);
      if (!inside(base)) { issues.push(`依赖路径越出小程序目录：${relative(file)} → ${specifier}`); continue; }
      const candidates = path.extname(base) ? [base] : [base, base + '.js', base + '.json', path.join(base, 'index.js'), path.join(base, 'index.json')];
      const resolved = candidates.find(isFile);
      if (!resolved) issues.push(`缺少运行依赖：${relative(file)} → ${specifier}`);
      else scripts.push(resolved);
    }
  }
  return issues;
}

module.exports = { validateRuntimeDependencies };
