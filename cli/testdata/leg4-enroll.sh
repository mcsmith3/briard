set -eu
ROOT='/home/pat/.briard'
exec "$ROOT/bin/briard" 'join' 'desk.tail.ts.net' '-' '--address' '100.1.2.3:8787' '--label' 'nas' <<'__BRIARD_PAYLOAD__'
#__BRIARD_STDIN__
__BRIARD_PAYLOAD__
