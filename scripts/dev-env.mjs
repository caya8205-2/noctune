import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOTENV_PATH = resolve(process.cwd(), '.env');

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readDotEnv() {
  if (!existsSync(DOTENV_PATH)) {
    return {};
  }

  const entries = {};
  const content = readFileSync(DOTENV_PATH, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = stripQuotes(trimmed.slice(separator + 1));
    if (key) {
      entries[key] = value;
    }
  }

  return entries;
}

function firstValue(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}

function clientHostFor(bindHost) {
  if (bindHost === '0.0.0.0' || bindHost === '::') {
    return '127.0.0.1';
  }
  return bindHost;
}

export function createDevEnv({ defaultPort = '3131', preferDotEnvPort = true } = {}) {
  const dotEnv = readDotEnv();
  const source = { ...dotEnv, ...process.env };
  const host = firstValue(source, ['HOST', 'BACKEND_BIND_HOST']) ?? '127.0.0.1';
  const port =
    firstValue(process.env, ['PORT', 'NOCTUNE_DEV_PORT', 'TAURI_DEV_PORT']) ??
    firstValue(dotEnv, ['NOCTUNE_DEV_PORT', 'TAURI_DEV_PORT']) ??
    (preferDotEnvPort ? firstValue(dotEnv, ['PORT']) : undefined) ??
    defaultPort;
  const backendHost =
    firstValue(source, ['VITE_TAURI_BACKEND_HOST', 'VITE_BACKEND_HOST', 'BACKEND_HOST']) ??
    clientHostFor(host);
  const portAttempts =
    firstValue(source, [
      'VITE_TAURI_BACKEND_PORT_ATTEMPTS',
      'VITE_BACKEND_PORT_ATTEMPTS',
      'BACKEND_PORT_ATTEMPTS',
    ]) ?? '10';

  return {
    ...process.env,
    HOST: host,
    PORT: port,
    BACKEND_HOST: backendHost,
    VITE_BACKEND_HOST: backendHost,
    VITE_BACKEND_PORT: port,
    VITE_BACKEND_PORT_ATTEMPTS: portAttempts,
    VITE_TAURI_BACKEND_HOST: backendHost,
    VITE_TAURI_BACKEND_PORT: port,
    VITE_TAURI_BACKEND_PORT_ATTEMPTS: portAttempts,
  };
}

export function printDevEnv(env, label) {
  console.log(
    `[${label}] backend bind: http://${env.HOST}:${env.PORT} | client API: http://${env.VITE_TAURI_BACKEND_HOST}:${env.VITE_TAURI_BACKEND_PORT}`,
  );
}
