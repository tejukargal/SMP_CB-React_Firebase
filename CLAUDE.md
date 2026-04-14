# SMP Cash Book — Claude Instructions

## Commit / Push / Deploy

Whenever the user says any of the following (case-insensitive), **immediately invoke the `/commit-push` skill** without asking for clarification:

- "commit & push" / "commit and push"
- "commit changes" / "commit all changes" / "commit my changes"
- "push changes" / "push to github"
- "commit & deploy" / "commit and deploy" / "push and deploy"
- "deploy" (when there are uncommitted or unpushed changes)
- "ship it" / "save and push"

The skill handles staging, commit message generation, push, and optional Firebase deploy automatically.
