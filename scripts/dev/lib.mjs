import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const USE_SHELL = process.platform === 'win32';

export function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: options.stdio ?? 'inherit',
      shell: USE_SHELL,
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || options.allowFailure) {
        resolve(code ?? 0);
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

export function capture(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: USE_SHELL,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on('exit', (code) => {
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

export function isPortOpen(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

export async function fetchStatus(url, timeoutMs = 1000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function printSection(title) {
  console.log(`\n== ${title} ==`);
}

export function printResult(label, ok, detail = '') {
  const marker = ok ? 'OK' : 'FAIL';
  console.log(`${marker.padEnd(4)} ${label}${detail ? ` ${detail}` : ''}`);
}

export function spawnService(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: USE_SHELL,
    ...options,
  });

  const prefix = `[${name}]`;
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      console.log(`${prefix} ${line}`);
    }
  });
  child.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      console.error(`${prefix} ${line}`);
    }
  });
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`${prefix} exited with code ${code}`);
    }
  });
  return child;
}
