# Repo Terminal Switcher

A minimal Windows-focused VS Code extension that keeps one integrated
PowerShell terminal synchronized with the Git repository containing the active
file.

When you open or click a file—including a changed file opened from Source
Control—the extension finds the deepest Git repository containing the file,
falls back to its workspace folder when necessary, and creates or reuses one
integrated terminal named **Repo Terminal**. Windows paths are handled with
PowerShell literal-path quoting.

## Install

Download the newest `repo-terminal-switcher-*.vsix` file from
[Releases](https://github.com/mrjohndowe/repo-terminal-switcher/releases), then:

1. Open VS Code's Extensions view.
2. Open the `...` menu and choose **Install from VSIX...**.
3. Select the downloaded VSIX.
4. Run **Developer: Reload Window** from the Command Palette.

The extension checks this repository's public GitHub Releases after startup.
When a newer semantic version is available, it downloads and installs that
release automatically and offers to reload VS Code. Disable this with the
`repoTerminalSwitcher.autoUpdate` setting if desired.

## Use

Open or click a file in the editor or Source Control. You can also run
**Repo Terminal: Sync to Active File** from the Command Palette.

## Publish an update

1. Change the `version` in `package.json` and update `CHANGELOG.md`.
2. Commit the changes.
3. Create and push a tag matching that version, such as `v1.2.0`.

The GitHub Actions workflow packages the extension and creates a public GitHub
Release with the VSIX attached. Existing installations discover it on their
next VS Code startup.

## Development

```powershell
pnpm install
pnpm run package

```

## VS Code limitation

VS Code does not expose a supported event for merely selecting the native Git
repository heading in Source Control. The extension responds when that action
opens or focuses a file, including changed files clicked in Source Control.
