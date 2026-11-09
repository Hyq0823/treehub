#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { validateRuntimeDependencies } = require('./runtime-dependencies.cjs');
const issues = validateRuntimeDependencies(root);
const assets = require('../config/theme-assets.js');
const localTestAssets = path.join(root, 'assets/tests');
if (fs.existsSync(localTestAssets) && fs.readdirSync(localTestAssets, { recursive: true }).some(name =>
  /\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|aac|m4a|mp4)$/i.test(name))) {
  issues.push('测试业务素材必须放在 public/v2 云目录，禁止打进本地代码包');
}
if (!/^v[1-9]\d*$/.test(assets.assetRelease || '')) issues.push('主题素材缺少有效的独立发布版本');
for (const [id, fileId] of Object.entries(assets.files)) {
  if (typeof fileId !== 'string' || !fileId.startsWith(`cloud://${assets.environmentId}.`) ||
      !fileId.endsWith(`/themes/${assets.assetRelease}/${id}.webp`)) {
    issues.push(`素材 ${id} 尚未配置 themes/${assets.assetRelease} 的云文件 ID`);
  }
}
const policyPath = path.join(root, 'config/privacy.js');
if (!fs.existsSync(policyPath)) issues.push('缺少隐私政策运营者配置');
else {
  const loaded = require(policyPath);
  const policy = loaded.POLICY_CONFIG || loaded;
  const apiSource = fs.readFileSync(path.join(root, 'cloudfunctions/treehub-api/index.js'), 'utf8');
  const apiVersion = apiSource.match(/const POLICY_VERSION = '([^']+)'/);
  if (!apiVersion || apiVersion[1] !== policy.policyVersion) issues.push('客户端与云函数隐私政策版本不一致');
}
if (issues.length) { console.error('发布前必须完成：\n' + issues.map(item => '- ' + item).join('\n')); process.exitCode = 1; }
else console.log('Static release configuration passed. Complete the WeChat console checklist before publishing.');
