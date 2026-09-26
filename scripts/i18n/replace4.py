#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PHASE 27 — pass 4: display template literals → t("… {pN} …", {…}).
Component files only. Single-line templates whose key contains Persian.
Blocked: payload/comparison/collection-op lines and object keys."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import tokenize_lines, has_persian, is_server_file, template_to_key

ROOT = "/home/z/my-project"
SRC = os.path.join(ROOT, "src")

LINE_BLOCKERS = ("api(", "fetch(", "JSON.stringify", "where", "case ",
                 ".includes(", ".startsWith(", ".endsWith(", ".split(", ".indexOf(")
CMP_BEFORE = re.compile(r"[=!<>]=\s*$")
CMP_AFTER = re.compile(r"^\s*[=!<>]=")
ALREADY_T = re.compile(r"(?:t|tr)\(\s*$")

def jdump(s): return json.dumps(s, ensure_ascii=False)

def is_component_file(rel):
    return rel.startswith("components/") or rel == "app/page.tsx"

def main():
    apply_mode = "--apply" in sys.argv
    total = 0
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d not in {"node_modules", ".next", "i18n"} and not d.startswith(".")]
        for fn in sorted(filenames):
            if not fn.endswith((".ts", ".tsx")) or fn.endswith(".d.ts"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), SRC)
            if is_server_file(rel) or rel == "app/layout.tsx" or not is_component_file(rel):
                continue
            path = os.path.join(dirpath, fn)
            with open(path, encoding="utf-8") as f:
                lines = f.read().split("\n")
            edits = []
            for lineno, line, tokens in tokenize_lines(lines):
                if any(b in line for b in LINE_BLOCKERS):
                    continue
                st = line.strip()
                if st.startswith(("//", "*", "/*")):
                    continue
                for tok in tokens:
                    if tok[0] != "template" or "${" not in tok[1]:
                        continue
                    text, col = tok[1], tok[2]
                    if not has_persian(text) or "\n" in text:
                        continue
                    before = line[:col].rstrip()
                    after = line[col + len(text) + 2:]
                    if ALREADY_T.search(before[-6:]):
                        continue
                    if re.match(r"\s*:", after) and not before.endswith("?"):
                        continue
                    if CMP_BEFORE.search(before[-6:]) or CMP_AFTER.match(after):
                        continue
                    key, exprs = template_to_key(text)
                    if not has_persian(key):
                        continue
                    params = ", ".join(f"p{i}: {e}" for i, e in enumerate(exprs))
                    call = f"t({jdump(key)}, {{ {params} }})" if exprs else f"t({jdump(key)})"
                    edits.append((lineno, col, col + len(text) + 2, call))
            if not edits:
                continue
            by_line = {}
            for (ln, s_, e_, r_) in edits:
                by_line.setdefault(ln, []).append((s_, e_, r_))
            for ln, items in by_line.items():
                items.sort(key=lambda x: -x[0])
                line = lines[ln - 1]
                for (s_, e_, r_) in items:
                    line = line[:s_] + r_ + line[e_:]
                lines[ln - 1] = line
            content = "\n".join(lines)
            if apply_mode:
                if 'from "@/lib/i18n"' not in content:
                    idx = -1
                    for i, l in enumerate(lines[:80]):
                        if l.startswith("import "):
                            idx = i
                    if idx >= 0:
                        lines.insert(idx + 1, 'import { t } from "@/lib/i18n";')
                    else:
                        lines.insert(0, 'import { t } from "@/lib/i18n";')
                with open(path, "w", encoding="utf-8") as f:
                    f.write("\n".join(lines))
            total += len(edits)
            print(f"  {rel}: {len(edits)}")
    print(f"mode={'APPLY' if apply_mode else 'DRY'} edits={total}")

if __name__ == "__main__":
    main()
