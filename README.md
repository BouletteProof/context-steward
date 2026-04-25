# context-steward

**Load skills dynamically. Learn what works. Works with any LLM.**

MCP server for Claude Desktop, Claude Code, and Cursor.

> Read the companion write-up: [context-steward — lazy skill loading for agent systems](https://bouletteproof.com/writing/context-steward/) — why the problem matters, what the loading policy does, and where this came from.

---

## The problem

You have 10 skill files. Your agent loads all of them into the system prompt. That's 15,000 tokens burned before the task starts — whether the agent reads them or not.

On a 32K model, that's 47% of your context gone. And you have no idea which skills actually help.

## How it works

### Lazy loading

Skills are MCP tools. Zero skill content in the initial prompt.

When your agent hits a task, it calls:

```
load_skills({ task: "refactor the auth module" })
```

context-steward finds the relevant skill, returns it with a `contextId`, and content enters context only when needed — right before generation. The `contextId` is a handle: pass it back later to link outcome feedback to the specific skill that was used.

### Feedback loop

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
| --- | --- | --- |
| `praised` | User explicitly said good/great/perfect | 0.95 |
| `used_as_is` | User accepted and moved to the next topic | 0.70 |
| `revised` | User asked for specific changes | 0.40 |
| `rejected` | User said no, start over, dismissed output | 0.15 |
| `redone_by_user` | User did it themselves after seeing the attempt | 0.10 |

Why signals instead of scores? Because a model scoring its own work is unreliable — it will always be generous with itself. Signals are binary observations: did the user accept it or not? Did they ask for changes or not? No subjectivity in the observation.

The "derived score" column is a deterministic mapping used only for aggregation and ranking. It's not a judgment; it's a sort key.

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

## Install

```
npx context-steward init
```

Creates `.skills/` and `steward.config.json`. Drop your `SKILL.md` files into subdirectories.

context-steward sits alongside your existing MCP servers:

```
{
  "mcpServers": {
    "context-steward": {
      "command": "npx",
      "args": ["context-steward", "serve"]
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

Your agent loads the right skill *before* calling the right tool. context-steward doesn't know or care what your other servers do.

## MCP tools

**Core**

| Tool | Description |
| --- | --- |
| `load_skills` | Match and return skills for a task. Returns `contextId` for feedback. |
| `list_skills` | Show all skills with token counts and effectiveness scores. |
| `add_skill` | Install a skill from URL or local path. |
| `estimate_tokens` | Count tokens in text or a file. |
| `pack_context` | Fit system + messages + skills into a token budget. Batch/programmatic use. |

**Feedback**

| Tool | Description |
| --- | --- |
| `report_outcome` | Report what happened: `praised`, `used_as_is`, `revised`, `rejected`, `redone_by_user`. Drives skill improvement. |
| `get_skill_scores` | View aggregated scores, trends, and tool pairings per skill. |
| `import_scores` | Import external quality scores (CI, agent platforms) into skill improvement. Inbound only. |

## Writing skills

Skills use the Anthropic v2 format — same as Claude's native skills:

```
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

```
triggers: [sql, postgres, migration, schema, database]
```

## Token budgets

| Model | Context | 10 skills eager | 1 skill lazy | Verdict |
| --- | --- | --- | --- | --- |
| Claude Sonnet 4 | 200K | ~15K (8%) | ~1.5K | Saves cost |
| Gemini Flash | 1M | ~15K (<2%) | ~1.5K | Saves cost |
| Codestral | 32K | ~15K (47%) | ~1.5K | **Lazy essential** |
| Ollama local | 4–32K | Often impossible | ~1.5K | **Only viable approach** |

## Why not stuff skills in the system prompt?

We ran an 88-execution experiment comparing agent output quality with and without skill checklists pre-loaded into the system prompt. Each execution was scored by a structured quality grader against the objective and constraints the agent was given.

Result: **mean score 0.608 → 0.610**. No measurable improvement. The models ignored upfront instructions buried in large system prompts.

Dynamic loading — serving the right skill at the right moment, near the point of generation — saves cost and keeps context clean. On a 32K model: 5 pre-loaded skills (8K tokens) vs 1 dynamic skill (1.5K) = working prompt vs truncation.

## Self-improving skills

Skills learn from both success and failure through observable signals.

When `report_outcome` receives `praised` with notes about what worked, context-steward appends a `[STRENGTH]` entry to the skill's `## Learned` section. When it receives `revised`, `rejected`, or `redone_by_user` with notes about what went wrong, it appends a `[WEAKNESS]` entry. `used_as_is` is recorded in the outcome store but doesn't modify the skill file — neutral outcomes are noise.

Next time that skill is served, it includes its own history of what works and what doesn't.

```
## Learned
- [STRENGTH:2026-04-10] Score 0.95 on "api refactor": Clean decomposition into small focused edits with explicit file paths
- [WEAKNESS:2026-04-10] Score 0.40 on "large file edit": Generated monolithic 300-line component without type hints
```

Entries are suggestions, not overrides. You can edit, delete, or ignore them by hand — the skill file is yours. The conversation itself is the data; the automation is there to make the data useful.

## External score import

context-steward can import scores from external systems (CI pipelines, agent platforms, quality scoring tools) via `import_scores`. No data leaves the system — this is inbound only.

```
import_scores({
  source: "ci-pipeline",
  scores: [
    { slug: "typescript", score: 0.92, notes: "All tests passed, clean decomposition" },
    { slug: "database", score: 0.35, notes: "Query missing index, caused timeout" }
  ]
})
```

The same `[STRENGTH]`/`[WEAKNESS]` entries are appended to the skill files. Useful when you have a scoring system that runs outside the conversation — CI, automated reviews, production metrics.

## How this compares

| | context-steward | Native Claude skills | Cursor rules | Static system prompts |
| --- | --- | --- | --- | --- |
| Skill format | Anthropic v2 SKILL.md | Anthropic v2 SKILL.md | `.cursorrules` (custom) | Free-form |
| Loading | Lazy, on-demand | Eager (all at once) | Eager | Eager |
| Learning from outcomes | Yes, via signals | No | No | No |
| External score import | Yes | No | No | No |
| Works across LLMs | Yes (MCP) | Claude only | Cursor only | Yes |
| Telemetry | None | — | — | — |

Native Claude skills are a good starting point if you're Claude-only and don't need feedback. context-steward adds the portable MCP surface, the lazy-load mechanism, and the learning loop.

## What this doesn't do

- It does not route tasks across LLMs. That's a separate concern — use your own router or orchestration layer.
- It does not manage long-conversation memory. That's a different primitive; the skill library is deliberately narrower.
- It does not score skills using an LLM. It receives observable signals (or imports external scores) and maps them deterministically. No self-judgement.
- It does not revise your skill files — it appends learning entries. The skill files remain yours to edit.

## Telemetry

None. Zero tracking. Fully open source.

## CLI

```
context-steward init              # Create .skills/ and config
context-steward serve             # Start MCP server (stdio)
context-steward list              # Show skills with token counts
context-steward scores            # Skill effectiveness report
context-steward estimate <file>   # Token estimate
context-steward reset-scores      # Clear outcome data
```

Built and maintained by [Bouletteproof](https://bouletteproof.com/).

## Further reading

- [Why context-steward exists](https://bouletteproof.com/writing/context-steward/) — companion article.
- [Bouletteproof — writing index](https://bouletteproof.com/writing/) — practitioner notes from production, including the forthcoming essay on why per-job quality scores in multi-agent systems cluster around 85% ("The 85% Accuracy Trap") and what that number actually tells you.

## License

MIT — Copyright 2026 Bouletteproof Ltd.
