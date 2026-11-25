"""Refresh the service worker release after editing its cached files."""
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
worker = root / 'sw.js'
source = worker.read_text()
paths = json.loads(re.search(r'const SHELL = (\[.*?\]);', source, re.S)[1])
digest = hashlib.sha256()
for resource in paths:
    digest.update((root / resource.split('?')[0]).read_bytes())
version = digest.hexdigest()[:16]
updated, count = re.subn(
    r"const CACHE = PREFIX \+ '[^']+';", f"const CACHE = PREFIX + '{version}';", source
)
if count != 1:
    raise ValueError('Expected one offline cache identifier')
worker.write_text(updated)
print(version)
