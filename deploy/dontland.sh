#!/bin/sh
set -eu

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEPLOY_ROOT=${DEPLOY_ROOT:-$(CDPATH= cd -- "$APP_DIR/.." && pwd)}
SHARED_DIR="$DEPLOY_ROOT/shared"
NODE_VERSION=v24.19.0
PORT=${PORT:-3000}

case "$(uname -m)" in
  x86_64)
    NODE_ARCH=x64
    NODE_SHA256=f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4
    ;;
  aarch64|arm64)
    NODE_ARCH=arm64
    NODE_SHA256=d28c8a5bf0a808f0ed434a1dce8c54ae98f0371c0bd86ac58abc613f73e6643f
    ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

NODE_DIST="node-$NODE_VERSION-linux-$NODE_ARCH"
NODE_HOME="$SHARED_DIR/$NODE_DIST"
mkdir -p "$SHARED_DIR"

if [ ! -x "$NODE_HOME/bin/node" ]; then
  tmp=$(mktemp -d)
  cleanup_download() { rm -rf "$tmp"; }
  trap cleanup_download EXIT HUP INT TERM
  base="https://nodejs.org/dist/$NODE_VERSION"
  archive="$NODE_DIST.tar.gz"
  python3 -c 'import sys,urllib.request; urllib.request.urlretrieve(sys.argv[1],sys.argv[2])' "$base/$archive" "$tmp/$archive"
  actual=$(sha256sum "$tmp/$archive" | cut -d' ' -f1)
  [ "$actual" = "$NODE_SHA256" ] || { echo 'Node.js checksum verification failed' >&2; exit 1; }
  tar -xzf "$tmp/$archive" -C "$SHARED_DIR"
  cleanup_download
  trap - EXIT HUP INT TERM
fi

export PATH="$NODE_HOME/bin:$PATH"
cd "$APP_DIR"
case "${DEPLOY_PHASE:-all}" in
  prepare)
    npm ci --omit=dev --no-audit --no-fund
    echo "dontland-dev-prepared node=$($NODE_HOME/bin/node --version)"
    exit 0
    ;;
  activate) ;;
  all) npm ci --omit=dev --no-audit --no-fund ;;
  *) echo "Unknown DEPLOY_PHASE: ${DEPLOY_PHASE:-}" >&2; exit 1 ;;
esac

health_check() {
  python3 - "$PORT" <<'PY'
import json, sys, time, urllib.request
url=f'http://127.0.0.1:{sys.argv[1]}/healthz'
for _ in range(30):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            if response.status == 200 and json.load(response).get('status') == 'ok':
                raise SystemExit(0)
    except Exception:
        time.sleep(1)
raise SystemExit(1)
PY
}

start_with_systemd() {
  command -v systemctl >/dev/null 2>&1 || return 1
  command -v loginctl >/dev/null 2>&1 || return 1
  [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || true)" = yes ] || return 1
  systemctl --user show-environment >/dev/null 2>&1 || return 1
  unit_dir="$HOME/.config/systemd/user"
  mkdir -p "$unit_dir"
  cat > "$unit_dir/dontland-dev.service" <<EOF
[Unit]
Description=don-t-land dev paper-plane service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DEPLOY_ROOT/current
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$NODE_HOME/bin/node $DEPLOY_ROOT/current/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable dontland-dev.service >/dev/null
  systemctl --user restart dontland-dev.service
}

start_with_pidfile() {
  pid_file="$SHARED_DIR/app.pid"
  if [ -f "$pid_file" ]; then
    old_pid=$(cat "$pid_file" 2>/dev/null || true)
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      cmdline=$(tr '\000' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null || true)
      case "$cmdline" in
        *"$DEPLOY_ROOT/current/server.js"*) ;;
        *) echo "Refusing to stop unrelated PID $old_pid" >&2; return 1 ;;
      esac
      kill "$old_pid" 2>/dev/null || true
      i=0
      while kill -0 "$old_pid" 2>/dev/null && [ "$i" -lt 20 ]; do sleep 1; i=$((i+1)); done
      if kill -0 "$old_pid" 2>/dev/null; then
        echo "Previous app PID $old_pid did not stop" >&2
        return 1
      fi
    fi
  fi
  nohup env NODE_ENV=production PORT="$PORT" "$NODE_HOME/bin/node" "$DEPLOY_ROOT/current/server.js" >> "$SHARED_DIR/app.log" 2>&1 </dev/null &
  echo $! > "$pid_file"
}

restart_app() {
  if [ "${DONTLAND_USE_SYSTEMD:-1}" = 1 ] && start_with_systemd; then
    APP_START_MODE=systemd
    return 0
  fi
  start_with_pidfile
  APP_START_MODE=pidfile
}

verify_started_process() {
  if [ "$APP_START_MODE" = systemd ]; then
    systemctl --user is-active --quiet dontland-dev.service
    return
  fi
  pid=$(cat "$SHARED_DIR/app.pid" 2>/dev/null || true)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 1
  cmdline=$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  case "$cmdline" in
    *"$DEPLOY_ROOT/current/server.js"*) return 0 ;;
    *) return 1 ;;
  esac
}

restart_app
if health_check && verify_started_process; then
  echo "dontland-dev-ready port=$PORT node=$($NODE_HOME/bin/node --version)"
  exit 0
fi

echo 'New release failed health verification; attempting rollback.' >&2
if [ -n "${PREVIOUS_RELEASE:-}" ] && [ -d "$PREVIOUS_RELEASE" ]; then
  ln -sfn "$PREVIOUS_RELEASE" "$DEPLOY_ROOT/current.rollback"
  mv -Tf "$DEPLOY_ROOT/current.rollback" "$DEPLOY_ROOT/current"
  restart_app
  health_check || true
fi
exit 1
