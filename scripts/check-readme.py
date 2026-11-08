# -*- coding: utf-8 -*-
"""校验 README 的本地资源引用、HTML 标签配对与锚点可达性。"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
md_path = os.path.join(ROOT, "README.md")
md = open(md_path, encoding="utf-8").read()

# --- 1. 本地图片/文件引用 ---
refs = set(re.findall(r"\]\(([^)]+)\)", md))
refs |= set(re.findall(r'src="((?!http)[^"]+)"', md))
local = [r for r in refs if not r.startswith("http") and not r.startswith("#")]
missing = [r for r in local if not os.path.exists(os.path.join(ROOT, r))]

# --- 2. HTML 标签配对 ---
div_o, div_c = md.count("<div"), md.count("</div>")
details_o, details_c = md.count("<details>"), md.count("</details>")

# --- 3. 锚点可达性：README 内的 # 链接是否都能在标题中找到 ---
def slug(text):
    text = re.sub(r"[^\w\u4e00-\u9fa5\- ]", "", text.lower())
    return re.sub(r"\s+", "-", text.strip())

headings = re.findall(r"^#{1,6}\s+(.+)$", md, re.M)
anchors = {slug(h) for h in headings}
anchors |= set(re.findall(r'<a id="([^"]+)"', md))
anchors |= {"top"}
internal = [r[1:] for r in refs if r.startswith("#")]
dead = [a for a in internal if a not in anchors]

print("README: %s" % md_path)
print("行数 %d · 字符 %d" % (len(md.splitlines()), len(md)))
print("本地引用 %d 项 → 缺失: %s" % (len(local), missing if missing else "无 ✓"))
print("div %d/%d · details %d/%d" % (div_o, div_c, details_o, details_c))
print("内部锚点 %d 个 → 失效: %s" % (len(internal), dead if dead else "无 ✓"))

ok = not missing and div_o == div_c and details_o == details_c and not dead
print("\n%s" % ("全部校验通过 ✓" if ok else "存在问题 ✗"))
sys.exit(0 if ok else 1)
