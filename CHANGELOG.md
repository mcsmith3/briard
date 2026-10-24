# Changelog

Changes to Briard are recorded here. Versions follow Semantic Versioning.

## [Unreleased]

### Added

- **Flockr alongside Herdr.** A shared adapter supports first-run selection, plugin actions, diagnostics and session discovery for either tool.
- **The phone names your multiplexer.** The header, the offline banner, Settings and the empty dashboard say "Flockr" or "Herdr" instead of "the multiplexer", from a display name the bridge now publishes on `/api/config`.

### Fixed

- **First-run detection names each tool's socket by the host's rules.** The Herdr-family probe takes its path rules from the injected host, so a Windows runner checks the same Unix fixtures as Linux.

### Packaging

- **Packages and installers point at Briard's own releases.** The AUR and Nix files name 0.1.0 with placeholder checksums until the first release fills them in, the installer offers Flockr, and the upstream-only triage workflow is gone.

## [0.1.0] - 2026-10-23

### Changed

- **Briard forks ColliePWA 1.24.0 under a new name.** Rename the product, commands, configuration, packages and branding to Briard. Earlier history is in the [upstream changelog](https://github.com/AltanS/collie/blob/35d3ccf/CHANGELOG.md).
