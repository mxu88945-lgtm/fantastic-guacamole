# fantastic-guacamole

江屹琛 · Chat —— 一个零依赖的单文件网页聊天客户端。

双击 `index.html` 即可在浏览器打开，无需安装、无需构建。

## 功能

- 💬 聊天界面 + 流式输出（打字机效果）
- 🔌 同时支持 **OpenAI 兼容** 和 **Anthropic (Claude)** 两种 API 格式
- ⚙️ 可配置 Base URL、API Key、模型、温度、最大输出 tokens、System Prompt
- 💾 设置和对话历史自动保存在浏览器 localStorage
- 📝 基础 Markdown 渲染（代码块、加粗、列表、链接）
- ⏹️ 流式生成中可随时停止

## 使用

1. 在浏览器中打开 `index.html`
2. 点右上角 **⚙️ 设置**，选择 API 格式并填入 API Key
   - **OpenAI 兼容**：默认 `https://api.openai.com/v1`，也支持 DeepSeek / Moonshot / 本地 Ollama 等任何兼容 `/v1/chat/completions` 的服务
   - **Anthropic**：默认 `https://api.anthropic.com/v1`，模型如 `claude-opus-4-8`
3. 开始聊天，`Enter` 发送，`Shift+Enter` 换行

## 隐私说明

所有数据（包括 API Key）仅保存在你本地浏览器，直接从浏览器请求对应 API，不经过任何第三方服务器。

> ⚠️ Anthropic 直连浏览器使用了 `anthropic-dangerous-direct-browser-access` 头，会暴露 API Key 给前端。仅建议在本地、个人环境下使用；生产环境应通过自建后端代理转发请求。
