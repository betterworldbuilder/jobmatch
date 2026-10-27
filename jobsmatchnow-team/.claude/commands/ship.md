---
description: Build a feature end to end — builder implements, reviewer checks, founder approves
---

Feature request: $ARGUMENTS

1. Hand the request to the `builder` agent.
2. Hand builder's summary and changed files to the `reviewer` agent.
3. If reviewer says BLOCK, send the issues back to builder once. If it still blocks, stop and report to the founder.
4. Report: what changed, reviewer verdict, and anything the founder must decide. Never deploy to production.
