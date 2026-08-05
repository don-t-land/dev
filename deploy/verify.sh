#!/bin/sh
set -eu
PORT=${PORT:-3000}
python3 - "$PORT" <<'PY'
import json, sys, urllib.request
url=f'http://127.0.0.1:{sys.argv[1]}/healthz'
with urllib.request.urlopen(url, timeout=5) as response:
    assert response.status == 200
    payload=json.load(response)
    assert payload.get('status') == 'ok'
    assert isinstance(payload.get('release'), str) and payload['release']
print(f"dontland-dev-health-ok url={url} release={payload['release']}")
PY
