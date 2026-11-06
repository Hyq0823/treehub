#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 200000;
const MEDIA = /\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|aac|m4a|mp4)$/i;
const normalize = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');

// Diagnose local DevTools scans, including untracked files and authoring folders.
// This deliberately does not restrict traversal to the uploaded app package.
function scanMedia(directory) {
  const root = path.resolve(directory);
  const configPath = path.join(root, 'project.config.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  const ignores = config.packOptions && config.packOptions.ignore || [];
  const cloudRoot = normalize(config.cloudfunctionRoot);
  const under = (file, folder) => file === folder || file.startsWith(folder + '/');
  function exclusion(file) {
    if (cloudRoot && under(file, cloudRoot)) return '云函数目录';
    for (const item of ignores) {
      const value = normalize(item.value);
      if (!value) continue;
      const matches = item.type === 'folder' ? under(file, value) :
        item.type === 'file' ? file === value :
          item.type === 'suffix' ? file.endsWith(value) :
            item.type === 'prefix' ? file.startsWith(value) :
              item.type === 'regexp' ? new RegExp(item.value).test(file) : false;
      if (matches) return `packOptions.ignore: ${item.value}`;
    }
    return '';
  }
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') visit(target);
      } else if (entry.isFile() && MEDIA.test(entry.name)) {
        const relative = path.relative(root, target).split(path.sep).join('/');
        files.push({ path: relative, bytes: fs.statSync(target).size, excludedBy: exclusion(relative) });
      }
    }
  }
  visit(root);
  files.sort((first, second) => second.bytes - first.bytes || first.path.localeCompare(second.path));
  return { files, oversized: files.filter(file => file.bytes > MAX_BYTES) };
}

function main(args) {
  if (args.length && (args[0] !== '--root' || args.length !== 2)) throw new Error('用法：node scripts/check-media.cjs [--root 项目目录]');
  const result = scanMedia(args.length ? args[1] : path.resolve(__dirname, '..'));
  const describe = file => `${file.path} · ${file.bytes} bytes · ${file.excludedBy ? `已排除（${file.excludedBy}）` : '随包候选（未被打包配置排除）'}`;
  console.log(`本地媒体 ${result.files.length} 个；超过 ${MAX_BYTES} bytes：${result.oversized.length} 个。`);
  console.log('扫描包含未跟踪文件及被排除的本地目录；“已排除”资源仅用于定位本地扫描问题，不代表会上传。');
  console.log('最大的 5 个媒体文件：');
  result.files.slice(0, 5).forEach(file => console.log(describe(file)));
  if (result.oversized.length) {
    console.log('全部超限文件：');
    result.oversized.forEach(file => console.log(describe(file)));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`媒体扫描失败：${error.message}`); process.exitCode = 2; }
}

module.exports = { scanMedia };
