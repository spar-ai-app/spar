# Show HN

**Title** (80 characters max):

Show HN: Spar – make Claude and ChatGPT argue until the answer is right

**URL:** https://github.com/[ORG]/spar

**First comment** (post it right after submitting):

I kept pasting Claude's answers into ChatGPT ("what's wrong with this?") and back again. They're much better at finding each other's mistakes than their own, but the copy-paste was exhausting.

spar does the back-and-forth in your terminal. One serves an answer, the other looks for holes and improves it, and it goes back and forth until one side looks at the other's version and can't find anything to fix. You can type a note on any turn to steer it.

A few things that might be interesting:

- It runs the official Claude Code and Codex CLIs with your own sign-in, so it uses the plans you already pay for. No API keys, no account with us, nothing sent anywhere else.
- Both sides get the same short "house rules": be right, not agreeable; say PASS instead of making busywork changes; mark uncertain facts [CHECK]; never invent sources. That's most of what makes them disagree usefully instead of politely agreeing. The rules are in lib/prompts.js.
- `--code` mode has them take turns in a git repo: one edits, the other reads the diff, runs the tests and fixes what's wrong. Every turn is a commit on its own branch.
- It's one dependency-free Node package, Apache 2.0.

What I'd love feedback on: when does a second model actually catch real problems for you, and when is it just noise?
