'use strict';
// Running the official agent CLIs (Claude Code, Codex) and small helpers like git.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';

function which(bin) {
  const sep = IS_WIN ? ';' : ':';
  const exts = IS_WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map(e => e.toLowerCase()) : [''];
  for (const dir of (process.env.PATH || '').split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const f = path.join(dir, bin + ext);
      try { if (fs.statSync(f).isFile()) return f; } catch { /* next */ }
    }
  }
  return null;
}

function quoteWin(a) {
  a = String(a);
  if (a.includes('"')) throw new Error('Arguments with double quotes are not supported on Windows.');
  return /[\s&|<>^()%!,;=]/.test(a) || a === '' ? `"${a}"` : a;
}

// The agents should use the subscription you signed in with, not a stray API key in your shell.
const API_KEY_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'CODEX_API_KEY'];
function agentEnv(keepKeys) {
  const env = { ...process.env };
  if (!keepKeys) for (const v of API_KEY_VARS) delete env[v];
  return env;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (IS_WIN) spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true });
    else process.kill(-child.pid, 'SIGKILL');
  } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
}

const running = new Set();
process.on('exit', () => { for (const c of running) killTree(c); });

function runCli(bin, args, { input = '', cwd, env, timeoutMs = 30 * 60 * 1000, onData } = {}) {
  return new Promise((resolve, reject) => {
    const exe = which(bin);
    if (!exe) return reject(Object.assign(new Error(`${bin} isn't installed or isn't on your PATH.`), { missing: bin }));
    const child = IS_WIN
      ? spawn([quoteWin(exe), ...args.map(quoteWin)].join(' '), { cwd, env, shell: true, windowsHide: true })
      : spawn(exe, args, { cwd, env, detached: true });
    running.add(child);
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => { stdout += d; if (onData) onData(d); });
    child.stderr.on('data', d => { stderr += d; if (stderr.length > 200000) stderr = stderr.slice(-100000); });
    const timer = setTimeout(() => { killTree(child); reject(new Error(`${bin} timed out after ${Math.round(timeoutMs / 60000)} minutes.`)); }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); running.delete(child); reject(e); });
    child.on('close', code => { clearTimeout(timer); running.delete(child); resolve({ code, stdout, stderr }); });
    child.stdin.on('error', () => { /* exited early */ });
    child.stdin.end(input, 'utf8');
  });
}

function git(args, cwd) {
  return new Promise(resolve => {
    const child = spawn('git', args, { cwd, windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
    child.on('error', e => resolve({ code: 127, out: '', err: e.message }));
    child.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

module.exports = { IS_WIN, which, runCli, git, agentEnv, killTree };
