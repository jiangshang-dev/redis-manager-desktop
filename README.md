# Redis Manager Desktop

基于 **Vue 3 + TypeScript + Electron** 的 Redis 桌面客户端，风格贴近 Redis 官方红色主题。

## 功能

- 同时管理多个 Redis 服务，连接配置保存在本地，密码使用系统安全存储加密
- Key 按分隔符（默认 `:`）展示为树形文件夹，例如 `demo1:demo2:demo3`
- 勾选 Key / 文件夹后批量删除
- 支持 string、hash、list、set、zset、stream、RedisJSON
- 字符串和复合值可按 JSON 树查看
- 多种刷新：连接状态、数据库信息、全部 Key、当前文件夹、当前 Key、自动刷新
- 快捷键：`F5` 刷新全部 Key，`⌘/Ctrl + R` 刷新当前值

## 开发

```bash
cd /Users/xiaobai/DevEcoStudioProjects/redis-manager-desktop
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
npm run dev
```

## 打包

```bash
npm run build:mac
# 产物在 dist/，应用图标使用 build/icon.png
```

图标文件：

- `build/icon.png`：electron-builder 打包图标（Mac / Windows / Linux）
- `resources/icon.png`：运行时窗口 / Dock 图标
- `src/renderer/src/assets/logo.png`：界面左上角品牌图

## 使用说明

1. 点击「新建连接」，填写 Host / Port / 密码，可先「测试连接」再保存
2. 在左侧选择服务并连接，切换 db0、db1…
3. 中间树按 `namespace:folder:key` 分层展开
4. 勾选节点后点「批量删除」
5. 右侧用 JSON 结构 / 表格 / 原始文本查看值
