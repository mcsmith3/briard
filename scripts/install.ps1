# Briard's installer for Windows. It downloads the Windows release, checks its sha256, lays it down,
# and puts `briard` on your user PATH. It is the Windows twin of install.sh.
#
# Run it like this, in PowerShell:
#
#   irm https://raw.githubusercontent.com/mcsmith3/briard/main/scripts/install.ps1 | iex
#
# You can also download this file, read it, and run it by hand:
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#
# Windows marks a file that a browser downloaded (the Mark of the Web), and a RemoteSigned policy then
# refuses it as "not digitally signed". After you have read it, clear the mark with:
#
#   Unblock-File .\install.ps1
#
# This file is one page with no helpers to fetch, so you can read all of it before you run it.
# What it will never do:
#   - It never asks for admin rights.
#   - It never writes outside BRIARD_DIR, except one entry in your user PATH.
#   - It never starts a service or a task. It runs one program once: the new briard.exe, as
#     `briard.exe version`, to check that Windows lets it run.
#   - It never sends anything anywhere. It only downloads the release files.
#   - It never installs a download whose sha256 does not match. There is no flag to skip the check.
# It ends by PRINTING the next steps. It never takes them for you.
#
# It needs no toolchain: no Bun, no Git, no bash. It needs Windows 10 build 19041 or newer on x64,
# and Windows PowerShell 5.1 or PowerShell 7. Briard on Windows is experimental, and briard.exe is
# not signed. The sha256 check is the only check that the download is the one the release published.
#
# Three environment variables steer what it installs:
#   BRIARD_DIR          where to install. Default: %LOCALAPPDATA%\briard
#   BRIARD_UPDATE_REPO  which GitHub repository to download from. Default: mcsmith3/briard
#   BRIARD_TAG          install one exact release tag, for example v1.16.0. A pin skips the tag
#                       lookup, so the script makes no call to api.github.com.
# A GitHub token in BRIARD_GITHUB_TOKEN, GH_TOKEN or GITHUB_TOKEN goes only to api.github.com, with
# the one call that lists the tags. It never goes with a download and never to a mirror.
# Two more exist on Windows only, and neither is in install.sh:
#   BRIARD_NO_PATH_EDIT=1     do not change the user PATH. Run <BRIARD_DIR>\current\bin\briard.exe.
#   BRIARD_INSTALL_MIRROR     A TEST SEAM for tests and rehearsals, not a way to install. A base URL
#                             that replaces https://api.github.com and https://github.com. Only a
#                             file:/// URL or http://127.0.0.1 or http://localhost (with a port) is
#                             accepted, and a loud line says it is set. The script asks it for
#                             /repos/<repo>/tags and /<repo>/releases/download/<tag>/<file>.
#
# The layout is the one `briard update` reads: <BRIARD_DIR>\versions\<X.Y.Z> holds one release, and
# <BRIARD_DIR>\current is a directory junction to one of them. A standard user can make a junction.
# A symbolic link needs Developer Mode, so this uses none.
#
# Everything is inside functions, and the last line calls them. If the download of this file stops
# half way, `iex` gets no last line, and nothing runs. A failed run ends with a line that starts
# "Install failed." and names one fix, and sets $LASTEXITCODE: 0 when it installed, 1 when it failed.
# Run as a file (`powershell -File install.ps1`), a failure also ends with `exit 1`, which ends only
# that PowerShell. Under `irm | iex` it never calls `exit`, because that would close your window.

# Stop the install. What happened, then the one thing to do about it. The entry function prints both,
# with "Install failed." in front of the fix, as the last line.
function Stop-BriardInstall([string]$What, [string]$Fix = "Fix the problem above, then run the installer again.") {
  $failure = New-Object System.Exception $What
  $failure.Data["BriardFix"] = $Fix
  throw $failure
}

function Write-BriardLine([string]$Text) {
  Write-Host $Text
}

# Is this machine one Briard publishes a binary for? Returns the reason it is not, or $null.
function Get-BriardHostProblem([string]$Arch, [int]$Build) {
  if ($Arch -ne "AMD64" -and $Arch -ne "X64") {
    return "Briard publishes no Windows binary for $Arch. Only x64 (AMD64) is published."
  }
  if ($Build -lt 19041) {
    return "this Windows is build $Build. Briard needs Windows 10 build 19041 or newer, and is tested on Windows 11."
  }
  return $null
}

# The processor of the machine, not of this PowerShell. A 32-bit PowerShell on 64-bit Windows says x86.
function Get-BriardArch {
  try {
    $os = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    if ($null -ne $os) { return $os.ToString() }
  } catch { }
  if ($env:PROCESSOR_ARCHITEW6432) { return $env:PROCESSOR_ARCHITEW6432 }
  return $env:PROCESSOR_ARCHITECTURE
}

# Every value that becomes part of a URL or a path is checked here first, case-sensitively and
# anchored at both ends (\A and \z: `$` would let a trailing newline through). A tag the API or a
# mirror returns is checked the same way as one you typed, so a hostile answer such as
# `v1.0.0\..\..\x` never reaches a path.
function Test-BriardTag([string]$Tag, [switch]$AllowPrerelease) {
  if ($AllowPrerelease) { return $Tag -cmatch '\Av[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?\z' }
  return $Tag -cmatch '\Av[0-9]+\.[0-9]+\.[0-9]+\z'
}

