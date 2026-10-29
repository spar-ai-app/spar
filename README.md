<h1 align="center">spar</h1>
<p align="center"><b>two AIs. one ball. no mercy.</b></p>
<p align="center">Make Claude and ChatGPT argue until the answer is actually right,<br>using the plans you already pay for.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/spar-ai"><img alt="npm" src="https://img.shields.io/npm/v/spar-ai?color=5fd3a3&label=npm"></a>
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-7cb6f0"></a>
  <a href="https://github.com/[ORG]/spar/actions"><img alt="CI" src="https://github.com/[ORG]/spar/actions/workflows/ci.yml/badge.svg"></a>
</p>

<p align="center"><img src="assets/demo.svg" alt="Claude serves an answer, ChatGPT finds two problems, Claude can't find a hole: match report" width="860"></p>

```bash
npx spar-ai "should I lease or buy my next car?"
```

## Why

You ask Claude. You paste its answer into ChatGPT: "what's wrong with this?" You paste that back into Claude. Again. And again.

spar does the copy-paste for you. One serves, the other returns, back and forth, until one of them looks at the other's answer and can't find anything to fix. You can step in on any turn.

Works for anything you'd ask an AI: questions, decisions, plans, emails, essays, research, code.

## Install

You need [Node.js](https://nodejs.org) 18+ and at least one of these, signed in with your own plan:

- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) (Claude Pro, Max, Team): `npm i -g @anthropic-ai/claude-code`
- [Codex](https://github.com/openai/codex) (ChatGPT Plus, Pro, Team): `npm i -g @openai/codex`

```
npm i -g spar-ai
spar doctor
```

No API keys. No account with us. Your prompts go only to Anthropic and OpenAI, through their own official tools.

## Play

```bash
spar "what should I name my dog?"                  # you steer between turns
spar --auto "explain mortgages like I'm 12"        # no pauses, play to the end
cat draft.md | spar "make this cover letter land"  # pipe in material
spar -f contract.pdf.txt "anything risky in here?" # or hand them files
spar --swap "..."                                  # ChatGPT serves first
spar --left-model opus --right-effort high "..."   # pick models and effort
spar "..." > answer.md                             # only the final answer goes to stdout
spar --save "..."                                  # keep the whole rally as markdown
```

You see what each one is doing as it happens ("Claude is searching the web for…", "ChatGPT is running npm test"), the way their own apps show it.

While they play:

| key | does |
|---|---|
| `↵` | send it to the other side |
| any text | a note for the next turn (it beats everything else) |
| `d` | done: keep the current answer |

### Code matches

```bash
spar --code "the date parser fails on leap years. fix it and add a test"
```

They take turns in your repo: one edits, the other reads the diff, runs the tests and fixes what's wrong. Every turn is a commit on its own `spar/…` branch, so nothing touches your work until you merge it.

## How a match ends

- **Someone concedes.** A side says `VERDICT: PASS` and changes nothing: the other side's version stands.
- **You call it** with `d`.
- **Turn limit:** `--turns n` (default 6 with `--auto`).

## House rules

Both sides get the same short rules: be right, not agreeable. No flattery. If the other answer is good, say PASS instead of changing things to look busy. Mark anything uncertain `[CHECK]` and never invent sources. (Read them in [`lib/prompts.js`](lib/prompts.js).)

## Want more?

**spar for desktop** adds projects, your imported Claude and ChatGPT history (each side gets its own), attachments and images, Gemini and OpenRouter, saved matches, and a safe code mode with one-click undo. → spar.app

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). "spar" is a trademark; forks need their own name.

Not affiliated with Anthropic or OpenAI.
