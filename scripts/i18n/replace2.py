#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 27 — pass 2: aggressive-but-guarded literal wrapping.
Scope: component files ONLY (components/, app/page.tsx, stores/, hooks/).
       lib/** is excluded (shared/server code — messages stay Persian and are
       translated client-side at the api() choke point).

Wraps Persian string literals in display-ish contexts that pass 1 flagged:
  - ternary branches        cond ? "آ" : "ب"
  - logical fallbacks       res.message ?? "متن"   /  x && "متن"
  - call arguments          toast("متن"), confirm("متن")
  - array elements (non-const)   ["آ", "ب"]
  - object values with display prop names (unknown-but-not-data props)

Blocked (never wrapped):
  - object keys / switch cases (token followed by ":")
  - comparison operands (before ends with ==/!= or after starts with ==/!=)
  - assignments (before ends with "=" — pass-1 territory)
  - data prop names: name/value/key/id/status/type/role/code/module/page/
    method/unit/currency/payType/field/action/email/search/query/category/tag
  - lines containing: api( / fetch( / JSON.stringify / where / case  /
    .includes( / .startsWith( / .endsWith( / .split( / .indexOf( / as const

Usage: python3 scripts/i18n/replace2.py [--apply]
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import tokenize_lines, has_persian  # noqa: E402

ROOT = "/home/z/my-project"
SRC = os.path.join(ROOT, "src")

DATA_PROPS = {
    "name", "value", "key", "id", "status", "type", "role", "code", "slug",
    "module", "page", "method", "unit", "currency", "payType", "field",
    "action", "email", "password", "search", "query", "category", "tag",
    "icon", "color", "url", "path", "to", "from", "sortBy", "order",
}

LINE_BLOCKERS = (
    "api(", "fetch(", "JSON.stringify", "where", "case ",
    ".includes(", ".startsWith(", ".endsWith(", ".split(", ".indexOf(",
    "as const", ".push(",
)

PRE_PROP = re.compile(r"([A-Za-z_]\w*)\s*:\s*$")
CMP_BEFORE = re.compile(r"[=!]=\s*$")
CMP_AFTER = re.compile(r"^\s*[=!]=")
ALREADY_T = re.compile(r"(?:tr|t)\(\s*$")

def jdump(s):
    return json.dumps(s, ensure_ascii=False)

def is_component_file(rel):
    return (
        rel.startswith("components/")
        or rel.startswith("stores/")
        or rel.startswith("hooks/")
        or rel == "app/page.tsx"
    )

def process_file(path, rel, apply_mode):
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    edits = []
    flags = []
    for lineno, line, tokens in tokenize_lines(lines):
        if any(b in line for b in LINE_BLOCKERS):
            continue
        for tok in tokens:
            kind, text, col = tok[0], tok[1], tok[2]
            if kind != "string" or not has_persian(text):
                continue
            if "\n" in text:
                continue
            before_raw = line[:col]
            before = before_raw.rstrip()
            after = line[col + len(text) + 2:]
            if ALREADY_T.search(before[-6:]):
                continue
            # object key / switch case
            if re.match(r"\s*:", after) and not before.endswith("?"):
                flags.append((rel, lineno, "key", text[:60]))
                continue
            # comparison operand
            if CMP_BEFORE.search(before[-6:]) or CMP_AFTER.match(after):
                flags.append((rel, lineno, "comparison", text[:60]))
                continue
            # assignment (before ends with '=' but not a comparison/arrow)
            if before.endswith("=") and before[-2:] not in ("==", "!=", "<=", ">=", "=>"):
                flags.append((rel, lineno, "assign", text[:60]))
                continue
            # data prop value
            m = PRE_PROP.search(before[-60:])
            if m and m.group(1) in DATA_PROPS:
                flags.append((rel, lineno, f"data-prop:{m.group(1)}", text[:60]))
                continue
            # ── display context → wrap ──
            edits.append((lineno, col, col + len(text) + 2, f"t({jdump(text)})"))

    if not edits:
        return 0, flags
    by_line = {}
    for (lineno, start, end, repl) in edits:
        by_line.setdefault(lineno, []).append((start, end, repl))
    for lineno, items in by_line.items():
        items.sort(key=lambda x: -x[0])
        line = lines[lineno - 1]
        for (start, end, repl) in items:
            line = line[:start] + repl + line[end:]
        lines[lineno - 1] = line
    if apply_mode:
        content = "\n".join(lines)
        if 'from "@/lib/i18n"' not in content:
            import_idx = -1
            for i, l in enumerate(lines[:80]):
                if l.startswith("import "):
                    import_idx = i
            if import_idx >= 0:
                lines.insert(import_idx + 1, 'import { t } from "@/lib/i18n";')
            else:
                for i, l in enumerate(lines[:5]):
                    if l.strip() == '"use client";':
                        lines.insert(i + 1, "")
                        lines.insert(i + 2, 'import { t } from "@/lib/i18n";')
                        break
                else:
                    lines.insert(0, 'import { t } from "@/lib/i18n";')
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
    return len(edits), flags

def main():
    apply_mode = "--apply" in sys.argv
    total = 0
    all_flags = []
    touched = []
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d not in {"node_modules", ".next", "i18n"} and not d.startswith(".")]
        for fn in sorted(filenames):
            if not (fn.endswith(".ts") or fn.endswith(".tsx")) or fn.endswith(".d.ts"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), SRC)
            if not is_component_file(rel):
                continue
            n, flags = process_file(os.path.join(dirpath, fn), rel, apply_mode)
            all_flags.extend(flags)
            if n:
                touched.append((rel, n))
                total += n
    out = dict(mode="apply" if apply_mode else "dry", total=total,
               files=[dict(file=f, edits=n) for f, n in touched],
               flagged=[dict(file=f, line=l, type=t, text=x) for (f, l, t, x) in all_flags])
    with open(os.path.join(ROOT, "scripts", "i18n", "replace2-report.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"mode={'APPLY' if apply_mode else 'DRY'} files={len(touched)} edits={total} flagged={len(all_flags)}")

if __name__ == "__main__":
    main()
