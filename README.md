# context-steward (Denethor)

**Load skills dynamically. Learn what works. Works with any LLM.**

---

## The problem

You have 10 skill files. Your agent loads all of them into the system prompt. That's 15,000 tokens burned before the task starts — whether the agent reads them or not.

On a 32K model, that's 47% of your context gone. And you have no idea which skills actually help.

## How it works

### 1. Lazy loading

Skills are MCP tools. Zero skill content in the initial prompt.

When your agent hits a task, it calls:

```
load_skills({ task: "refactor the auth module" })
```

Context-steward finds the relevant skill, returns it with a `contextId`, and content enters context only when needed — right before generation.

### 2. Feedback loop

After the task, report what happened — not a score:

```
report_outcome({
  contextId: "abc123",
  signal: "praised",
  notes: "Clean decomposition, all types correct, user said 'perfect'"
})
```

**Signals** are observable conversation events:

| Signal | When to use | Derived score |
|--------|-------------|---------------|
| `praised` | User explicitly said good/great/perfect | 0.95 |
| `used_as_is` | User accepted and moved to next topic | 0.70 |
| `revised` | User asked for specific changes | 0.40 |
| `rejected` | User said no, start over, dismissed output | 0.15 |
| `redone_by_user` | User did it themselves after seeing attempt | 0.10 |

Why signals instead of scores? Because Claude scoring its own work is unreliable. A model will always be generous with itself. Signals are binary observations: did the user accept it or not? Did they ask for changes or not? No subjectivity.

Over time, skills accumulate signal history:

```
$ context-steward scores

  slug              mean   trend  outcomes
  ─────────────────────────────────────────
  typescript        0.84   ↑      34
  frontend-design   0.71   →      22
  coding            0.42   ↘      41  ← mostly revised
  database          0.18   ↓      18  ← mostly rejected
```

### 3. Works with any MCP server

Context-steward sits alongside your existing tools:

```json
{
  "mcpServers": {
    "context-steward": {
      "command": "npx",
      "args": ["@bouletteproof/context-steward", "serve"]
    },
    "postgres": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    },
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"]
    }
  }
}
```

Your agent loads the right skill *before* calling the right tool. Context-steward doesn't know or care what your other servers do.

## Install

```bash
npx @bouletteproof/context-steward init
```

Creates `.skills/` and `steward.config.json`. Drop your `SKILL.md` files into subdirectories. Done.

## MCP Tools

**Core**

| Tool | Description |
|------|-------------|
| `load_skills` | Match and return skills for a task. Returns `contextId` for feedback. |
| `list_skills` | Show all skills with token counts and effectiveness scores. |
| `add_skill` | Install a skill from URL or local path. |
| `estimate_tokens` | Count tokens in text or a file. |
| `pack_context` | Fit system + messages + skills into a token budget. Batch/programmatic use. |

**Feedback**

| Tool | Description |
|------|-------------|
| `report_outcome` | Report what happened: `praised`, `used_as_is`, `revised`, `rejected`, `redone_by_user`. Drives skill improvement. |
| `get_skill_scores` | View aggregated scores, trends, and tool pairings per skill. |
| `import_scores` | Bridge external telemetry (CI, agent platforms) into skill improvement. |

## Writing skills

Skills use the Anthropic v2 format — same as Claude's native skills:

```markdown
---
name: database-conventions
description: SQL naming conventions and query patterns for PostgreSQL.
---

# Database Conventions

- Tables: plural snake_case
- Always parameterize inputs
- Add EXPLAIN ANALYZE for queries touching >10K rows
```

Triggers are auto-extracted from the description. Or declare them:

```yaml
triggers: [sql, postgres, migration, schema, database]
```

## Token budgets

| Model | Context | 10 skills eager | 1 skill lazy | Verdict |
|-------|---------|----------------|--------------|---------|
| Claude Sonnet 4 | 200K | ~15K (8%) | ~1.5K | Saves cost |
| Gemini Flash | 1M | ~15K (<2%) | ~1.5K | Saves cost |
| Codestral | 32K | ~15K (47%) | ~1.5K | **Lazy essential** |
| Ollama local | 4–32K | Often impossible | ~1.5K | **Only viable approach** |

## Why not stuff skills in the system prompt?

Across 3,000+ quality-scored agent executions on our multi-agent platform ([BPOS](https://bouletteproof.com)), we measured the impact of pre-loading skill checklists into system prompts. Each execution was scored by COCA (Context, Objective, Constraints, Actions) — a structured prompt and evaluation framework that scores agent output against the objective and constraints it was given.

Result: **zero measurable improvement** (mean COCA 0.608 → 0.610). The models ignored upfront instructions buried in large system prompts.

But dynamic loading — serving the right skill at the right moment, near the point of generation — saves cost and keeps context clean. On a 32K model: 5 pre-loaded skills (8K tokens) vs 1 dynamic skill (1.5K) = working prompt vs truncation.

## Self-improving skills

Skills learn from both success and failure through observable signals.

When `report_outcome` receives `praised` with notes about what worked, context-steward appends a `[STRENGTH]` entry to the skill's `## Learned` section. When it receives `revised`, `rejected`, or `redone_by_user` with notes about what went wrong, it appends a `[WEAKNESS]` entry. `used_as_is` is recorded in the outcome store but doesn't modify the skill file — neutral outcomes are noise.

Next time that skill is served, it includes its own history of what works and what doesn't.

```markdown
## Learned
- [STRENGTH:2026-04-10] Score 0.95 on "api refactor": Clean decomposition into small focused edits with explicit file paths
- [WEAKNESS:2026-04-10] Score 0.40 on "large file edit": Generated monolithic 300-line component without type hints
```

No human edits a report. No human revises a skill. The conversation itself is the data.

## External telemetry bridge

Context-steward can import scores from external systems (CI pipelines, agent platforms, quality scoring tools) via `import_scores`:

```
import_scores({
  source: "ci-pipeline",
  scores: [
    { slug: "typescript", score: 0.92, notes: "All tests passed, clean decomposition" },
    { slug: "database", score: 0.35, notes: "Query missing index, caused timeout" }
  ]
})
```

This bridges the gap between server-side telemetry and local skill files. The same `[STRENGTH]`/`[WEAKNESS]` entries are appended to the skill files.

## Telemetry

None. Zero tracking. Fully open source.

## CLI

```bash
context-steward init              # Create .skills/ and config
context-steward serve             # Start MCP server (stdio)
context-steward list              # Show skills with token counts
context-steward scores            # Skill effectiveness report
context-steward estimate <file>   # Token estimate
context-steward reset-scores      # Clear outcome data
```

Built by [Bouletteproof](https://bouletteproof.com).

## License

MIT — Copyright 2026 Bouletteproof Ltd.
