'use strict';
// One match: a serve, then volleys back and forth until one side can't find anything to fix,
// you call it, or the turn limit is reached.
const fs = require('fs');
const path = require('path');
const { AGENTS } = require('./agents');
const { serve, volley, parse } = require('./prompts');
const { git } = require('./run');
const ui = require('./ui');
const { c } = ui;

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

async function prepareGit(cwd, allowDirty) {
  const top = await git(['rev-parse', '--show-toplevel'], cwd);
  if (top.code !== 0) throw new Error('Code matches need a git repository so every turn can be undone.\nRun `git init && git add -A && git commit -m start` first.');
  const dirty = await git(['status', '--porcelain'], cwd);
  if (dirty.out && !allowDirty) throw new Error('You have uncommitted changes. Commit or stash them first, so spar can keep each turn separate and undoable.\n(Or pass --allow-dirty to include them.)');
  const from = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).out;
  const base = (await git(['rev-parse', 'HEAD'], cwd)).out;
  const branch = `spar/${stamp()}`;
  const r = await git(['checkout', '-b', branch], cwd);
  if (r.code !== 0) throw new Error(`Couldn't create branch ${branch}: ${r.err}`);
  if (dirty.out) await commit(cwd, 'spar: your uncommitted changes');
  return { from, base, branch };
}

async function commit(cwd, msg) {
  await git(['add', '-A'], cwd);
  const staged = await git(['diff', '--cached', '--quiet'], cwd);
  if (staged.code === 0) return false;
  await git(['-c', 'user.name=spar', '-c', 'user.email=spar@localhost', 'commit', '-q', '-m', msg], cwd);
  return true;
}

async function lastDiff(cwd) {
  const d = (await git(['diff', 'HEAD~1', 'HEAD'], cwd)).out;
  return d.length > 20000 ? d.slice(0, 20000) + '\n… (diff truncated; read the files for the rest)' : d;
}

