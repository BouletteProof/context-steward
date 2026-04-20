/**
 * @file types.ts
 * @description Core TypeScript type definitions for the context-steward library.
 *
 * Defines all public interfaces and type aliases used throughout the context steward,
 * including skill definitions, budget configuration, packing inputs/outputs, outcome
 * tracking, skill scoring, and top-level steward configuration.
 *
 * This file contains NO runtime code and has NO external dependencies.
 * All types are exported as named exports.
 *
 * @module context-steward/types
 */

// ---------------------------------------------------------------------------
// Skill format
// ---------------------------------------------------------------------------

/**
 * The native skill file format used by context-steward.
 *
 * `anthropic_v2` describes files with YAML frontmatter (delimited by `---`)
 * containing `name`, `description`, and `triggers[]` fields, followed by a
 * freeform Markdown body that constitutes the skill's instructional content.
 *
 * @example
 * ```yaml
 * ---
 * name: My Skill
 * description: Handles foo-related queries.
 * triggers:
 *   - foo
 *   - bar
 * ---
 * ## Instructions
 * Always do X before Y.
 * ```
 */
export type SkillFormat = 'anthropic_v2';

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

/**
 * A single checklist item embedded inside a skill's metadata.
 */
export interface ChecklistItem {
  /** Unique identifier for this checklist rule. */
  id: string;
  /** Human-readable rule text. */
  rule: string;
}

/**
 * Optional metadata attached to a {@link SkillDefinition}.
 */
export interface SkillMeta {
  /**
   * An ordered list of checklist rules that should be followed when this
   * skill is active.
   */
  checklist?: ChecklistItem[];

  /**
   * Free-form lessons or observations accumulated over time for this skill.
   * Typically appended programmatically as the steward learns from outcomes.
   */
  learned?: string[];
}

/**
 * Represents a fully parsed skill that can be injected into a context window.
 *
 * Skills are loaded from files conforming to the {@link SkillFormat} and stored
 * in memory as `SkillDefinition` objects before being packed into a request.
 */
export interface SkillDefinition {
  /**
   * URL-safe unique identifier for the skill, typically derived from the
   * filename (e.g., `"typescript-public-repo"`).
   */
  slug: string;

  /**
   * Human-readable display name for the skill (sourced from frontmatter
   * `name` field).
   */
  name: string;

  /**
   * Full Markdown body of the skill.  This is the authoritative content
   * that will be injected when the skill is selected and there is enough
   * token budget to do so.
   */
  content: string;

  /**
   * An abbreviated version of {@link content} used when the full content
   * does not fit within the available token budget.  If absent the steward
   * may truncate or drop the skill instead.
   */
  condensedContent?: string;

  /**
   * Keywords or phrases that signal this skill should be considered for
   * injection.  Matched against user intent, message content, or tool names
   * depending on the matching strategy in use.
   */
  triggers: string[];

  /**
   * Relative ordering weight.  Higher values cause the skill to be
   * preferred when the token budget is insufficient to include all matched
   * skills.  Defaults to `0` when not specified.
   */
  priority?: number;

  /**
   * Optional structured metadata accompanying the skill.
   */
  meta?: SkillMeta;

  /**
   * Absolute path to the SKILL.md file this definition was parsed from.
   * Populated by {@link loadSkillsFromDirectory}; absent for skills
   * constructed in-memory (e.g. during tests). Server code uses this to
   * write back learnings to the exact source file without having to
   * re-scan the skills directory on every update.
   */
  sourcePath?: string;
}

// ---------------------------------------------------------------------------
// Budget configuration
// ---------------------------------------------------------------------------

/**
 * Per-category token allocations expressed as fractions of
 * {@link BudgetConfig.maxTokens}.  All values must be in the range `[0, 1]`.
 *
 * Default allocations (when not specified):
 * - `system`   → 20 % (0.20)
 * - `messages` → 40 % (0.40)
 * - `skills`   → 25 % (0.25)
 * - `tools`    → 15 % (0.15)
 */
export interface BudgetAllocations {
  /**
   * Fraction of the total budget reserved for the system prompt.
   * @default 0.20
   */
  system?: number;

  /**
   * Fraction of the total budget reserved for the message history.
   * @default 0.40
   */
  messages?: number;

  /**
   * Fraction of the total budget reserved for injected skills.
   * @default 0.25
   */
  skills?: number;

  /**
   * Fraction of the total budget reserved for tool definitions.
   * @default 0.15
   */
  tools?: number;
}

/**
 * Configures the token budget enforced during context packing.
 *
 * The steward uses this configuration to decide which skills to drop,
 * which messages to truncate, and how much space to leave for each
 * category of content.
 */
