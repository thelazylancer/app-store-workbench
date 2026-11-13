#!/usr/bin/env bash
set -euo pipefail

# Builds the patched ipatool binary used by the container image.
# The output is gitignored, so a fresh clone must run this once (or copy the
# binary out of an existing image) before `docker compose build` can succeed.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PATCH_FILE="$ROOT_DIR/deploy/ipatool-authcode.patch"
OUT_PATH="${1:-$ROOT_DIR/deploy/vendor/ipatool-authcode-linux-amd64}"
IPATOOL_REPO="${IPATOOL_REPO:-https://github.com/majd/ipatool.git}"
IPATOOL_VERSION="${IPATOOL_VERSION:-v2.8.1}"
GO_IMAGE="${GO_IMAGE:-golang:1.26-bookworm}"

for command in docker git; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "error: $command is required" >&2
    exit 1
  }
done

[ -f "$PATCH_FILE" ] || {
  echo "error: patch not found: $PATCH_FILE" >&2
  exit 1
}

work_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

echo "Cloning ipatool $IPATOOL_VERSION..."
clone_attempt=0
until git clone --quiet --depth 1 --branch "$IPATOOL_VERSION" "$IPATOOL_REPO" "$work_dir/ipatool"; do
  clone_attempt=$((clone_attempt + 1))
  rm -rf "$work_dir/ipatool"
  if [ "$clone_attempt" -ge 3 ]; then
    echo "error: could not clone $IPATOOL_REPO after 3 attempts" >&2
    exit 1
  fi
  echo "clone failed; retrying in 5s..." >&2
  sleep 5
done

echo "Applying deploy/ipatool-authcode.patch..."
git -C "$work_dir/ipatool" apply "$PATCH_FILE"

network_args=()
if [ -n "${IPATOOL_BUILD_NETWORK:-}" ]; then
  network_args=(--network "$IPATOOL_BUILD_NETWORK")
  echo "Using Docker network: $IPATOOL_BUILD_NETWORK"
fi

proxy_args=()
for variable in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy GOPROXY GOPRIVATE GONOSUMDB; do
  value="${!variable-}"
  if [ -n "$value" ]; then
    proxy_args+=(-e "$variable=$value")
  fi
done

echo "Building with $GO_IMAGE..."
docker run --rm \
  "${network_args[@]}" \
  "${proxy_args[@]}" \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e GOCACHE=/tmp/go-cache \
  -e GOPATH=/tmp/go \
  -v "$work_dir/ipatool:/src" \
  -w /src \
  "$GO_IMAGE" \
  sh -c 'CGO_ENABLED=1 go build -trimpath -ldflags "-s -w" -o ipatool-authcode-linux-amd64 .'

mkdir -p "$(dirname "$OUT_PATH")"
mv "$work_dir/ipatool/ipatool-authcode-linux-amd64" "$OUT_PATH"
chmod 755 "$OUT_PATH"

if ! grep -q -- "--auth-code" <("$OUT_PATH" download --help 2>&1); then
  echo "error: built binary does not expose --auth-code" >&2
  exit 1
fi

echo "Wrote $OUT_PATH"
sha256sum "$OUT_PATH"
