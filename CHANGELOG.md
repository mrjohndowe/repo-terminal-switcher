# Changelog

## 1.1.3

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
