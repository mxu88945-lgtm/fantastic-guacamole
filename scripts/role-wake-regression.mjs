import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0
const ok = (value, message) => { if (!value) throw new Error(message); checks++ }

ok(html.includes('id="role-wake-enabled"'), 'role-wake 开关缺失')
ok(html.includes('id="role-wake-url"') && html.includes('id="role-wake-key"'), 'role-wake 配置输入缺失')
ok(html.includes('localStorage.getItem("jyc-role-wake-enabled") === "1"'), 'role-wake 默认关闭或未使用本机存储')
ok(html.includes('localStorage.getItem("jyc-role-wake-key") || ""'), 'role-wake 密钥未从本机存储读取')
ok(html.includes('roleWakePullInbox();'), 'App 激活时未拉取 role-wake 收件箱')
ok(html.includes('roleWakeSyncAfterChat();'), '聊天完成后未同步 role-wake')
ok(html.includes('personaSummary: persona') && html.includes('recentSummary: recent.slice(0, 1800)'), '同步摘要没有长度限制')
ok(!html.includes('body: JSON.stringify({ roleId: roleWakeRoleId(conv), roleName: settings.aiName || activeRole()?.name || "角色", ...summary, lastChatAt: Date.now(), messages'), '同步请求疑似上传全文消息')
ok(html.includes('const push = pushReady() ? { pushDevice: pushDevice(), pushUrl: location.href.split("#")[0] } : {};'), '同步没有仅在推送开启时附带 device 和 App 地址')
ok(html.includes('lastChatAt: Date.now(), ...push'), '同步请求没有传递推送字段')
ok(html.includes('pushReady() ? { pushDevice: pushDevice(), pushUrl:'), '推送关闭时可能生成或上传新的 device')
ok(html.includes('if (meta.wakeId && conv.messages.some(m => m && m.wakeId === meta.wakeId)) return null;'), '收件箱没有按唯一 ID 去重')
ok(html.includes('proactiveSource: "role-wake"'), 'role-wake 消息没有独立来源标记')
ok(sw.includes('const CACHE = "role-chat-cache-v423"'), 'sw 缓存版本不匹配')
console.log(`role-wake regression: ${checks} checks passed`)
