#!/bin/sh
set -eu
PORT=${PORT:-3000}
python3 - "$PORT" <<'PY'
import json, sys, urllib.request
url=f'http://127.0.0.1:{sys.argv[1]}/healthz'
with urllib.request.urlopen(url, timeout=5) as response:
    assert response.status == 200
    assert json.load(response) == {'status': 'ok'}
print(f'dontland-dev-health-ok url={url}')
PY
