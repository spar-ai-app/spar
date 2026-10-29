'use strict';
// What each player is told. Short, blunt rules: that's what makes two models disagree usefully
// instead of politely agreeing.

const RULES = `House rules:
- Be right, not agreeable. If something is wrong, say so plainly and fix it.
- If the other side's answer is already good, say PASS. Don't change things just to look busy.
- No flattery, no filler, no repeating the question back.
- Facts you are not sure of get marked [CHECK]. Never invent sources, numbers or quotes.
- Keep the answer the length the task actually needs.`;

const CODE_RULES = `House rules for code:
- Evidence beats opinion: read the code, run the tests, then decide.
- Smallest change that fully solves the task. No drive-by refactors.
- If tests exist, run them. If you can't run them, say so.
- If the other side's change is correct and complete, change nothing and say PASS.`;

const VERDICT = `End with exactly one line:
VERDICT: PASS   (their version stands as is)
or
VERDICT: REVISE: <one-line reason>`;

function material(m) {
  if (!m || !m.length) return '';
  return '\n\nMaterial from the user:\n' + m.map(x => `--- ${x.name} ---\n${x.text}`).join('\n\n');
}

function note(steer, user) {
  return steer ? `\n\nNote from ${user} for this turn (highest priority):\n${steer}` : '';
}

function serve({ task, me, other, user, materials, steer, code }) {
  if (code) {
    return `You are ${me}, sparring with ${other} on a coding task for ${user}. You go first; ${other} will review your work and push back.

${CODE_RULES}

Task (in the codebase in the current folder):
${task}${material(materials)}${note(steer, user)}

Make the changes in the files now. Then reply with at most 8 short bullets: what you changed, and how you checked it.`;
  }
  return `You are ${me}, sparring with ${other} to give ${user} the best possible answer. You serve first; ${other} will look for every weakness.

${RULES}

Task:
${task}${material(materials)}${note(steer, user)}

Put your complete answer inside <answer></answer>. Before it you may add up to 3 lines on your approach.`;
}

function volley({ task, me, other, user, materials, steer, code, answer, theirNotes, diff }) {
  if (code) {
    return `You are ${me}, sparring with ${other} on a coding task for ${user}. ${other} just worked on it. Your turn to check their work and push back.

${CODE_RULES}

Task:
${task}${material(materials)}${note(steer, user)}

What ${other} said about their change:
${theirNotes || '(nothing)'}

The change they made (git diff):
${diff || '(no file changes)'}

Review it in the actual files: read the code, run the tests. If something is wrong or missing, fix it directly in the files. Then reply with at most 8 short bullets on what you found and changed.

${VERDICT}`;
  }
  return `You are ${me}, sparring with ${other} to give ${user} the best possible answer. ${other} just returned the ball. Find what's wrong with it.

${RULES}

Task:
${task}${material(materials)}${note(steer, user)}

${other}'s current answer:
<their_answer>
${answer}
</their_answer>
${theirNotes ? `\n${other}'s comments:\n${theirNotes}\n` : ''}
Reply in this order:
1. The most important problems, at most 5 short bullets (or one line saying it holds up).
2. If anything should change, your complete improved answer inside <answer></answer>. If it's fine as is, leave the answer out.

${VERDICT}`;
}

function parse(text) {
  const t = String(text || '');
  const m = t.match(/<answer>([\s\S]*?)<\/answer>/i);
  const answer = m ? m[1].trim() : null;
  let verdict = null, reason = '';
  const re = /^\s*\**\s*VERDICT\s*\**\s*:\s*\**\s*(PASS|REVISE)\s*\**\s*(?:[:—–-]+\s*(.*))?$/gim;
  let v; while ((v = re.exec(t))) { verdict = v[1].toUpperCase(); reason = (v[2] || '').trim(); }
  const notes = t.replace(/<answer>[\s\S]*?<\/answer>/i, '').replace(/^\s*\**\s*VERDICT.*$/gim, '').trim();
  return { answer, verdict, reason, notes };
}

module.exports = { serve, volley, parse };
