# Commands

Every verb uses the format **`briard <verb>`**. This is the canonical syntax across all
installations, implemented directly in the binary (`cli/`). Before adding `briard` to your PATH
([below](#put-briard-on-your-path)), run `bin/briard <verb>` from the repository root. On a
Herdr-managed installation, these same verbs register as Herdr actions ([below](#herdr-actions))
with identical behavior.

If the host runs multiple instances, prepend `BRIARD_INSTANCE=<name>` to every verb. See
[Multiple Briard instances on one host](deployment.md#multiple-briard-instances-on-one-host).

| Verb | Command | What it does |
| --- | --- | --- |
| **Start** | `briard start` | Build if needed, serve, print the URL |
| **Stop** | `briard stop` | Pause the bridge; removes nothing |
| **Restart** | `briard restart` | Stop, then start |
| **Status** | `briard status` | The *Briard is running* banner + URLs |
| **URL** | `briard url` | Print the tailnet URL |
| **QR** | `briard qr` | The same URL as a scannable code |
| **Version** | `briard version` | The running version (`0.x.y+sha`) |
| **Skill** | `briard skill` | The agent-facing brief on Briard, for an AI coding agent working in your terminal (also `briard --skill`). `briard skill install`, `uninstall`, `sync`, `status` and `print` manage the walky talky skill in your agents' instruction files; `briard update` runs `sync` after each update ([Install the skill](walky-talky.md#install-the-skill)) |
| **Docs** | `briard docs` · `briard docs <name>` · `briard docs --all` | These pages, printed out of the binary itself |
| **Update** | `briard update` | Stage the newest release of your major, flip to it, restart and verify (`--check` preflights, `--status` reports, `--major` crosses one) |
| **Rollback** | `briard update --rollback` | Put the previous version back (not on a Herdr-managed checkout, which has none staged) |
| **Uninstall** | `briard uninstall` | Remove the service; keep `.env` and the install |
| **Pair** | `briard pair` · `briard pair --expires <duration>` | Print an 8-character code and a QR code, good for 10 minutes; scan the QR code to open Settings → System → Paired devices with the code filled in, or enter the code manually to get it [paired](security.md#pair-a-device--the-write-credential). Without `--expires` the token never expires and the command says so; with it (`12h`, `30d`, `2w`) the command prints the date the token stops working once claimed. A script claims the code with a label of its own, for example `script`, and pairs once ([Give a device an expiry](security.md#give-a-device-an-expiry)) |
| **Devices** | `briard devices list` · `briard devices revoke <label>` · `briard devices set-expiry <label> <duration>` · `briard devices clear-expiry <label>` | List / revoke paired devices, or change when one [expires](security.md#give-a-device-an-expiry). `list` shows each device's expiry as `no expiry`, `expires <date>` or `EXPIRED <date>`. `set-expiry` counts a new lifetime from now; `clear-expiry` removes it. A label matches exactly, or without case when only one device fits |
| **Link** | `briard link` · `briard unlink` | Put `briard` on your PATH ([below](#put-briard-on-your-path)) |
| **Logs** | `briard logs` | Tail the service log |
| **Config** | `briard config show` · `briard config check` · `briard config init` | Print every setting with its source, validate the file, or write a commented `config.toml` ([the config file](configure.md#the-config-file)) |
| **Durable agents** | `briard durable attach <name> --socket <path>` · `briard durable attach <name> --url <url> --token-env <VAR>` · `briard durable detach <name>` · `briard durable list` | Add a durable agent to `sources.json`, remove it, or list each durable agent with the state the running bridge gives it. `attach` and `detach` apply at the next restart, or at once with `--restart`. Flags, output and exit codes: [Durable agents](durable-agents.md#the-three-verbs) |
| **Walky talky** | `briard walky who` · `briard walky send <address> <text>` · `briard walky reply <id> <text>` · `briard walky inbox` · `briard walky status <id>` | Message an agent session from a terminal, or from one agent to another ([Walky talky](walky-talky.md)) |
| **Voice** | `briard stt setup` · `stt test` · `stt status` · `stt off` | Configure / check / disable [voice input](voice-and-push.md#voice-input-optional) |
| **Push keys** | `briard push-keys` | Generate the VAPID keypair into your `.env` |
| **Push test** | `briard push-test` | Send one notification to prove it works |

The CLI also includes `build`, `serve`, `unserve`, `doctor`, and `crew …` for less frequent tasks.

Both `start` and `status` output the **Briard is running** banner: a health mark and the version,
then a `service`, a `local` and a `tailnet` line.
[First run](install.md#first-run-what-youll-see) shows it in full, including what a failed health
check prints instead. The reported version reads from the served bundle stamp, reflecting the active
build.

**Ink or plain text.** The `start`, `status`, `doctor`, `crew add`, and `crew status` commands
render an interactive terminal UI when stdout is a TTY. Passing `--plain`, or redirecting output to
a pipe, file, systemd journal, or CI runner, falls back to raw line output.


## Put `briard` on your PATH

Run `briard link` to publish `~/.local/bin/briard`:

```bash
bin/briard link          # ~/.local/bin/briard → <checkout>/bin/briard
briard status            # from anywhere
bin/briard unlink        # take the name back down
```

It creates a **symlink to the checkout's binary**, so future `briard build` updates take effect
immediately without extra steps
([ADR 0021](../.adr/0021-the-path-name-is-a-pointer-never-a-copy.md)). The command replaces existing
links from other Briard checkouts and prints which one it overwrote. It refuses to overwrite
non-Briard files at that path. `unlink` removes the symlink only if it targets *your* current
checkout.

If `~/.local/bin` is missing from your `PATH`, `link` warns you and exits. It never edits your shell
profile. Run `briard doctor` to check the `path-link` line and see which checkout the bare `briard`
command resolves to.

## Herdr actions

**Applies only to a Herdr-managed install** created with `herdr plugin install mcsmith3/briard` or
`herdr plugin link`, or a Flockr-managed one created with `flockr plugin install mcsmith3/briard`
or `flockr plugin link`. Flockr registers the same actions from `flockr-plugin.toml`; spell them
with `flockr` and `--plugin flockr.briard`. These actions map directly
to the adapter: each action forwards the verb to the same `briard` binary documented in the table
above. On binary installs created via `scripts/install.sh`, plugin actions do not exist, and
`briard <verb>` is the only syntax.

Briard registers these actions in `herdr-plugin.toml`. Invoke them with
`herdr plugin action invoke <id> --plugin herdr.briard`, or view them with
`herdr plugin action list --plugin herdr.briard`:

| `<id>` | Equivalent verb | What it does |
| --- | --- | --- |
| `start` | `briard start` | Build if needed, start the service, `tailscale serve`, print URL + banner |
| `stop` | `briard stop` | Pause the bridge; removes nothing |
| `restart` | `briard restart` | `stop` + `start` |
| `status` | `briard status` | The *Briard is running* banner — readiness ✓/⚠, version, URLs |
| `url` | `briard url` | Print the tailnet URL |
| `version` | `briard version` | Print the running version (`0.x.y+sha`) |
| `update` | `briard update` | Advance the checkout (pull, or fetch + re-detach) + rebuild + restart |
| `uninstall` | `briard uninstall` | Tear down the service (keeps `.env` + checkout) |
| `push-keys` | `briard push-keys` | Write a VAPID keypair into the `.env` the service reads |
| `push-test` | `briard push-test` | Push one notification to every subscribed device |

`qr`, `pair`, `devices`, `link`, `logs`, `stt`, and `config` have no corresponding plugin action
because they require a terminal, positional arguments, or both. Run them as `briard <verb>`.

**Herdr actions return Herdr's JSON envelope instead of the terminal banner.** View the action's
captured stdout with `herdr plugin log list --plugin herdr.briard`, or run `briard <verb>` directly
to print output inline. Output from `herdr plugin list --json` reflects the version cached during
`plugin link`, not the active version. For linked clones, `update` re-links automatically to fix the
cache. You can force this with `herdr plugin link "$(pwd)"`. Herdr ≥0.8.0 re-reads the manifest from
disk on each invocation.

> **Note.** `scripts/briard-ctl.sh <verb>` remains supported. It operates as a bootstrap shim: it locates
> Bun, compiles `bin/briard` if the checkout lacks it, and passes along argv. A freshly linked clone
> uses this path to build its initial binary. Herdr actions continue to point to this script because
> Herdr <0.8.0 freezes the action definitions cached at install time
> ([ADR 0006](../.adr/0006-update-advances-the-checkout-herdr-installed.md)). Each verb is
> implemented once inside the compiled binary in `cli/`.


---

[← back to the README](../README.md)
