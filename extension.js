'use strict';

const path = require('path');
const fs = require('fs/promises');
const https = require('https');
const vscode = require('vscode');

const TERMINAL_NAME = 'Repo Terminal';
const RELEASE_API = 'https://api.github.com/repos/mrjohndowe/repo-terminal-switcher/releases/latest';
const MAX_UPDATE_BYTES = 20 * 1024 * 1024;

class RepositoryProvider {
  constructor() {
    this.gitApi = undefined;
    this.disposables = [];
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
  }

  async initialize() {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) return;

    try {
      const exports = gitExtension.isActive
        ? gitExtension.exports
        : await gitExtension.activate();
      this.gitApi = exports && typeof exports.getAPI === 'function'
        ? exports.getAPI(1)
        : undefined;

      if (this.gitApi && typeof this.gitApi.onDidOpenRepository === 'function') {
        this.disposables.push(this.gitApi.onDidOpenRepository(() => this.refresh()));
      }
      if (this.gitApi && typeof this.gitApi.onDidCloseRepository === 'function') {
        this.disposables.push(this.gitApi.onDidCloseRepository(() => this.refresh()));
      }
    } catch (error) {
      console.warn('Repo Terminal Switcher could not initialize the Git API:', error);
    }

    this.refresh();
  }

  refresh() {
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(entry) {
    const label = path.basename(entry.rootUri.fsPath);
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('repo');
    item.tooltip = `Open Repo Terminal at ${entry.rootUri.fsPath}`;
    item.command = {
      command: 'repoTerminalSwitcher.openRepository',
      title: 'Open Repository Terminal',
      arguments: [entry.rootUri]
    };
    return item;
  }

  getChildren() {
    const repositories = this.gitApi && Array.isArray(this.gitApi.repositories)
      ? this.gitApi.repositories
      : [];
    const entries = repositories.length > 0
      ? repositories.map((repository) => ({ rootUri: repository.rootUri }))
      : (vscode.workspace.workspaceFolders || []).map((folder) => ({ rootUri: folder.uri }));

    return entries
      .filter((entry) => entry.rootUri && entry.rootUri.scheme === 'file')
      .sort((left, right) => path.basename(left.rootUri.fsPath).localeCompare(
        path.basename(right.rootUri.fsPath),
        undefined,
        { sensitivity: 'base' }
      ));
  }

  dispose() {
    for (const disposable of this.disposables) disposable.dispose();
    this.changeEmitter.dispose();
  }
}

function request(url, accept = 'application/vnd.github+json', redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { Accept: accept, 'User-Agent': 'mrjohndowe/repo-terminal-switcher' }
    }, (response) => {
      const location = response.headers.location;
      if (location && response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        if (redirects >= 5) {
          reject(new Error('Too many redirects while downloading the update.'));
          return;
        }
        resolve(request(new URL(location, url).toString(), accept, redirects + 1));
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`GitHub returned HTTP ${response.statusCode}.`));
        return;
      }
      resolve(response);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Update request timed out.')));
  });
}

async function readJson(url) {
  const response = await request(url);
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('GitHub release response was unexpectedly large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function versionParts(value) {
  const match = String(value).replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : undefined;
}

function isNewer(candidate, installed) {
  const next = versionParts(candidate);
  const current = versionParts(installed);
  if (!next || !current) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== current[index]) return next[index] > current[index];
  }
  return false;
}

async function download(url, destination) {
  const response = await request(url, 'application/octet-stream');
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > MAX_UPDATE_BYTES) throw new Error('The update is larger than the allowed 20 MB.');
    chunks.push(chunk);
  }
  await fs.writeFile(destination, Buffer.concat(chunks));
}

async function checkForUpdate(context) {
  const enabled = vscode.workspace.getConfiguration('repoTerminalSwitcher').get('autoUpdate', true);
  if (!enabled) return;

  try {
    const release = await readJson(RELEASE_API);
    if (!isNewer(release.tag_name, context.extension.packageJSON.version)) return;

    const asset = Array.isArray(release.assets)
      ? release.assets.find((item) => /^repo-terminal-switcher-\d+\.\d+\.\d+\.vsix$/.test(item.name))
      : undefined;
    if (!asset || !asset.browser_download_url) return;

    await fs.mkdir(context.globalStorageUri.fsPath, { recursive: true });
    const destination = path.join(context.globalStorageUri.fsPath, asset.name);
    await download(asset.browser_download_url, destination);
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(destination));

    const action = await vscode.window.showInformationMessage(
      `Repo Terminal Switcher ${release.tag_name} was installed. Reload VS Code to use it.`,
      'Reload Now'
    );
    if (action === 'Reload Now') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  } catch (error) {
    console.warn('Repo Terminal Switcher update check failed:', error);
  }
}

function createRepoTerminal(rootUri) {
  for (const terminal of [...vscode.window.terminals]) {
    terminal.dispose();
  }

  const options = {
    name: TERMINAL_NAME,
    cwd: rootUri,
    location: vscode.TerminalLocation.Panel
  };

  if (process.platform === 'win32') {
    options.shellPath = 'powershell.exe';
  }

  return vscode.window.createTerminal(options);
}

async function openRepository(rootUri) {
  if (!rootUri || rootUri.scheme !== 'file') {
    await vscode.window.showErrorMessage(
      'Repo Terminal Switcher could not determine the selected repository root.'
    );
    return;
  }

  const terminal = createRepoTerminal(rootUri);
  terminal.show(true);
}

function activate(context) {
  const provider = new RepositoryProvider();

  context.subscriptions.push(
    provider,
    vscode.window.registerTreeDataProvider('repoTerminalSwitcher.repositories', provider),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
    vscode.commands.registerCommand('repoTerminalSwitcher.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('repoTerminalSwitcher.openRepository', (rootUri) => openRepository(rootUri))
  );

  void provider.initialize();
  setTimeout(() => void checkForUpdate(context), 10000);
}

function deactivate() {}

module.exports = { activate, deactivate };
