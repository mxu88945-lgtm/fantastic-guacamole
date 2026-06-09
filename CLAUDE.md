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
  - `jyc_settings` —— 设置（providers / activeProviderId / temperature / maxTokens / systemPrompt / memory / autoMemory / theme / sidebarCollapsed / supabase* / userName / userAvatar / aiName / aiAvatar）
    - `providers` —— 多接口配置数组，每项 `{id, name, provider, baseUrl, apiKey, model, modelList}`；`activeProviderId` 指当前激活的那个。顶层 `provider/baseUrl/apiKey/model/modelList` 是「激活接口的镜像」，`streamChat` 等直接读这些，靠 `mirrorActiveToFlat()` 保持同步。
    - `userAvatar` / `aiAvatar` —— 头像，可为文字 / emoji / 图片链接 / 上传的 `data:` URL（上传时压缩到 128px JPEG）。
    - `memory` 是「长期记忆」文本，每次请求会拼进 system prompt（见 `streamChat` 里的 `systemText`）；清空对话不会清掉它。
    - `theme` —— `dark` / `light`，作用在 `<html data-theme>` 上，CSS 变量按主题切换。
    - `modelList` —— 多行文本，每行一个模型，渲染到顶部「快速切换模型」下拉。
  - `jyc_conversations` —— 多会话数组，每项 `{id, title, messages:[{role,content}], updatedAt}`。
  - `jyc_current` —— 当前会话 id。
  - `jyc_messages` —— 旧版单会话历史，仅用于首次加载时迁移到 `jyc_conversations`。
- 可选「云端账号同步」用 **Supabase**：
  - 运行时通过 `import("https://esm.sh/@supabase/supabase-js@2")` 动态加载（仍是单文件、无构建）。
  - 设置里填 `supabaseUrl` / `supabaseKey`（anon key，本身可公开，靠 RLS 保护）；邮箱密码登录。
  - 同步数据存到表 `chats(user_id uuid pk, payload jsonb, updated_at)`，整 blob upsert，last-write-wins。
  - `payload = { conversations, settings(仅 SYNCED_KEYS) }`。**apiKey 和 supabase* 配置不上云**，只留本地。
  - 登录后 `pullCloud`（云端非空则覆盖本地，空则把本地推上去），改动经 `schedulePush` 防抖 1.5s 后 `pushCloudNow`。
- 「自动记忆」：`settings.autoMemory` 开启后，每 2 轮成功回复调一次 `autoUpdateMemory()`（非流式 `completeOnce`）提炼新事实，追加进 `settings.memory`。
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

- ~~多会话 / 侧边栏~~ ✅ 已实现（左侧栏，可新建/切换/删除会话，可收起）。
- ~~亮色主题切换~~ ✅ 已实现（顶部 🌙/☀️ 切换，存 `settings.theme`）。
- ~~模型快速切换~~ ✅ 已实现（顶部下拉，列表来自设置里的「常用模型列表」）。
- ~~长期「记忆库」~~ ✅ 已实现（手动便签式，注入 system prompt）。后续可升级为「模型自动提取记忆」。
- MCP 支持（纯浏览器难直连，需配后端/代理，尚未做）。
- 后端代理（隐藏 API Key）
- 导出对话为 Markdown
