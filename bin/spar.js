#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { AGENTS } = require('../lib/agents');
const { which, runCli, agentEnv } = require('../lib/run');
const { play, report, save } = require('../lib/match');
const ui = require('../lib/ui');
const { c } = ui;
const pkg = require('../package.json');

const HELP = `
  ${c.bold('spar')} · make Claude and ChatGPT argue until the answer is right

  ${c.bold('Usage')}
    spar "your question or task"            ask anything; they rally, you steer
    spar --code "fix the failing test"      they take turns editing this repo
    cat notes.md | spar "tighten this"      pipe in material
    spar doctor                             check both players are ready

  ${c.bold('Options')}
    -f, --file <path>          give them a file to work with (repeatable)
    -l, --left <claude|codex>  who serves first (default: claude)
        --swap                 ChatGPT serves, Claude returns
        --code                 code match in the current git repo
    -a, --auto                 no pauses: play until someone concedes
    -t, --turns <n>            stop after n turns (default with --auto: 6)
        --no-web               no web search
        --left-model <m>       e.g. opus, sonnet, haiku, or a GPT model
        --right-model <m>
        --left-effort <e>      low · medium · high · xhigh · max
        --right-effort <e>
    -s, --save                 keep a match report in ./spar-matches
        --allow-dirty          code match with uncommitted changes
        --use-api-keys         let the CLIs use API keys from your shell
    -v, --version
    -h, --help

  ${c.bold('While they play')}
    ↵          send it to the other side
    any text   a note for the next turn (it beats everything else)
    d          done: keep the current answer

  Uses your own Claude and ChatGPT plans through the official Claude Code and
  Codex CLIs. Nothing goes anywhere else.
`;

function parseArgs(argv) {
  const o = { files: [], left: 'claude', web: true, code: false, auto: false, turns: 0, save: false, models: {}, efforts: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '-v': case '--version': o.version = true; break;
      case '-f': case '--file': o.files.push(val()); break;
      case '-l': case '--left': o.left = val(); break;
      case '--swap': o.left = 'codex'; break;
      case '--code': o.code = true; break;
      case '-a': case '--auto': o.auto = true; break;
      case '-t': case '--turns': o.turns = Math.max(1, parseInt(val(), 10) || 0); break;
      case '--no-web': o.web = false; break;
      case '--web': o.web = true; break;
      case '--left-model': o.models.left = val(); break;
      case '--right-model': o.models.right = val(); break;
      case '--left-effort': o.efforts.left = val(); break;
      case '--right-effort': o.efforts.right = val(); break;
      case '-s': case '--save': o.save = true; break;
      case '--allow-dirty': o.allowDirty = true; break;
      case '--use-api-keys': o.keepKeys = true; break;
      default:
        if (a.startsWith('-') && a.length > 1) throw new Error(`Unknown option ${a}. See spar --help`);
        o.rest.push(a);
    }
  }
  if (!AGENTS[o.left]) throw new Error('--left must be claude or codex');
  o.right = o.left === 'claude' ? 'codex' : 'claude';
  return o;
}

async function doctor() {
  ui.say();
  let ok = true;
  for (const a of Object.values(AGENTS)) {
    if (!which(a.bin)) { ok = false; ui.say(`  ${c.red('✗')} ${a.name}: not installed. ${c.dim(`Install: ${a.install}`)}`); continue; }
    const v = await runCli(a.bin, ['--version'], { env: agentEnv(), timeoutMs: 30000 }).catch(() => null);
    ui.say(`  ${c.green('✓')} ${a.name}: ${(v && v.stdout.trim().split('\n')[0]) || 'installed'} ${c.dim(`(sign in: ${a.login})`)}`);
  }
  ui.say();
  ui.say(ok ? '  Ready. Try: spar "what should I name my dog?"' : '  Install the missing player, sign in once, then play.');
  ui.say();
  return ok ? 0 : 1;
}

function readStdin() {
  return new Promise(resolve => {
    let s = ''; process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => { s += d; }); process.stdin.on('end', () => resolve(s));
  });
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { ui.say(c.red(`  ${e.message}`)); return 2; }
  if (o.help) { ui.say(HELP); return 0; }
  if (o.version) { console.log(pkg.version); return 0; }
  if (o.rest[0] === 'doctor') return doctor();

  const materials = [];
  for (const f of o.files) {
    try { materials.push({ name: path.basename(f), text: fs.readFileSync(f, 'utf8').slice(0, 200000) }); }
    catch { ui.say(c.red(`  Can't read ${f}`)); return 2; }
  }
  const piped = !process.stdin.isTTY;
  if (piped) { const s = await readStdin(); if (s.trim()) materials.push({ name: 'piped input', text: s.slice(0, 200000) }); }

  let task = o.rest.join(' ').trim();
  if (!task && !piped && ui.TTY) task = ((await ui.ask(`  ${c.bold('What should they spar about?')} › `)) || '').trim();
  if (!task) { ui.say(HELP); return 2; }

  for (const id of [o.left, o.right]) {
    if (!which(AGENTS[id].bin)) { ui.say(c.red(`  ${AGENTS[id].name} isn't installed.`) + c.dim(` Install: ${AGENTS[id].install}, then sign in with: ${AGENTS[id].login}`)); return 1; }
  }

  const opts = {
    task, materials, left: o.left, right: o.right, code: o.code, web: o.web, turns: o.turns,
    interactive: !o.auto && !piped && ui.TTY && !!process.stdin.isTTY,
    models: o.models, efforts: o.efforts, keepKeys: o.keepKeys, allowDirty: o.allowDirty,
    user: 'the user', cwd: process.cwd(),
  };
  let res;
  try { res = await play(opts); } catch (e) { ui.say(c.red(`  ${e.message}`)); return 1; }
  if (!res.turns) return 1;

  report(opts, res);
  if (o.save) ui.say(c.dim(`  Saved: ${path.relative(process.cwd(), save(opts, res))}`));
  if (!o.code && res.answer) {
    if (process.stdout.isTTY) ui.say(`  ${c.bold('FINAL ANSWER')}\n`);
    process.stdout.write(res.answer.trim() + '\n');
  }
  if (ui.TTY) ui.say(c.dim('\n  Want projects, your chat history and a proper app? spar.app'));
  return 0;
}

main().then(code => { process.exitCode = code; }, e => { console.error(e); process.exitCode = 1; });
