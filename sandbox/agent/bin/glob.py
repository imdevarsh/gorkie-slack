#!/usr/bin/env python3
import base64
import glob
import json
import os
import sys

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
  params = json.loads(base64.b64decode(os.environ.get("PARAMS_B64", "")) or b"{}")
  pattern = params.get("pattern") or ""
  path = params.get("path") or "."
  limit = int(params.get("limit") or 100)

  if not pattern:
    raise ValueError("pattern is required")
  if not os.path.isdir(path):
    raise ValueError(f"Not a directory: {path}")

  patterns = expand_braces(pattern)
  matches = []
  seen = set()
  for pat in patterns:
    for item in glob.glob(os.path.join(path, pat), recursive=True):
      if not os.path.isfile(item):
        continue
      full = os.path.normpath(item)
      if full in seen:
        continue
      seen.add(full)
      try:
        mtime = os.path.getmtime(full)
      except OSError:
        mtime = 0
      matches.append((full, mtime))

  matches.sort(key=lambda x: x[1], reverse=True)
  truncated = False
  if len(matches) > limit:
    matches = matches[:limit]
    truncated = True

  paths = [os.path.relpath(p, path) for p, _ in matches]
  output = "\n".join(paths) if paths else "No files found"

  print(json.dumps({
    "path": path,
    "count": len(paths),
    "truncated": truncated,
    "output": output
  }))

if __name__ == "__main__":
  try:
    main()
  except Exception as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
