#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'minitool/src');
const output = path.join(root, 'minitool/dist');
const testIds = ['yierbubu', 'mbti', 'enneagram', 'bigfive', 'shadow', 'ie'];

function readDefaultExport(file) {
  const module = { exports: {} };
  const code = fs.readFileSync(file, 'utf8').replace(/^\s*export\s+default\s+/, 'module.exports = ');
  vm.runInNewContext(code, { module, exports: module.exports }, { filename: file });
  return module.exports;
}

function publicTest(test) {
  return JSON.parse(JSON.stringify(test, (key, value) => {
    if (typeof value === 'function' || key === 'image') return undefined;
    return value;
  }));
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
for (const name of ['index.html', 'style.css', 'app.js']) {
  fs.copyFileSync(path.join(source, name), path.join(output, name === 'index.html' ? name : `assets/${name}`));
}
fs.cpSync(path.join(source, 'assets'), path.join(output, 'assets'), { recursive: true });
const catalog = testIds.map(id => publicTest(readDefaultExport(path.join(root, `data/tests/${id}.js`))));
const themes = require(path.join(root, 'data/themes.js')).THEMES.map(theme => ({
  id: theme.id, name: theme.name, quote: theme.quote, description: theme.description,
  art: `./assets/themes/${theme.id}.webp`,
  color: theme.color, pale: theme.pale, accent: theme.accent, tags: theme.tags,
  starter: !!theme.starter, unlockTest: theme.unlockTest || '',
  requiredExplorations: theme.requiredExplorations || 0,
  companions: theme.companions.map(item => ({ name: item.name, emoji: item.emoji, line: item.line }))
}));
fs.writeFileSync(path.join(output, 'assets/catalog.js'),
  `window.MINITOOL_CATALOG=${JSON.stringify(catalog)};\nwindow.MINITOOL_THEMES=${JSON.stringify(themes)};\n`);
console.log(`MINITOOL_BUILD tests=${catalog.length} themes=${themes.length} output=${output}`);