export interface BudgetConfig {
  /**
   * Hard upper limit on the total number of tokens that may be included
   * in the packed context.  Must be a positive integer.
   */
  maxTokens: number;

  /**
   * Per-category allocation fractions.  Values must sum to ≤ 1.
   * Unspecified categories fall back to the defaults documented on
   * {@link BudgetAllocations}.
   */
  allocations?: BudgetAllocations;
}

// ---------------------------------------------------------------------------
// Pack input / result
// ---------------------------------------------------------------------------

/**
 * Describes a single message in a conversation thread.
 */
export interface MessageEntry {
  /** The speaker role, e.g. `"user"`, `"assistant"`, or `"system"`. */
  role: string;
  /** The textual content of the message. */
  content: string;
}

/**
 * Describes an external tool that the model may call.
 */
export interface ToolDefinition {
  /** Machine-readable tool identifier. */
  name: string;
  /** Short explanation of what the tool does. */
  description: string;
  /**
   * JSON Schema (or equivalent) describing the tool's input parameters.
   * Left untyped here because schema shapes vary widely across providers.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema?: Record<string, unknown>;
}

/**
 * The raw inputs provided to the context packer before any token-budget
 * enforcement is applied.
 */
export interface PackInput {
  /**
   * The system prompt text, if any.  May be condensed or omitted by the
   * packer if the budget is extremely tight.
   */
  system?: string;

  /**
   * Ordered list of conversation messages.  Older messages may be dropped
   * from the front when the budget is exceeded.
   */
  messages?: MessageEntry[];

  /**
   * Skills that have been matched and are candidates for injection.  The
   * packer may drop lower-priority skills to stay within the skill budget.
   */
  skills?: SkillDefinition[];

  /**
   * Tool definitions to expose to the model.  The packer may omit tools
   * when the tools budget is exhausted.
   */
  tools?: ToolDefinition[];
}

/**
 * Statistics summarising the changes made during a single packing operation.
 */
export interface PackStats {
  /** Estimated token count of the unpacked {@link PackInput}. */
  tokensBefore: number;
  /** Estimated token count of the packed {@link PackInput}. */
  tokensAfter: number;
  /** Number of skills present in the input before packing. */
  skillsLoaded: number;
  /** Number of skills removed during packing to satisfy the budget. */
  skillsDropped: number;
  /** Number of messages retained in the packed output. */
  messagesKept: number;
  /** Number of messages removed or shortened during packing. */
  messagesTruncated: number;
}

/**
 * The result returned by the context packer after applying token-budget
 * constraints to a {@link PackInput}.
 */
export interface PackResult {
  /** The budget-compliant context ready to be sent to the model. */
  packed: PackInput;
  /** A summary of what the packer changed to satisfy the budget. */
  stats: PackStats;
}

// ---------------------------------------------------------------------------
// Outcome signals (observable conversation events)
// ---------------------------------------------------------------------------

/**
 * Observable signals from conversation flow that indicate skill effectiveness.
 * These replace arbitrary 0-1 scores — Claude reports what happened, not what
 * it thinks the score should be.
 *
 * - `praised`        — User explicitly said output was good ("perfect", "great", "exactly right")
 * - `used_as_is`     — User accepted output and moved on without changes
 * - `revised`        — User asked for specific changes (one or more revision rounds)
 * - `rejected`       — User said no, start over, or explicitly dismissed the output
 * - `redone_by_user` — User did it themselves after seeing Claude's attempt
 * - `numeric`        — External system provided a numeric score (import_scores bridge)
 */
export type OutcomeSignal = 'praised' | 'used_as_is' | 'revised' | 'rejected' | 'redone_by_user' | 'numeric';

/**
 * Maps outcome signals to numeric scores for aggregation.
 * These are internal — users never see or pick these numbers.
 */
export const SIGNAL_SCORES: Record<OutcomeSignal, number> = {
  praised: 0.95,
  used_as_is: 0.7,
  revised: 0.4,
  rejected: 0.15,
  redone_by_user: 0.1,
  numeric: 0,  // placeholder — actual score comes from import
};

// ---------------------------------------------------------------------------
// Outcome tracking
// ---------------------------------------------------------------------------

/**
 * Records the outcome of a single model interaction for later analysis and
 * skill scoring.
 *
 * Outcome records are typically persisted to the {@link StewardConfig.dataDir}
 * and aggregated into {@link SkillScore} objects over time.
 */
export interface OutcomeRecord {
  /**
   * Optional unique identifier for this record (e.g. a UUID).  Generated
   * automatically if not provided.
   */
  id?: string;

