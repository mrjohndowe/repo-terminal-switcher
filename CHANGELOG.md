# Changelog

## 1.1.9

- Add the Repo Terminal Switcher extension logo.
- Add a Features section and walkthrough-video location to the README.

## 1.1.8

- Remove the separate `Repository Terminals` section.
- Restore the PowerShell terminal action directly on each built-in Git
  repository row in Source Control.
- Preserve VS Code's normal repository-row click behavior.

## 1.1.7

- Add a `Repository Terminals` list directly inside the Source Control view.
- Make each repository name a single-click terminal switch action.
- Remove automatic active-editor switching and the repository-row terminal
  button.
- Refresh the list when Git repositories or workspace folders change.

## 1.1.6

- Add a PowerShell-terminal action directly to every Git repository row in
  Source Control.
- Use the clicked Source Control provider's `rootUri` instead of the active
  editor when opening a repository terminal from that action.

## 1.1.4

- Close every previous integrated terminal when switching repositories.
- Create one fresh PowerShell terminal named `Repo Terminal` at the new root.
- Detect Source Control preview files through active, opened, and visible editor events.

## 1.1.2

- Use pnpm 11's current `allowBuilds` policy format in the release workflow.

## 1.1.1

- Fix pnpm 11 build-script approval for automated GitHub release packaging.

## 1.1.0

- Synchronize `Repo Terminal` with the repository of the active file.
- Reuse one PowerShell terminal and quote Windows paths safely.
- Prefer the deepest matching Git repository, with workspace-folder fallback.
- Add automatic updates from the project's public GitHub Releases.
