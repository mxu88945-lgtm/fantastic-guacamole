#!/usr/bin/env python3
"""构建时注入天气小组件 + 整点时间提醒（移植自惟境小手机）。

功能代码只在 scripts/weather-time.js 里改；本脚本负责把它精确插进 index.html。

规则（v370 起）：
- 每个注入块都用成对注释包住：/* WX-INJECT-BEGIN <名字> */ … /* WX-INJECT-END <名字> */。
- 已有标记块：整块替换成最新内容（不再“看到就跳过”），所以改 weather-time.js 一定生效。
- 没有标记、却出现了天气卡函数定义/钩子/接线（旧式残留，比如被 restore bundle 提交进来的）：
  打印醒目错误并以非零退出，构建失败，绝不静默跳过。
- 提交到仓库的 index.html 必须是未注入版本（scripts/weather-inject-regression.mjs 会检查）。
  本地 npm run build 之后可用 `python3 scripts/inject-weather-time.py --strip index.html` 还原。

用法：
  python3 scripts/inject-weather-time.py [index.html]          注入 / 替换为最新
  python3 scripts/inject-weather-time.py --strip [index.html]  移除所有注入块
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NL = chr(10)
BS = chr(92)  # 反斜杠，避开转义问题

HOOK = (
    "  let wxNote = \"\";" + NL
    + "  try { wxNote = buildWxPromptNote(); } catch (_) { wxNote = \"\"; }" + NL
    + "  if (wxNote) systemText = systemText ? systemText + "
    + chr(34) + BS + "n" + BS + "n" + chr(34) + " + wxNote : wxNote;"
)

WIRING = (
    "  // 天气小组件 + 整点时间提醒（移植自惟境小手机）" + NL
    + "  try { wxEnsureWidget(); wxRefresh(false); } catch (_) {}" + NL
    + "  try { setInterval(function () { wxRefresh(false); }, 30 * 60 * 1000); } catch (_) {}"
)

ANCHOR_JS = "function autoResize() {"
# 提示词钩子放在「一起听歌」注入之前（v370 前的锚点在时间提示块末尾，已被上游改掉）。
ANCHOR_HOOK = "  let musicNote = \"\";"
ANCHOR_INIT = "  lockApp();"

# 旧式残留检测用的签名；函数名用拼接写，避免源码里出现字面量。
LEGACY_SIGNS = [
    "function " + "wx" + "EnsureWidget",
    "wxNote = " + "buildWxPromptNote()",
    "wx" + "EnsureWidget(); wxRefresh(false);",
]


def begin(name):
    return "/* WX-INJECT-BEGIN " + name + " */"


def end(name):
    return "/* WX-INJECT-END " + name + " */"


def block_re(name):
    # 匹配整行：行首缩进 + BEGIN … END + 换行
    return re.compile(
        r"[ \t]*" + re.escape(begin(name)) + r".*?" + re.escape(end(name)) + r"[ \t]*\n",
        re.S,
    )


def wrap(name, payload):
    return begin(name) + NL + payload + NL + end(name) + NL


def load_js():
    with open(os.path.join(HERE, "weather-time.js"), encoding="utf-8") as f:
        return f.read().rstrip(NL)


def blocks():
    # (名字, 锚点, 位置, 内容)；before = 整块放在锚点行之前，after = 紧跟锚点行之后
    return [
        ("js", ANCHOR_JS, "before", load_js()),
        ("hook", ANCHOR_HOOK, "before", HOOK),
        ("wiring", ANCHOR_INIT, "after", WIRING),
    ]


def fail(msg):
    bar = "!" * 72
    print(bar, file=sys.stderr)
    print("WEATHER-TIME INJECT FAIL: " + msg, file=sys.stderr)
    print(bar, file=sys.stderr)
    sys.exit(1)


def strip_marked(html):
    for name, _, _, _ in blocks():
        html = block_re(name).sub("", html)
    return html


def check_legacy(html):
    """去掉标记块后若仍有天气卡签名，就是旧式（无标记）注入残留。"""
    rest = strip_marked(html)
    found = [s for s in LEGACY_SIGNS if s in rest]
    if found:
        fail(
            "index.html 里有无标记的旧式天气卡注入残留（%s）。"
            "这会让 weather-time.js 的修改永远不生效。请从 index.html 删除这段旧注入后再构建。"
            % ", ".join(repr(s) for s in found)
        )


def inject(html):
    check_legacy(html)
    for name, anchor, position, payload in blocks():
        rx = block_re(name)
        n = len(rx.findall(html))
        if n > 1:
            fail("注入块 %s 出现 %d 次，应最多 1 次。" % (name, n))
        if n == 1:
            html = rx.sub(lambda _m: wrap(name, payload), html, count=1)
            continue
        count = html.count(anchor)
        if count != 1:
            fail("锚点 %.60r 出现 %d 次，应恰好 1 次（上游改了锚点附近代码，需要更新本脚本的锚点）。" % (anchor, count))
        if position == "after":
            line = anchor + NL
            if html.count(line) != 1:
                fail("锚点 %.60r 后面应紧跟换行。" % anchor)
            html = html.replace(line, line + wrap(name, payload), 1)
        else:
            html = html.replace(anchor, wrap(name, payload) + anchor, 1)
    return html


def main():
    args = sys.argv[1:]
    strip = "--strip" in args
    args = [a for a in args if a != "--strip"]
    path = args[0] if args else "index.html"
    with open(path, encoding="utf-8") as f:
        html = f.read()
    if strip:
        out = strip_marked(html)
        check_legacy(out)
        msg = "weather-time blocks stripped from %s" % path
    else:
        out = inject(html)
        msg = "weather-time injected into %s: %d blocks (replaced in place if present)" % (path, len(blocks()))
    if out != html:
        with open(path, "w", encoding="utf-8") as f:
            f.write(out)
    print(msg)


if __name__ == "__main__":
    main()
