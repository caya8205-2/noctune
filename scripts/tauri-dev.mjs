import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createDevEnv, printDevEnv } from './dev-env.mjs';

function ensureDevSidecarStubs() {
  const binariesDir = join(process.cwd(), 'src-tauri', 'binaries');
  mkdirSync(binariesDir, { recursive: true });
  const targetTriples = [
    'x86_64-pc-windows-msvc.exe',
    'x86_64-unknown-linux-gnu',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
  ];
  for (const triple of targetTriples) {
    const binaryPath = join(binariesDir, `noctune-backend-${triple}`);
    if (!existsSync(binaryPath)) {
      writeFileSync(binaryPath, '');
    }
  }
}

ensureDevSidecarStubs();

const env = createDevEnv({ defaultPort: '3132', preferDotEnvPort: false });
const children = [];
let shuttingDown = false;

function npmInvocation(args) {
  if (process.platform !== 'win32') {
    return { command: 'npm', args };
  }

  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', ['npm.cmd', ...args].join(' ')],
  };
}

function spawnChild(name, args) {
  const command = npmInvocation(args);
  const child = spawn(command.command, command.args, {
    env,
    stdio: 'inherit',
    windowsHide: false,
  });
  children.push({ name, child });
  return child;
}

function runOnce(args) {
  return new Promise((resolve, reject) => {
    const command = npmInvocation(args);
    const child = spawn(command.command, command.args, {
      env,
      stdio: 'inherit',
      windowsHide: false,
    });
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Command stopped by ${signal}`));
        return;
      }
      if (code) {
        reject(new Error(`Command failed with exit code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function killTree(child) {
  if (child.killed || child.exitCode !== null || !child.pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill('SIGTERM');
}

function stopAll() {
  for (const { child } of children) {
    killTree(child);
  }
}

function watch(child) {
  child.once('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shutdown(code ?? (signal ? 1 : 0));
  });
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  stopAll();
  setTimeout(() => process.exit(code), 800).unref();
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

printDevEnv(env, 'tauri');
await runOnce(['run', 'build', '--workspace=backend']);
watch(spawnChild('backend', ['run', 'dev:backend']));
watch(spawnChild('tauri', ['exec', 'tauri', '--', 'dev']));
