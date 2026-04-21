# Changelog

## 0.3.2 — Honest data handling

**Fixed**

- **README "No telemetry" was ambiguous.** True of network transmission, silent about local recording. Rewrote the Telemetry section to describe exactly what's stored locally (outcome history in `~/.context-steward/outcomes.db`, learnings appended to `SKILL.md` files) and why (the learning loop).
- **`init` silently copied skills that weren't in the published tarball.** `package.json`'s `files` field only included `dist/`, so the bundled-skills copy step failed silently on every npm install. Removed the copy step from `init`; now it creates the empty `.skills/` directory and points at README documentation for the SKILL.md format.
- **Skill-loader silently skipped symlinks.** `readdirSync({ withFileTypes: true })` returns dirents based on `lstat`, so a symlinked skill directory was classified as a symlink rather than a directory and skipped during traversal. Users trying to share skills across projects via `ln -s ~/skills/auth .skills/auth` saw nothing loaded and no error. Loader now resolves symlinks through `stat`, with graceful handling of dangling links.
- **Install section in README was a one-liner.** Rewrote with step-by-step per-client guidance for Claude Code, Cursor, and Claude Desktop, plus a table covering the four realistic ways to wire up skills (author in place, central library via `skillsDir`, per-skill symlinks, copy-and-edit).

**Added**

- **`persistence: false` config flag** for users who want the skill-routing without any on-disk trace. When set, no SQLite file is created, `[STRENGTH]`/`[WEAKNESS]` entries are not appended to SKILL.md files, and nothing survives process restart. Startup log announces ephemeral mode. Default remains `true` for backward compatibility.

**Changed**

- `OutcomeStore` constructor takes a `persistent: boolean = true` parameter.
- `improveSkill()` in `server.ts` checks `config.persistence` before writing to skill files.
- Server stdio startup log now reports persistence mode.

**Backward compatibility**

No breaking changes. Existing installs get identical behaviour — `persistence` defaults to `true`, which matches previous behaviour.

## 0.3.1

- `context-steward` published unscoped to npm (scoped `@bouletteproof/` pending npm org release).
- `better-sqlite3` moved from `optionalDependencies` to `dependencies` — fixes silent in-memory fallback on systems where native build was skipped.
- `prepare` script added so `dist/` auto-builds on install and publish.

## 0.3.0

- Signal-based scoring (`praised`, `used_as_is`, `revised`, `rejected`, `redone_by_user`) replaces arbitrary 0–1 scores.
- Bidirectional skill learning: `praised` appends `[STRENGTH]` entries, `revised`/`rejected`/`redone_by_user` append `[WEAKNESS]` entries.
- `import_scores` tool for bridging external quality scorers.

## 0.2.0

- Initial MCP server with 7 tools: `load_skills`, `list_skills`, `add_skill`, `estimate_tokens`, `pack_context`, `report_outcome`, `get_skill_scores`.
- SQLite persistence with in-memory fallback.
- Anthropic v2 SKILL.md format.
