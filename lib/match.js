'use strict';
// One match: a serve, then volleys back and forth until one side can't find anything to fix,
// you call it, or the turn limit is reached.
const fs = require('fs');
const path = require('path');
const { AGENTS } = require('./agents');
const { serve, volley, parse, asksUser } = require('./prompts');
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
  let cur = 0;                              // whose turn: 0 = left, 1 = right
  const session = { left: null, right: null }; // each side keeps its own conversation, like its app
  let lastBy = null;                        // the side whose message is the latest thing on the table
  const maxTurns = o.turns || (o.interactive ? Infinity : 6);

  ui.banner(L, R, o);
  if (o.code) {
    gitInfo = await prepareGit(o.cwd, o.allowDirty);
    ui.say(c.dim(`  Working on branch ${gitInfo.branch}. Every turn is a commit you can undo.`)); ui.say();
  }

  while (turn < maxTurns) {
    const me = sides[cur], other = sides[1 - cur];
    const mySide = cur === 0 ? 'left' : 'right', otherSide = cur === 0 ? 'right' : 'left';
    const base = { task: o.task, me: me.name, other: other.name, user: o.user, materials: o.materials, steer, code: o.code };
    const answering = lastBy === mySide; // this side asked you something and you're replying
    const resumed = !!session[mySide];
    let prompt;
    if (answering && resumed) prompt = steer || 'Go ahead with your best judgment.';
    else if (turn === 0) prompt = serve(base);
    else prompt = volley({ ...base, answer, theirNotes: notes, diff: o.code ? await lastDiff(o.cwd) : '', resumed });

    if (!log.length) { ui.say(`  ${ui.line('serve', { a: me.name })}`); }
    const stop = ui.rally(me, mySide === 'left');
    const steps = [];
    const t = Date.now();
    let res;
    try {
      const call = (pr, resume) => me.play({ prompt: pr, cwd: o.cwd, code: o.code, web: o.web, model: o.models[mySide], effort: o.efforts[mySide], keepKeys: o.keepKeys,
        resume, onStep: st => { stop.step(st); steps.push(st); }, onText: live => stop.text(live) });
      try { res = await call(prompt, session[mySide]); }
      catch (e) {
        if (!e.lostSession) throw e;
        // The saved conversation is gone: start this side fresh with the full picture.
        session[mySide] = null;
        res = await call(turn === 0 ? serve(base) : volley({ ...base, answer, theirNotes: notes, diff: o.code ? await lastDiff(o.cwd) : '' }), null);
      }
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
    if (res.session) session[mySide] = res.session;
    const text = res.text;
    const secs = Math.round((Date.now() - t) / 1000);
    const p = parse(text);
    turn++;
    steer = '';

    let changed;
    if (o.code) changed = await commit(o.cwd, `spar: turn ${turn} (${me.name})`);
    else changed = turn === 1 ? true : !!p.answer && p.answer.trim() !== answer.trim();

    ui.turnCard(me, turn, p, secs, steps);
    log.push({ turn, side: mySide, agent: me.name, secs, text, verdict: p.verdict, changed });

    // A question for you: like the apps, your answer goes straight back to whoever asked.
    if (o.interactive && asksUser(p)) {
      ui.say(`  ${ui.paint(me, me.name)} ${c.dim('asked you something.')}`);
      const a = await ui.ask(c.dim(`  your answer for ${me.name} · d = done › `));
      if (a === null || ['d', 'done', 'q', 'quit', 'exit'].includes(a.trim().toLowerCase())) break;
      steer = a.trim(); lastBy = mySide;
      if (turn === 1) { answer = ''; notes = ''; turn = 0; }
      continue;
    }
    lastBy = null;

    if (turn === 1 || (answer === '' && !o.code)) {
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
    cur = 1 - cur;

    if (!o.interactive) { if (over) break; continue; }
    const q = over
      ? c.dim('  Agreed. ↵ to finish · or type a note to keep going › ')
      : c.dim(`  ↵ send it to ${other.name} · type a note to steer · d = done › `);
    const a = await ui.ask(q);
    if (a === null) break;
    const s2 = a.trim();
    if (over) { if (!s2) break; over = false; winner = null; steer = s2; continue; }
    if (['d', 'done', 'q', 'quit', 'exit'].includes(s2.toLowerCase())) break;
    steer = s2;
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
    '---', 'Played with [spar](https://github.com/spar-ai-app/spar).'].join('\n');
  fs.writeFileSync(f, md);
  return f;
}

module.exports = { play, report, save };
