'use strict';
// The fun part: a little pong court in your terminal. Everything here goes to stderr,
// so `spar "..." > answer.md` captures only the final answer.
const readline = require('readline');

const out = process.stderr;
const TTY = !!out.isTTY;
const COLOR = TTY && !process.env.NO_COLOR;
const esc = code => s => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: esc('1'), dim: esc('2'), italic: esc('3'),
  orange: esc('38;5;209'), green: esc('38;5;42'), blue: esc('38;5;75'), yellow: esc('38;5;221'), red: esc('38;5;203'), grey: esc('38;5;245'),
};
const paint = (agent, s) => (c[agent.color] || (x => x))(s);

const say = (s = '') => out.write(s + '\n');

function banner(left, right, opts) {
  say();
  say(`  ${c.bold('SPAR')} ${c.dim('· two AIs, one ball, no mercy')}`);
  say(`  ${paint(left, '▌ ' + left.name)}  ${c.dim('vs')}  ${paint(right, right.name + ' ▐')}   ${c.dim(opts.code ? 'code match' : 'match')}${opts.web ? c.dim(' · web on') : ''}`);
  say();
}

// Each side has its own little mark that animates while it works (original marks, not the companies'
// logos): orbiting quarter-circles for Claude, a breathing dot for ChatGPT.
const GLYPH = { claude: ['◜', '◝', '◞', '◟'], codex: ['·', '∙', '•', '●', '•', '∙'] };
// Text that shimmers like the apps' "Thinking…": a bright band sweeps across a dim line.
function shimmer(text, pos) {
  if (!COLOR) return text;
  return [...text].map((ch, i) => (Math.abs(i - pos) <= 2 ? `\x1b[1;97m${ch}\x1b[0m` : `\x1b[2m${ch}\x1b[0m`)).join('');
}
// A ball bouncing between two paddles while a side works, with what it's doing right now.
function rally(agent, fromLeft) {
  let doing = 'Thinking';
  if (!TTY) { say(c.dim(`  ${agent.name} is thinking…`)); return Object.assign(() => {}, { step: () => {}, text: () => {} }); }
  const W = 22; let x = 0, dir = 1, f = 0; const t0 = Date.now();
  const frames = GLYPH[agent.id] || GLYPH.codex;
  const frame = () => {
    f++; x += dir; if (x >= W - 1 || x <= 0) dir = -dir;
    const court = Array.from({ length: W }, (_, i) => (i === x ? '●' : (i === Math.floor(W / 2) ? '┊' : ' '))).join('');
    const secs = Math.round((Date.now() - t0) / 1000);
    const what = doing.length > 46 ? doing.slice(0, 45) + '…' : doing;
    const mark = paint(agent, frames[Math.floor(f / 2) % frames.length]);
    out.write(`\r  ${fromLeft ? paint(agent, '▌') : c.dim('▌')}${court}${fromLeft ? c.dim('▐') : paint(agent, '▐')}  ${mark} ${paint(agent, agent.name)}  ${shimmer(what + '…', (f % (what.length + 8)) - 4)} ${c.dim(`${secs}s`)}\x1b[K`);
  };
  frame();
  const timer = setInterval(frame, 90);
  const stop = () => { clearInterval(timer); out.write('\r\x1b[K'); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  stop.step = s => { doing = cap(s); };
  stop.text = live => { doing = `Writing · ${words(live)} words`; };
  return stop;
}

const LINES = {
  serve: ['{a} serves.', '{a} opens the rally.', '{a} steps up to the line.'],
  revise: ['{a} found {n} hole{s}. Point {a}.', '{a} returns with topspin: {n} fix{es}. Point {a}.', '{a} isn\'t having it. Point {a}.'],
  revisePlain: ['{a} sends it back with changes. Point {a}.', '{a} returns it, improved. Point {a}.'],
  pass: ['{a} can\'t find a hole. Point {b}.', '{a} nods. That one stands. Point {b}.', '{a} lets it through. Game.'],
};
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function line(kind, vars) {
  return pick(LINES[kind]).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function turnCard(agent, n, parsed, secs, steps = []) {
  say(`  ${paint(agent, '●')} ${c.bold(agent.name)} ${c.dim(`· turn ${n} · ${secs}s`)}`);
  if (steps.length) say(`    ${c.dim('↳ ' + [...new Set(steps)].slice(0, 4).join(', ') + (steps.length > 4 ? ` +${steps.length - 4} more` : ''))}`);
  const body = (parsed.notes || '').split('\n').filter(l => l.trim()).slice(0, 12);
  for (const l of body) say(`    ${c.grey(l.length > 110 ? l.slice(0, 107) + '…' : l)}`);
  if (parsed.answer) say(`    ${c.dim(`↳ new version · ${words(parsed.answer)} words`)}`);
}

function score(left, right, pts) {
  say(`  ${c.dim('score')}  ${paint(left, left.name)} ${c.bold(pts.left)} ${c.dim('·')} ${c.bold(pts.right)} ${paint(right, right.name)}`);
  say();
}

const words = s => (String(s).trim().match(/\S+/g) || []).length;

function ask(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: out });
    rl.question(q, a => { rl.close(); resolve(a); });
    rl.on('SIGINT', () => { rl.close(); resolve(null); });
  });
}

module.exports = { c, paint, say, banner, rally, line, turnCard, score, ask, TTY, words, GLYPH, shimmer };
