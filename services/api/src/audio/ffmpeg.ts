/**
 * FFmpeg command execution wrapper
 *
 * Provides safe, typed command execution with timeout handling.
 * NEVER relies on FFmpeg defaults - always explicit codecs/formats.
 */

import { spawn } from 'node:child_process';

export type SpawnResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/**
 * Execute a command with proper timeout and output capture
 */
export async function run(
  cmd: string,
  args: string[],
  opts?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  }
): Promise<SpawnResult> {
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000; // 10 minutes default

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: opts?.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

/**
 * Throw if command did not exit with code 0
 */
export function requireOk(result: SpawnResult, context: string): void {
  if (result.code !== 0) {
    const err = new Error(
      `${context} failed (code=${result.code}).\n` +
      `STDERR:\n${result.stderr.slice(0, 2000)}\n` +
      `STDOUT:\n${result.stdout.slice(0, 2000)}`
    );
    (err as Error & { stderr: string; stdout: string }).stderr = result.stderr;
    (err as Error & { stderr: string; stdout: string }).stdout = result.stdout;
    throw err;
  }
}

/**
 * Check if FFmpeg is available on the system
 */
export async function checkFfmpeg(): Promise<boolean> {
  try {
    const result = await run('ffmpeg', ['-version'], { timeoutMs: 5000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Check if FFprobe is available on the system
 */
export async function checkFfprobe(): Promise<boolean> {
  try {
    const result = await run('ffprobe', ['-version'], { timeoutMs: 5000 });
    return result.code === 0;
  } catch {
    return false;
  }
}
