#!/usr/bin/env python3
import base64
import json
import os
import sys

def main():
  params = json.loads(base64.b64decode(os.environ.get("PARAMS_B64", "")) or b"{}")
  path = params.get("path") or ""
  offset = int(params.get("offset") or 0)
  limit = int(params.get("limit") or 200)

  if not path:
    raise ValueError("path is required")
  if not os.path.exists(path):
    raise ValueError(f"File not found: {path}")

  with open(path, "r", errors="ignore") as f:
    lines = f.readlines()

  total = len(lines)
  start = max(0, offset)
  end = min(total, start + max(1, limit))
  content = "".join(lines[start:end])

  print(json.dumps({
    "path": path,
    "totalLines": total,
    "offset": start,
    "linesReturned": max(0, end - start),
    "content": content
  }))

if __name__ == "__main__":
  try:
    main()
  except Exception as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
