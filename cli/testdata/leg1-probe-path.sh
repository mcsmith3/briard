set -u
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
say() { printf 'briard-probe:%s=%s\n' "$1" "$2"; }
GIT=$(briard_tool git) || GIT=""
BUN=$(briard_tool bun) || BUN=""
HERDR=$(briard_tool herdr) || HERDR=""
TS=$(briard_tool tailscale) || TS=""
CURL=$(briard_tool curl) || CURL=""
TAR=$(briard_tool tar) || TAR=""
SHA=$(briard_tool sha256sum) || SHA=$(briard_tool shasum) || SHA=""
say home "$HOME"
say git "$GIT"
say bun "$BUN"
say herdr "$HERDR"
say curl "$CURL"
say tar "$TAR"
say sha256 "$SHA"
CFG=""
if [ -n "$HERDR" ]; then CFG=$("$HERDR" plugin config-dir 'herdr.briard' 2>/dev/null | head -n 1 | tr -d '\r') || CFG=""; fi
say configdir "$CFG"
ENVHOST=""; ENVPORT=""; ENVMUX=""
if [ -n "$CFG" ] && [ -f "$CFG/.env" ]; then
  ENVHOST=$(sed -n "s/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}BRIARD_HOST=//p" "$CFG/.env" | tail -n 1 | tr -d "\"'\r")
  ENVPORT=$(sed -n "s/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}BRIARD_PORT=//p" "$CFG/.env" | tail -n 1 | tr -d "\"'\r")
  ENVMUX=$(sed -n "s/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}BRIARD_MUX=//p" "$CFG/.env" | tail -n 1 | tr -d "\"'\r")
fi
say envhost "$ENVHOST"
say envport "$ENVPORT"
say envmux "$ENVMUX"
CHECKOUT=""
for _d in '/srv/briard' '/srv/briard/current'; do
  _d=${_d%/}
  [ -f "$_d/herdr-plugin.toml" ] || continue
  grep -Fq "herdr.briard" "$_d/herdr-plugin.toml" 2>/dev/null || continue
  CHECKOUT="$_d"
  break
done
say checkout "$CHECKOUT"
CHECKOUTGIT=""; INSTALLROOT=""
if [ -n "$CHECKOUT" ]; then
  if [ -e "$CHECKOUT/.git" ]; then CHECKOUTGIT=yes; else CHECKOUTGIT=no; fi
  case "$CHECKOUT" in
    */current)
      _r=${CHECKOUT%/current}
      if [ -d "$_r/versions" ]; then INSTALLROOT="$_r"; fi
      ;;
  esac
fi
say checkoutgit "$CHECKOUTGIT"
say installroot "$INSTALLROOT"
COMMIT=""; DIRTY=""; DIRTYFILES=""; BRANCH=""; VERSION=""
if [ -n "$CHECKOUT" ] && [ -n "$GIT" ]; then
  COMMIT=$("$GIT" -C "$CHECKOUT" rev-parse HEAD 2>/dev/null) || COMMIT=""
  BRANCH=$("$GIT" -C "$CHECKOUT" symbolic-ref -q --short HEAD 2>/dev/null) || BRANCH=""
  if [ -n "$COMMIT" ]; then
    DIRTYFILES=$("$GIT" -C "$CHECKOUT" status --porcelain 2>/dev/null | head -n 5 | tr "\n" " ")
    if [ -n "$DIRTYFILES" ]; then DIRTY=yes; else DIRTY=no; fi
  fi
fi
if [ -n "$CHECKOUT" ] && [ -x "$CHECKOUT/bin/briard" ]; then
  VERSION=$("$CHECKOUT/bin/briard" version 2>/dev/null | head -n 1) || VERSION=""
fi
say commit "$COMMIT"
say branch "$BRANCH"
say dirty "$DIRTY"
say dirtyfiles "$DIRTYFILES"
say version "$VERSION"
ADDR=""
if [ -n "$TS" ]; then ADDR=$("$TS" ip -4 2>/dev/null | head -n 1) || ADDR=""; fi
say address "$ADDR"
PORTSTATE=unknown
SS=$(briard_tool ss) || SS=""
NETSTAT=$(briard_tool netstat) || NETSTAT=""
LISTEN=""
if [ -n "$SS" ]; then LISTEN=$("$SS" -ltn 2>/dev/null) || LISTEN=""
elif [ -n "$NETSTAT" ]; then LISTEN=$("$NETSTAT" -ltn 2>/dev/null) || LISTEN=""; fi
if [ -n "$LISTEN" ]; then
  if printf '%s\n' "$LISTEN" | grep -q "[:.]9000[[:space:]]"; then PORTSTATE=busy; else PORTSTATE=free; fi
fi
say port "$PORTSTATE"
say probe ok