async function play(o) {
  const L = AGENTS[o.left], R = AGENTS[o.right];
  const sides = [L, R];
  const pts = { left: 0, right: 0 };
  const log = [];
  const t0 = Date.now();
  let answer = '', notes = '', turn = 0, steer = o.steer || '', over = false, winner = null, gitInfo = null;
  const maxTurns = o.turns || (o.interactive ? Infinity : 6);

  ui.banner(L, R, o);
  if (o.code) {
    gitInfo = await prepareGit(o.cwd, o.allowDirty);
    ui.say(c.dim(`  Working on branch ${gitInfo.branch}. Every turn is a commit you can undo.`)); ui.say();
  }

  while (turn < maxTurns) {
    const me = sides[turn % 2], other = sides[(turn + 1) % 2];
    const mySide = turn % 2 === 0 ? 'left' : 'right', otherSide = mySide === 'left' ? 'right' : 'left';
    const base = { task: o.task, me: me.name, other: other.name, user: o.user, materials: o.materials, steer, code: o.code };
    let prompt;
    if (turn === 0) prompt = serve(base);
    else prompt = volley({ ...base, answer, theirNotes: notes, diff: o.code ? await lastDiff(o.cwd) : '' });

    if (turn === 0) { ui.say(`  ${ui.line('serve', { a: me.name })}`); }
    const stop = ui.rally(me, mySide === 'left');
    const steps = [];
    const t = Date.now();
    let text;
    try {
      text = await me.play({ prompt, cwd: o.cwd, code: o.code, web: o.web, model: o.models[mySide], effort: o.efforts[mySide], keepKeys: o.keepKeys, onStep: st => { stop.step(st); steps.push(st); } });
    } catch (e) {
      stop();
      ui.say(c.red(`  ✗ ${e.message.split('\n').join('\n    ')}`));
      if (e.missing) ui.say(c.dim(`    Install it with: ${me.install}`));
      if (!o.interactive) break;
      const a = await ui.ask(c.dim('  r = retry · d = done › '));
      if (a && a.trim().toLowerCase() === 'r') continue;
      break;
    }
    stop();
    const secs = Math.round((Date.now() - t) / 1000);
    const p = parse(text);
    turn++;
    steer = '';

    let changed;
    if (o.code) changed = await commit(o.cwd, `spar: turn ${turn} (${me.name})`);
    else changed = turn === 1 ? true : !!p.answer && p.answer.trim() !== answer.trim();

    ui.turnCard(me, turn, p, secs, steps);
    log.push({ turn, side: mySide, agent: me.name, secs, text, verdict: p.verdict, changed });

    if (turn === 1) {
      answer = o.code ? '' : (p.answer || p.notes || text.trim());
      notes = o.code ? p.notes : (p.answer ? p.notes : '');
    } else if (p.verdict === 'PASS' && !changed) {
      pts[otherSide]++;
      ui.say(`  ${c.yellow(ui.line('pass', { a: me.name, b: other.name }))}`);
      winner = other; over = true;
    } else {
      pts[mySide]++;
      const n = (p.notes.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length;
      ui.say(`  ${c.blue(n ? ui.line('revise', { a: me.name, n, s: n === 1 ? '' : 's', es: n === 1 ? '' : 'es' }) : ui.line('revisePlain', { a: me.name }))}`);
      if (!o.code && p.answer) answer = p.answer;
      notes = p.notes + (p.reason ? `\nVerdict reason: ${p.reason}` : '');
    }
    ui.score(L, R, pts);

    if (!o.interactive) { if (over) break; continue; }
    const q = over
      ? c.dim('  Agreed. ↵ to finish · or type a note to keep going › ')
      : c.dim(`  ↵ send it to ${other.name} · type a note to steer · d = done › `);
    const a = await ui.ask(q);
    if (a === null) break;
    const s = a.trim();
    if (over) { if (!s) break; over = false; winner = null; steer = s; continue; }
    if (['d', 'done', 'q', 'quit', 'exit'].includes(s.toLowerCase())) break;
    steer = s;
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  return { answer, log, pts, winner, secs, turns: turn, gitInfo, L, R };
}

function report(o, res) {
  const { L, R, pts, winner, secs, turns, gitInfo } = res;
  const mins = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  ui.say(`  ${c.bold('MATCH REPORT')}`);
  ui.say(`  ${ui.paint(L, L.name)} ${c.bold(pts.left)} ${c.dim('·')} ${c.bold(pts.right)} ${ui.paint(R, R.name)}   ${c.dim(`${turns} turn${turns === 1 ? '' : 's'} · ${mins}`)}`);
  ui.say(`  ${winner ? `${ui.paint(winner, winner.name)}'s version stood.` : c.dim('You called it before anyone conceded.')}`);
  if (gitInfo) {
    ui.say();
    ui.say(`  ${c.bold('Changes are on branch')} ${gitInfo.branch}`);
    ui.say(c.dim(`    see them:   git diff ${gitInfo.base.slice(0, 8)} ${gitInfo.branch}`));
    ui.say(c.dim(`    keep them:  git checkout ${gitInfo.from} && git merge ${gitInfo.branch}`));
    ui.say(c.dim(`    undo all:   git checkout ${gitInfo.from} && git branch -D ${gitInfo.branch}`));
  }
  ui.say();
}

function save(o, res) {
  const dir = path.join(o.cwd, 'spar-matches');
  fs.mkdirSync(dir, { recursive: true });
  const slug = o.task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'match';
  const f = path.join(dir, `${stamp()}-${slug}.md`);
  const md = [`# ${o.task.split('\n')[0].slice(0, 100)}`, '',
    `${res.L.name} ${res.pts.left} · ${res.pts.right} ${res.R.name} · ${res.turns} turns`, '',
    ...(o.code ? [] : ['## Final answer', '', res.answer, '']),
    '## The rally', '',
    ...res.log.map(t => `### Turn ${t.turn}: ${t.agent}${t.verdict ? ` (${t.verdict})` : ''}\n\n${t.text}\n`),
    '---', 'Played with [spar](https://github.com/[ORG]/spar).'].join('\n');
  fs.writeFileSync(f, md);
  return f;
}

module.exports = { play, report, save };
