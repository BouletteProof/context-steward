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

After the task, report what happened:

```
report_outcome({ contextId: "abc123", score: 0.85, tool: "postgres:query" })
```

Over time, high-scoring skills get prioritized, low-scoring skills get demoted:

```
$ context-steward scores

  slug              mean   trend  outcomes
  ─────────────────────────────────────────
  typescript        0.84   ↑      34
  frontend-design   0.71   →      22
  coding            0.62   ↘      41
  database          0.38   ↓      18    ← needs revision
```

Continuous skill improvement driven by data, not opinions.

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
| `report_outcome` | Record quality score (0–1) for a skill delivery. |
| `get_skill_scores` | View aggregated scores, trends, and tool pairings per skill. |

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

When `report_outcome` receives a low score (< 0.5) with notes about what went wrong, context-steward appends the learning directly to the SKILL.md file under a `## Learned` section. Next time that skill is served, it includes its own failure history. Skills improve themselves through use — no human edits a report, no human revises a skill.

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
