# Review Findings Format & Communication Patterns

Reference document for review workflow details. Loaded by Claude Marchetti and
reviewers when entering review phases.

## Review Findings File Format

Every reviewer writes findings to `.reviews/[agent-name]-findings.md`:

```markdown
# [Agent Name] Review Findings — [Feature Name]
## Date: [date]
## Status: REVIEWING | CHANGES_REQUESTED | APPROVED

### CRITICAL (Blocks merge)
- **[FILE:LINE]** [Description of issue]
  - **Impact**: [What goes wrong if not fixed]
  - **Fix**: [Specific recommended fix]
  - **Verified**: [ ] (reviewer checks this after fix confirmed)

### HIGH (Should fix before merge)
- **[FILE:LINE]** [Description]
  - **Impact**: [consequence]
  - **Fix**: [recommendation]
  - **Verified**: [ ]

### MEDIUM (Recommended improvement)
...

### LOW (Nice to have)
...

### CROSS-DOMAIN NOTES
[Issues that affect other reviewers' domains. These should also be
communicated via direct message during agent team review sessions.]
```

## Agent Team Cross-Domain Communication Patterns

During agent team review phases, reviewers message each other about cross-domain
issues. Key patterns to watch for:

**Security ↔ Science**: User-controlled input reaching computation engines, manipulable
normalization parameters, batch identifiers used in both display and pipeline computation.

**Architecture ↔ UX**: API shapes forcing awkward state management, error codes without
user-friendly mapping, pagination breaking infinite scroll.

**Science ↔ UX**: Results without uncertainty measures, scale choices misrepresenting
effect sizes, labels like "significant" without showing statistical test and p-value.

**Security ↔ Infra**: Docker configs exposing internal ports, Redis without auth,
database strings without secrets management, unauthenticated internal APIs.

**QA ↔ Everyone**: Tests passing but not testing what was flagged, coverage looking
good numerically but missing critical paths, E2E not covering primary workflow.

## Retrospective Template

After Henrik passes, Claude Marchetti writes to `docs/retro/[feature].md`:

```markdown
# Retrospective: [Feature Name]
## Date: [date]

## What Went Well
[Patterns that worked, reviews that caught important issues early]

## What Was Caught Late
[Issues Henrik found that reviewers should have caught earlier.
Which reviewer missed it? Which skill file needs updating?]

## Cross-Domain Issues Discovered
[New patterns from reviewer-to-reviewer messaging during agent teams.
Each becomes an entry in cross-domain-lessons.md]

## Skill File Updates Needed
[Specific skill files that need new entries based on this feature's lessons]

## Bug Patterns
[Any bugs found — root cause, what review step should catch this class of
bug in the future, which checklist needs updating]
```
