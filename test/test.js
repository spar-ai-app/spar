'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const BIN = path.join(__dirname, '..', 'bin', 'spar.js');
let n = 0; const ok = m => console.log(`  ✓ ${++n}. ${m}`);

function run(args, { input = '', pass = 99, fail = '', cwd, env: extra = {} } = {}) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'sparcli-'));
  const env = { ...process.env, PATH: path.join(__dirname, 'fakes', 'bin') + path.delimiter + process.env.PATH, FAKE_STATE: state, FAKE_PASS_AT: String(pass), FAKE_FAIL: fail, NO_COLOR: '1', ANTHROPIC_API_KEY: 'sk-should-be-removed', ...extra };
  const r = spawnSync('node', [BIN, ...args], { input, env, cwd: cwd || state, encoding: 'utf8' });
  const log = fs.existsSync(path.join(state, 'args.log')) ? fs.readFileSync(path.join(state, 'args.log'), 'utf8') : '';
  const prompt = i => fs.readFileSync(path.join(state, `prompt-${i}.md`), 'utf8');
  return { ...r, log, prompt, state };
}

let r = run(['--auto', 'name my dog'], { pass: 3 });
assert.equal(r.status, 0, r.stderr);
assert.equal(r.stdout.trim(), 'Version 2 by codex');
assert.match(r.stderr, /Claude 0 · 2 ChatGPT/);
assert.match(r.stderr, /ChatGPT's version stood/);
assert.ok(r.prompt(2).includes('Version 1 by claude') && r.prompt(3).includes('Version 2 by codex'));
assert.match(r.stderr, /searching the web for dog names 2026/);
assert.match(r.stderr, /searching the web for best dog names/);
ok('auto match: serve, return, concede; live steps shown; final answer on stdout, commentary on stderr');

r = run(['--auto', '--turns', '3', 'x']);
assert.equal(r.stdout.trim(), 'Version 3 by claude');
assert.match(r.stderr, /You called it/);
ok('turn limit stops the match and keeps the latest version');

r = run(['--auto', '--swap', '--left-model', 'gpt-x', '--left-effort', 'high', '--right-model', 'sonnet', '--right-effort', 'max', '--no-web', 'x'], { pass: 2 });
const [first, second] = r.log.trim().split('\n');
assert.ok(first.startsWith('codex') && first.includes('"-m","gpt-x"') && first.includes('"model_reasoning_effort=high"') && !first.includes('--search'));
assert.ok(second.startsWith('claude') && second.includes('"--model","sonnet"') && second.includes('"--effort","max"') && !second.includes('WebSearch'));
ok('--swap, models, effort and --no-web reach the right CLI');

r = run(['--auto', 'summarise this'], { input: 'SECRET MATERIAL 123', pass: 2 });
assert.ok(r.prompt(1).includes('SECRET MATERIAL 123'));
const f = path.join(r.state, 'brief.txt'); fs.writeFileSync(f, 'FROM A FILE');
r = run(['--auto', '-f', f, 'x'], { pass: 2 });
assert.ok(r.prompt(1).includes('FROM A FILE'));
ok('piped input and --file reach both players');

r = run(['--auto', 'x'], { fail: 'codex' });
assert.match(r.stderr, /usage limit/);
assert.equal(r.stdout.trim(), 'Version 1 by claude');
ok('a failing side is explained, and the best answer so far is kept');

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sparrepo-'));
const g = a => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
g(['init', '-q']); fs.writeFileSync(path.join(repo, 'app.js'), '1\n'); g(['add', '-A']); g(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'start']);
r = run(['--code', '--auto', 'add notes'], { cwd: repo, pass: 3 });
assert.equal(r.status, 0, r.stderr);
assert.match(r.stderr, /Changes are on branch spar\//);
const commits = g(['log', '--oneline']).stdout.trim().split('\n');
assert.equal(commits.length, 3, commits.join('|'));
assert.ok(r.prompt(2).includes('+claude 1'), 'reviewer sees the diff');
assert.ok(r.log.includes('"acceptEdits"') && r.log.includes('"workspace-write"'));
ok('code match: own branch, one commit per turn, reviewer gets the diff');

fs.writeFileSync(path.join(repo, 'dirty.txt'), 'x');
r = run(['--code', '--auto', 'x'], { cwd: repo });
assert.equal(r.status, 1); assert.match(r.stderr, /uncommitted changes/);
ok('code match refuses to start on uncommitted changes');

r = run(['--auto', '--save', 'Best pizza?'], { pass: 2 });
const saved = fs.readdirSync(path.join(r.state, 'spar-matches'));
assert.ok(saved[0].endsWith('best-pizza.md'));
ok('--save writes a match report');

r = run(['doctor']);
assert.equal(r.status, 0); assert.match(r.stderr, /fake-claude 1.0/);
ok('doctor checks both players');

r = run(['--auto', '--turns', '4', 'x']);
const calls = r.log.trim().split('\n');
assert.ok(calls[0].includes('--system-prompt') && !calls[0].includes('--resume'), 'Claude starts with its chat-app brief');
assert.ok(calls[1].includes('model_instructions_file'), 'ChatGPT starts with its chat-app brief');
assert.ok(calls[2].includes('"--resume","sess-claude-1"'), 'Claude continues its own conversation');
assert.ok(calls[3].includes('"resume"') && calls[3].includes('thread-codex-2'), 'ChatGPT continues its own conversation');
assert.ok(!r.prompt(3).includes('Task:') && r.prompt(3).includes('<their_answer>'), 'a continuing side only gets what is new');
ok('each side keeps its own conversation and gets only what is new');

const { asksUser, parse } = require('../lib/prompts');
assert.ok(asksUser(parse('Happy to help. Which city are you in?')));
assert.ok(!asksUser(parse('Here you go.\n<answer>x</answer>\nVERDICT: REVISE: y')));
ok('a reply that asks you a question is recognised');

// Interactive, in a real terminal: a question goes back to whoever asked it.
const { execSync } = require('child_process');
let hasScript = false; try { execSync('command -v script', { stdio: 'ignore', shell: '/bin/sh' }); hasScript = process.platform === 'linux'; } catch { /* none */ }
if (hasScript) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'sparcli-pty-'));
  const envs = `PATH=${path.join(__dirname, 'fakes', 'bin')}:$PATH FAKE_STATE=${state} FAKE_ASK=claude FAKE_PASS_AT=99 NO_COLOR=1`;
  execSync(`(sleep 2; printf 'Calgary\\r'; sleep 2; printf 'd\\r'; sleep 1) | script -qec "env ${envs} node ${BIN} 'Plan my weekend'" /dev/null > ${state}/screen.txt 2>&1`, { shell: '/bin/bash', cwd: state, timeout: 30000 });
  const screen = fs.readFileSync(path.join(state, 'screen.txt'), 'utf8');
  const log = fs.readFileSync(path.join(state, 'args.log'), 'utf8').trim().split('\n');
  assert.match(screen, /asked you something/);
  assert.ok(log[1].startsWith('claude') && log[1].includes('--resume'), 'answer went back to Claude, same conversation');
  assert.match(fs.readFileSync(path.join(state, 'prompt-2.md'), 'utf8'), /Calgary/);
  ok('in the terminal, your answer to a question goes back to the side that asked');
}

