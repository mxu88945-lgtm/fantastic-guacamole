import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const ok = (condition, message) => { if (!condition) throw new Error(message) }
let checks = 0
const check = (c, m) => { ok(c, m); checks++ }

check(html.includes('function syncStatusBarToWallpaper(imageUrl, dark, dim)'), 'wallpaper status-bar sync helper is missing')
check(html.includes('syncStatusBarToWallpaper(imageUrl, dark, d);'), 'applying a wallpaper does not retint the status bar')
check(html.includes('syncStatusBarToWallpaper("", false, 0);'), 'removing the wallpaper does not restore the theme status-bar color')
check(html.includes('localStorage.removeItem("jyc_statusbg")'), 'stale wallpaper tint is not cleared when the wallpaper is removed')
check(html.includes('themeMeta.setAttribute("content", statusBg || bg)'), 'pre-paint script does not start on the wallpaper tint')
check(html.includes('setStatusBarColor(t.vars.bg);'), 'theme switch no longer sets the status-bar color')
check(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="default" />'), 'status bar style must stay default to keep the bottom strip paintable')
console.log(`statusbar wallpaper regression: ${checks} checks passed`)