  /**
   * Identifier of the context window in which this interaction took place.
   * Used to correlate multiple outcomes that share the same packed context.
   */
  contextId: string;

  /**
   * Slugs of all skills that were active (injected) during this interaction.
   */
  skillSlugs: string[];

  /** Name of the tool that was invoked, if any. */
  tool?: string;

  /** Free-text description of the user's intent for this interaction. */
  intent?: string;

  /**
   * Numeric quality score for this outcome, typically in the range `[0, 1]`.
   * When using signals, this is derived automatically from the signal type.
   * When using import_scores, this is provided directly by the external system.
   */
  score: number;

  /**
   * Observable conversation signal that produced this score.
   * Preferred over raw numeric scores because it's objective.
   * @see OutcomeSignal
   */
  signal?: OutcomeSignal;

  /** Optional human-readable notes or observations about this outcome. */
  notes?: string;

  /**
   * ISO 8601 timestamp indicating when the outcome was recorded.
   * Defaults to the current time if not provided.
   */
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Skill scoring
// ---------------------------------------------------------------------------

/**
 * Aggregated performance statistics for a single skill derived from its
 * historical {@link OutcomeRecord} entries.
 */
export interface SkillScore {
  /** Slug of the skill these statistics relate to. */
  slug: string;

  /**
   * Arithmetic mean of all recorded outcome scores for this skill.
   */
  meanScore: number;

  /** Total number of outcome records that reference this skill. */
  totalOutcomes: number;

  /**
   * Directional trend computed from recent outcomes.
   *
   * - `'improving'`  — recent scores are higher than the historical mean.
   * - `'stable'`     — recent scores are close to the historical mean.
   * - `'declining'`  — recent scores are lower than the historical mean.
   */
  recentTrend: 'improving' | 'stable' | 'declining';

  /**
   * Name of the tool with which this skill achieved its highest mean score,
   * if sufficient data exists to make that determination.
   */
  bestWithTool?: string;

  /**
   * Name of the tool with which this skill achieved its lowest mean score,
   * if sufficient data exists to make that determination.
   */
  worstWithTool?: string;
}

// ---------------------------------------------------------------------------
// Steward configuration
// ---------------------------------------------------------------------------

/**
 * Top-level configuration object for the context steward.
 *
 * These settings control where the steward finds skills, how it sizes its
 * default budget, and where it stores persistent data such as outcome records
 * and skill scores.
 */
export interface StewardConfig {
  /**
   * Absolute or relative path to the directory from which skill files are
   * loaded.  Defaults to `./skills` relative to the current working directory.
   */
  skillsDir?: string;

  /**
   * Default maximum token budget used when no explicit {@link BudgetConfig}
   * is supplied to a packing call.
   */
  defaultBudget?: number;

  /**
   * Identifier of the model the steward is targeting.  Used for
   * model-specific token counting heuristics where available.
   */
  model?: string;

  /**
   * When `true`, the steward emits detailed diagnostic logs to stdout during
   * packing and scoring operations.
   * @default false
   */
  verbose?: boolean;

  /**
   * Directory used to persist outcome records and cached skill scores.
   * @default "~/.context-steward/"
   */
  dataDir?: string;

  /**
   * Absolute paths (or paths relative to process.cwd()) that are allowed
   * to be read by tools accepting a user-supplied file path — currently
   * `estimate_tokens` and `add_skill` (when using the `path` argument).
   *
   * The server rejects any read that resolves outside this list, preventing
   * path-traversal reads of arbitrary files on the host (e.g. `/etc/passwd`,
   * `~/.ssh/id_rsa`). Symlinks within an allowed directory that point outside
   * it are also blocked.
   *
   * Defaults to `[process.cwd()]` when unset, which confines reads to the
   * directory where the steward was started. Add entries explicitly if you
   * need to estimate tokens on files outside that tree.
   */
  allowedReadDirs?: string[];

  /**
   * URL prefixes (exact string match against the start of the full URL) that
   * `add_skill` is allowed to fetch from. Defaults to public raw-content
   * hosts for Git forges:
   *
   * - `https://raw.githubusercontent.com/`
   * - `https://gist.githubusercontent.com/`
   * - `https://gitlab.com/` (raw paths)
   * - `https://bitbucket.org/` (raw paths)
   *
   * All requests over HTTP, file://, or to arbitrary origins are rejected.
   * This prevents server-side request forgery — fetching instance metadata,
   * intranet services, or localhost admin endpoints via a crafted URL.
   */
  allowedUrlPrefixes?: string[];
}