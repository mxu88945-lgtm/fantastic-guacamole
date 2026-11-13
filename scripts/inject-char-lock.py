#!/usr/bin/env python3
"""角色锁屏（移植自惟境）—— v370 起已并入 index.html 源码，本脚本只做检查，不再注入。

历史：9532caf 起本脚本在构建时把 6 段代码插进 index.html，并以 "char-lock-screen" 作为
“已注入就跳过”的标记。后来注入结果被提交进了仓库，之后又在 index.html 里直接改过
（例如独立消息不解析锁屏、时间变量声明挪了位置），原来的锚点和内容都对不上了。
继续“看到就跳过”会让本脚本的内容静默失效，所以改为：
- 锁屏功能就在 index.html 源码里维护，直接改 index.html；
- 构建时检查各部分都在：齐全 -> 通过；缺任何一部分 -> 打印醒目错误并非零退出。
原来的注入内容可在 git 历史 9532caf:scripts/inject-char-lock.py 找到。
"""
import sys

REQUIRED = [
    ("锁屏 CSS", "#char-lock-screen {"),
    ("锁屏遮罩 HTML", '<div id="char-lock-screen"'),
    ("提示词注入", "const charLockNote = charLockPromptNote();"),
    ("告状注入", "buildCharLockBreachNote();"),
    ("回复解析", "parseCharLockCommand(assistantMsg.content)"),
    ("功能函数", "function parseCharLockCommand(text) {"),
    ("功能函数", "function renderCharLockScreen() {"),
    ("功能函数", "function sneakUnlockCharLock() {"),
    ("启动接线", '$("char-lock-sneak").onclick = sneakUnlockCharLock;'),
]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "index.html"
    with open(path, encoding="utf-8") as f:
        html = f.read()
    missing = [label + "：" + sign for label, sign in REQUIRED if sign not in html]
    if missing:
        bar = "!" * 72
        print(bar, file=sys.stderr)
        print("CHAR-LOCK CHECK FAIL: index.html 缺少角色锁屏的部分代码：", file=sys.stderr)
        for m in missing:
            print("  - " + m, file=sys.stderr)
        print("锁屏功能已并入 index.html 源码，不再构建注入；请在 index.html 里补回。", file=sys.stderr)
        print(bar, file=sys.stderr)
        sys.exit(1)
    print("char-lock is part of %s source: %d parts present, nothing to inject" % (path, len(REQUIRED)))


if __name__ == "__main__":
    main()
