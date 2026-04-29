#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const isDryRun = process.argv.includes('--dry-run');

function commandName(command) {
  if (process.platform !== 'win32') return command;
  if (command === 'powershell') return 'powershell.exe';
  return command;
}

function winQuote(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_./:\\-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function spawnCommand(command, args, options) {
  if (process.platform === 'win32' && command === 'npm') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${args.map(winQuote).join(' ')}`], options);
  }

  return spawnSync(commandName(command), args, options);
}

function run(command, args, options = {}) {
  const result = spawnCommand(command, args, {
    cwd: appRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function output(command, args) {
  const result = spawnCommand(command, args, {
    cwd: appRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result.stdout.trim();
}

function getNpmBinDir() {
  const prefix = output('npm', ['prefix', '-g']);
  return process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
}

function normalizePathEntry(entry) {
  const expanded = process.platform === 'win32'
    ? entry.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`)
    : entry;

  return path.resolve(expanded).replace(/[\\/]+$/, '').toLowerCase();
}

function pathIncludes(binDir, value = process.env.PATH || '') {
  const expected = normalizePathEntry(binDir);
  return value
    .split(path.delimiter)
    .filter(Boolean)
    .some((entry) => normalizePathEntry(entry) === expected);
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function ensureWindowsUserPath(binDir) {
  const command = [
    `$bin = ${psQuote(binDir)}`,
    `$current = [Environment]::GetEnvironmentVariable('Path', 'User')`,
    `$parts = @($current -split ';' | Where-Object { $_ -and $_.Trim() })`,
    `$exists = $false`,
    `foreach ($part in $parts) {`,
    `  try {`,
    `    $expanded = [Environment]::ExpandEnvironmentVariables($part)`,
    `    if ([IO.Path]::GetFullPath($expanded.TrimEnd('\\')) -ieq [IO.Path]::GetFullPath($bin.TrimEnd('\\'))) { $exists = $true }`,
    `  } catch {}`,
    `}`,
    `if (-not $exists) {`,
    `  $next = if ([string]::IsNullOrWhiteSpace($current)) { $bin } else { "$current;$bin" }`,
    `  [Environment]::SetEnvironmentVariable('Path', $next, 'User')`,
    `}`,
  ].join('; ');

  run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
}

function ensurePath(binDir) {
  if (pathIncludes(binDir)) {
    console.log(`npm global bin is already on PATH: ${binDir}`);
    return;
  }

  if (isDryRun) {
    console.log(`Would add npm global bin to PATH: ${binDir}`);
    return;
  }

  if (process.platform === 'win32') {
    ensureWindowsUserPath(binDir);
    console.log(`Added npm global bin to the user PATH: ${binDir}`);
    console.log('Open a new terminal before running "phd".');
    return;
  }

  console.log(`npm global bin is not on PATH: ${binDir}`);
  console.log('Add that directory to your shell PATH, then open a new terminal.');
}

const npmBinDir = getNpmBinDir();

if (isDryRun) {
  console.log(`[dry-run] Would install ${appRoot} globally.`);
} else {
  run('npm', ['install', '-g', appRoot]);
}

ensurePath(npmBinDir);
console.log('Installed command: phd');
