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
  if (/You serve first|You go first/.test(prompt)) {
    if (code) fs.appendFileSync('notes.txt', `${who} ${n}\n`);
    out = code ? `- added notes.txt (${who})` : `Approach: short.\n<answer>Version 1 by ${who}</answer>`;
  } else if (pass) out = 'It holds up.\nVERDICT: PASS';
  else {
    if (code) fs.appendFileSync('notes.txt', `${who} ${n}\n`);
    out = `- issue one\n- issue two\n${code ? '' : `<answer>Version ${n} by ${who}</answer>\n`}VERDICT: REVISE: needs work`;
  }
  if (who === 'codex') {
    fs.writeFileSync(args[args.indexOf('-o') + 1], out);
    if (args.includes('--json')) process.stdout.write(JSON.stringify({ type: 'item.started', item: { type: 'web_search', query: 'best dog names' } }) + '\n');
  } else if (args.includes('stream-json')) {
    process.stdout.write([{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'WebSearch', input: { query: 'dog names 2026' } }] } }, { type: 'result', result: out }].map(e => JSON.stringify(e)).join('\n') + '\n');
  } else process.stdout.write(out);
});
