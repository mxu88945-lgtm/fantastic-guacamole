# fantastic-guacamole

江屹琛 · Chat —— 一个零依赖的单文件网页聊天客户端。

双击 `index.html` 即可在浏览器打开，无需安装、无需构建。

## 功能

- 💬 聊天界面 + 流式输出（打字机效果）
- 🗂️ **多会话侧边栏**：新建 / 切换 / 删除对话，侧栏可收起
- 🎨 **亮 / 暗主题切换**（顶部 🌙/☀️ 按钮）
- 🔀 **顶部模型下拉**快速切换（列表在设置里维护）
- 🔌 同时支持 **OpenAI 兼容** 和 **Anthropic (Claude)** 两种 API 格式
- 🧠 **长期记忆**：写一次，每轮对话自动注入，刷新不丢；可开 **✨ 自动记忆**让模型自动提炼补充
- ☁️ **可选云端账号同步**（Supabase）：邮箱登录后多设备同步对话，API Key 不上云
- ⚙️ 可配置 Base URL、API Key、模型、温度、最大输出 tokens、System Prompt
- 💾 设置和所有对话自动保存在浏览器 localStorage
- 📝 基础 Markdown 渲染（代码块、加粗、列表、链接）
- ⏹️ 流式生成中可随时停止

> 🛠️ 计划中：MCP 工具支持（纯浏览器无法直连 MCP，需配一个本地后端/代理）、后端代理隐藏 Key、导出对话为 Markdown。

## 使用

1. 在浏览器中打开 `index.html`
2. 点右上角 **⚙️ 设置**，选择 API 格式并填入 API Key
   - **OpenAI 兼容**：默认 `https://api.openai.com/v1`，也支持 DeepSeek / Moonshot / 本地 Ollama 等任何兼容 `/v1/chat/completions` 的服务
   - **Anthropic**：默认 `https://api.anthropic.com/v1`，模型如 `claude-opus-4-8`
3. 开始聊天，`Enter` 发送，`Shift+Enter` 换行

## 隐私说明

所有数据（包括 API Key）仅保存在你本地浏览器，直接从浏览器请求对应 API，不经过任何第三方服务器。

> ⚠️ Anthropic 直连浏览器使用了 `anthropic-dangerous-direct-browser-access` 头，会暴露 API Key 给前端。仅建议在本地、个人环境下使用；生产环境应通过自建后端代理转发请求。
