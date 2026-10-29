'use strict';
// The two players. Each one is the provider's own official CLI, signed in with your own plan.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCli, agentEnv } = require('./run');

const TEST_COMMANDS = ['Bash(npm test:*)', 'Bash(npm run:*)', 'Bash(pnpm test:*)', 'Bash(pnpm run:*)', 'Bash(yarn test:*)',
  'Bash(pytest:*)', 'Bash(python -m pytest:*)', 'Bash(cargo test:*)', 'Bash(go test:*)', 'Bash(git status:*)', 'Bash(git diff:*)',
  'Bash(git log:*)', 'Bash(ls:*)', 'Bash(cat:*)'];

const short = (x, n = 60) => { x = String(x || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
const base = f => String(f || '').split(/[\\/]/).pop();
// What each agent is doing right now, in the words its own app would use.
function claudeStep(b) {
  const i = b.input || {};
  return ({ WebSearch: `searching the web for ${short(i.query, 40)}`, WebFetch: `reading ${short(i.url, 40)}`, Read: `reading ${base(i.file_path)}`, Edit: `editing ${base(i.file_path)}`,
    Write: `writing ${base(i.file_path)}`, Bash: `running ${short(i.command, 40)}`, Grep: 'searching files', Glob: 'looking through files', TodoWrite: 'making a plan' })[b.name] || `using ${b.name}`;
}
function codexStep(e) {
  const it = e.item || {};
  if (e.type !== 'item.started') return null;
  if (it.type === 'command_execution') return `running ${short(it.command, 40)}`;
  if (it.type === 'web_search') return `searching the web for ${short(it.query, 40)}`;
  if (it.type === 'file_change') return 'editing files';
  if (it.type === 'reasoning') return 'thinking';
  return null;
}
function lines(onJson) {
  let buf = '';
  return chunk => { buf += chunk; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l.startsWith('{')) { try { onJson(JSON.parse(l)); } catch { /* partial */ } } } };
}

const AGENTS = {
  claude: {
    id: 'claude', name: 'Claude', bin: 'claude', install: 'npm i -g @anthropic-ai/claude-code', login: 'claude  (then /login)',
    color: 'orange',
    async play({ prompt, cwd, code, web, model, effort, keepKeys, onStep }) {
      const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'none'];
      if (model) args.push('--model', model);
      if (effort) args.push('--effort', effort);
      const webTools = web ? ['WebSearch', 'WebFetch'] : [];
      if (code) args.push('--permission-mode', 'acceptEdits', '--allowedTools', ['Read', 'Glob', 'Grep', 'Edit', 'Write', ...TEST_COMMANDS, ...webTools].join(','));
      else args.push('--allowedTools', ['Read', 'Glob', 'Grep', ...webTools].join(','));
      let result = '';
      const seen = new Set();
      const r = await runCli('claude', args, { input: prompt, cwd, env: agentEnv(keepKeys), onData: lines(e => {
        if (e.type === 'assistant' && e.message && Array.isArray(e.message.content)) for (const b of e.message.content) if (b.type === 'tool_use' && !seen.has(b.id)) { seen.add(b.id); if (onStep) onStep(claudeStep(b)); }
        if (e.type === 'result' && typeof e.result === 'string') result = e.result;
      }) });
      const text = result.trim() || (r.stdout.trim().startsWith('{') ? '' : r.stdout.trim());
      if (r.code !== 0 || !text) throw new Error(tidyError('Claude', r));
      return text;
    },
  },
  codex: {
    id: 'codex', name: 'ChatGPT', bin: 'codex', install: 'npm i -g @openai/codex', login: 'codex login',
    color: 'green',
    async play({ prompt, cwd, code, web, model, effort, keepKeys, onStep }) {
      const out = path.join(os.tmpdir(), `spar-${process.pid}-${Date.now()}.txt`);
      const args = [];
      if (web) args.push('--search');
      args.push('exec', '--json', '--skip-git-repo-check', '-o', out, '--sandbox', code ? 'workspace-write' : 'read-only');
      if (model) args.push('-m', model);
      if (effort) args.push('-c', `model_reasoning_effort=${effort}`);
      args.push('-');
      try {
        const r = await runCli('codex', args, { input: prompt, cwd, env: agentEnv(keepKeys), onData: lines(e => { const st = codexStep(e); if (st && onStep) onStep(st); }) });
        let text = '';
        try { text = fs.readFileSync(out, 'utf8').trim(); } catch { /* none */ }
        if (r.code !== 0 || !text) throw new Error(tidyError('ChatGPT (Codex)', r));
        return text;
      } finally { fs.rmSync(out, { force: true }); }
    },
  },
};

function tidyError(who, r) {
  const msg = (r.stderr || r.stdout || '').trim().split('\n').filter(Boolean).slice(-6).join('\n');
  if (/usage limit|rate limit|quota/i.test(msg)) return `${who} hit your plan's usage limit. Try again later, or swap in the other side.\n${msg}`;
  if (/log ?in|auth|unauthori[sz]ed|sign in/i.test(msg)) return `${who} isn't signed in. Run it once on its own to sign in.\n${msg}`;
  return `${who} stopped with an error (exit ${r.code}).\n${msg}`;
}

module.exports = { AGENTS };
