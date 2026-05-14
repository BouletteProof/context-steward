# context-steward

**Load skills dynamically. Learn what works. Works with any LLM.**

MCP server for Claude Desktop, Claude Code, and Cursor.

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

Prerequisites: Node.js ≥ 18, and one of Claude Code, Cursor, or Claude Desktop.

### Step 1 — Install the package

```
npm install -g context-steward
context-steward --help     # smoke test; should print the banner
```

### Step 2 — Create a workspace

```
mkdir my-agent-workspace && cd my-agent-workspace
context-steward init
```

`init` creates `.skills/` and `steward.config.json` in the current directory. It does not bundle any skills — you bring your own (see [Working with your own skills](#working-with-your-own-skills) below).

### Step 3 — Author or import at least one skill

Either write one by hand:

```
mkdir -p .skills/auth
cat > .skills/auth/SKILL.md <<'EOF'
---
name: auth
description: Authentication patterns
triggers: [auth, login, jwt, oauth]
---
# Auth
- Prefer JWT over session cookies for stateless APIs
- Hash passwords with argon2 or bcrypt
- Rotate tokens on privilege escalation
EOF
```

…or point the config at your existing skills library (see the next section).

### Step 4 — Register with your MCP client

Pick your client below. Each sets up `context-steward serve` as an MCP server rooted at `my-agent-workspace` so it finds your `.skills/` and config.

**Claude Code**

```
claude mcp add context-steward -- context-steward serve
claude
```

In the Claude Code session, verify:

> *"What context-steward tools do you have available?"*

Expect all 8 tools: `load_skills`, `list_skills`, `add_skill`, `estimate_tokens`, `pack_context`, `report_outcome`, `get_skill_scores`, `import_scores`.

**Cursor**

Edit `~/.cursor/mcp.json` (or `.cursor/mcp.json` in your project root):

```json
{
  "mcpServers": {
    "context-steward": {
      "command": "npx",
      "args": ["-y", "context-steward", "serve"],
      "cwd": "/absolute/path/to/my-agent-workspace"
    }
  }
}
```

`cwd` must be absolute and must point at the directory containing your `steward.config.json`. Restart Cursor. The MCP status indicator should show the server as connected.

**Claude Desktop**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS (similar paths on Windows and Linux — see Anthropic's docs):

```json
{
  "mcpServers": {
    "context-steward": {
      "command": "npx",
      "args": ["-y", "context-steward", "serve"],
      "cwd": "/absolute/path/to/my-agent-workspace"
    }
  }
}
```

Fully quit Claude Desktop (⌘Q, not just close the window) and reopen. The tool icon in the chat input should show MCP tools available.

### Step 5 — Verify end-to-end

In any client:

> *"Call load_skills with task 'refactor the auth module'. What came back?"*

Expect a response with `contextId`, the `auth` skill's content, and non-zero `tokensUsed`. If `matched: 0`, either your skills directory is empty or your triggers don't match the task — check `context-steward list` to see what the server can see.

## Working with your own skills

Most people arrive at context-steward with skills already in hand — Cursor rules, Claude Desktop skills, internal style guides, markdown cheat sheets. You don't have to rewrite them. Four ways to wire them up, ranked by scenario:

| Scenario | Approach | How |
|---|---|---|
| One project, skills live with it | **Author in place** | `mkdir -p .skills/<slug> && edit .skills/<slug>/SKILL.md` |
| Central skills library, same everywhere | **Point the config at it** | Set `"skillsDir": "/path/to/your/skills"` in `steward.config.json` |
| Central library, pick-and-choose per project | **Per-skill symlinks** | `ln -s ~/skills/auth .skills/auth` |
| Starting from someone else's skills | **Copy and edit** | `cp -r ~/their-skills/auth .skills/auth` |

Symlinks and the `skillsDir` config field are both fully supported as of v0.3.2. The loader resolves symlinks via `stat`, so per-skill symlinks and symlinked SKILL.md files are treated exactly like real ones. Dangling symlinks are skipped silently rather than crashing the listing.

Skills must follow the Anthropic v2 SKILL.md format — a YAML front-matter block with at minimum `name` and `description`, followed by markdown body. Triggers are auto-extracted from the description unless you declare them:

```
---
name: database-conventions
description: SQL naming conventions and query patterns for PostgreSQL.
triggers: [sql, postgres, migration, schema, database]
---

# Database Conventions

- Tables: plural snake_case
- Always parameterize inputs
- Add EXPLAIN ANALYZE for queries touching >10K rows
```

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

Native Claude skills are a good starting point if you're Claude-only and don't need feedback. context-steward adds the portable MCP surface, the lazy-load mechanism, and the learning loop.

## What this doesn't do

- It does not route tasks across LLMs. That's a separate concern — use your own router or orchestration layer.
- It does not manage long-conversation memory. That's a different primitive; the skill library is deliberately narrower.
- It does not score skills using an LLM. It receives observable signals (or imports external scores) and maps them deterministically. No self-judgement.
- It does not revise your skill files — it appends learning entries. The skill files remain yours to edit.

## Telemetry

None — the server phones no home. No outbound HTTP, no analytics, no third-party transmission.

It *does* keep a local record of what you asked and how it went, because that's what powers the learning loop. Specifically:

- Outcome rows live in `~/.context-steward/outcomes.db` (SQLite) — one row per `report_outcome` call, containing the context id, matched skill slugs, signal, derived score, your `intent`, and your `notes`.
- Learnings append to your `SKILL.md` files as dated `[STRENGTH]` / `[WEAKNESS]` entries under a `## Learned` section, including the notes you provided.

Both are yours. `context-steward reset-scores` clears the SQLite database. Skill files are just files in your workspace — edit or delete them like any other markdown.

If you don't want any local history — for example you're running this inside an agent handling sensitive client work — set `persistence: false` in `steward.config.json`:

```json
{
  "skillsDir": ".skills",
  "defaultBudget": 100000,
  "persistence": false
}
```

In ephemeral mode no SQLite file is created, no skill-file writes happen, and nothing survives process restart. You lose the learning loop in exchange; skill routing still works, but scores don't accumulate. The startup log reports ephemeral status so you can verify.

## CLI

```
context-steward init              # Create .skills/ and config
context-steward serve             # Start MCP server (stdio)
context-steward list              # Show skills with token counts
context-steward scores            # Skill effectiveness report
context-steward estimate <file>   # Token estimate
context-steward reset-scores      # Clear outcome data
```

Built and maintained by [Bouletteproof](https://bouletteproof.com).

## License

MIT — Copyright 2026 Bouletteproof Ltd.
