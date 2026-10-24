set -eu
umask 077
CFG='/cfg'
mkdir -p "$CFG"
ENVFILE="$CFG/.env"
TMP="$ENVFILE.briard-add.$$"
trap 'rm -f "$TMP"' EXIT INT TERM
: > "$TMP"
chmod 600 "$TMP"
KEYS='BRIARD_HOST|BRIARD_PORT|BRIARD_MUX'
if [ -f "$ENVFILE" ]; then
  grep -v -E "^[[:space:]]*(export[[:space:]]+)?($KEYS)=" "$ENVFILE" >> "$TMP" || true
fi
printf 'BRIARD_HOST=%s\n' '100.1.2.3' >> "$TMP"
printf 'BRIARD_PORT=%s\n' '8787' >> "$TMP"
printf 'BRIARD_MUX=%s\n' 'tmux' >> "$TMP"
[ -s "$TMP" ] || { echo "error: refusing to write an empty .env" >&2; exit 30; }
mv "$TMP" "$ENVFILE"
printf 'briard-configure:env=%s\n' "$ENVFILE"
