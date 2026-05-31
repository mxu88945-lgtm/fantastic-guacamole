# CLAUDE.md

给在这个仓库工作的 Claude 的项目记忆 / 上下文说明。

## 关于这个项目

**fantastic-guacamole** 是一个零依赖的单文件网页聊天客户端，名为「**江屹琛 · Chat**」。

- 核心文件就是 `index.html`，**双击即可在浏览器打开，无需安装、无需构建步骤**。
- 全部逻辑（HTML + CSS + JS）都内联在这一个文件里。

## 技术栈 / 约定

- 纯原生 HTML / CSS / JavaScript，**不引入框架、不加构建工具**（保持单文件、零依赖是核心约定）。
- 中文 UI，暗色主题为主，配色变量定义在 `:root` CSS 变量里。
- 数据持久化用浏览器 `localStorage`：
  - `jyc_settings` —— 设置（provider / baseUrl / apiKey / model / temperature / maxTokens / systemPrompt）
  - `jyc_messages` —— 当前对话历史
- 支持两种 API 格式，靠 `settings.provider` 切换：
  - `openai` —— 走 `/chat/completions`，`Authorization: Bearer` 头
  - `anthropic` —— 走 `/messages`，`x-api-key` + `anthropic-version` + `anthropic-dangerous-direct-browser-access` 头
- 流式输出靠 `fetch` + `ReadableStream` 手动解析 SSE（`data:` 行）。

## 风格 / 人设约定

- 这个助手对用户自称「**江屹琛**」，头像是「江」字。语气亲切、口语化。

## 开发提醒

- 改动后保持「单文件、零依赖、双击即用」的特性。
- 当前开发分支：`claude/keen-allen-DFDKn`。
- 安全提醒：浏览器直连方式会把 API Key 暴露在前端，仅适合本地/个人使用；若要公开部署需另加后端代理。

## 可能的后续方向（尚未实现）

- 多会话 / 侧边栏
- 亮色主题切换
- 长期「记忆库」（在 system prompt 注入持久化的用户事实）
- 后端代理（隐藏 API Key）
- 导出对话为 Markdown
