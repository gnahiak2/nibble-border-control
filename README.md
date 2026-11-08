# nibble-border-control

a slack bot that guards a channel.

```
someone joins the welcome channel
  └─▶ bot posts a welcome message + [ Fill in entry form ] button
        └─▶ applicant opens the form: name, how they found you, why they want in,
            and a yes/no privacy clause
              ├─ "no"  ─▶ refused in the thread (they can press the button again)
              └─ "yes" ─▶ OWNER_SLACK_ID set?  ─▶ DMed to you with Approve / Deny
                          not set?             ─▶ auto-approved
                                 approved ─▶ invited to the approved channel
```

the clause text lives in `CLAUSE_TEXT` in `src/messages.ts`.

## setup

1. **create the app** at <https://api.slack.com/apps> → create new app → from a manifest →
   paste `slack-manifest.yml`.
2. **tokens**: basic information → app-level token with `connections:write` = `SLACK_APP_TOKEN`;
   install to workspace → bot token = `SLACK_BOT_TOKEN`.
3. **invite the bot** to both the welcome channel and the approved channel
   (`/invite @border control`).
4. **configure**: `cp .env.example .env` and fill it in (channel id = the `C…` at the end of a
   channel's link; your user id is under your profile → ⋮ → copy member id).
5. **run**:

```bash
bun install
bun start        # or: bun dev (restarts on change)
bun test
bun run typecheck
```

`.claude/` and `.remember/` are gitignored, so nothing personal gets committed.
