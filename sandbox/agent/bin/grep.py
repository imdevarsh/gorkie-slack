#!/usr/bin/env python3
import base64
import fnmatch
import json
import os
import re
import sys

def expand_braces(value):
  if not value or "{" not in value:
    return [value] if value else []
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
  include = params.get("include")
  limit = int(params.get("limit") or 100)

  if not pattern:
    raise ValueError("pattern is required")
  if not os.path.isdir(path):
    raise ValueError(f"Not a directory: {path}")

  include_patterns = expand_braces(include) if include else []
  regex = re.compile(pattern)

  skip_dirs = {".git", "node_modules", ".venv", "venv"}
  matches = []
  truncated = False

  def matches_include(relpath):
    if not include_patterns:
      return True
    return any(fnmatch.fnmatch(relpath, p) for p in include_patterns)

  for root, dirs, files in os.walk(path):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for name in files:
      relpath = os.path.relpath(os.path.join(root, name), path)
      if not matches_include(relpath):
        continue
      full = os.path.join(root, name)
      try:
        if os.path.getsize(full) > 2_000_000:
          continue
        with open(full, "r", errors="ignore") as f:
          for line_num, line in enumerate(f, start=1):
            if regex.search(line):
              text = line.rstrip("\n")
              if len(text) > 2000:
                text = text[:2000] + "..."
              try:
                mtime = os.path.getmtime(full)
              except OSError:
                mtime = 0
              matches.append((full, mtime, line_num, text))
              if len(matches) >= limit:
                truncated = True
                raise StopIteration
      except StopIteration:
        break
      except OSError:
        continue
    if truncated:
      break

  matches.sort(key=lambda x: x[1], reverse=True)

  if not matches:
    output = "No files found"
  else:
    output_lines = [f"Found {len(matches)} matches"]
    current = ""
    for file_path, _, line_num, text in matches:
      if file_path != current:
        if current:
          output_lines.append("")
        current = file_path
        output_lines.append(f"{file_path}:")
      output_lines.append(f"  Line {line_num}: {text}")
    if truncated:
      output_lines.append("")
      output_lines.append("(Results are truncated. Consider using a more specific path or pattern.)")
    output = "\n".join(output_lines)

  print(json.dumps({
    "path": path,
    "count": len(matches),
    "truncated": truncated,
    "output": output
  }))

if __name__ == "__main__":
  try:
    main()
  except Exception as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
