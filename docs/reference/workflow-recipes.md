# BioAvengers Workflow Recipes

Reference document for common workflow patterns. Claude Marchetti reads this
at the start of each feature session or when the Super PM requests a specific workflow.

## Full Feature Development

```
SESSION 1: RECONNAISSANCE
Super PM: "I want to add [feature description]"
Claude Marchetti: [reads codebase, skills, lessons, produces research brief]
Super PM: [reviews brief, approves or adjusts]

SESSION 2: INTERROGATION
Claude Marchetti: [interviews Super PM with AskUserQuestionTool]
Claude Marchetti: [spawns planning team if multi-domain: Marcus + James + Alexandra]
Claude Marchetti: [writes spec to docs/specs/[feature].md]
Super PM: [approves spec]

SESSION 3+: EXECUTION
Claude Marchetti: [decomposes spec into tasks with dependencies]
Claude Marchetti: [runs Phase 3a: scaffold → Marcus review → fix loop]
Claude Marchetti: [runs Phase 3b: core → multi-reviewer team → fix loop]
Claude Marchetti: [runs Phase 3c: integration + browser verify → fix loop]
Claude Marchetti: [runs Phase 3d: polish + browser a11y verify → fix loop]

FINAL SESSION: HARDENING
Claude Marchetti: [spawns Henrik subagent → PASS/FAIL]
Claude Marchetti: [writes retrospective, updates skills and lessons]
Claude Marchetti: [reports to Super PM with diff and retro summary]
Super PM: [reviews, merges or requests changes]
```

## Bug Fix

```
Super PM: "There's a bug where [description]"
Claude Marchetti: [quick recon — affected files, root cause hypothesis]
Claude Marchetti: [spawns builder subagent (Elena or Jennifer) to fix]
Claude Marchetti: [spawns Robert subagent to verify with tests]
Claude Marchetti: [spawns Henrik subagent for light gate]
Claude Marchetti: [brief retro entry if bug reveals a skill gap]
Claude Marchetti: [reports to Super PM]
```

## Architecture Decision

```
Super PM: "We need to decide between [Option A] and [Option B] for [topic]"
Claude Marchetti: [spawns decision agent team: Marcus + James + Dmitri + Alexandra]
Teammates: [debate via messaging, each writes evaluation]
Claude Marchetti: [synthesizes positions, writes to docs/decisions/[topic].md]
Super PM: [decides, recorded as ADR]
```

## New Project Onboarding

```
Super PM: "We're starting [new project]. Here's the tech stack and domain."
Claude Marchetti: [Phase 1 Recon — researches domain, identifies skill gaps]
Claude Marchetti: [drafts project skill files in .claude/skills/project/[name]/]
Claude Marchetti: [writes project root CLAUDE.md (inheriting BioAvengers framework)]
Claude Marchetti: [writes subdirectory CLAUDE.md files per layer]
Super PM: [reviews and approves skill files and CLAUDE.md]
Claude Marchetti: [ready to run features through the standard 4-phase workflow]
```
