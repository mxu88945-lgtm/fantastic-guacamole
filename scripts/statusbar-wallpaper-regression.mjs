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
check(html.includes('position: fixed; top: 0; left: 0; width: 100%; height: var(--app-h, 100%);'), 'body shell must use 100vh so the home-indicator strip is painted')
check(html.includes('.app { display: flex; height: var(--app-h, 100%); }'), 'app shell must use 100vh')
check(html.includes('applyAppH(h, h, false);') && html.includes('appRoot.style.setProperty("--app-h", h + "px")'), 'standalone shell is not pinned to the physical screen height')
// iOS keyboard: shrink the standalone shell to the visual viewport so the composer sits on the keyboard
check(html.includes('window.visualViewport.addEventListener("resize", setAppH);') && html.includes('window.visualViewport.addEventListener("scroll", setAppH);'), 'standalone shell does not follow visualViewport while the keyboard is open')
check(html.includes('if (vv && vv.height < h - 120) {') && html.includes('applyAppH(Math.round(vv.height), h, true);'), 'keyboard-open shell is not shrunk to the visual viewport height')
check(html.includes('appRoot.setAttribute("data-kb", "")') && html.includes('appRoot.removeAttribute("data-kb")'), 'data-kb is not toggled with the keyboard')
check(html.includes('if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);'), 'iOS page pan is not reset when the keyboard opens')
check(html.includes('appHFrame = requestAnimationFrame(') && html.includes('if (appHFrame) return;'), 'viewport listener is not throttled to one measure per frame')
check(html.includes('if (h !== lastAppH)') && html.includes('if (kb !== lastKb)'), 'viewport listener writes --app-h/data-kb even when unchanged')
check(html.includes('html[data-kb][data-theme-key="claude"] .main > .composer-wrap { padding-bottom: 8px; }'), 'composer keeps the home-indicator inset while the keyboard is open')
check(html.includes('html[data-kb] #chat-bg { bottom: auto; height: var(--app-full-h, 100%); }'), 'wallpaper rescales while the keyboard is open')
check(html.includes('.main > header::before {') && html.includes('backdrop-filter: blur(14px) saturate(1.15);'), 'progressive frosted top is missing')
console.log(`statusbar wallpaper regression: ${checks} checks passed`)
