import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0

const ok = (value, message) => {
  if (!value) throw new Error(message)
  checks++
}

ok(html.includes('const MEMORY_ENTRY_SCHEMA_VERSION = 4;'), 'memory entry schema v4 is missing')
ok(html.includes('entry.tags = normalizeMemoryTags(entry.tags, entry.text, entry.kind);'), 'legacy memory tag migration is missing')
ok(html.includes('scope: provenance?.scope || "backstage:"'), 'new memories do not record an isolated scope')
ok(html.includes('...memoryRecallScore(recent, q, e, explicit)'), 'durable recall does not use weighted v4 scoring')
ok(html.includes('fingerprint: memoryPromptFingerprint('), 'memory prompt fingerprint is missing')
ok(html.includes('召回原因：'), 'memory inspection does not explain why a fact was recalled')
ok(html.includes('authority: provenance?.authority || defaultMemoryAuthority'), 'new memories do not record authority')
ok(html.includes('kind: provenance?.kind || inferMemoryKind(text)'), 'new memories do not record semantic kind')
ok(html.includes('entry.confidence = entry.authority === "model_derived" ? 0.72 : 1;'), 'legacy memory confidence migration is missing')
ok(html.includes('const userTurns = messages.filter(m =>')
  && html.includes('m && m.role === "user" && !m._event && !m._summary')
  && html.includes('const recent = currentMemoryRecallQuery();'),
  'durable recall still uses assistant echoes')
ok(html.includes('【已确认的跨窗口长期事实'), 'confirmed memory lane is not labeled')
ok(html.includes('【角色先前提炼的记忆线索·未经用户逐条确认】'), 'derived memory lane is not labeled as unconfirmed')
ok(html.includes('rememberMemoryInspection(auditBlocks, selected'), 'request assembly does not save an inspection receipt')
ok(html.includes('id="memory-inspection-view"'), 'memory inspection surface is missing')
ok(html.includes('只展示应用实际组装给模型的记忆来源'), 'inspection surface does not explain its boundary')
ok(html.includes('if (tab === "memory") renderMemoryInspection();'), 'memory inspection does not refresh when opened')
ok(sw.includes('const CACHE = "role-chat-cache-v252";'), 'service worker cache was not bumped for memory v4')

console.log(`memory evidence regression: ${checks} checks passed`)
