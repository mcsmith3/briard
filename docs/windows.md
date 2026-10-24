# Briard on Windows

How to install Briard on Windows 11, open it on your phone, and fix what can go wrong. Read
[Security](security.md) first: Briard gives remote shell access to your machine by design.

On Linux and macOS, `briard start` can publish Briard to your phone for you, with Tailscale Serve.
Tailscale is a service that joins your own devices into a private network, called a tailnet.

On Windows, Briard does not publish itself. Tailscale Serve gives Briard an HTTPS address on your
tailnet, and on Windows you run that one step by hand.
[Reaching it from your phone](#reaching-it-from-your-phone) shows how.

> **Experimental.** Experimental means the maintainer owns and tests the Windows code, and the
> parts below are not all proven yet. This is the whole status:
>
> **Tested**
> - A 25-step install, update and rollback rehearsal on a Windows 11 virtual machine, against local
>   copies of the release files.
> - A real install from the public v1.16.0 release on a Windows 11 virtual machine: `install.ps1`
>   found the release, the sha256 matched and `briard.exe` ran. Then `briard start`,
>   `briard status`, `briard doctor` and `briard stop` worked.
> - Phone access through Tailscale Serve over HTTP, on a Headscale tailnet: the Host check,
>   `briard url`, pairing and the write gate.
>
> **Not tested yet**
> - An update between two real releases on Windows.
> - The HTTPS form of Tailscale Serve on Windows, and with it the home screen install, Web Push and
>   the microphone.
> - Windows 10, Windows Server, Windows on ARM, and the other items in
>   [What is not tested](#what-is-not-tested).
>
> The release check requires the Windows zip from now on. Only the maintainer can override that, for
> a Linux hotfix ([details](#a-release-without-a-windows-zip)).

## What you get

Briard shows the agents in your terminal on your phone, so you can see which one needs you and
answer it.

The agents run in [Herdr](https://herdr.dev) panes. A pane is one terminal window inside Herdr.
Herdr is a terminal multiplexer, a program that keeps your agents running in panes. On Windows,
Herdr is the only supported multiplexer.

Briard reads agents such as Claude Code, Codex, OpenCode, pi and omp. The agent itself must run on
Windows. Which ones do is the agent's matter, not Briard's.

## Before you start

You need these:

- **Windows 11 on x64.** WSL is not Windows here. Inside WSL, follow the Linux install in
  [Install](install.md).
- **PowerShell.** The Windows PowerShell 5.1 that comes with Windows 11 is enough.
- **Herdr 0.9.3 or newer for Windows.** Step 1 below installs it. The Herdr project makes its
  Windows build, and Briard depends on it.
- **A phone** with a browser, an iPhone or an Android phone.
- **A free Tailscale account.** You create it when you first sign in to the Tailscale app. The PC
  and the phone must sign in to the same one. The phone reaches the PC through it, and step 6 sets
  it up.

Check whether Smart App Control is on, because it can block `briard.exe`. Open Windows Security,
then **App & browser control**, then **Smart App Control settings**. It has three states:

| State | What it means for this install |
| --- | --- |
| Off | It blocks nothing. |
| Evaluation | Windows is still deciding whether to turn it on. It did not block Briard on the test VM. |
| On | It can block `briard.exe`, because the file is not signed, and it has no per-file allow. |

If it is on, read [Unsigned binary](#unsigned-binary-smartscreen-and-smart-app-control) first. It
lists your choices.

## Zero to phone

Follow these steps in order. After the list, you find what you should see after each step. To read
the installer script before you run it, see [Install](#install).

1. Install Herdr with its own installer, then check the version:

   ```powershell
   irm https://herdr.dev/install.ps1 | iex
   herdr --version
   ```

2. Install Briard with its installer:

   ```powershell
   irm https://raw.githubusercontent.com/mcsmith3/briard/main/scripts/install.ps1 | iex
   ```

3. Open a NEW terminal, start Herdr there, and leave it open:

   ```powershell
   herdr
   ```

4. Open a second terminal, or a new Herdr pane, then start Briard and print its address:

   ```powershell
   briard start
   briard url
   ```

5. In a Herdr pane, start your agent, for example Claude Code:

   ```powershell
   claude
   ```

6. Give the phone a way in with [Reaching it from your phone](#reaching-it-from-your-phone), which
   the project ran over HTTP only on Windows. Briard answers no device until you pair one.

7. On the phone, type that address into the browser, or send it to yourself, then add Briard to the
   home screen, as shown in [Open it on your phone](#open-it-on-your-phone).

8. Pair the phone by running this on the PC:

   ```powershell
   briard pair
   ```

What you should see after each step:

1. Herdr prints its installer output. `herdr --version` prints 0.9.3 or newer. This page has no
   Herdr command of its own, because the Herdr project owns the installer. If this one fails, open
   [herdr.dev](https://herdr.dev) and follow its Windows steps.
2. The script prints each step. It ends with a line that starts with `OK  Briard` and a list of next
   steps, which begins with `Next steps. This script does not take them for you:`, then
   `1. Open a NEW terminal window.` and `3. Start Briard, then print its address:`. To read the
   script first, see [Install](#install).

   No service starts and nothing stays running. The script runs `briard.exe version` once, to check
   that Windows lets it run, and that is all.
3. Herdr opens and takes over that terminal. A new terminal is needed because Windows gives the new
   PATH only to windows opened after the install.
4. A second terminal is needed because Herdr holds the first one. `briard start` prints the
   **Briard is running** banner and a note that Briard publishes no front door here. A front door is
   the HTTPS address in front of Briard that your phone opens. That note is
   expected on Windows: step 6 does that part by hand. Before Tailscale is installed, it also
   prints this line on stderr: `error: 'tailscale status' named no host for this node`. That line
   is expected at this point, and it goes away after step 6.
5. Your agent starts in the pane. Briard shows it on its dashboard.
6. `tailscale serve status` shows your tailnet address, and `briard url` prints it. Before this
   step, `briard url` may print a loopback address (`127.0.0.1`), an address that only this PC can
   open. You can open that one in a browser on this PC to see the dashboard.
7. The phone shows the Briard dashboard. Panes that wait for you come first.
8. `briard pair` prints a code of eight characters, then a line like `single-use · expires
   <time> (10 minutes)`, then a QR code. Type the code into Briard on the phone, in the app you
   opened from the home screen. Then the phone is paired.

## Install

What `install.ps1` does, and what you can change.

```powershell
irm https://raw.githubusercontent.com/mcsmith3/briard/main/scripts/install.ps1 | iex
```

To read the script before you run it, save it, open it and run it as a file:

```powershell
Invoke-WebRequest -OutFile install.ps1 https://raw.githubusercontent.com/mcsmith3/briard/main/scripts/install.ps1
notepad install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

`install.ps1` needs no Bun, no Git and no `bash`. It looks at the newest five releases, takes the
first one that has a Windows zip, checks its sha256 and stops on a mismatch. A sha256 is a fingerprint of the
file. The script prints each step, and it never asks for administrator rights. If no release
carries the zip, it stops as [described below](#a-release-without-a-windows-zip).

The default execution policy, `Restricted`, which is the Windows rule for which scripts may run,
refuses a downloaded script file. The last line of the
"read it first" variant sets `Bypass` for that one run. `Unblock-File .\install.ps1` is the other
way. The `irm ... | iex` form runs the script text directly and does not need this.

The script puts a release in `%LOCALAPPDATA%\briard\versions\<version>`, points the `current`
junction at it, and adds `current\bin` to your user PATH. A junction is a Windows folder link, and
`current` always points at the version that runs. The script runs `briard.exe version` once to
check that Windows lets it run. It starts nothing else. A second run changes nothing and points at
`briard update`.

| Variable | Effect |
| --- | --- |
| `BRIARD_DIR` | Where to install. Default `%LOCALAPPDATA%\briard`. Keep it short. |
| `BRIARD_TAG` | Install one exact release, for example `v1.16.0`. |
| `BRIARD_UPDATE_REPO` | The GitHub repository to download from. Default `mcsmith3/briard`. |
| `BRIARD_NO_PATH_EDIT=1` | Leave your PATH alone. Run `<BRIARD_DIR>\current\bin\briard.exe`. |

The zip is also on each release page on GitHub, beside its `.sha256` file. Use the script, not a
hand install of the zip.

`briard start` registers a Task Scheduler task named `herdr.briard`. Task Scheduler is the Windows
program that runs jobs at set times or events. The task starts Briard at your logon with a limited
token, which means without administrator rights.

The task runs a launcher, a small program that starts the bridge again if the bridge exits with an
error. The bridge is the Briard program that runs on your PC and serves the web page to your phone.

The launcher also restarts a bridge that is still running but has stopped answering. Two minutes
after a start it asks the bridge's health check every 30 seconds, and three misses in a row, about
90 seconds of silence, end the bridge so the launcher starts it again. A crew peer with no standby
door is not asked: its only door is mutual TLS.

## Reaching it from your phone

Step 6 of Zero to phone, in full. These are the same steps as on Linux and macOS, done by hand.
The project ran them once on Windows, over HTTP, on a Headscale tailnet (Headscale is a self-hosted
Tailscale server), with a desktop browser at phone size. The HTTPS form below was not run, and no
real phone or agent was used. If a step fails, report it ([where](#when-something-breaks)).

> **Note.** After the `tailscale serve` command (step 3 below), every device on your tailnet can
> reach Briard, but it answers each one `device not paired` until you run `briard pair` and enter
> the code on the phone. Read [Security](security.md) on how to limit who may reach Briard.

1. Install Tailscale on the PC and on the phone, and sign in to the same account on both:
   [tailscale.com/download](https://tailscale.com/download).

2. In the Tailscale [admin console](https://login.tailscale.com/admin/dns), open **DNS**, turn on
   MagicDNS, then select **Enable HTTPS**.

3. In a new terminal on the PC, publish Briard's local port, 8787 by default, on your tailnet:

   ```powershell
   tailscale serve --bg --set-path=/ 8787
   ```

4. Create the Briard config folder if it is missing, then open its `.env` file:

   ```powershell
   New-Item -ItemType Directory -Force "$env:APPDATA\herdr\plugins\config\herdr.briard"
   notepad "$env:APPDATA\herdr\plugins\config\herdr.briard\.env"
   ```

5. Add these two lines at the end of the file, with your own name from step 3, and save:

   ```text
   BRIARD_PUBLIC_HOSTS=myhost.tail1234.ts.net
   BRIARD_PUBLIC_URL=https://myhost.tail1234.ts.net
   ```

6. Restart the bridge, then print the address:

   ```powershell
   briard restart
   briard url
   ```

Briard listens on this PC only, at a loopback address that only this PC can reach. On Linux and
macOS, `briard start` runs Tailscale Serve for you. That is what "managed front door" means: Briard
publishes the address itself. On Windows, `briard start` does not, so you run Tailscale Serve
yourself.

In step 3, Tailscale prints a line with an address like `https://myhost.tail1234.ts.net`. The name
is the part after `https://`. Copy it. `tailscale serve status` shows the same address:

```text
https://myhost.tail1234.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:8787
```

The command is the same one that `briard start` runs for you on Linux and macOS. `--set-path=/`
replaces whatever this PC already serves at `/` on your tailnet.

> **Note.** On a Headscale tailnet, the HTTPS command in step 3 fails with
> `error enabling https feature: error 501 Not Implemented`, because Headscale issues no HTTPS
> certificates. Until you publish, `briard doctor` warns on its `front-door` line:
> `this tailnet has no HTTPS certificates, so an https front door cannot be published`.
>
> There, publish over HTTP, which is the form the project ran on Windows:
> `tailscale serve --bg --http=80 --set-path=/ 8787`. It publishes on tailnet port 80, so the
> address is `http://<name>` with no port. Use that `http://` address in `BRIARD_PUBLIC_URL`.
> After that command, the `front-door` line passes. In 1.16.0 it keeps the warning.
>
> Plain HTTP is acceptable here because Tailscale encrypts the traffic between tailnet devices
> (WireGuard), and the HTTP hop stays inside the tailnet. Never use `tailscale funnel`. Over HTTP
> the home screen install, Web Push and the microphone stay off.
>
> On Linux and macOS, Briard's own HTTP mode publishes on the bridge port instead
> ([`BRIARD_SERVE_MODE`](configure.md#the-environment-still-wins)). Briard does not run Serve on
> Windows, so that variable changes no publishing here.

On a tailnet with HTTPS on, Tailscale gives the address a certificate that the phone trusts. On
Headscale, see the Note above. Installing to the home screen, Web Push (notifications to your
phone) and the microphone need HTTPS. Over plain HTTP they stay off
([Voice input and Web Push](voice-and-push.md)).

In step 4, Notepad asks whether to create the file if it is not there. Click **Yes**. The folder
is the Herdr plugin config folder for `herdr.briard`, by default
`%APPDATA%\herdr\plugins\config\herdr.briard`. Briard asks Herdr for it, so
`herdr plugin config-dir herdr.briard` prints it.

`BRIARD_PUBLIC_HOSTS` is the Host check: Briard reads the website name in each request and refuses
any name that is not on this list, which stops a web page from reaching it through DNS rebinding.
`BRIARD_PUBLIC_URL` is the address that `briard url` and the QR code of `briard pair` print. Open
Briard by the full name: the Host check refuses the tailnet IP address and the short name.
Briard also tries to find the tailnet name itself at start. The two lines make it certain.

Briard does not manage this mapping on Windows. `briard stop` and `briard uninstall` leave it in
place. `tailscale serve status` shows it, and `tailscale serve reset` clears every Serve mapping
on the PC. Never use `tailscale funnel`: Funnel puts Briard on the public internet.

If you prefer a reverse proxy, a program that forwards web requests to Briard, or another tunnel,
[Deployment](deployment.md) describes the variants. That is
[Variant C](deployment.md#variant-c--reverse-proxy-as-the-only-front-door-no-tailscale), with
`BRIARD_PUBLIC_HOSTS` set to the name your phone opens. The first `briard start` raises no firewall
prompt, because Briard listens on this machine only.

### Open it on your phone

1. Get the address from `briard url` to the phone: type it in, or send it to yourself. On an
   iPhone, open it in Safari. On an Android phone, open it in Chrome. The phone needs the Tailscale app, signed in to your tailnet.
2. Add Briard to the home screen, so that it opens full screen like an app:
   - **iPhone:** in Safari, tap **Share**, tap **Add to Home Screen**, then tap **Add**.
   - **Android:** in Chrome, open Briard **Settings** and tap **Install** on the top card.
3. Open Briard from the new icon.
4. In the app, open **Settings**, then **System**, then **Paired devices**.
5. Run `briard pair` on the PC, type the code and a name, then tap **Pair this device**.

Type the code in the app that you opened from the icon. Do not scan the QR code that `briard pair`
prints: the camera opens it in a browser tab, and on an iPhone the home screen app keeps its own
storage, separate from Safari, so a pairing made in the tab does not carry over.

The code is good for 10 minutes and works once. Run `briard pair` again if it ran out. Pairing ends the open access in the Caution above
([Pair a device](security.md#pair-a-device--the-write-credential)).

## Everyday commands

Run these in any terminal. Each works as it does on Linux and macOS, with the Windows notes below.

| Command | What it does on Windows |
| --- | --- |
| `briard start` | Registers the `herdr.briard` task if needed and starts the bridge. |
| `briard stop` | Disables the task, ends a running bridge and its launcher, and prints `bridge stopped`. Briard stays off, also at your next logon, until `briard start`. |
| `briard restart` | Restarts the bridge alone. |
| `briard status` | Names the task and its state, and shows the **Briard is running** banner. |
| `briard doctor` | Checks the install, Herdr, long paths and secret files, and prints a fix for each problem. |
| `briard url` | Prints the address to open on the phone. |
| `briard logs` | Prints the last lines of the log file. |
| `briard update` | Updates to the newest release ([Update](#update)). |
| `briard update --rollback` | Goes back to the previous version ([Update](#update)). |
| `briard uninstall` | Removes the task ([Uninstall](#uninstall)). |

### Update

Update from the terminal or from the phone, the same as on Linux and macOS:

```powershell
briard update
```

The update fetches the release, swaps `briard.exe`, restarts the bridge and checks that it
answers. If it does not answer, Briard rolls back to the version that worked, in about a minute
and a quarter. The phone's Update button runs the same chain.

To go back by hand, run this. It needs no network. It points `current` at the newest older version
that is still on disk and restarts the bridge. If that version does not come up, Briard goes
forward again and changes nothing:

```powershell
briard update --rollback
```

An old version folder can stay in `versions\` until the launcher restarts, because Windows will
not delete a folder a running program holds. The next update removes it.

> **Caution.** A source checkout never updates itself on Windows: `briard update` and the phone
> button say so in one sentence and change nothing. Every Windows install made before the first
> zip is a source checkout. Moving to the zip install is a one-time manual step: run
> `briard uninstall` to remove the old task, then run `install.ps1`. After that, `briard update`
> works.

Briard allows one install per Windows machine, and `briard start` refuses a task that runs
another one, which is why the old task goes first. You can also stay on a source checkout and
update it by hand: fetch the newer tag, run `bun run build`, then `briard restart`. The build
needs Git for Windows' `bash`.

Releases up to and including v1.15.0 cannot swap a running `briard.exe` and fail with `EPERM`.
The fix (PR 309) first shipped in v1.15.1. The later Windows update work, such as the phone's
Update button on Windows, first ships in v1.16.0.

### Uninstall

```powershell
briard uninstall
```

`briard uninstall` stops the bridge and removes the Task Scheduler task. It keeps the install
folder, your `.env` and the user PATH entry, as every install keeps its files. Then it prints two
more lines for PowerShell. The first removes the install folder. The second removes only
`current\bin` from your user PATH, through the registry. Briard prints the two lines on one line
each, with your real folder in them. They look like this, wrapped here to fit:

```powershell
cmd /c rmdir /s /q "<install folder>"
$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
$k.SetValue('Path', (($k.GetValue('Path', '', 'DoNotExpandEnvironmentNames') -split ';' |
  Where-Object { $_.TrimEnd('\') -ne '<install folder>\current\bin' }) -join ';'),
  $k.GetValueKind('Path'))
$k.Close()
```

Copy the lines from Briard's own output when you can. Briard does not remove a `tailscale serve`
mapping that you made by hand ([Reaching it from your phone](#reaching-it-from-your-phone)).

## When something breaks

Run `briard doctor` first, then find your problem below.

`briard doctor` checks the install and prints a fix for each problem it finds. Then read the
section below that matches what you see. If none does, look in the log, described in
[Logs](#logs).

To report a problem, open an issue at
[github.com/mcsmith3/briard/issues](https://github.com/mcsmith3/briard/issues). Say that you run
Windows, give the Briard version from `briard version`, and paste the `briard doctor` output and
the last lines of the log. Remove anything private first. The log can hold pane text.

### Unsigned binary: SmartScreen and Smart App Control

`briard.exe` is not signed, so Windows does not know who published it. Read this before you run
the installer.

Two Windows features can stop an unsigned program:

- **SmartScreen** asks before it runs a program that came from the internet. For a file you
  downloaded in a browser, click **More info**, then **Run anyway**.
- **Smart App Control** has no per-file allow. If it is on and it blocks Briard, you cannot allow
  that one file. `install.ps1` shows the block when it runs `briard.exe version`, and prints no
  success line.

If Smart App Control blocks Briard, you have these choices, in this order:

1. Check whether it is on: open Windows Security, then **App & browser control**, then **Smart App
   Control settings**.
2. Build from source ([Build from source](#build-from-source)), which makes `briard.exe` on your
   own machine. This was not tested on a machine where Smart App Control is on.
3. Use a PC where Smart App Control is off, or report the block in an issue.
4. Last, turn Smart App Control off. This is hard to undo: Microsoft's documentation has said that
   turning it on again may need a Windows reset, so read Microsoft's current page first.

The sha256 check in `install.ps1` finds a damaged or swapped download. It does not say who
published the file, because the hash sits beside the zip, and whoever can replace one can replace
the other. Signing the binary is a possible later step, with no date.

### Long paths

**What you see:** a pane does not open, and Herdr says `The directory name is invalid (os error
267)`. `briard doctor` warns first: `LongPathsEnabled is 0 on this machine`.

Herdr cannot start a pane in a folder whose path is longer than 260 characters unless Windows
long paths are on. `briard doctor` also warns when the install folder itself is very long.

In a PowerShell run as administrator:

```powershell
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' `
  -Name LongPathsEnabled -Value 1
```

Windows may need a restart before programs that are already running see it. Keep your work
folders short in any case.

### Task Scheduler refuses a standard user

**What you see:** `briard start` fails with `error: schtasks /Create /TN herdr.briard failed`,
Windows reports `0x80070569`, and Briard says the account lacks the right "Log on as a batch job".

This affects a standard user account that never had that right. An administrator account usually
has it.

An administrator grants the right:

1. Run `secpol.msc`.
2. Open Local Policies, then User Rights Assignment.
3. Open **Log on as a batch job**, and add the account.
4. Run `briard start` again.

Windows Home does not ship `secpol.msc`.

### Secret files

**What you see:** `briard doctor` prints a `secrets-private` line, for example
`can be read by other accounts`, with a fix.

Briard limits who can read its secret files: your account, SYSTEM and Administrators. Windows has
no `0600` mode, so Briard sets the access list (ACL) of its state and config folders.

```powershell
briard doctor
```

The `secrets-private` line has three answers:

| Answer | Meaning |
| --- | --- |
| Private | The folders are private to your account, SYSTEM and Administrators. |
| Loose | Another account can read a folder or a secret. This is an error, and `doctor` prints the fix. |
| Not checked | Briard cannot read the list, so it says `cannot confirm`. This is a warning. |

A folder on a network share or a FAT or exFAT volume is "not checked", because there is no list
to read. Keep the state and config folders on an NTFS drive in this PC.

The bridge repairs a loose folder at start, but only a folder Briard created now, a default
folder in your user profile, or a folder that is empty or holds only Briard's own files. Any other
folder is checked and warned about, with the `icacls` command that fixes it. `briard doctor` and
other commands change nothing.

To undo a repair: before it, the bridge saves the old list in `acl-backups` in the state folder
and prints the undo line. Run it in a terminal run as administrator:

```powershell
icacls <folder> /restore <backup file>
```

`BRIARD_NO_ACL_REPAIR=1` turns every change off. Briard still checks and warns. The full account
of the rules is in [Secret files on Windows](security.md#secret-files-on-windows).

### Logs

The bridge log is `briard.log` in the plugin config folder
(`%APPDATA%\herdr\plugins\config\herdr.briard\briard.log` by default). `briard logs` prints its last
lines. Briard only appends to it and never rotates it, so the file grows for as long as the bridge
runs. To empty it, run `briard stop`, delete the file, then run `briard start`.

### Build from source

The release zip needs no toolchain. A build from source still needs Bun, Git and Git for Windows'
`bash` on your PATH, because `bun run build` calls `bash`. A build without `bash` is planned and
not done.

## What is supported

One host: Windows 11 on x64, with Herdr as the multiplexer.

A **crew** is several machines that each run a Briard, shown behind one URL ([Crews](crew.md)).

| | Supported | Not supported, may work, untested |
| --- | --- | --- |
| Windows | Windows 11, x64 | Windows 10, Windows Server and Windows on ARM |
| Multiplexer | Herdr 0.9.3 or newer for Windows | tmux, zellij and tuios: none has a native Windows build |
| Service | Task Scheduler, one Briard per machine | A Windows service, winget and MSI |
| Crew | Briard on one machine | A Windows machine joining a crew |
| Front door | You publish it yourself, by hand | A front door that Briard manages |
| Binary | `briard.exe`, unsigned, with a sha256 | A signed binary |

These limits also hold:

- Briard allows one install per Windows machine. The task name is always `herdr.briard`.
- Briard does not rotate `briard.log` ([Logs](#logs)).
- `herdr plugin install` is not a Windows install path. Use `install.ps1`, then `briard start`.
- Herdr's action buttons do not exist on Windows, because they need `bash`.
- A permission that a hook holds is not on Windows yet. Briard builds no hold socket there, so every permission stays a screen ask.
- The nightly harness lab runs on Linux only. It is not on Windows.
- Herdr's Windows build is made by the Herdr project. Briard depends on it and does not control it.

### Crews

A Windows machine cannot join a crew in this release. `briard crew invite`, `crew join`,
`crew add`, `crew deputy`, `crew approve-promote` and `briard promote` refuse on Windows, say so in
one sentence and change nothing. Briard on one Windows machine works on its own.

## Moving from the community script

What changes if you ran the community script, and what does not carry over.

Before this release, Windows ran under `contrib/windows/briard-ctl.ps1`, a script the community wrote. Briard now runs the task itself, and every verb of the script is a `briard` verb of the same name. After you update, run `briard restart` once. If the script ran the task named `herdr.briard`, Briard takes it over under the same name. Until you restart, `briard status` and `briard doctor` say that the task still runs the old script.

Two things do not carry over:

- **A custom task name.** The script let you set `BRIARD_TASK_NAME`. Briard does not read it, and the task is always `herdr.briard`. A task you registered under another name stays where it is, and Briard does not stop or remove it. Delete it before you run `briard start`, or two supervisors will start the bridge. In PowerShell: `schtasks /Delete /TN "<your task name>" /F`.
- **Crash-log copies.** The script kept a copy of the log when the bridge failed. Briard does not. The old copies stay on disk until you delete them.

## How this is tested, and when experimental ends

Why Briard says experimental, for readers who want the evidence. You do not need it to use Briard.

Two words on this page have a fixed meaning:

- **Supported** means the maintainer owns the Windows code and tests it: a CI run on every push,
  and a rehearsal on a Windows 11 virtual machine before each release tag
  ([ADR 0075](../.adr/0075-windows-is-a-supported-host.md)). CI is the automatic test run on
  GitHub. An ADR is a short decision record kept in the repository.
- **Experimental** means an update between two real releases and the HTTPS phone path are not yet
  proven.

The inherited Windows support was validated upstream as follows; Briard has not yet published a Windows release:

- The `windows.yml` workflow, a CI workflow, runs the bridge, cli and scripts tests on
  `windows-latest` for every pull request and every push to `main`. It is not yet a required check.
  Branch protection must be configured for this repository before relying on it.
- Each release builds `briard-<version>-windows-x64.zip` with a `.sha256` file.
- Windows 11 is the second truth beside CI, because the CI runner is Windows Server.
- The real install from the public v1.16.0 release ran on a Windows 11 VM. `install.ps1` found the
  release, downloaded the zip, the sha256 matched, and `briard.exe` ran as 1.16.0. `briard start`
  registered the task and started the bridge. `briard status` said running, `briard doctor` exited
  0, and `briard stop` stopped it. The fork retains that installer implementation under its new name.
- Phone access ran on a Windows 11 VM on a Headscale tailnet, over HTTP. `tailscale serve --bg
  --http=80 --set-path=/ <port>` published Briard. The two `.env` lines and `briard restart` made
  `briard url` and the `briard start` banner print the tailnet name. From another tailnet machine,
  the page, `/api/health` and `/api/snapshot` answered by the full name, and a request by tailnet IP
  address or by the short name was refused. Pairing in the phone interface worked, and after it a
  write without the credential got 403 "device not paired". A desktop browser at phone size stood
  in for the phone.
- Smart App Control on the test VM is in evaluation mode, and neither Smart App Control nor
  SmartScreen has blocked Briard there. This page describes what Windows documents, not a block
  that was seen.

The word experimental leaves only when all of these are true together:

1. A release carries the Windows zip, `install.ps1` is published with the project, and one install and one
   update have run against a real release. These checks must be repeated against Briard releases once they exist.
2. The Windows check is a required check in branch protection. Branch protection is the GitHub
   setting that blocks a merge until the named checks pass.
3. The release gate reads the Windows workflow. The gate is the first step of the release
   workflow, which waits for the tests before it publishes.
4. The tolerance for a missing Windows zip is off. It is off now, as the next section says.

### A release without a Windows zip

The release check requires the Windows zip from now on. Only the maintainer can override that, for
a Linux hotfix. The release job checks this in `scripts/windows-asset.ts`. It looks for an earlier
stable release (not a draft, not a prerelease) that carries the zip, and v1.16.0 is one. From 2026-11-15 the zip is mandatory in any case, and it is
also mandatory when GitHub's release list does not answer. The one exception is a switch that the
maintainer can set for a Linux hotfix while the Windows build is broken, the repository variable
`BRIARD_WINDOWS_ASSET_OVERRIDE`. A release made under that switch carries no Windows zip.

Releases before v1.16.0 have no Windows zip. What you see when the newest release has none:

- `install.ps1` looks at the newest five releases. For each one it prints
  `<tag> has no Windows build. Trying the next older release.` Then it prints
  `briard install: none of the newest 5 releases of mcsmith3/briard carries a Windows build yet.
  Nothing was installed.` and ends with `Install failed.` and a line that tells you to pin a
  release that has one. It changes nothing on your machine. To pin one, set `BRIARD_TAG`.
- `briard update` on a Windows install says `error: release <version> has no Windows build; try
  again after the next release. Nothing was changed.`

To check, open the release page on GitHub and look for a file named
`briard-<version>-windows-x64.zip`.

### What is not tested

Plain list, so nothing here reads as a promise:

- An update between two real releases on Windows. The rehearsal used a local copy of the release
  files.
- The HTTPS form of Tailscale Serve on Windows (Headscale answered `501 Not Implemented`), and with
  it the home screen install, Web Push and the microphone. Also a real phone, an agent running in a
  Herdr pane, and a reverse proxy, in place of
  [Tailscale Serve](#reaching-it-from-your-phone).
- A manual `briard update --rollback` on Windows. The automatic rollback after a failed update was
  rehearsed.
- Moving from a source checkout to the zip install, and updating a source checkout by hand.
- Installing the zip by hand, without `install.ps1`.
- Windows 10, Windows Server, Windows on ARM, tmux, zellij and tuios on Windows.
- pi and OmO in a Herdr pane on Windows. Briard reads their screens from Linux captures only, and the
  Windows console may lay out their rows differently.
- A real Smart App Control block, and PowerShell 7 for `install.ps1`.
- A build from source on a machine where Smart App Control is on.
- The Task Scheduler fix on Windows Home. The route was checked with a standard user whose name held
  a space and a non-ASCII letter.
- A FAT volume with real hardware. The "not checked" answer is covered by unit tests.
- A second Briard's task being refused, covered by unit tests only.
- Whether Explorer sees the new PATH without a sign-out, and a PATH edit by a standard user.
- The `local-cli` voice provider with a real engine. Its cleanup was tested with a test command:
  Briard ends the command's process tree, but a process started by a helper that has already exited
  can outlive it ([Voice input and Web Push](voice-and-push.md#run-your-own-command-the-local-cli-provider)).
