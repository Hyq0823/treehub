const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scanMedia } = require('../scripts/check-media.cjs');
const cli = path.resolve(__dirname, '../scripts/check-media.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'treehub-media-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const media = (name, bytes) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '');
    fs.truncateSync(target, bytes);
    return target;
  };
  fs.writeFileSync(path.join(root, 'project.config.json'), JSON.stringify({
    cloudfunctionRoot: 'cloudfunctions/', packOptions: { ignore: [{ type: 'folder', value: '.agents' }] }
  }));
  return { root, media };
}

test('local diagnostics include excluded and untracked oversized media with accurate package labels', t => {
  const { root, media } = fixture(t);
  media('assets/untracked.PNG', 200001);
  media('.agents/skills/example.webp', 250000);
  media('cloudfunctions/api/sample.mp4', 230000);
  media('assets/exact-limit.jpg', 200000);
  media('assets/not-media.txt', 400000);
  media('.git/cache.png', 300000);
  media('tools/node_modules/library/icon.png', 300000);
  const result = scanMedia(root);
  assert.equal(result.files.length, 4);
  assert.equal(result.oversized.length, 3);
  assert.equal(result.files.find(file => file.path === 'assets/untracked.PNG').excludedBy, '');
  assert.match(result.files.find(file => file.path.startsWith('.agents/')).excludedBy, /packOptions.ignore/);
  assert.equal(result.files.find(file => file.path.startsWith('cloudfunctions/')).excludedBy, '云函数目录');
  const run = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /全部超限文件/);
  for (const file of result.oversized) assert.ok(run.stdout.includes(file.path));
  assert.match(run.stdout, /不代表会上传/);
});

test('broken links and directory symlinks are skipped without scanning outside the project', t => {
  const { root, media } = fixture(t);
  media('assets/ok.webp', 100);
  try {
    fs.symlinkSync(path.join(root, 'missing.png'), path.join(root, 'broken.png'));
    fs.symlinkSync(root, path.join(root, 'recursive-directory'), 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('This system does not permit test symlinks.');
    throw error;
  }
  assert.deepEqual(scanMedia(root).files.map(file => file.path), ['assets/ok.webp']);
  const run = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('current repository media all remain within the local diagnostic size budget', () => {
  const result = scanMedia(path.resolve(__dirname, '..'));
  assert.ok(result.files.length > 0);
  assert.equal(result.oversized.length, 0, JSON.stringify(result.oversized));
});
