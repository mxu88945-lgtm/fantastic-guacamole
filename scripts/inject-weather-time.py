#!/usr/bin/env python3
"""构建时注入天气小组件 + 整点时间提醒（移植自惟境小手机）。
功能代码在 weather-time.js，本脚本只负责精确插入。
"""
import sys

BS = chr(92)  # 反斜杠，避开转义问题

HOOK = (
    "  const wxNote = buildWxPromptNote();" + chr(10)
    + "  if (wxNote) systemText = systemText ? systemText + "
    + chr(34) + BS + "n" + BS + "n" + chr(34) + " + wxNote : wxNote;"
)

WIRING = (
    "  // 天气小组件 + 整点时间提醒（移植自惟境小手机）" + chr(10)
    + "  try { wxEnsureWidget(); wxRefresh(false); } catch (_) {}" + chr(10)
    + "  try { setInterval(function () { wxRefresh(false); }, 30 * 60 * 1000); } catch (_) {}"
)

ANCHOR_JS = "function autoResize() {"
ANCHOR_HOOK = (
    '      + "。提到现在/今天/今晚时只能以此为准；历史消息里的时间都属于过去。";' + chr(10)
    + "    systemText = systemText ? systemText + " + chr(34) + BS + "n" + BS + "n" + chr(34) + " + note : note;" + chr(10)
    + "  }"
)
ANCHOR_INIT = "  lockApp();"
MARKER = "wx-widget"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "index.html"
    html = open(path, encoding="utf-8").read()
    if MARKER in html:
        print("weather-time already injected, skipping")
        return
    js = open("scripts/weather-time.js", encoding="utf-8").read().rstrip(chr(10))
    steps = [
        (ANCHOR_JS, "before", chr(10), js),
        (ANCHOR_HOOK, "after", chr(10), HOOK),
        (ANCHOR_INIT, "after", chr(10) + chr(10), WIRING),
    ]
    for anchor, position, sep, payload in steps:
        count = html.count(anchor)
        if count != 1:
            print("INJECT FAIL: anchor %.60r found %d times, expected 1." % (anchor, count), file=sys.stderr)
            sys.exit(1)
        if position == "after":
            html = html.replace(anchor, anchor + sep + payload, 1)
        else:
            html = html.replace(anchor, payload + sep + anchor, 1)
    open(path, "w", encoding="utf-8").write(html)
    print("weather-time injected into %s: %d blocks" % (path, len(steps)))


if __name__ == "__main__":
    main()
