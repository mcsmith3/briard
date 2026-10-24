# Flockr differences from the Herdr API

Probe: 2026-10-24 on Linux, Flockr **1.0.0**, Herdr **0.9.1**, socket protocol **22**.
Read this alongside [HERDR_API.md](HERDR_API.md). Briard shares the implementation under
`bridge/mux/herdr/`, with profiles supplying names and host conventions.

| Convention | Flockr value |
| --- | --- |
| Binary, plugin | `flockr`, `flockr.briard` |
| Manifest, minimum | `flockr-plugin.toml`, `min_flockr_version = "1.0.0"` |
| Default socket | `~/.config/flockr/flockr.sock` |
| Named socket | `~/.config/flockr/sessions/<name>/flockr.sock` |
| Environment | `FLOCKR_SOCKET_PATH`, `FLOCKR_PANE_ID`, `FLOCKR_ENV`, `FLOCKR_CONFIG_PATH`, `FLOCKR_HOME`, `FLOCKR_PLUGIN_CONFIG_DIR`, `FLOCKR_PLUGIN_STATE_DIR`, `FLOCKR_PLUGIN_ROOT` |
| Config, worktrees | `~/.config/flockr/config.toml`, `~/.flockr/worktrees` |
| Hooks | `flockr-agent-state.sh`, `flockr-agent-state.ts`, `flockr-omp-agent-state.ts` |

`api schema --json` shows the additional `layout.select`, `layout.sort_by_age`, `pane.clear`,
`pane.mark_unread`, `pane.link.list` and the `completion_seq`, `restore_error`,
`ssh_agent_registration` fields. Flockr lacks `pane.graphics.*`. Briard uses none of these differences.
`session.snapshot` retains the envelope and workspace/tab/pane shape the shared client parses.
A scrubbed real answer is in `bridge/mux/herdr/captures/flockr-snapshot-1.0.0.json`.

`plugin config-dir flockr.briard` answered the conventional Flockr plugin config directory.
`integration status` uses the same `agent: current (vN) (path)` lines with Flockr hook names.
`machine list --json` answered `[]`; the nonempty grammar is covered by shared fixtures, not a
populated live machine list. `--default-config` documents `~/.flockr/worktrees`.

Both headless `--session briard-probe server` instances exposed their named sockets. Separate
scratch bridges on ports 18787 (Flockr) and 18788 (Herdr), with Tailscale serve bypassed, were
paired through the CLI and `/api/pair`. Authenticated `curl` requests to `/api/snapshot` and
`/api/pane/w1:p1` succeeded. `/api/send` returned `outcome: sent`; each tool's own
`--session briard-probe pane read w1:p1 --source visible --lines 10` showed the echo command
and its `BRIARD_PHASE2_FLOCKR_OK` or `BRIARD_PHASE2_HERDR_OK` output.

Windows uses `%APPDATA%\flockr\flockr.sock`, falling back to the user's `AppData\Roaming`,
mirroring Herdr. No Windows Flockr binary was available to verify this convention. The Herdr
0.9.3 Windows minimum is specific to Herdr and is not applied to Flockr 1.0.0. Other declared
capabilities inherit the protocol-22 contract and shared conformance tests; the live probe did
not exercise all writes, agent integrations or Windows behavior.
