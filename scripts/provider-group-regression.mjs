import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const grab = name => {
  const start = html.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`${name} missing`)
  let depth = 0, i = html.indexOf('{', start)
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break }
  return html.slice(start, i + 1)
}
const fn = new Function(`${grab('providerGroupKey')}\n${grab('groupedProviders')}\nreturn groupedProviders`)()
const groups = fn([
  { id: 'a', name: 'passion 1', baseUrl: 'https://Passion.example.com/v1' },
  { id: 'b', name: '晚晚舟', baseUrl: 'https://wwz.example.com/v1' },
  { id: 'c', name: 'passion 2', baseUrl: 'https://passion.example.com/v1/' },
  { id: 'd', name: '没地址', baseUrl: '' },
])
const order = groups.flatMap(g => g.items.map(p => p.id)).join('')
if (order !== 'acbd') throw new Error('same host channels are not adjacent: ' + order)
if (groups[0].label !== 'passion.example.com' || groups[0].items.length !== 2) throw new Error('host group label wrong')
if (groups[2].label !== '') throw new Error('channel without url should stay ungrouped')
for (const call of ['appendGroupedProviderOptions(providerQuick', 'appendGroupedProviderOptions(sel, settings.providers', 'groupedProviders(settings.providers).flatMap'])
  if (!html.includes(call)) throw new Error('picker not grouped: ' + call)
if (!sw.includes('const CACHE = "role-chat-cache-v370";')) throw new Error('sw cache not bumped')
console.log('provider group regression: passed')