// OpenRouter: any model with your own key
{
  const { spawn } = require('child_process');
  const orState = fs.mkdtempSync(path.join(os.tmpdir(), 'sparcli-or-'));
  const srv = spawn('node', [path.join(__dirname, 'fakes', 'openrouter-server.js'), orState]);
  const waitPort = () => new Promise(res => srv.stdout.once('data', d => res(String(d).trim())));
  (async () => {
    const p = await waitPort();
    const env = { OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_BASE_URL: `http://127.0.0.1:${p}/api/v1` };
    let r = run(['--auto', '--right', 'openrouter:google/gemini-test', 'Plan a team offsite'], { pass: 2, env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /Gemini Test via OpenRouter, your key: about \$0\.02 a turn/);
    assert.match(r.stderr, /Claude 0 · 2 Gemini Test/);
    assert.match(r.stderr, /OpenRouter cost this match: \$0\.01/);
    assert.equal(r.stdout.trim(), 'Version from Gemini 1');
    ok('an OpenRouter model plays with your key: price shown first, cost at the end');

    r = run(['--auto', '--turns', '4', '--right', 'openrouter:google/gemini-test', 'x'], { env });
    const reqs = fs.readFileSync(path.join(orState, 'or-requests.log'), 'utf8').trim().split('\n').map(JSON.parse).slice(-2);
    assert.equal(reqs[0].messages, 2); assert.equal(reqs[1].messages, 4);
    assert.equal(reqs[0].plugins, null);
    ok('the OpenRouter side keeps its own conversation, and web search costs nothing unless you ask');

    r = run(['--auto', '--right', 'openrouter:google/nope', 'x'], { env });
    assert.equal(r.status, 1); assert.match(r.stderr, /no model called google\/nope/);
    r = run(['--auto', '--right', 'openrouter:google/gemini-test', 'x'], { env: { OPENROUTER_API_KEY: '' } });
    assert.equal(r.status, 1); assert.match(r.stderr, /No OpenRouter key/);
    r = run(['--code', '--auto', '--right', 'openrouter:google/gemini-test', 'x'], { env });
    assert.equal(r.status, 1); assert.match(r.stderr, /can't edit files/);
    ok('clear messages for a missing key, an unknown model, and code matches');
    srv.kill();
    console.log(`\n${n} checks passed`);
  })().catch(e => { srv.kill(); console.error(e); process.exit(1); });
}
