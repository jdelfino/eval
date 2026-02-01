import { spawn, SpawnOptionsWithoutStdio, ChildProcessWithoutNullStreams } from 'child_process';
import { execSync } from 'child_process';
import * as path from 'path';

// Sandbox configuration
const SANDBOX_CONFIG = {
  // Memory limit in bytes (128MB)
  memoryLimit: 128 * 1024 * 1024,
  // Maximum number of PIDs
  maxPids: 10,
  // Time limit in seconds (handled separately by caller, but nsjail has its own limit as backup)
  timeLimit: 15,
  // Maximum file size in bytes (10MB)
  maxFileSize: 10 * 1024 * 1024,
};

// Cache nsjail availability check
let nsjailAvailable: boolean | null = null;

/**
 * Check if nsjail is available on the system
 */
export function isNsjailAvailable(): boolean {
  if (nsjailAvailable !== null) {
    return nsjailAvailable;
  }

  try {
    execSync('which nsjail', { stdio: 'ignore' });
    nsjailAvailable = true;
  } catch {
    nsjailAvailable = false;
  }

  return nsjailAvailable;
}

/**
 * Check if sandboxing is enabled
 * Can be disabled via environment variable for testing
 */
export function isSandboxEnabled(): boolean {
  if (process.env.DISABLE_SANDBOX === 'true') {
    return false;
  }
  return isNsjailAvailable();
}

/**
 * Get Python3 path for nsjail bindings.
 * Returns the real path (following symlinks) for proper mounting.
 */
function getPython3Path(): string {
  try {
    // Get the real path following symlinks
    return execSync('readlink -f $(which python3)', { encoding: 'utf-8' }).trim();
  } catch {
    return '/usr/bin/python3';
  }
}

/**
 * Get the directory containing Python (for mounting)
 */
function getPythonInstallDir(): string {
  const python3Path = getPython3Path();
  // Go up from bin/python3 to the install root
  // e.g., /usr/local/python/3.11.14/bin/python3.11 -> /usr/local/python/3.11.14
  const binDir = path.dirname(python3Path);
  return path.dirname(binDir);
}

/**
 * Get Python lib paths for nsjail bindings
 */
function getPythonLibPaths(): string[] {
  const paths: string[] = [];

  try {
    // Get Python's sys.path to find stdlib location
    const sysPath = execSync('python3 -c "import sys; print(\\"\\n\\".join(sys.path))"', {
      encoding: 'utf-8',
    }).trim().split('\n').filter(p => p);

    for (const p of sysPath) {
      if (p && !p.includes('site-packages')) {
        paths.push(p);
      }
    }
  } catch {
    // Fallback to common paths
    paths.push('/usr/lib/python3');
    paths.push('/usr/lib/python3.11');
  }

  // Add architecture-specific library paths
  try {
    const arch = execSync('uname -m', { encoding: 'utf-8' }).trim();
    let libArch = 'x86_64-linux-gnu';
    if (arch === 'aarch64') {
      libArch = 'aarch64-linux-gnu';
    } else if (arch === 'armv7l') {
      libArch = 'arm-linux-gnueabihf';
    }

    const usrLibPath = `/usr/lib/${libArch}`;
    const libPath = `/lib/${libArch}`;

    // Only add if they exist
    try { execSync(`test -d ${usrLibPath}`, { stdio: 'ignore' }); paths.push(usrLibPath); } catch {}
    try { execSync(`test -d ${libPath}`, { stdio: 'ignore' }); paths.push(libPath); } catch {}
  } catch {}

  // Add /usr/local/lib if it exists
  try { execSync('test -d /usr/local/lib', { stdio: 'ignore' }); paths.push('/usr/local/lib'); } catch {}

  return [...new Set(paths)]; // Remove duplicates
}

export interface SandboxSpawnOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  additionalMountsRO?: string[];
}

/**
 * Build nsjail command arguments
 */
