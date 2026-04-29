#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const env = { ...process.env };

// Electron also uses this variable internally. If it leaks from a shell,
// the GUI would start as plain Node instead of opening the app window.
delete env.ELECTRON_RUN_AS_NODE;

let electronPath;

try {
  electronPath = require('electron');
} catch (error) {
  console.error('Electron was not found. Run "npm install" and try again.');
  process.exit(1);
}

const child = spawn(electronPath, [appRoot, ...process.argv.slice(2)], {
  detached: true,
  env,
  stdio: 'ignore',
  windowsHide: false,
});

child.on('error', (error) => {
  console.error(`Failed to open PH Downloader: ${error.message}`);
  process.exit(1);
});

child.unref();
