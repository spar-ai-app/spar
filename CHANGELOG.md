# Changelog

## 0.1.1 (2026-11-03)

- `doctor` now checks that Claude Code and Codex are signed in, not just installed, and a match won't start if a side is signed out.
- If Codex can't reach OpenAI, you see "reconnecting" / "waiting for the network" instead of a frozen "thinking…", and after two minutes spar stops with a clear message.
- Claude vs Claude (or ChatGPT vs ChatGPT) matches name the sides apart.
- Hints show `npx spar-ai` when that's how you ran it.
- README: FAQ, launch video.

## 0.1.0 (2026-11-02)
- First release: Claude and ChatGPT rally on any question until one concedes.
- Live activity, like the apps: what each side is doing right now, a live word count while it writes, and an animated mark for each side.
- Each side keeps its own conversation (Claude Code and Codex sessions are resumed), and gets its chat-app brief outside code matches.
- When a side asks you a question, your answer goes back to that side.
- Any model on OpenRouter can play either side with your own key (`--right openrouter:google/gemini-2.5-pro`), with a cost estimate before and the actual cost after.
- `--code` matches in your git repo, one commit per turn.
- Pick models and effort per side; pipe in material; save match reports.
