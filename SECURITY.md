# Security

## Threat model

`context-steward` runs locally as an MCP server over stdio. It is trusted by the LLM client that spawns it, but **the LLM itself is not trusted** — tool arguments reaching the server may be:

- attacker-controlled content that leaked into a model's context via retrieval, web browsing, or email, then echoed back as a tool call
- crafted by the user directly
- returned by another MCP server that the host orchestrates

The server therefore treats every tool argument as untrusted input.

## Trust boundaries

| Input | Trust | Why |
|---|---|---|
| `steward.config.json` | Trusted | Written by the machine owner. Controls allowlists. |
| `task` argument to `load_skills` | Untrusted text | Used only for keyword matching — no file/network access. |
| `file` argument to `estimate_tokens` | Untrusted path | Gated by `assertPathAllowed` against `allowedReadDirs`. |
| `path` argument to `add_skill` | Untrusted path | Same gate. |
| `url` argument to `add_skill` | Untrusted URL | Gated by `assertUrlAllowed` against `allowedUrlPrefixes`. HTTPS-only. |
| `notes` / `intent` on outcome calls | Untrusted text | Sanitized by `sanitizeLearning` before being written into skill files. |

## Defenses in place

### Path traversal (read side)

`estimate_tokens` and `add_skill` (path variant) accept a user-supplied path. Both call `assertPathAllowed`, which:

- rejects NUL bytes
- resolves the path lexically (`path.resolve`)
- canonicalizes via `fs.realpathSync` so a symlink inside an allowed directory that targets `/etc/passwd` is rejected, not followed
- requires the canonical path to equal or be a descendant (with a trailing separator) of one of `allowedReadDirs`
- defaults `allowedReadDirs` to `[process.cwd()]` — the steward only reads from the directory it was started in unless config widens it

### SSRF

`add_skill` URL variant passes through `assertUrlAllowed`, which:

- rejects anything that is not a valid `URL`
- requires `https:` — blocks `http:`, `file:`, `data:`, `ftp:`
- requires the full URL string to start with one of `allowedUrlPrefixes`
- defaults `allowedUrlPrefixes` to public raw-content hosts: `raw.githubusercontent.com`, `gist.githubusercontent.com`, `gitlab.com`, `bitbucket.org`
- does **not** allow private-range hosts, cloud-metadata endpoints (`169.254.169.254`), `localhost`, or intranet addresses under the default allowlist

### Persistent prompt injection

`improveSkill` appends `notes` and `intent` from outcome calls into the skill's `SKILL.md` file. Because that skill is then loaded into the model's context on every subsequent `load_skills` call, an attacker who can submit outcome notes can in principle poison the skill for all future users of that skill file — a *persistent* prompt injection.

`sanitizeLearning` defends against this by:

- stripping control characters (including all newlines — the attacker cannot add a new line, let alone a new Markdown heading or code fence)
- removing `` ` ``, `|`, `"`, `<`, `>` — the characters that let a payload break out of the surrounding Markdown list item or quoted `intent` wrapper
- collapsing all whitespace to single spaces
- capping `notes` at 500 characters and `intent` at 200 characters

After sanitization, a malicious payload can only add plain words to an existing `- [STRENGTH:YYYY-MM-DD] ...` bullet. It cannot create a new Markdown section, cannot embed code, cannot exceed a bounded length.

### Denial of service via `contextMap`

`load_skills` stores the loaded-skills list keyed by a random `contextId` so `report_outcome` can retrieve it later. Without bounds, an attacker who never reports outcomes would leak memory indefinitely. The map:

- enforces a 1-hour TTL per entry; `getContext` returns `undefined` for expired entries, and `pruneExpiredContexts` runs on every insert
- caps total size at 1000 entries; oldest entries are evicted when full

## Configuring allowlists

Widen the defaults by adding either or both of these fields to `steward.config.json`:

```json
{
  "skillsDir": ".skills",
  "defaultBudget": 100000,
  "allowedReadDirs": ["/home/me/projects", "/var/shared/code"],
  "allowedUrlPrefixes": ["https://raw.githubusercontent.com/my-org/"]
}
```

Providing an empty array is equivalent to omitting the key — defaults apply.

## What this project does not defend against

- A malicious `steward.config.json`. The machine owner controls it.
- A malicious skill file on disk. Skills are assumed to be written by the machine owner or installed by them via `add_skill`.
- Attacks against the MCP client that spawns the server.
- Network-level threats (DNS rebinding, MITM on HTTPS). Standard TLS trust applies.

## Reporting a vulnerability

Email security disclosures privately to the maintainer listed in `package.json`. Do not open a public issue for a security bug before we've had a chance to address it.
