# 小红书小工具版

这是人格测试树的离线 H5 小工具实现，独立于微信小程序运行。当前包含“一二 / 布布”原创熊熊趣味测试、五套正式量表、九套主题原画、首测主题、主题图鉴、本地年轮、结果图片、保存相册和发布笔记入口。

## 构建

```bash
node minitool/scripts/build.cjs
node .agents/skills/minitool-zip-builder/scripts/write_manifest.mjs minitool/dist false
```

Windows PowerShell 可一键构建、生成 manifest、使用正斜杠路径打包并审计：

```powershell
powershell -ExecutionPolicy Bypass -File .\minitool\scripts\package.ps1
```

`dist/` 是待打包目录，入口 `index.html` 位于根目录。代码没有 Worker、OffscreenCanvas、WebAssembly、Unity 或 Cocos，因此 `mini_tool.json` 标记为非高消耗场景。

## 校验

```bash
node .agents/skills/minitool-zip-builder/scripts/audit_artifact.mjs minitool/dist
python3 .agents/skills/minitool-zip-builder/scripts/audit_artifact.py minitool/dist
```

在线规范已于 2026-11-05 从 `https://miniapp-sandbox.xiaohongshu.com/minitool/doc` 获取并与 Skill 随包基线比较，文档 SHA-256 为 `edce947ae9551c9b7143b068a55322c2563c212249bca1d14af8ba97b414bca3`。

## 数据与能力

- 测试记录优先使用 `window.xhs.miniTool` Storage API，本地不可用时降级到 `localStorage`。
- 不采集微信身份、小红书昵称、精确位置、通讯录或设备传感器数据。
- 页面不直接联网，题库、样式和脚本全部随 ZIP 打包。
- 保存与发布由用户主动点击触发，发布页打开不表示内容已发布或审核通过。
- 结果用于自我探索，不作心理诊断。

浏览器检查只能验证 H5 布局与逻辑，交付后仍需在创服平台模拟器、Android 真机和 iOS 真机验证同一 ZIP。
