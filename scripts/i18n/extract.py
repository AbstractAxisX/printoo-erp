#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n extraction for Printoo24 ERP — PHASE 27 (bilingual fa/en).

Scans all src/**/*.ts,tsx, tokenizes (strings / template literals /
comments / JSX text / attributes), finds every Persian-containing token and
builds a complete catalog:

  scripts/i18n/catalog.json  — unique Persian strings + occurrences + classification
  scripts/i18n/occurrences.json — one entry per physical occurrence (for the Excel)

Classification types:
  jsx_text | attr:NAME | toast | error | prop:NAME | assign:NAME | template |
  template_param | literal | comment | console

Scope flag per file: client (replaceable) vs server (API routes/proxy — NOT
replaced; their messages are translated client-side at the api() choke point).
"""

import json
import os
import re
import sys
from collections import defaultdict

ROOT = "/home/z/my-project"
SRC = os.path.join(ROOT, "src")
OUT_DIR = os.path.join(ROOT, "scripts", "i18n")

PERSIAN = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]")

SKIP_DIRS = {"node_modules", ".next", "i18n"}  # i18n = our own dicts

def is_server_file(rel: str) -> bool:
    return rel.startswith("app/api/") or rel == "proxy.ts"

def has_persian(s: str) -> bool:
    return bool(PERSIAN.search(s))

# ── tokenizer ────────────────────────────────────────────────────────────

def tokenize_lines(lines):
    """Yield (lineno, line, tokens). token = (kind, text, col [, quote]).
    kinds: string | template | comment | __TEMPLATE__ (multi-line closed).
    Handles multi-line template literals and block comments.
    """
    in_block_comment = False
    in_template = False
    template_buf = []
    template_col = 0

    for lineno, raw in enumerate(lines, 1):
        line = raw.rstrip("\n")
        tokens = []
        i = 0
        n = len(line)
        while i < n:
            if in_block_comment:
                end = line.find("*/", i)
                if end == -1:
                    tokens.append(("comment", line[i:], i))
                    i = n
                else:
                    tokens.append(("comment", line[i:end + 2], i))
                    in_block_comment = False
                    i = end + 2
                continue
            if in_template:
                # scan for closing backtick outside ${...}
                j = i
                depth = 0
                closed = None
                while j < n:
                    c = line[j]
                    if c == "\\":
                        j += 2
                        continue
                    if depth == 0 and c == "`":
                        closed = j
                        break
                    if c == "{":
                        depth += 1
                    elif c == "}":
                        depth = max(0, depth - 1)
                    j += 1
                if closed is None:
                    template_buf.append(line[i:])
                    i = n
                else:
                    template_buf.append(line[i:closed])
                    full = "\n".join(template_buf)
                    tokens.append(("template", full, template_col))
                    in_template = False
                    i = closed + 1
                continue
            c = line[i]
            if c == "/" and i + 1 < n and line[i + 1] == "/":
                tokens.append(("comment", line[i:], i))
                break
            if c == "/" and i + 1 < n and line[i + 1] == "*":
                end = line.find("*/", i + 2)
                if end == -1:
                    tokens.append(("comment", line[i:], i))
                    in_block_comment = True
                    i = n
                else:
                    tokens.append(("comment", line[i:end + 2], i))
                    i = end + 2
                continue
            if c in ("'", '"'):
                q = c
                j = i + 1
                while j < n:
                    if line[j] == "\\":
                        j += 2
                        continue
                    if line[j] == q:
                        break
                    j += 1
                if j < n:
                    tokens.append(("string", line[i + 1:j], i))
                    i = j + 1
                else:
                    tokens.append(("string", line[i + 1:], i))
                    i = n
                continue
            if c == "`":
                # try close on same line
                rest = line[i + 1:]
                j = 0
                depth = 0
                closed = None
                nn = len(rest)
                while j < nn:
                    ch = rest[j]
                    if ch == "\\":
                        j += 2
                        continue
                    if depth == 0 and ch == "`":
                        closed = j
                        break
                    if ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth = max(0, depth - 1)
                    j += 1
                if closed is not None:
                    tokens.append(("template", rest[:closed], i))
                    i = i + 1 + closed + 1
                else:
                    in_template = True
                    template_buf = [rest]
                    template_col = i
                    i = n
                continue
            i += 1
        yield lineno, line, tokens

# ── classification helpers ───────────────────────────────────────────────

PRE_ATTR = re.compile(r"([A-Za-z_][\w-]*)\s*=\s*$")
PRE_PROP = re.compile(r"([A-Za-z_]\w*)\s*:\s*$")
PRE_ASSIGN = re.compile(r"(?:const|let|var)?\s*([A-Za-z_]\w*)\s*=\s*$")
PRE_TOAST = re.compile(r"toast(?:\.(?:success|error|warning|info|loading|custom))?\(\s*$")
PRE_ERROR = re.compile(r"(?:new\s+)?Error\(\s*$")
PRE_CONSOLE = re.compile(r"console\.(?:log|error|warn|info)\(\s*$")

def classify(line: str, kind: str, col: int):
    before = line[:col] if col <= len(line) else ""
    stripped_before = before.rstrip()
    m = PRE_ATTR.search(stripped_before[-60:])
    if kind == "string" and m:
        attr = m.group(1)
        return f"attr:{attr}", attr
    if PRE_TOAST.search(stripped_before[-40:]):
        return "toast", None
    if PRE_ERROR.search(stripped_before[-30:]):
        return "error", None
    if PRE_CONSOLE.search(stripped_before[-30:]):
        return "console", None
    m = PRE_PROP.search(stripped_before[-60:])
    if kind == "string" and m:
        prop = m.group(1)
        return f"prop:{prop}", prop
    m = PRE_ASSIGN.search(stripped_before[-60:])
    if kind == "string" and m:
        name = m.group(1)
        return f"assign:{name}", name
    if kind == "template":
        if "${" in (line[col:col + 200] if col < len(line) else ""):
            return "template_param", None
        return "template", None
    return "literal", None

def template_to_key(text: str):
    """`سفارش ${x} ثبت` -> ('سفارش {p0} ثبت', ['x'])"""
    exprs = []
    out = []
    i = 0
    n = len(text)
    buf = ""
    while i < n:
        c = text[i]
        if c == "$" and i + 1 < n and text[i + 1] == "{":
            depth = 1
            j = i + 2
            while j < n and depth:
                if text[j] == "{":
                    depth += 1
                elif text[j] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            expr = text[i + 2:j]
            out.append(buf)
            buf = ""
            exprs.append(expr)
            out.append("{p%d}" % (len(exprs) - 1))
            i = j + 1
            continue
        buf += c
        i += 1
    out.append(buf)
    return "".join(out), exprs

# ── per-file scan ────────────────────────────────────────────────────────

def mask_line(line: str) -> str:
    """Blank out string literals & comments so the JSX-text regex won't match them."""
    out = list(line)
    i = 0
    n = len(line)
    in_bc = False
    while i < n:
        c = line[i]
        if not in_bc and c == "/" and i + 1 < n and line[i + 1] == "/":
            for k in range(i, n):
                out[k] = " "
            break
        if not in_bc and c == "/" and i + 1 < n and line[i + 1] == "*":
            in_bc = True
            out[i] = out[i + 1] = " "
            i += 2
            continue
        if in_bc:
            if c == "*" and i + 1 < n and line[i + 1] == "/":
                out[i] = out[i + 1] = " "
                in_bc = False
                i += 2
                continue
            out[i] = " "
            i += 1
            continue
        if c in ("'", '"', "`"):
            q = c
            j = i + 1
            while j < n:
                if line[j] == "\\":
                    out[j] = " "
                    if j + 1 < n:
                        out[j + 1] = " "
                    j += 2
                    continue
                if line[j] == q:
                    break
                out[j] = " "
                j += 1
            out[i] = " "
            if j < n:
                out[j] = " "
            i = j + 1
            continue
        i += 1
    return "".join(out)

