#!/bin/sh
# ipatool wrapper for headless containers:
# - trust bundle that includes the Apple Root CA (absent from the system store)
# - dead D-Bus address so ipatool falls back to its encrypted file keychain
# - keychain passphrase comes from the environment (never baked into the image)
export SSL_CERT_FILE="${SSL_CERT_FILE:-/usr/local/share/apple-ca-bundle.pem}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/tmp/nonexistent-bus}"
if [ -n "${IPATOOL_KEYCHAIN_PASSPHRASE:-}" ]; then
  exec /usr/local/bin/ipatool-bin --keychain-passphrase "$IPATOOL_KEYCHAIN_PASSPHRASE" "$@"
fi
exec /usr/local/bin/ipatool-bin "$@"