# owner/name, each part from [A-Za-z0-9._-] and not made of dots alone.
function Test-BriardRepo([string]$Repo) {
  if ($Repo -cnotmatch '\A([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+)\z') { return $false }
  return ($Matches[1] -cnotmatch '\A\.+\z') -and ($Matches[2] -cnotmatch '\A\.+\z')
}

# Why Path cannot be the install folder, or $null. It must be a full path on a drive, not a share and
# not the drive itself, and hold no `;` or `%`: the folder goes into your PATH, where `;` splits an
# entry and `%` starts a variable. A space, `&` or a non-ASCII letter is fine.
function Get-BriardDirProblem([string]$Path) {
  if ($Path -cnotmatch '\A[A-Za-z]:[\\/]') { return "BRIARD_DIR='$Path' is not a full path on a drive, such as C:\Users\you\briard" }
  if ($Path.Contains(';') -or $Path.Contains('%')) { return "BRIARD_DIR='$Path' holds a ';' or a '%', which would break your PATH" }
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  if ($full -cmatch '\A[A-Za-z]:\z') { return "BRIARD_DIR='$Path' is the root of a drive" }
  return $null
}

# The strict release tags (vX.Y.Z), newest first, compared as numbers (v1.15.0 is newer than v1.9.0).
# A prerelease is never picked: pin it.
function Sort-BriardTags([string[]]$Names) {
  return @($Names | Where-Object { Test-BriardTag $_ } | Sort-Object { [version]$_.Substring(1) } -Descending)
}

# Check a downloaded file against its sidecar line "<sha256>  <name>" (the name may be left out).
# Returns the problem, or $null.
function Get-BriardDigestProblem([string]$Sidecar, [string]$Name, [string]$Actual) {
  $words = @("$Sidecar".Trim() -split '\s+')
  if ($words.Count -gt 2 -or $words[0] -cnotmatch '\A[0-9a-fA-F]{64}\z') {
    return "$Name.sha256 is not one '<sha256>  <name>' line"
  }
  if ($words.Count -eq 2 -and $words[1].TrimStart('*') -cne $Name) { return "$Name.sha256 names $($words[1]), not $Name" }
  if (-not [string]::Equals($words[0], $Actual, [StringComparison]::OrdinalIgnoreCase)) {
    return "CHECKSUM MISMATCH for $Name"
  }
  return $null
}

