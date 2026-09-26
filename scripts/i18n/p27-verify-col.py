#!/usr/bin/env python3
"""PHASE 27 — verify User.language column (read-only)."""
import sqlite3

con = sqlite3.connect("file:db/custom.db?mode=ro", uri=True)
cols = [r[1] for r in con.execute('PRAGMA table_info("User")')]
print("has language:", "language" in cols)
print("has guideTooltips:", "guideTooltips" in cols)
rows = con.execute('SELECT language, COUNT(*) FROM "User" GROUP BY language').fetchall()
print("language distribution:", rows)
con.close()
