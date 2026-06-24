import { spawn } from 'node:child_process';
import { createDevEnv, printDevEnv } from './dev-env.mjs';

const env = createDevEnv({ defaultPort: '3131' });
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

function run(name, args) {
  const command = npmInvocation(args);
  const child = spawn(command.command, command.args, {
    env,
    stdio: 'inherit',
    windowsHide: false,
  });
  child.once('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shutdown(code ?? (signal ? 1 : 0));
  });
  children.push({ name, child });
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

printDevEnv(env, 'dev');
run('backend', ['run', 'dev:backend']);
run('frontend', ['run', 'dev:frontend']);
