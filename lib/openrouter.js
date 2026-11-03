'use strict';
// Any model on OpenRouter as a player, with your own key (OPENROUTER_API_KEY).
// You pay OpenRouter directly; spar never sees the bill. Each side keeps its own conversation in memory.
const BASE = () => (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const conversations = new Map(); // session id -> messages
let nextId = 1;

const SYSTEM = 'You are a helpful AI assistant chatting with the user. Answer naturally and use Markdown where it helps. If the request is ambiguous and the answer depends on details only the user knows, ask them first. The user is also asking another AI and will share its replies: judge them on their merits.';

function prettyName(model) {
  const tail = String(model).split('/').pop().replace(/:.*$/, '');
  return tail.split(/[-_]/).map(w => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
    .replace(/\bGpt\b/g, 'GPT').replace(/\bAi\b/g, 'AI').replace(/\bLlama\b/g, 'Llama');
}

let pricing = null;
async function prices() {
  if (pricing) return pricing;
  try {
    const r = await fetch(`${BASE()}/models`);
    const j = await r.json();
    pricing = Object.fromEntries((j.data || []).map(m => [m.id, { in: Number(m.pricing && m.pricing.prompt) || 0, out: Number(m.pricing && m.pricing.completion) || 0 }]));
  } catch { pricing = {}; }
  return pricing;
}
// Rough cost of one turn: ~4k tokens in (task, the other side's answer, history), ~1.5k out.
async function estimateTurn(model) {
  const p = (await prices())[model];
  return p ? p.in * 4000 + p.out * 1500 : null;
}
async function knownModel(model) { const p = await prices(); return !Object.keys(p).length || model in p; }

function makePlayer(model) {
  return {
    id: 'openrouter', model, name: prettyName(model), color: 'purple', api: true, spent: 0,
    install: 'get a key at https://openrouter.ai/settings/keys, then set OPENROUTER_API_KEY', login: 'OPENROUTER_API_KEY',
    async play({ prompt, web, onStep, onText, resume }) {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw Object.assign(new Error('No OpenRouter key. Get one at https://openrouter.ai/settings/keys and set OPENROUTER_API_KEY.'), { noKey: true });
      const session = resume && conversations.has(resume) ? resume : `or-${nextId++}`;
      const messages = conversations.get(session) || [{ role: 'system', content: SYSTEM }];
      messages.push({ role: 'user', content: prompt });
      const body = { model, messages, stream: true, usage: { include: true } };
      if (web) body.plugins = [{ id: 'web', max_results: 3 }];
      if (onStep) onStep(web ? 'searching the web' : 'thinking');
      const r = await fetch(`${BASE()}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'HTTP-Referer': 'https://github.com/spar-ai-app/spar', 'X-Title': 'spar' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = (j.error && j.error.message) || r.statusText;
        messages.pop();
        if (r.status === 401) throw new Error(`OpenRouter didn't accept your key (OPENROUTER_API_KEY). ${msg}`);
        if (r.status === 402) throw new Error(`Your OpenRouter account is out of credits. Top up at https://openrouter.ai/settings/credits. ${msg}`);
        throw new Error(`OpenRouter (${model}) stopped with an error ${r.status}: ${msg}`);
      }
      let text = '', buf = '', cost = 0;
      const dec = new TextDecoder();
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let e; try { e = JSON.parse(data); } catch { continue; }
          const d = e.choices && e.choices[0] && e.choices[0].delta;
          if (d && d.content) { text += d.content; if (onText) onText(text); }
          if (e.usage && e.usage.cost != null) cost = Number(e.usage.cost) || 0;
        }
      }
      if (!text.trim()) { messages.pop(); throw new Error(`OpenRouter (${model}) sent back an empty reply.`); }
      messages.push({ role: 'assistant', content: text });
      conversations.set(session, messages);
      this.spent += cost;
      return { text: text.trim(), session, cost };
    },
  };
}

module.exports = { makePlayer, estimateTurn, knownModel, prettyName };
