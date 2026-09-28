#!/usr/bin/env bash
#
# Generate a self-signed TLS certificate for local development.
# Includes localhost, 127.0.0.1, and all local-network IPs as SANs
# so the browser treats the page as a secure context.
#
# Usage:
#   ./scripts/generate-cert.sh            # auto-detect IPs
#   ./scripts/generate-cert.sh 192.168.0.103  # explicit IP
#
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/.certs"
mkdir -p "$CERT_DIR"

# Collect SANs: localhost + 127.0.0.1 + local IPs
sans="DNS:localhost,IP:127.0.0.1"

if [ $# -gt 0 ]; then
  for ip in "$@"; do
    sans="$sans,IP:$ip"
  done
else
  while IFS= read -r ip; do
    sans="$sans,IP:$ip"
  done < <(ifconfig 2>/dev/null \
    | grep 'inet ' \
    | awk '{print $2}' \
    | grep -v '^127\.' \
    || true)
fi

echo "Generating self-signed cert with SANs: $sans"

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -days 365 \
  -subj "/CN=dost-dev" \
  -addext "subjectAltName=$sans" \
  2>/dev/null

echo ""
echo "Certificate generated:"
echo "  cert: $CERT_DIR/cert.pem"
echo "  key:  $CERT_DIR/key.pem"
echo ""
echo "Add these to your .env:"
echo "  TLS_CERT=.certs/cert.pem"
echo "  TLS_KEY=.certs/key.pem"
echo ""
echo "On your phone, open https://<your-ip>:3000/dev/voice"
echo "and accept the self-signed certificate warning."