function buildNsjailArgs(
  command: string,
  args: string[],
  options: SandboxSpawnOptions = {}
): string[] {
  const { cwd, timeout = SANDBOX_CONFIG.timeLimit, additionalMountsRO = [] } = options;
  const python3Path = getPython3Path();
  const pythonInstallDir = getPythonInstallDir();
  const pythonBinDir = path.dirname(python3Path);
  const pythonLibPaths = getPythonLibPaths();

  // If the command is 'python3', replace with the full path
  const actualCommand = command === 'python3' ? python3Path : command;

  const nsjailArgs: string[] = [
    // Run in one-shot mode (execute and exit)
    '--mode', 'o',

    // Network isolation: by NOT passing --disable_clone_newnet,
    // nsjail creates a new network namespace with no connectivity
    // (This is the default behavior - we just don't disable it)

    // Resource limits
    '--rlimit_as', Math.floor(SANDBOX_CONFIG.memoryLimit / (1024 * 1024)).toString(), // MB
    '--rlimit_cpu', timeout.toString(),
    '--rlimit_fsize', Math.floor(SANDBOX_CONFIG.maxFileSize / (1024 * 1024)).toString(), // MB
    '--rlimit_nofile', '32',
    '--rlimit_nproc', SANDBOX_CONFIG.maxPids.toString(),

    // Time limit (seconds)
    '--time_limit', timeout.toString(),

    // Quiet mode (less noise in stderr)
    '--really_quiet',

    // Mount minimal filesystem
    // Root filesystem (read-only)
    '--bindmount_ro', '/usr',
    '--bindmount_ro', '/lib',
    '--bindmount_ro', '/bin',
    '--bindmount_ro', '/etc/alternatives',
    '--bindmount_ro', '/etc/ld.so.cache',
    '--bindmount_ro', '/etc/ld.so.conf',
    '--bindmount_ro', '/etc/ld.so.conf.d',

    // Python installation directory (includes bin, lib, etc.)
    '--bindmount_ro', pythonInstallDir,
  ];

  // Try to mount /lib64 if it exists (not on all architectures)
  try {
    execSync('test -d /lib64', { stdio: 'ignore' });
    nsjailArgs.push('--bindmount_ro', '/lib64');
  } catch {
    // /lib64 doesn't exist, skip it
  }

  // Add Python library paths
  for (const libPath of pythonLibPaths) {
    nsjailArgs.push('--bindmount_ro', libPath);
  }

  // Add additional read-only mounts (e.g., tracer script)
  for (const mountPath of additionalMountsRO) {
    nsjailArgs.push('--bindmount_ro', mountPath);
  }

  // Mount /dev/null and /dev/urandom (needed by Python)
  nsjailArgs.push('--bindmount_ro', '/dev/null');
  nsjailArgs.push('--bindmount_ro', '/dev/urandom');

  // Mount temp directory as read-write if specified
  if (cwd) {
    nsjailArgs.push('--bindmount', cwd);
    nsjailArgs.push('--cwd', cwd);
  } else {
    // Create a minimal temp directory
    nsjailArgs.push('--tmpfsmount', '/tmp');
    nsjailArgs.push('--cwd', '/tmp');
  }

  // Environment - clear and set minimal vars
  // Include Python bin dir in PATH
  nsjailArgs.push('--env', `PATH=${pythonBinDir}:/usr/bin:/bin`);
  nsjailArgs.push('--env', 'HOME=/tmp');
  nsjailArgs.push('--env', 'PYTHONDONTWRITEBYTECODE=1');
  nsjailArgs.push('--env', 'PYTHONUNBUFFERED=1');

  // The command to execute (use actualCommand which resolves python3 to full path)
  nsjailArgs.push('--', actualCommand, ...args);

  return nsjailArgs;
}

/**
 * Spawn a process in the sandbox
 *
 * SECURITY: This function will throw an error if nsjail is not available,
 * unless DISABLE_SANDBOX=true is explicitly set (for testing only).
 */
export function spawnSandboxed(
  command: string,
  args: string[],
  options: SandboxSpawnOptions = {}
): ChildProcessWithoutNullStreams {
  // Check if sandbox is explicitly disabled (for testing)
  if (process.env.DISABLE_SANDBOX === 'true') {
    console.warn('[SECURITY WARNING] Sandbox disabled via DISABLE_SANDBOX - running without isolation');
    const spawnOptions: SpawnOptionsWithoutStdio = {};
    if (options.cwd) {
      spawnOptions.cwd = options.cwd;
    }
    if (options.env) {
      spawnOptions.env = options.env;
    }
    return spawn(command, args, spawnOptions);
  }

  // Require nsjail to be available
  if (!isNsjailAvailable()) {
    throw new Error(
      'Sandbox (nsjail) is required but not available. ' +
      'Install nsjail or set DISABLE_SANDBOX=true for testing only.'
    );
  }

  // Use nsjail
  const nsjailArgs = buildNsjailArgs(command, args, options);
  return spawn('nsjail', nsjailArgs);
}

/**
 * Get sandbox status for diagnostics
 */
export function getSandboxStatus(): {
  available: boolean;
  enabled: boolean;
  reason?: string;
} {
  const available = isNsjailAvailable();
  const enabled = isSandboxEnabled();

  let reason: string | undefined;
  if (!available) {
    reason = 'nsjail not found in PATH';
  } else if (!enabled) {
    reason = 'Disabled via DISABLE_SANDBOX environment variable';
  }

  return { available, enabled, reason };
}

// Reset cache (useful for testing)
export function resetSandboxCache(): void {
  nsjailAvailable = null;
}
