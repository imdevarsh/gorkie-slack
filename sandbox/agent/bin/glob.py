#!/usr/bin/env python3
import base64
import json
import os
import sys
from pathlib import Path

def expand_braces(value):
  if "{" not in value:
    return [value]
  start = value.find("{")
  end = value.find("}", start + 1)
  if start == -1 or end == -1:
    return [value]
  prefix = value[:start]
  suffix = value[end + 1 :]
  options = value[start + 1 : end].split(",")
  return [prefix + opt + suffix for opt in options]

def main():
  params = json.loads(base64.b64decode(os.environ.get("PARAMS", "")) or b"{}")
  pattern = params.get("pattern") or ""
  path = params.get("path") or "."
  limit = int(params.get("limit") or 100)

  if not pattern:
    raise ValueError("pattern is required")
  if not os.path.isdir(path):
    raise ValueError(f"Not a directory: {path}")

  patterns = expand_braces(pattern)
  root = Path(path)
  matches = []
  seen = set()
  for pat in patterns:
    for item in root.glob(pat):
      if not item.is_file():
        continue
      full = os.path.normpath(str(item))
      if full in seen:
        continue
      seen.add(full)
      try:
        mtime = item.stat().st_mtime
      except OSError:
        mtime = 0
      matches.append((full, mtime))

  matches.sort(key=lambda x: x[1], reverse=True)
  truncated = False
  if len(matches) > limit:
    matches = matches[:limit]
    truncated = True

  paths = [os.path.normpath(p) for p, _ in matches]
  output = "\n".join(paths)

  print(json.dumps({
    "path": path,
    "count": len(paths),
    "truncated": truncated,
    "output": output,
    "matches": paths
  }))

if __name__ == "__main__":
  try:
    main()
  except Exception as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