# The user PATH with Entry added at the end, or $null when it is there already. Pure, so it is tested
# with strings. The value keeps every byte it had: no entry is reordered, expanded or dropped.
function Add-BriardUserPathEntry([string]$PathValue, [string]$Entry) {
  $want = $Entry.TrimEnd('\')
  foreach ($part in ("$PathValue" -split ';')) {
    if ($part -eq '') { continue }
    $expanded = [Environment]::ExpandEnvironmentVariables($part).TrimEnd('\')
    if ($part.TrimEnd('\') -eq $want -or $expanded -eq $want) { return $null }
  }
  if ("$PathValue" -eq '') { return $Entry }
  # A value that ends in ';' keeps ending in ';', so removing the entry again (the line `briard
  # uninstall` prints) gives back the exact value it had before.
  if ("$PathValue".EndsWith(';')) { return "$PathValue$Entry;" }
  return "$PathValue;$Entry"
}

# Add Entry to HKCU\Environment\Path. No admin is needed. Returns $true when it changed the value.
function Set-BriardUserPath([string]$Entry) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Environment")
  try {
    $raw = $key.GetValue("Path", "", [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
    if ($null -ne $key.GetValue("Path")) { $kind = $key.GetValueKind("Path") }
    if ($kind -ne [Microsoft.Win32.RegistryValueKind]::String -and $kind -ne [Microsoft.Win32.RegistryValueKind]::ExpandString) {
      Stop-BriardInstall "your user PATH is stored as $kind, which this script does not edit." "Add $Entry to your user PATH by hand, or set BRIARD_NO_PATH_EDIT=1 and run the installer again."
    }
    $new = Add-BriardUserPathEntry $raw $Entry
    if ($null -eq $new) { return $false }
    $key.SetValue("Path", $new, $kind)
  } finally {
    $key.Close()
  }
  # Tell open programs that the environment changed, so a terminal started from the Start menu sees
  # the new PATH. .NET sends that message after any user variable change. Removing a variable that
  # does not exist changes nothing in the registry, and still sends the message.
  [Environment]::SetEnvironmentVariable("BRIARD_INSTALL_NOT_A_VARIABLE", $null, "User")
  return $true
}

# The HTTP status of a failed web call, or 0 when no server answered.
function Get-BriardHttpCode($ErrorRecord) {
  $response = $ErrorRecord.Exception.Response
  if ($null -eq $response) { return 0 }
  try { return [int]$response.StatusCode } catch { return 0 }
}

# Is Url a mirror this script accepts? Only a local folder or this machine's loopback address.
function Test-BriardMirror([string]$Url) {
  return $Url -cmatch '\A(file:///[A-Za-z]:/[A-Za-z0-9._~/ -]*|http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?)\z'
}

# Download Url to OutFile. Returns 200, the HTTP status of a failure, or 0 when no server answered.
# A file:/// URL (a mirror folder) is copied, and a missing file answers 404.
function Get-BriardFile([string]$Url, [string]$OutFile) {
  if ($Url.StartsWith("file:///")) {
    $local = ([Uri]$Url).LocalPath
    if (-not (Test-Path -LiteralPath $local -PathType Leaf)) { return 404 }
    Copy-Item -LiteralPath $local -Destination $OutFile
    return 200
  }
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile -ErrorAction Stop
    return 200
  } catch {
    Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
    return (Get-BriardHttpCode $_)
  }
}

# Why a zip entry may not be unpacked, or $null. Every entry must sit under Root/, with no drive, no
# stream (':'), no leading slash and no '..' part. This is what stops a zip that writes outside the
# folder it is unpacked into.
function Get-BriardEntryProblem([string]$Name, [string]$Root) {
  if ($Name -ceq '') { return "an entry with no name" }
  if ($Name.Contains(':')) { return "'$Name' names a drive or a stream" }
  if ($Name.StartsWith('/') -or $Name.StartsWith('\')) { return "'$Name' starts at the root" }
  if (@($Name -split '[\\/]' | Where-Object { $_ -ceq '..' }).Count -gt 0) { return "'$Name' climbs out with '..'" }
  if (-not $Name.StartsWith("$Root/", [StringComparison]::Ordinal)) { return "'$Name' is not under $Root/" }
  return $null
}

# Unpack Zip into Destination, one entry at a time, after EVERY entry has been checked: by name, and
# by its full path, which must start with Destination\. Nothing is written when one entry fails.
# System.IO.Compression is part of Windows; nothing is compiled.
function Expand-BriardZip([string]$Zip, [string]$Destination, [string]$Root) {
  try { Add-Type -AssemblyName System.IO.Compression.FileSystem } catch { }
  $dest = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Zip)
  try {
    $plan = New-Object System.Collections.ArrayList
    foreach ($entry in $archive.Entries) {
      $problem = Get-BriardEntryProblem $entry.FullName $Root
      if ($null -eq $problem) {
        $target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dest, $entry.FullName.Replace('/', '\')))
        if (-not $target.StartsWith($dest, [StringComparison]::OrdinalIgnoreCase)) { $problem = "'$($entry.FullName)' resolves outside the folder" }
      }
      if ($null -ne $problem) { Stop-BriardInstall "the zip is not safe to unpack: $problem. Nothing was installed." "Report it at https://github.com/mcsmith3/briard/issues" }
      [void]$plan.Add(@($entry, $target))
    }
    foreach ($item in $plan) {
      $entry = $item[0]; $target = $item[1]
      if ($entry.FullName.EndsWith('/')) { [void][System.IO.Directory]::CreateDirectory($target); continue }
      [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target))
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
  } finally {
    $archive.Dispose()
  }
}

# A rename that tries again while the folder is busy. Defender often holds a new folder for a moment.
function Move-BriardItem([string]$From, [string]$To) {
  for ($try = 1; ; $try++) {
    try {
      [System.IO.Directory]::Move($From, $To)
      return
    } catch {
      if ($try -ge 5) { throw }
      Start-Sleep -Milliseconds (500 * $try)
    }
  }
}

# "absent", "link" (a junction or a symbolic link) or "other". It never follows the link.
function Get-BriardLinkState([string]$Path) {
  try {
    $attributes = [System.IO.File]::GetAttributes($Path)
  } catch {
    return "absent"
  }
  if ($attributes -band [System.IO.FileAttributes]::ReparsePoint) { return "link" }
  return "other"
}

function Get-BriardLinkTarget([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($null -eq $item) { return $null }
  $target = @($item.Target)
  if ($target.Count -eq 0 -or "$($target[0])" -eq '') { return $null }
  return "$($target[0])"
}

function New-BriardJunction([string]$Path, [string]$Target) {
  New-Item -ItemType Junction -Path $Path -Value $Target -ErrorAction Stop | Out-Null
}

# Remove a junction ITSELF. A non-recursive delete never touches the folder the junction names.
function Remove-BriardLink([string]$Path) {
  if ([System.IO.File]::GetAttributes($Path) -band [System.IO.FileAttributes]::Directory) { [System.IO.Directory]::Delete($Path, $false) }
  else { [System.IO.File]::Delete($Path) }
}

# Delete a folder this script made, and everything in it. It never follows a junction or a link: one
# found anywhere in the tree is removed by itself, so the folder it names keeps every file. That is
# why this script has no `Remove-Item -Recurse`, which in Windows PowerShell 5.1 walks into one.
function Remove-BriardTree([string]$Path) {
  $state = Get-BriardLinkState $Path
  if ($state -eq "absent") { return }
  if ($state -eq "link") { Remove-BriardLink $Path; return }
  if (-not ([System.IO.File]::GetAttributes($Path) -band [System.IO.FileAttributes]::Directory)) {
    [System.IO.File]::SetAttributes($Path, [System.IO.FileAttributes]::Normal)
    [System.IO.File]::Delete($Path)
    return
  }
  foreach ($child in [System.IO.Directory]::GetFileSystemEntries($Path)) { Remove-BriardTree $child }
  [System.IO.Directory]::Delete($Path, $false)
}

# Delete Path only when it is an EMPTY real folder.
function Remove-BriardEmptyFolder([string]$Path) {
  if ((Get-BriardLinkState $Path) -ne "other") { return }
  if (@([System.IO.Directory]::GetFileSystemEntries($Path)).Count -gt 0) { return }
  [System.IO.Directory]::Delete($Path, $false)
}

# Point <Dir>\current at Target. A new junction is made beside it first, which proves the folder can
# be named before anything moves. Then the old junction goes and the new one takes its name. When
# that fails, the old junction is put back, or the exact command to put it back is printed.
function Set-BriardCurrent([string]$Dir, [string]$Target) {
  $current = Join-Path $Dir "current"
  $staged = Join-Path $Dir ".current.new"
  $state = Get-BriardLinkState $current
  if ($state -eq "absent") {
    New-BriardJunction $current $Target
    return
  }
  if ($state -eq "other") {
    Stop-BriardInstall "$current is a real folder or file, not a junction, so it is not Briard's to remove." "Move $current aside, then run the installer again."
  }
  $old = Get-BriardLinkTarget $current
  switch (Get-BriardLinkState $staged) {
    "link" { Remove-BriardLink $staged }
    "other" { Stop-BriardInstall "$staged is in the way and is not a junction." "Move $staged aside, then run the installer again." }
  }
  New-BriardJunction $staged $Target
  try {
    Remove-BriardLink $current
    Move-BriardItem $staged $current
    return
  } catch {
    $why = $_.Exception.Message
  }
  if ((Get-BriardLinkState $staged) -eq "link") { try { Remove-BriardLink $staged } catch { } }
  if ($null -ne $old -and (Get-BriardLinkState $current) -eq "absent") {
    try {
      New-BriardJunction $current $old
    } catch {
      Stop-BriardInstall "could not point $current at $Target ($why). $current is missing now, and putting it back failed too." "Make it again by hand:  cmd /c mklink /J `"$current`" `"$old`""
    }
  }
  Stop-BriardInstall "could not point $current at $Target ($why). $current still names $old. Nothing was changed." "Close every program that runs Briard from $Dir, then run the installer again."
}

# Stop a process and every process below it, children first, so none is left without a parent to
# be found by. Windows PowerShell 5.1 has no Kill(entireProcessTree), and taskkill would be a second
# program this script runs.
function Stop-BriardTree([int]$Id) {
  foreach ($child in @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $Id" -ErrorAction SilentlyContinue)) {
    Stop-BriardTree ([int]$child.ProcessId)
  }
  Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
}

# Run Exe once, as `Exe version`, and wait up to 30 seconds. Returns $null when it ran and exited 0,
# or what went wrong. cmd.exe writes its output to Log, a file: nothing is read through a pipe, which
# a program left running could hold open. Its input is NUL, so nothing waits for a key. On the
# timeout the whole tree goes (Stop-BriardTree): killing cmd.exe alone left a hung briard.exe
# running, and it held the version folder open.
function Test-BriardRuns([string]$Exe, [string]$Log) {
  if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { return "$Exe is missing" }
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = Join-Path ([Environment]::SystemDirectory) "cmd.exe"
  $start.Arguments = "/d /s /c `"`"$Exe`" version < NUL > `"$Log`" 2>&1`""
  $start.UseShellExecute = $false
  $run = [System.Diagnostics.Process]::Start($start)
  if (-not $run.WaitForExit(30000)) {
    Stop-BriardTree $run.Id
    [void]$run.WaitForExit(5000)
    return "briard.exe version did not finish in 30 seconds"
  }
  if ($run.ExitCode -eq 0) { return $null }
  $said = ""
  if (Test-Path -LiteralPath $Log) { $said = "$(@([System.IO.File]::ReadAllLines($Log) | Where-Object { $_.Trim() -ne '' })[0])".Trim() }
  return "briard.exe version stopped with exit code $($run.ExitCode): $said"
}

# The one message for a briard.exe that Windows did not let run. The files stay where they are.
function Stop-BriardBlocked([string]$Dir, [string]$Exe, [string]$Why) {
  Stop-BriardInstall ("Briard was installed in $Dir, but Windows did not let briard.exe run ($Why). " +
    "The usual causes are Smart App Control, Microsoft Defender (it may have quarantined the file), or a policy set by whoever manages this computer. " +
    "The install is safe to leave in place. Smart App Control cannot be overridden for one program, and turning it off is permanent, so decide that first. " +
    "If you saw 'Windows protected your PC' (SmartScreen), choose More info, then Run anyway.") "Fix the cause, then run  `"$Exe`" version  to check. If you are stuck, report it at https://github.com/mcsmith3/briard/issues"
}

# Add the PATH entry, unless BRIARD_NO_PATH_EDIT says no. Returns one line that says what happened.
function Publish-BriardName([string]$Dir) {
  $bin = Join-Path $Dir "current\bin"
  if ($env:BRIARD_NO_PATH_EDIT -eq "1") {
    return "BRIARD_NO_PATH_EDIT=1 is set, so your PATH was not changed. Run Briard as $bin\briard.exe."
  }
  $added = Set-BriardUserPath $bin
  # This window too, so the steps below work here without a new terminal. Appended, like the user PATH.
  $here = Add-BriardUserPathEntry $env:Path $bin
  if ($null -ne $here) { $env:Path = $here }
  if ($added) { return "Added $bin to your user PATH." }
  return "$bin is on your user PATH already."
}

# How to spell Briard in the printed steps: `briard` when that name finds THIS install's briard.exe,
# else the full path (no PATH edit, or another `briard` comes first on PATH).
function Get-BriardCommandName([string]$Exe) {
  $found = Get-Command briard -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $found -and [string]::Equals($found.Source, $Exe, [StringComparison]::OrdinalIgnoreCase)) { return "briard" }
  return $Exe
}

function Invoke-BriardInstall {
  $repo = "$env:BRIARD_UPDATE_REPO".Trim()
  if ($repo -eq '') { $repo = "mcsmith3/briard" }
  if (-not (Test-BriardRepo $repo)) {
    Stop-BriardInstall "BRIARD_UPDATE_REPO='$repo' is not a GitHub repository name like mcsmith3/briard." "Set BRIARD_UPDATE_REPO to owner/name, or remove it to take Briard's own releases."
  }
  if ($repo -cne "mcsmith3/briard") {
    Write-BriardLine "WARNING: BRIARD_UPDATE_REPO is set. This installs Briard from github.com/$repo, not from mcsmith3/briard."
  }
  $dir = "$env:BRIARD_DIR".Trim()
  if ($dir -eq '') {
    if ("$env:LOCALAPPDATA" -eq '') { Stop-BriardInstall "LOCALAPPDATA is not set." "Set BRIARD_DIR to the folder to install into, then run the installer again." }
    $dir = Join-Path $env:LOCALAPPDATA "briard"
  }
  $problem = Get-BriardDirProblem $dir
  if ($null -ne $problem) { Stop-BriardInstall "$problem." "Set BRIARD_DIR to a full folder path such as C:\Users\you\briard, then run the installer again." }
  $dir = [System.IO.Path]::GetFullPath($dir).TrimEnd('\')
  $mirror = "$env:BRIARD_INSTALL_MIRROR".Trim().TrimEnd('/')
  if ($mirror -ne '') {
    if (-not (Test-BriardMirror $mirror)) {
      Stop-BriardInstall "BRIARD_INSTALL_MIRROR='$mirror' is not a file:/// URL or an http://127.0.0.1 or http://localhost URL. It is a test seam, never a download source." "Remove BRIARD_INSTALL_MIRROR to install from GitHub."
    }
    Write-BriardLine "WARNING: BRIARD_INSTALL_MIRROR is set. This is a test seam: everything comes from $mirror, not from GitHub."
  }

  # A pinned tag is checked before anything is fetched or touched.
  $pin = "$env:BRIARD_TAG".Trim()
  if ($pin -ne '' -and -not (Test-BriardTag $pin -AllowPrerelease)) {
    Stop-BriardInstall "BRIARD_TAG='$pin' is not a release tag." "Set BRIARD_TAG to a tag like v1.16.0 (or v1.16.0-rc.1), or remove it to take the newest release."
  }

  $problem = Get-BriardHostProblem (Get-BriardArch) ([Environment]::OSVersion.Version.Build)
  if ($null -ne $problem) { Stop-BriardInstall $problem "Install Briard on an x64 machine with Windows 10 build 19041 or newer." }

  # Leave an existing install alone, unless a tag was pinned. A pin lays that version down BESIDE
  # what is there and points `current` at it. That is the way back when the installed version is
  # the broken one.
  $rescue = $false
  if (Test-Path -LiteralPath $dir) {
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) { Stop-BriardInstall "$dir is a file." "Move $dir aside, or set BRIARD_DIR to another folder." }
    $isGit = Test-Path -LiteralPath (Join-Path $dir ".git")
    $hasVersions = Test-Path -LiteralPath (Join-Path $dir "versions") -PathType Container
    if ($isGit -and $pin -ne '') {
      Stop-BriardInstall "$dir is a git checkout, and BRIARD_TAG only pins a binary install." "Pin it with git instead:  git -C $dir checkout $pin"
    }
    if ($hasVersions -and -not $isGit -and $pin -ne '') {
      $rescue = $true
    } elseif ($isGit -or $hasVersions) {
      # A rerun is not an update: `briard update` owns that, so a working `current` is never moved
      # from here without a pin, and nothing is changed or downloaded.
      $installed = "Briard"
      if ($isGit) { $installed = "Briard (a git checkout)" }
      else {
        $target = Get-BriardLinkTarget (Join-Path $dir "current")
        if ($null -ne $target) { $installed = "Briard " + [System.IO.Path]::GetFileName($target.TrimEnd('\')) }
      }
      Write-BriardLine "$installed is already installed in $dir. To update, run: briard update"
      Write-BriardLine "To lay one exact version beside it instead, set BRIARD_TAG (for example `$env:BRIARD_TAG = 'v1.16.0') and run the installer again."
      return
    } else {
      $other = @(Get-ChildItem -LiteralPath $dir -Force | Where-Object { $_.Name -ne ".staging" })
      if ($other.Count -gt 0) { Stop-BriardInstall "$dir already exists and is not a Briard install." "Move $dir aside, or set BRIARD_DIR to another folder." }
    }
  }

  # Which release. The tags are the list `briard update` reads too, never `releases/latest`. A
  # GitHub token, if you have one, goes with this ONE call to api.github.com: never with a download
  # (Windows PowerShell 5.1 can carry the header across the redirect to the file host) and never to
  # a mirror. Without a pin, the newest strict tag is tried first, then up to four older ones,
  # because a release made before Briard shipped a Windows zip has none.
  $platform = "windows-x64"
  $releases = "https://github.com/$repo/releases"
  $candidates = @($pin)
  if ($pin -eq '') {
    $api = if ($mirror -ne '') { $mirror } else { "https://api.github.com" }
    $headers = @{ Accept = "application/vnd.github+json" }
    $tokenFrom = ''
    foreach ($name in "BRIARD_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN") {
      $value = [Environment]::GetEnvironmentVariable($name)
      if ("$value" -ne '') { $tokenFrom = $name; break }
    }
    if ($tokenFrom -ne '' -and $mirror -eq '') { $headers.Authorization = "Bearer " + [Environment]::GetEnvironmentVariable($tokenFrom) }
    $pinFix = "Name the version and skip this call:  `$env:BRIARD_TAG = 'vX.Y.Z'  (the tags are at $releases)"
    try {
      if ($api.StartsWith("file:///")) {
        $tagsFile = ([Uri]"$api/repos/$repo/tags").LocalPath
        if (-not (Test-Path -LiteralPath $tagsFile -PathType Leaf)) { Stop-BriardInstall "the mirror has no $tagsFile." "Put the tags list there, or remove BRIARD_INSTALL_MIRROR." }
        $rows = @([System.IO.File]::ReadAllText($tagsFile) | ConvertFrom-Json | ForEach-Object { $_ })
      } else {
        # Every page: GitHub serves 100 tags a page, and a newer tag can sit on a later one. A page
        # shorter than 100 is the last; ten pages is the bound, as in `briard update`.
        $rows = @()
        for ($page = 1; $page -le 10; $page++) {
          $uri = "$api/repos/$repo/tags?per_page=100"
          if ($page -gt 1) { $uri = "$uri&page=$page" }
          $answer = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers $headers -ErrorAction Stop
          $onePage = @($answer.Content | ConvertFrom-Json | ForEach-Object { $_ })
          $rows += $onePage
          if ($onePage.Count -lt 100) { break }
        }
      }
    } catch {
      if ($null -ne $_.Exception.Data["BriardFix"]) { throw }
      $code = Get-BriardHttpCode $_
      if ($code -eq 0) { Stop-BriardInstall "could not reach $api to list the releases." "Check your network, or $pinFix" }
      if ($code -eq 401 -and $headers.ContainsKey("Authorization")) { Stop-BriardInstall "GitHub refused the token in $tokenFrom (HTTP 401)." "Fix or remove $tokenFrom, then run the installer again." }
      if ($code -eq 403 -or $code -eq 429) {
        Stop-BriardInstall "GitHub's API rate limit says no (HTTP $code). Without a token GitHub allows 60 calls an hour per network address." "Wait an hour, set GH_TOKEN to a GitHub token with no scopes, or $pinFix"
      }
      Stop-BriardInstall "$api answered HTTP $code when asked for the tags of $repo." "Try again later, or $pinFix"
    }
    $names = @($rows | ForEach-Object { "$($_.name)" })
    $candidates = @(Sort-BriardTags $names | Select-Object -First 5)
    if ($candidates.Count -eq 0) { Stop-BriardInstall "no release tag found for $repo." "Pin a version with BRIARD_TAG, or report this at https://github.com/mcsmith3/briard/issues" }
  }
  $current = Join-Path $dir "current"

  # The pinned version may be on disk already: then the rescue is a junction flip and nothing more.
  if ($rescue) {
    $tag = $pin
    $versionDir = Join-Path $dir "versions\$($tag.Substring(1))"
  }
  if ($rescue) {
    foreach ($folder in (Join-Path $dir "versions"), $versionDir) {
      if ((Get-BriardLinkState $folder) -eq "link") {
        Stop-BriardInstall "$folder is a junction or a link, not a folder this installer made." "Move $folder aside, then run the installer again."
      }
    }
    if ((Get-BriardLinkState $current) -eq "other") {
      Stop-BriardInstall "$current is a real folder or file, not a junction, so it is not Briard's to remove." "Move $current aside, then run the installer again."
    }
  }
  if ($rescue -and (Test-Path -LiteralPath $versionDir)) {
    # A folder from a move that stopped half way is not an install: it must hold bin\briard.exe.
    if (-not (Test-Path -LiteralPath (Join-Path $versionDir "bin\briard.exe"))) {
      Stop-BriardInstall "$versionDir is there but holds no bin\briard.exe." "Move $versionDir aside, then run the installer again."
    }
    $now = Get-BriardLinkTarget $current
    if ($null -ne $now -and $now.TrimEnd('\') -eq $versionDir) {
      Write-BriardLine (Publish-BriardName $dir)
      Write-BriardLine "OK  Briard $tag is installed at $dir and current names it already. Nothing was changed, and nothing was downloaded."
      return
    }
    Set-BriardCurrent $dir $versionDir
    Write-BriardLine (Publish-BriardName $dir)
    $blocked = Test-BriardRuns (Join-Path $current "bin\briard.exe") (Join-Path $dir ".briard-version-check.txt")
    Remove-Item -LiteralPath (Join-Path $dir ".briard-version-check.txt") -Force -ErrorAction SilentlyContinue
    if ($null -ne $blocked) { Stop-BriardBlocked $dir (Join-Path $current "bin\briard.exe") $blocked }
    Write-BriardLine "OK  Briard $tag was already at $versionDir. current now names it, and nothing was downloaded."
    Write-BriardLine "If Briard is running, run  briard restart  to start this version."
    return
  }

  # Download, and verify before anything is unpacked. The scratch folder is inside BRIARD_DIR, and
  # it is removed on every way out.
  if ($rescue) { Write-BriardLine "Briard is already installed in $dir. Laying $pin down beside it, and pointing current at it." }
  $createdDir = -not (Test-Path -LiteralPath $dir)
  $staging = Join-Path $dir ".staging"
  $work = Join-Path $staging "install-$PID"
  try {
    # A `.staging` left by a run that was stopped is emptied. One that is a junction is removed by
    # itself (the folder it names is not touched), and a real folder takes its place.
    switch (Get-BriardLinkState $staging) {
      "link" { Remove-BriardLink $staging }
      "other" { foreach ($leftover in [System.IO.Directory]::GetFileSystemEntries($staging)) { Remove-BriardTree $leftover } }
    }
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    # The checksum file first: it is small, and a release with no Windows build has none.
    $tag = $null
    foreach ($candidate in $candidates) {
      $zipName = "briard-$($candidate.Substring(1))-$platform.zip"
      $base = if ($mirror -ne '') { "$mirror/$repo/releases/download/$candidate" } else { "$releases/download/$candidate" }
      $code = Get-BriardFile "$base/$zipName.sha256" (Join-Path $work "$zipName.sha256")
      if ($code -eq 0) { Stop-BriardInstall "could not reach the download for $candidate." "Check your network, then run the installer again." }
      if ($code -eq 200) { $tag = $candidate; break }
      if ($pin -ne '') {
        Stop-BriardInstall "release $pin has no $zipName.sha256 (HTTP $code), so a download could not be checked. Either that release has no Windows build, or its checksum file is missing. Nothing was installed." "Check the tag against $releases, or pin another one with BRIARD_TAG."
      }
      Write-BriardLine "$candidate has no Windows build. Trying the next older release."
    }
    if ($null -eq $tag) {
      Stop-BriardInstall "none of the newest $($candidates.Count) releases of $repo carries a Windows build yet. Nothing was installed." "Pin a release that has one:  `$env:BRIARD_TAG = 'vX.Y.Z'  (see $releases)"
    }
    $version = $tag.Substring(1)
    $versionDir = Join-Path $dir "versions\$version"
    $zip = Join-Path $work $zipName
    if ($mirror -ne '') { Write-BriardLine "Downloading Briard $tag for $platform from the mirror $mirror ..." }
    else { Write-BriardLine "Downloading Briard $tag for $platform ..." }
    $code = Get-BriardFile "$base/$zipName" $zip
    if ($code -eq 0) { Stop-BriardInstall "could not reach the download for $zipName." "Check your network, then run the installer again." }
    if ($code -ne 200) {
      Stop-BriardInstall "release $tag has a checksum file but no $zipName (HTTP $code). Nothing was installed." "Try again later. If it happens again, report it at https://github.com/mcsmith3/briard/issues"
    }
    $manifestPath = Join-Path $work "manifest.json"
    if ((Get-BriardFile "$base/briard-$version.manifest.json" $manifestPath) -ne 200) {
      Stop-BriardInstall "could not download the release manifest for $version. Nothing was installed." "Try again later. If it happens again, report it at https://github.com/mcsmith3/briard/issues"
    }
    $manifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1) {
      Stop-BriardInstall "release $version uses a manifest this installer does not understand." "Report it at https://github.com/mcsmith3/briard/issues"
    }
    $digest = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
    $problem = Get-BriardDigestProblem ([System.IO.File]::ReadAllText("$zip.sha256")) $zipName $digest
    if ($null -ne $problem) {
      Stop-BriardInstall "$problem. The download was discarded and nothing was installed." "Run the installer again. If it happens again, report it at https://github.com/mcsmith3/briard/issues"
    }
    # The manifest's own Windows entry, matched by platform, and its digest compared as a whole value.
    $entries = @($manifest.artifacts | Where-Object { "$($_.platform)" -ceq $platform })
    $named = ($entries.Count -eq 1) -and ("$($entries[0].name)" -ceq $zipName) -and [string]::Equals("$($entries[0].sha256)", $digest, [StringComparison]::OrdinalIgnoreCase)
    if (-not $named) { Stop-BriardInstall "the digest of $zipName is not the one release $version's manifest names. Nothing was installed." "Report it at https://github.com/mcsmith3/briard/issues" }

    # Lay it down: one complete payload per version, and `current` names one of them.
    $unpacked = Join-Path $work "unpacked"
    Expand-BriardZip $zip $unpacked "briard-$version-$platform"
    $payload = Join-Path $unpacked "briard-$version-$platform"
    if (-not (Test-Path -LiteralPath (Join-Path $payload "bin\briard.exe"))) {
      Stop-BriardInstall "$zipName does not contain bin\briard.exe. Refusing to install it." "Report it at https://github.com/mcsmith3/briard/issues"
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $dir "versions") | Out-Null
    if ((Get-BriardLinkState (Join-Path $dir "versions")) -ne "other") { Stop-BriardInstall "$dir\versions is a junction or a link, not a folder this installer made." "Move $dir\versions aside, then run the installer again." }
    if ((Get-BriardLinkState $versionDir) -ne "absent") { Stop-BriardInstall "$versionDir exists already." "Move $versionDir aside, then run the installer again." }
    try { Move-BriardItem $payload $versionDir }
    catch { Stop-BriardInstall "could not move the payload into $versionDir ($($_.Exception.Message))." "Close programs that may hold files in $dir (an antivirus scan can), then run the installer again." }
    Set-BriardCurrent $dir $versionDir
  } finally {
    try { Remove-BriardTree $work } catch { }
    try { Remove-BriardEmptyFolder $staging } catch { }
    if ($createdDir) { try { Remove-BriardEmptyFolder $dir } catch { } }
  }

  $published = Publish-BriardName $dir
  $exe = Join-Path $current "bin\briard.exe"
  # The check file sits in BRIARD_DIR, like everything else this script writes.
  $check = Join-Path $dir ".briard-version-check.txt"
  $blocked = Test-BriardRuns $exe $check
  Remove-Item -LiteralPath $check -Force -ErrorAction SilentlyContinue
  if ($null -ne $blocked) {
    Write-BriardLine $published
    Stop-BriardBlocked $dir $exe $blocked
  }
  $briard = Get-BriardCommandName $exe
  $herdr = Get-Command herdr -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1

  # A pinned run over an install: Briard may be running already, so the next step is a restart,
  # as for a rescue that found the version on disk, never a first start.
  if ($rescue) {
    Write-BriardLine ""
    Write-BriardLine "OK  Briard $version is installed in $dir, and current names it."
    Write-BriardLine "    The download matches the checksum published with the release, and briard.exe runs."
    Write-BriardLine $published
    Write-BriardLine "If Briard is running, run  $briard restart  to start this version."
    return
  }

  # What is left is yours.
  Write-BriardLine ""
  Write-BriardLine "OK  Briard $version is installed in $dir. Nothing is running yet."
  Write-BriardLine "    The download matches the checksum published with the release, and briard.exe runs."
  Write-BriardLine $published
  if ($null -eq $herdr) { Write-BriardLine "Herdr not found on your PATH. Briard on Windows needs it (step 2)." }
  else { Write-BriardLine "Herdr found: $($herdr.Source)" }
  Write-BriardLine ""
  Write-BriardLine "Next steps. This script does not take them for you:"
  Write-BriardLine ""
  if ($env:BRIARD_NO_PATH_EDIT -eq "1") { Write-BriardLine "  1. Open a NEW terminal window." }
  else { Write-BriardLine "  1. Open a NEW terminal window. Windows gives the new PATH only to windows opened after this install." }
  Write-BriardLine ""
  Write-BriardLine "  2. Start Herdr in another terminal window, and leave it running. Briard needs it before it starts."
  Write-BriardLine "     Get Herdr at https://herdr.dev (its installer: irm https://herdr.dev/install.ps1 | iex). Then run:"
  Write-BriardLine "       herdr"
  Write-BriardLine ""
  Write-BriardLine "  3. Start Briard, then print its address:"
  Write-BriardLine "       $briard start"
  Write-BriardLine "       $briard url"
  Write-BriardLine "     On Windows, Briard listens on this machine only. To open it on your phone, reach it through"
  Write-BriardLine "     your Tailscale network: $current\docs\deployment.md"
  Write-BriardLine ""
  Write-BriardLine "  4. Pair your phone. Briard answers no device until one is paired:"
  Write-BriardLine "       $briard pair"
  Write-BriardLine ""
  Write-BriardLine "Linking several machines (crew) does not work on Windows yet. Briard on one machine works fine."
  Write-BriardLine "briard.exe is unsigned: Windows does not know the publisher of this file. If Windows blocks it later, run  `"$exe`" version  to see why."
  Write-BriardLine "Read $current\docs\security.md before you open Briard on a phone. Briard gives remote shell access to this machine, by design."
}

# Print a failure: what happened, then "Install failed." and the one fix, as the last line.
function Write-BriardFailure([string]$What, [string]$Fix) {
  Write-Host "briard install: $What" -ForegroundColor Red
  Write-Host "Install failed. $Fix" -ForegroundColor Red
}

# The install and its outcome. It sets $LASTEXITCODE (0 on success, 1 on a failure, 2 on an option)
# and puts back the one process-wide setting it changes (the TLS protocols), so nothing it did stays
# in your session.
function Invoke-BriardEntry([object[]]$Arguments) {
  $ErrorActionPreference = "Stop"
  $ProgressPreference = "SilentlyContinue"
  if ($ExecutionContext.SessionState.LanguageMode -ne "FullLanguage") {
    Write-BriardFailure "this PowerShell runs in $($ExecutionContext.SessionState.LanguageMode) mode, and the installer needs FullLanguage (a device policy sets this)." "Ask whoever manages this machine, or install by hand: https://github.com/mcsmith3/briard/blob/main/docs/install.md"
    $global:LASTEXITCODE = 1
    return
  }
  if (@($Arguments).Count -gt 0) {
    Write-BriardFailure "install.ps1 takes no options, and got '$(@($Arguments)[0])'." "Run it with no options. Steer it with BRIARD_DIR, BRIARD_UPDATE_REPO and BRIARD_TAG."
    $global:LASTEXITCODE = 2
    return
  }
  $tls = [Net.ServicePointManager]::SecurityProtocol
  try {
    [Net.ServicePointManager]::SecurityProtocol = $tls -bor [Net.SecurityProtocolType]::Tls12
    Invoke-BriardInstall
    $global:LASTEXITCODE = 0
  } catch {
    $fix = $_.Exception.Data["BriardFix"]
    if ($null -eq $fix) { $fix = "Report it at https://github.com/mcsmith3/briard/issues with the lines above." }
    Write-BriardFailure $_.Exception.Message $fix
    $global:LASTEXITCODE = 1
  } finally {
    [Net.ServicePointManager]::SecurityProtocol = $tls
  }
}

# The entry. $PSCommandPath names the script file when it runs as one; under `irm | iex` it is empty.
# Only a file run ends a failure with `exit`: there it ends just that PowerShell and gives the caller
# the exit code. Under `iex` an `exit` would close your window, so the function returns instead.
function Install-Briard([object[]]$Arguments) {
  Invoke-BriardEntry $Arguments
  if ($global:LASTEXITCODE -ne 0 -and "$PSCommandPath" -ne '') { exit $global:LASTEXITCODE }
}

Install-Briard $args
