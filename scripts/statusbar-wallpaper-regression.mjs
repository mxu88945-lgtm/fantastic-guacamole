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
check(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />'), 'status bar must be black-translucent so the wallpaper reaches the notch')
check(html.includes('html[data-chat-bg="1"] { background: var(--wall-top'), 'html background does not follow the wallpaper top color')
check(html.includes('document.documentElement.style.setProperty("--wall-top", hex)'), 'sampled wallpaper color is not painted on html')
check(html.includes('document.documentElement.style.removeProperty("--wall-top")'), 'wall-top is not cleared when wallpaper is removed')
check(html.includes('position: fixed; top: 0; left: 0; width: 100%; height: 100vh;'), 'body shell must use 100vh so the home-indicator strip is painted')
check(html.includes('.app { display: flex; height: 100vh; }'), 'app shell must use 100vh')
console.log(`statusbar wallpaper regression: ${checks} checks passed`)
