# 智能家庭医药箱

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vitejs.dev)
[![GitHub Pages](https://img.shields.io/badge/Deployed-GitHub%20Pages-222.svg)](https://yifenqian1990-wq.github.io/Smart-Family-Medicine-Cabinet/)

AI 驱动的家庭药品管理应用：拍照识别药品、过期追踪、用药计划提醒、AI 健康助手问答，数据只存在你的浏览器本地。

🌐 **在线体验：https://yifenqian1990-wq.github.io/Smart-Family-Medicine-Cabinet/**

## ✨ 功能特性

- 📷 **拍照识药**：手机/电脑摄像头拍摄药盒，AI（OCR + 大模型）自动识别药品名称、规格、有效期
- ⏰ **过期追踪**：按过期时间排序展示，临期药品醒目提醒
- 👨‍👩‍👧 **家庭成员档案**：为每位家人建档，药品与用药计划按人管理
- 💊 **用药计划**：制定服药计划并记录服药历史
- 🤖 **AI 健康助手**：基于你的药箱存量进行问答咨询，支持图片提问
- 🔑 **多 Key 管理**：支持配置多个 API Key 并一键切换
- 💾 **数据自主**：默认存浏览器本地（localStorage + IndexedDB），也可连接本地文件实现跨设备同步；自托管后端（`server.ts`）可选

## 🚀 快速开始（本地运行）

```bash
git clone https://github.com/yifenqian1990-wq/Smart-Family-Medicine-Cabinet.git
cd Smart-Family-Medicine-Cabinet
npm install

# 方式一：纯前端模式（推荐）
npx vite build       # 构建
npx vite preview     # 预览，或直接用任意静态服务器托管 dist/

# 方式二：前后端一体（解锁服务器同步）
npm run dev          # http://localhost:3000，数据同步到服务器端药品.json
```

> 说明：网页版默认使用浏览器本地存储，全部功能可用；"连接服务器"为自托管高级功能，需要本地运行 `npm run dev` 或 `node dist/server.cjs`。

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| AI 能力 | @google/genai（OCR 识别、健康问答）|
| 数据存储 | localStorage + IndexedDB（本地），File System Access API（本地文件同步）|
| 可选后端 | Express（server.ts，仅服务器同步模式用）|
| 部署 | GitHub Pages（自动） |

## 📦 部署

本仓库已配置 GitHub Actions，推送到 `main` 分支后自动构建并发布到 GitHub Pages，无需手动操作。

想部署到自己的账号：Fork 本仓库 → Settings → Pages → Source 选择 `GitHub Actions`，推送即生效。

## ❓ FAQ

**Q: 需要 API Key 吗？**
A: 拍照识药和 AI 问答需要。在应用内的设置里添加自己的 Gemini API Key，Key 只保存在你的浏览器本地。

**Q: 我的药品数据会上传吗？**
A: 不会。默认全部存在浏览器本地；除非你主动使用"连接服务器"并自己搭建了后端。

**Q: 手机能用吗？**
A: 能。PWA 友好的响应式界面，手机浏览器打开即可拍照识药（需允许摄像头权限）。

**Q: 网页版点"连接服务器"报错？**
A: 那是自托管功能，GitHub Pages 纯静态环境没有后端。日常使用不需要它，本地数据模式已包含全部核心功能。

## 📄 许可证

本项目采用 [MIT](LICENSE) 许可证开源。

## ⚠️ 免责声明

本应用的 AI 健康助手回答仅供参考，不构成医疗建议。用药请遵医嘱，紧急情况请及时就医。
