set -eu
umask 077
briard_tool() {
  _n=$1
  if _p=$(command -v "$_n" 2>/dev/null); then
    case $_p in
      /*) printf '%s' "$_p"; return 0 ;;
    esac
  fi
  for _c in "${BUN_INSTALL:-$HOME/.bun}/bin/$_n" "$HOME/.bun/bin/$_n" "$HOME/.local/bin/$_n" \
    "/usr/local/bin/$_n" "/opt/homebrew/bin/$_n" "/usr/bin/$_n" "/bin/$_n" "/usr/sbin/$_n" "/sbin/$_n"; do
    if [ -x "$_c" ]; then printf '%s' "$_c"; return 0; fi
  done
  return 1
}
CURL=$(briard_tool curl) || { echo "error: no curl on this machine" >&2; exit 20; }
TAR=$(briard_tool tar) || { echo "error: no tar on this machine" >&2; exit 21; }
SHA=$(briard_tool sha256sum) || SHA=$(briard_tool shasum) || { echo "error: no sha256 tool on this machine" >&2; exit 22; }
PATH="$(dirname "$CURL"):$(dirname "$TAR"):$(dirname "$SHA"):$PATH"
export PATH
DIR='/home/pat/.local/share/briard'
EXPECT='1.2.3'
WORK=$(mktemp -d "${TMPDIR:-/tmp}/briard-add.XXXXXX")
trap 'rm -rf "$WORK"' EXIT INT TERM
cat > "$WORK/install.sh" <<'__BRIARD_PAYLOAD__'
#__BRIARD_STDIN__
__BRIARD_PAYLOAD__
BRIARD_DIR="$DIR" BRIARD_UPDATE_REPO='mcsmith3/briard' BRIARD_TAG='v1.2.3' /bin/sh "$WORK/install.sh" 1>&2
ROOT="$DIR/current"
[ -x "$ROOT/bin/briard" ] || { echo "error: the install left no binary at $ROOT/bin/briard" >&2; exit 25; }
VERSION=$("$ROOT/bin/briard" version | head -n 1)
case "$VERSION" in
  "$EXPECT"*) ;;
  *) echo "error: installed $VERSION, expected $EXPECT" >&2; exit 26 ;;
esac
printf 'briard-install:root=%s\nbriard-install:version=%s\n' "$ROOT" "$VERSION"
