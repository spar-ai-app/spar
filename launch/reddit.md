# Reddit

Post as yourself, with a real story. Each subreddit gets its own angle. Read each sub's self-promotion rules first; some want a ratio of non-promotional activity.

## r/ClaudeAI

**Title:** I made Claude and ChatGPT review each other's answers until neither can find a problem (free, open source, uses your Claude plan)

I write a lot of grant and research-tax-credit applications, and I'd been pasting Claude's drafts into ChatGPT for a second opinion and back. They catch different things. The copy-paste was killing me, so I built spar.

It runs Claude Code (signed in with your own plan) against Codex. Claude serves, ChatGPT pushes back, and they go back and forth until one concedes. You can steer on any turn. The fun part: you watch them work ("Claude is searching the web for…") with a little pong rally in the terminal.

`npx spar-ai "your question"`

Repo: https://github.com/[ORG]/spar. I'd love to see your best match reports (`--save`).

## r/ChatGPT

**Title:** ChatGPT vs Claude, but they have to agree on one answer before they stop

(Same story, but lead with the match report screenshot where ChatGPT caught Claude's mistake.)

## r/ChatGPTCoding

**Title:** Claude Code and Codex taking turns on the same repo: one builds, one reviews and runs the tests

`spar --code "the date parser fails on leap years. fix it and add a test"`

- Every turn is a commit on a `spar/…` branch, so nothing touches your work until you merge.
- The reviewer gets the actual diff and runs the tests before it's allowed to say PASS.
- It uses your own Claude and ChatGPT plans through their official CLIs.

I know there are council-style plugins; the difference here is that neither model is the boss. They alternate as equals and you referee.
