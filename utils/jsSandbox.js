/**
 * Secure JavaScript execution sandbox using isolated-vm.
 * - No require(), process, fs, or network access
 * - 5-second timeout
 * - 16MB memory limit
 * - Only console.log output captured
 * - Pure computation only (Math, Date, JSON, Array, etc.)
 */

let ivm = null;
try {
  ivm = require('isolated-vm');
} catch {
  // isolated-vm not installed
}

const TIMEOUT_MS = 5000;
const MEMORY_LIMIT_MB = 16;

async function executeJavaScript(code) {
  if (!ivm) {
    return {
      success: false,
      error: 'JavaScript sandbox (isolated-vm) is not installed. Run: npm install isolated-vm',
    };
  }

  const trimmedCode = String(code ?? '').trim();
  if (!trimmedCode) {
    return { success: false, error: 'No code provided.' };
  }

  // Block dangerous patterns before execution
  const blockRegexes = [
    /require\s*\(/,
    /import\s*\(/,
    /process\s*\./,
    /global\s*\./,
    /globalThis\s*\./,
    /__dirname/,
    /__filename/,
    /module\s*\./,
    /exports\s*\./,
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /Worker\s*\(/,
    /child_process/,
    /exec\s*\(/,
    /spawn\s*\(/,
    /fork\s*\(/,
    /eval\s*\(/,
    /Function\s*\(/,
    /Reflect\.construct/,
  ];

  for (const pattern of blockRegexes) {
    if (pattern.test(trimmedCode)) {
      return {
        success: false,
        error: `Blocked: "${pattern.source}" is not allowed.`,
      };
    }
  }

  const logs = [];
  let result = null;
  let error = null;

  try {
    const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });
    const context = await isolate.createContext();
    const jail = context.global;

    // Create a log callback using evalClosure with a reference
    const logRef = new ivm.Reference((...args) => {
      logs.push(args.map(String).join(' '));
    });

    // Remove dangerous globals
    await context.eval(`
      delete globalThis.setTimeout;
      delete globalThis.setInterval;
      delete globalThis.setImmediate;
      delete globalThis.clearTimeout;
      delete globalThis.clearInterval;
      delete globalThis.clearImmediate;
    `);

    // Set up console.log using evalClosure which supports references
    await context.evalClosure(`
      const logFn = $0;
      globalThis.console = {
        log: function() { logFn.apply(undefined, Array.prototype.slice.call(arguments)); },
        info: function() { logFn.apply(undefined, Array.prototype.slice.call(arguments)); },
        warn: function() { logFn.apply(undefined, Array.prototype.slice.call(arguments)); },
        error: function() { logFn.apply(undefined, Array.prototype.slice.call(arguments)); },
      };
    `, [logRef]);

    // Compile and run user code
    // isolated-vm's run() returns the last expression value for primitives.
    // Arrays/objects need JSON.stringify() by the user code.
    const compiled = await isolate.compileScript(trimmedCode, { timeout: TIMEOUT_MS });
    result = await compiled.run(context, { timeout: TIMEOUT_MS });

    context.release();
    isolate.dispose();
  } catch (err) {
    const msg = err?.message ?? String(err ?? 'Unknown error');
    error = msg.includes('timed out')
      ? `Execution timed out after ${TIMEOUT_MS / 1000} seconds.`
      : msg;
  }

  const response = { success: !error };
  if (result !== undefined && error === null) response.result = String(result);
  if (logs.length > 0) response.logs = logs.join('\n');
  if (error) response.error = error;

  return response;
}

module.exports = { executeJavaScript };
