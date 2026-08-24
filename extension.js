'use strict';

const path = require('path');
const fs = require('fs/promises');
const https = require('https');
const vscode = require('vscode');

const TERMINAL_NAME = 'Repo Terminal';
const RELEASE_API = 'https://api.github.com/repos/mrjohndowe/repo-terminal-switcher/releases/latest';
const MAX_UPDATE_BYTES = 20 * 1024 * 1024;

let repoTerminal;
let currentRoot;
let syncGeneration = 0;

function normalize(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function containsPath(rootPath, filePath) {
  const root = normalize(rootPath);
  const file = normalize(filePath);
  return file === root || file.startsWith(root + path.sep);
}

function deepestContainingRoot(roots, filePath) {
  return roots
    .filter((root) => containsPath(root.fsPath, filePath))
    .sort((a, b) => b.fsPath.length - a.fsPath.length)[0];
}

async function gitRootFor(documentUri) {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    return undefined;
  }

  try {
    const exports = gitExtension.isActive
      ? gitExtension.exports
      : await gitExtension.activate();
    const gitApi = exports && typeof exports.getAPI === 'function'
      ? exports.getAPI(1)
      : undefined;
    const repositories = gitApi && Array.isArray(gitApi.repositories)
      ? gitApi.repositories
      : [];

    return deepestContainingRoot(
      repositories.map((repository) => repository.rootUri),
      documentUri.fsPath
    );
  } catch {
    return undefined;
  }
}

async function rootFor(documentUri) {
  const gitRoot = await gitRootFor(documentUri);
  if (gitRoot) {
    return gitRoot;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  return workspaceFolder && workspaceFolder.uri;
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
  repoTerminal = undefined;
  currentRoot = undefined;

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

  repoTerminal = vscode.window.createTerminal(options);
  currentRoot = normalize(rootUri.fsPath);
  return repoTerminal;
}

async function syncToEditor(editor, showTerminal = true) {
  const generation = ++syncGeneration;
  const uri = editor && editor.document && editor.document.uri;

  if (!uri || uri.scheme !== 'file') {
    return;
  }

  const rootUri = await rootFor(uri);
  if (!rootUri || generation !== syncGeneration) {
    return;
  }

  const nextRoot = normalize(rootUri.fsPath);
  const terminalIsOpen = repoTerminal && vscode.window.terminals.includes(repoTerminal);
  const terminal = terminalIsOpen && currentRoot === nextRoot
    ? repoTerminal
    : createRepoTerminal(rootUri);

  if (showTerminal) {
    terminal.show(true);
  }
}

function syncActiveEditor(showTerminal = true) {
  void syncToEditor(vscode.window.activeTextEditor, showTerminal);
}

async function openForSourceControl(sourceControl) {
  const rootUri = sourceControl && sourceControl.rootUri;
  if (!rootUri || rootUri.scheme !== 'file') {
    await vscode.window.showErrorMessage(
      'Repo Terminal Switcher could not determine the selected repository root.'
    );
    return;
  }

  const generation = ++syncGeneration;
  const terminal = createRepoTerminal(rootUri);
  if (generation === syncGeneration) {
    terminal.show(true);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void syncToEditor(editor, true);
    }),
    vscode.workspace.onDidOpenTextDocument(() => {
      setTimeout(() => syncActiveEditor(true), 0);
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      syncActiveEditor(true);
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === repoTerminal) {
        repoTerminal = undefined;
        currentRoot = undefined;
      }
    }),
    vscode.commands.registerCommand('repoTerminalSwitcher.syncNow', () => {
      return syncToEditor(vscode.window.activeTextEditor, true);
    }),
    vscode.commands.registerCommand('repoTerminalSwitcher.openForSourceControl', (sourceControl) => {
      return openForSourceControl(sourceControl);
    })
  );

  syncActiveEditor(false);
  setTimeout(() => void checkForUpdate(context), 10000);
}

function deactivate() {
  repoTerminal = undefined;
  currentRoot = undefined;
}

module.exports = { activate, deactivate };
