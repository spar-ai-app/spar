# Contributing

Thanks for helping. spar is small on purpose: one dependency-free Node package that runs the official Claude Code and Codex CLIs.

**Run it from source**
```
git clone https://github.com/spar-ai-app/spar && cd spar
npm test                 # uses stand-in CLIs, no accounts needed
node bin/spar.js doctor  # checks your real Claude Code / Codex
```

**Ground rules**
- No runtime dependencies. Node built-ins only.
- Never touch people's credentials. spar runs the CLIs people already signed in to; it never reads or stores tokens.
- The house rules in `lib/prompts.js` are the product. Changes there need a before/after example in the PR.
- Keep the terminal output calm: one line per event, color only where it means something.

**Good first issues:** new commentary lines in `lib/ui.js`, Windows quirks, more stand-in tests.

By contributing you agree your work is licensed under Apache 2.0.
