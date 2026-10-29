#!/usr/bin/env node
'use strict';
// Stand-in for the claude and codex CLIs.
const fs = require('fs'), path = require('path');
const who = process.argv[2], args = process.argv.slice(3);
const state = process.env.FAKE_STATE;
fs.appendFileSync(path.join(state, 'args.log'), `${who} ${JSON.stringify(args)}\n`);
if (args.includes('--version')) { console.log(`fake-${who} 1.0`); process.exit(0); }
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { prompt += d; });
process.stdin.on('end', () => {
  const cf = path.join(state, 'count'); const n = (fs.existsSync(cf) ? +fs.readFileSync(cf, 'utf8') : 0) + 1; fs.writeFileSync(cf, String(n));
  fs.writeFileSync(path.join(state, `prompt-${n}.md`), prompt);
  if (process.env.FAKE_FAIL === who) { console.error('Error: You have hit your usage limit.'); process.exit(1); }
  const pass = n >= +(process.env.FAKE_PASS_AT || 99);
  const code = /coding task/.test(prompt);
  let out;
  const resumed = args.includes('--resume') || args.includes('resume');
  if (process.env.FAKE_ASK === who && !resumed) out = 'Happy to help. Which city are you in?';
  else if (resumed && !/their_answer|took a turn/.test(prompt)) out = `Thanks, noted: ${prompt.trim()}.\n<answer>Version ${n} by ${who}, using your answer</answer>`;
  else if (/You serve first|You go first/.test(prompt)) {
    if (code) fs.appendFileSync('notes.txt', `${who} ${n}\n`);
    out = code ? `- added notes.txt (${who})` : `Approach: short.\n<answer>Version 1 by ${who}</answer>`;
  } else if (pass) out = 'It holds up.\nVERDICT: PASS';
  else {
    if (code) fs.appendFileSync('notes.txt', `${who} ${n}\n`);
    out = `- issue one\n- issue two\n${code ? '' : `<answer>Version ${n} by ${who}</answer>\n`}VERDICT: REVISE: needs work`;
  }
  if (who === 'codex') {
    fs.writeFileSync(args[args.indexOf('-o') + 1], out);
    const ri = args.indexOf('resume'); const tid = ri >= 0 ? args[args.indexOf('-', ri) - 1] : `thread-${who}-${n}`;
    if (args.includes('--json')) process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: tid }) + '\n' + JSON.stringify({ type: 'item.started', item: { type: 'web_search', query: 'best dog names' } }) + '\n');
  } else if (args.includes('stream-json')) {
    const sid = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : `sess-${who}-${n}`;
    const half = Math.floor(out.length / 2);
    process.stdout.write([{ type: 'system', subtype: 'init', session_id: sid }, { type: 'assistant', session_id: sid, message: { content: [{ type: 'tool_use', id: 't1', name: 'WebSearch', input: { query: 'dog names 2026' } }] } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: out.slice(0, half) } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: out.slice(half) } } },
      { type: 'result', result: out, session_id: sid }].map(e => JSON.stringify(e)).join('\n') + '\n');
  } else process.stdout.write(out);
});