def scan_file(path: str, rel: str):
    occ = []
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
    except Exception as e:
        print(f"  !! read error {rel}: {e}")
        return occ
    is_tsx = rel.endswith(".tsx")
    for lineno, line, tokens in tokenize_lines(lines):
        for tok in tokens:
            kind, text, col = tok[0], tok[1], tok[2]
            if not has_persian(text):
                continue
            if kind == "comment":
                occ.append(dict(file=rel, line=lineno, type="comment",
                                text=text.strip()[:400], ctx=line.strip()[:300]))
                continue
            if kind in ("string", "template"):
                ctype, name = classify(line, kind, col)
                # template param detection on full text
                if kind == "template" and "${" in text:
                    ctype = "template_param"
                occ.append(dict(file=rel, line=lineno, type=ctype, name=name,
                                text=text[:600], ctx=line.strip()[:300]))
        if is_tsx:
            masked = mask_line(line)
            for m in re.finditer(r">([^<>{}\n]*[\u0600-\u06FF][^<>{}\n]*)<", masked):
                txt = m.group(1).strip()
                if txt and has_persian(txt):
                    occ.append(dict(file=rel, line=lineno, type="jsx_text",
                                    text=txt[:600], ctx=line.strip()[:300]))
    return occ

# ── main ─────────────────────────────────────────────────────────────────

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    all_occ = []
    files_scanned = 0
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if not (fn.endswith(".ts") or fn.endswith(".tsx")) or fn.endswith(".d.ts"):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, SRC)
            files_scanned += 1
            all_occ.extend(scan_file(full, rel))

    catalog = {}
    for o in all_occ:
        key = o["text"]
        params = None
        if o["type"] == "template_param" or "${" in o["text"]:
            k, exprs = template_to_key(o["text"])
            key = k
            params = exprs
        entry = catalog.setdefault(key, dict(
            count=0, types=defaultdict(int), params=params,
            occurrences=[], client_files=0, server_files=0))
        entry["count"] += 1
        entry["types"][o["type"]] += 1
        if is_server_file(o["file"]):
            entry["server_files"] += 1
        else:
            entry["client_files"] += 1
        if len(entry["occurrences"]) < 6:
            entry["occurrences"].append(dict(file=o["file"], line=o["line"], type=o["type"]))
        o["key"] = key

    by_type = defaultdict(int)
    for o in all_occ:
        by_type[o["type"]] += 1
    client_occ = sum(1 for o in all_occ if not is_server_file(o["file"]))
    server_occ = len(all_occ) - client_occ
    stats = dict(
        files_scanned=files_scanned,
        total_occurrences=len(all_occ),
        client_occurrences=client_occ,
        server_occurrences=server_occ,
        unique_strings=len(catalog),
        unique_client_only=sum(1 for e in catalog.values() if e["server_files"] == 0),
        unique_server_only=sum(1 for e in catalog.values() if e["client_files"] == 0),
        by_type=dict(by_type),
    )
    with open(os.path.join(OUT_DIR, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(dict(strings=catalog), f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT_DIR, "occurrences.json"), "w", encoding="utf-8") as f:
        json.dump(all_occ, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT_DIR, "stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)

    print(json.dumps(stats, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
