import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expoRoot = path.join(root, 'mobile-expo');

// The address of the interface that really reaches the network (default route), so a phone on the
// same Wi-Fi can connect. Docker/WSL bridges (also 192.168.x or 172.x) are skipped this way.
function defaultRouteAddress() {
  try {
    const out = execSync('ip route get 1.1.1.1', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return out.match(/\bsrc\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
  } catch { return undefined; }
}

function localAddress() {
  const routed = defaultRouteAddress();
  if (routed) return routed;
  const candidates = Object.values(os.networkInterfaces()).flat().filter((entry) =>
    entry && entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')
  );
  return candidates.find((entry) => entry.address.startsWith('192.168.'))?.address
    || candidates.find((entry) => entry.address.startsWith('10.'))?.address
    || candidates[0]?.address;
}

const address = process.env.MOBILE_HOST || localAddress();
if (!address) {
  console.error('Could not find a private network address. Connect to Wi-Fi and try again.');
  process.exit(1);
}

const webPort = Number(process.env.MOBILE_WEB_PORT || 4173);
const apiPort = Number(process.env.MOBILE_API_PORT || 4174);
const children = [];

function start(command, args, cwd, env = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env, FORCE_COLOR: '1' }, stdio: 'inherit' });
  children.push(child);
  return child;
}

start(process.execPath, ['server/index.js'], root, { PORT: String(apiPort) });
start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', String(webPort), '--strictPort'], root, { API_PORT: String(apiPort) });

const expoCli = path.join(expoRoot, 'node_modules', 'expo', 'bin', 'cli');
start(process.execPath, [expoCli, 'start', '--go', '--lan', '--clear'], expoRoot, {
  // ?fm=1 previews features that are still switched off for visitors (src/lib/flags.ts).
  EXPO_PUBLIC_APP_URL: process.env.EXPO_PUBLIC_APP_URL || `http://${address}:${webPort}/?fm=1`,
  REACT_NATIVE_PACKAGER_HOSTNAME: address,
});

console.log(`\nJobsMatchNow Expo preview is starting for iOS and Android.`);
console.log(`The native preview will load ${process.env.EXPO_PUBLIC_APP_URL || `http://${address}:${webPort}/?fm=1`}.`);
console.log('Install Expo Go, scan the Expo QR code, and keep this window open.\n');

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 150).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) child.on('exit', (code) => { if (!stopping && code) stop(code); });
