# 微信云开发部署

云环境：`cloud1-d2ghbskq3663254ce`

1. 在微信开发者工具打开“云开发”，确认当前环境为上面的环境 ID。
2. 在数据库中创建 `treehub_users` 和 `treehub_assessments` 两个集合。
3. 将两个集合的客户端权限设为“所有用户不可读写”。小程序只通过云函数访问，云函数会按 OpenID 隔离用户。
4. 右键 `cloudfunctions/treehub-api`，选择“上传并部署：云端安装依赖”。
5. 在 `treehub_assessments` 创建组合索引：`owner` 升序、`completedAt` 降序。

发布前使用两个微信账号分别完成测评，确认各自只能取回自己的档案；然后在同一微信账号的两台设备上确认历史、树种和 VIP 解锁状态能够合并。
