/**
 * @file skill-loader.ts
 * @description Filesystem-based skill loader for context-steward.
 * Scans directories for SKILL.md files in Anthropic v2 format and manages skill lifecycle.
 *
 * Anthropic v2 format uses YAML frontmatter between --- delimiters containing
 * at minimum `name` and `description` fields. Optional fields include `triggers[]`
 * and `priority`. The document body after the closing --- delimiter is the skill content.
 *
 * This module provides:
 * - `loadSkillsFromDirectory` — recursively scans for SKILL.md files
 * - `addSkillFromUrl`         — fetches a SKILL.md from a remote URL
 * - `addSkillFromPath`        — copies a local SKILL.md into the managed directory
 *
 * Only Node.js built-in modules (fs, path, http, https) are used; no external dependencies.
 *
 * @module context-steward/core/skill-loader
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchUrl } from "./utils/fetch-url.js";
import { SkillDefinition } from '../types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Raw metadata extracted from a SKILL.md YAML frontmatter block.
 * All values are loosely typed before validation and coercion.
 */
interface RawFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  priority?: number;
  [key: string]: unknown;
}

/**
 * Parses a minimal YAML frontmatter block without external dependencies.
 * Supports:
 * - Simple `key: value` pairs (strings and numbers)
 * - Block-style lists (lines starting with `- `)
 * - Inline lists (`key: [a, b, c]`)
 * - Quoted string values (single or double quotes)
 *
 * Lines starting with `#` and blank lines are ignored.
 * Unknown or malformed lines are silently skipped for graceful degradation.
 *
 * @param yaml - The raw YAML string extracted from between the `---` delimiters.
 * @returns A record of parsed metadata fields.
 */
function parseYamlFrontmatter(yaml: string): RawFrontmatter {
  const lines = yaml.split('\n');
  const result: RawFrontmatter = {};
  let currentKey: string | null = null;
  let currentIsArray = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Handle list items belonging to the most recent key
    if (trimmed.startsWith('- ') && currentKey !== null && currentIsArray) {
      const itemValue = trimmed.substring(2).trim().replace(/^["']|["']$/g, '');
      const existing = result[currentKey];
      if (Array.isArray(existing)) {
        existing.push(itemValue);
      } else {
        result[currentKey] = [itemValue];
      }
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      // Not a key-value pair — skip
      currentKey = null;
      currentIsArray = false;
      continue;
    }

    const key = trimmed.substring(0, colonIndex).trim();
    const rawValue = trimmed.substring(colonIndex + 1).trim();

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      // Inline list: triggers: [foo, bar]
      const items = rawValue
        .slice(1, -1)
        .split(',')
        .map((s: string) => s.trim().replace(/^["']|["']$/g, ''))
        .filter((s: string) => s.length > 0);
      result[key] = items;
      currentKey = key;
      currentIsArray = true;
    } else if (rawValue === '') {
      // Block list follows
      result[key] = [];
      currentKey = key;
      currentIsArray = true;
    } else {
      // Scalar value
      const unquoted = rawValue.replace(/^["']|["']$/g, '');
      const asNumber = Number(unquoted);
      result[key] = !isNaN(asNumber) && unquoted !== '' ? asNumber : unquoted;
      currentKey = key;
      currentIsArray = false;
    }
  }

  return result;
}

/**
 * Splits a SKILL.md file's raw text into its YAML frontmatter and Markdown body.
 * Expects the file to start with `---`, followed by YAML, followed by another `---`.
 *
 * @param rawText - The full text content of a SKILL.md file.
 * @returns An object containing the `frontmatter` YAML string and the `body` Markdown string,
 *          or `null` if the file does not conform to the Anthropic v2 format.
 */
function splitFrontmatter(rawText: string): { frontmatter: string; body: string } | null {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Must start with ---
  if (!normalized.startsWith('---')) {
    return null;
  }

  const afterOpen = normalized.substring(3);
  const closeIndex = afterOpen.indexOf('\n---');
  if (closeIndex === -1) {
    return null;
  }

  const frontmatter = afterOpen.substring(0, closeIndex).trim();
  const body = afterOpen.substring(closeIndex + 4).trim(); // skip \n---

  return { frontmatter, body };
}

/**
 * Converts a human-readable name or URL segment into a URL-safe slug.
 * Lowercases, replaces non-alphanumeric sequences with hyphens, and trims
 * leading/trailing hyphens.
 *
 * @param input - The string to slugify.
 * @returns A URL-safe slug string.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extracts candidate trigger keywords from a plain-text description.
 * Uses a simple heuristic: splits on whitespace and punctuation, keeps tokens
 * longer than 3 characters, lowercases them, and deduplicates.
 * Stop words (common English words) are removed.
 *
 * @param description - The skill description text to analyse.
 * @returns An array of unique keyword strings suitable for use as triggers.
 */
function extractTriggersFromDescription(description: string): string[] {
  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
    'were', 'will', 'have', 'has', 'had', 'not', 'but', 'they', 'their',
    'all', 'when', 'which', 'what', 'who', 'how', 'can', 'any', 'also',
    'into', 'than', 'then', 'its', 'been', 'more', 'about', 'over',
    'used', 'using', 'use', 'each', 'only', 'very', 'just', 'such',
  ]);

  const tokens = description
    .toLowerCase()
    .split(/[\s\.,;:!?()\[\]{}"'/\\|<>@#$%^&*+=~`]+/)
    .filter((token: string) => token.length > 3 && !stopWords.has(token));

  return [...new Set(tokens)];
}

/**
 * Parses the raw text of a SKILL.md file into a {@link SkillDefinition}.
 * Returns `null` if the file is malformed or missing required fields.
 *
 * @param rawText  - The full raw text of the SKILL.md file.
 * @param filePath - Absolute path to the file (used to derive the slug as fallback).
 * @returns A parsed {@link SkillDefinition} or `null` on failure.
 */
function parseSkillFile(rawText: string, filePath: string): SkillDefinition | null {
  try {
    const parts = splitFrontmatter(rawText);
    if (!parts) {
      return null;
    }

    const meta = parseYamlFrontmatter(parts.frontmatter);

    // `name` is required
    if (!meta.name || typeof meta.name !== 'string' || meta.name.trim() === '') {
      return null;
    }

    const name = meta.name.trim();
    const description = typeof meta.description === 'string' ? meta.description.trim() : '';
    const slug = slugify(name) || slugify(path.basename(path.dirname(filePath)));
    const content = parts.body;

    // Resolve triggers: use declared list or auto-extract from description
    let triggers: string[];
    if (Array.isArray(meta.triggers) && meta.triggers.length > 0) {
      triggers = meta.triggers.map((t: string) => String(t).trim()).filter((t: string) => t.length > 0);
    } else {
      triggers = extractTriggersFromDescription(description);
    }

    const priority = typeof meta.priority === 'number' && !isNaN(meta.priority)
      ? meta.priority
      : undefined;

    const skill: SkillDefinition = {
      slug,
      name,
      content,
      triggers,
      sourcePath: filePath,
    };

    if (priority !== undefined) {
      skill.priority = priority;
    }

    return skill;
  } catch {
    // Graceful degradation — malformed files are skipped
    return null;
  }
}

/**
 * Recursively collects all absolute file paths whose basename matches `SKILL.md`
 * starting from the given root directory.
 *
 * @param rootDir - The absolute or relative directory to start scanning from.
 * @returns An array of absolute paths to discovered SKILL.md files.
 */
function findSkillFiles(rootDir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(rootDir)) {
    return results;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findSkillFiles(fullPath);
      for (const p of nested) {
        results.push(p);
      }
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      results.push(fullPath);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recursively scans a directory tree for `SKILL.md` files conforming to the
 * Anthropic v2 format and returns parsed {@link SkillDefinition} objects.
 *
 * Malformed or unreadable files are silently skipped rather than throwing,
 * so the caller always receives all successfully parsed skills.
 *
 * @param dir - Absolute or relative path to the root directory to scan.
 * @returns An array of {@link SkillDefinition} objects for every valid SKILL.md found.
 * @throws {Error} If `dir` is not a non-empty string.
 *
 * @example
 * ```ts
 * const skills = loadSkillsFromDirectory('./skills');
 * console.log(skills.map(s => s.name));
 * ```
 */
export function loadSkillsFromDirectory(dir: string): SkillDefinition[] {
  if (typeof dir !== 'string' || dir.trim() === '') {
    throw new Error('loadSkillsFromDirectory: dir must be a non-empty string');
  }

  const resolvedDir = path.resolve(dir);
  const skillFiles = findSkillFiles(resolvedDir);
  const skills: SkillDefinition[] = [];

  for (const filePath of skillFiles) {
    try {
      const rawText = fs.readFileSync(filePath, 'utf8');
      const skill = parseSkillFile(rawText, filePath);
      if (skill !== null) {
        skills.push(skill);
      }
    } catch {
      // Unreadable files are silently skipped
    }
  }

  return skills;
}

/**
 * Fetches a `SKILL.md` file from the given URL and stores it under
 * `<targetDir>/<slug>/SKILL.md`, where `slug` is derived from the skill's
 * `name` frontmatter field (or the URL path segment if the name is absent).
 *
 * The target subdirectory is created automatically if it does not exist.
 *
 * @param url       - The fully-qualified URL to fetch the SKILL.md from (http or https).
 * @param targetDir - Absolute or relative path to the managed skills directory.
 * @returns A promise resolving to the parsed {@link SkillDefinition}.
 * @throws {Error} If either argument is invalid, the fetch fails, the HTTP status
 *                 indicates an error, or the fetched content is not a valid SKILL.md.
 *
 * @example
 * ```ts
 * const skill = await addSkillFromUrl(
 *   'https://example.com/skills/typescript/SKILL.md',
 *   './managed-skills'
 * );
 * console.log(skill.slug); // e.g. "typescript"
 * ```
 */
export async function addSkillFromUrl(url: string, targetDir: string): Promise<SkillDefinition> {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('addSkillFromUrl: url must be a non-empty string');
  }
  if (typeof targetDir !== 'string' || targetDir.trim() === '') {
    throw new Error('addSkillFromUrl: targetDir must be a non-empty string');
  }

  let rawText: string;
  try {
    rawText = await fetchUrl(url.trim());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`addSkillFromUrl: failed to fetch "${url}": ${message}`);
  }

  // Derive a fallback slug from the URL path before we parse
  const urlPathSegments = url.replace(/\/$/, '').split('/');
  const urlSlugFallback = slugify(urlPathSegments[urlPathSegments.length - 2] ?? urlPathSegments[urlPathSegments.length - 1] ?? 'skill');

  const skill = parseSkillFile(rawText, path.join(targetDir, urlSlugFallback, 'SKILL.md'));
  if (skill === null) {
    throw new Error(`addSkillFromUrl: content fetched from "${url}" is not a valid Anthropic v2 SKILL.md`);
  }

  const resolvedTargetDir = path.resolve(targetDir);
  const skillDir = path.join(resolvedTargetDir, skill.slug);
  const destPath = path.join(skillDir, 'SKILL.md');

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(destPath, rawText, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`addSkillFromUrl: failed to write skill to "${destPath}": ${message}`);
  }

  return skill;
}

/**
 * Copies a local `SKILL.md` file into the managed skills directory under
 * `<targetDir>/<slug>/SKILL.md`, where `slug` is derived from the skill's
 * `name` frontmatter field.
 *
 * The target subdirectory is created automatically if it does not exist.
 * The source file is copied (not moved) so the original remains intact.
 *
 * @param sourcePath - Absolute or relative path to the source SKILL.md file.
 * @param targetDir  - Absolute or relative path to the managed skills directory.
 * @returns The parsed {@link SkillDefinition} for the copied skill.
 * @throws {Error} If either argument is invalid, the source file cannot be read,
 *                 the content is not a valid SKILL.md, or writing fails.
 *
 * @example
 * ```ts
 * const skill = addSkillFromPath('./my-skill/SKILL.md', './managed-skills');
 * console.log(skill.name); // "My Skill"
 * ```
 */
export function addSkillFromPath(sourcePath: string, targetDir: string): SkillDefinition {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    throw new Error('addSkillFromPath: sourcePath must be a non-empty string');
  }
  if (typeof targetDir !== 'string' || targetDir.trim() === '') {
    throw new Error('addSkillFromPath: targetDir must be a non-empty string');
  }

  const resolvedSource = path.resolve(sourcePath.trim());

  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`addSkillFromPath: source file not found: "${resolvedSource}"`);
  }

  let rawText: string;
  try {
    rawText = fs.readFileSync(resolvedSource, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`addSkillFromPath: failed to read "${resolvedSource}": ${message}`);
  }

  const skill = parseSkillFile(rawText, resolvedSource);
  if (skill === null) {
    throw new Error(`addSkillFromPath: "${resolvedSource}" is not a valid Anthropic v2 SKILL.md`);
  }

  const resolvedTargetDir = path.resolve(targetDir.trim());
  const skillDir = path.join(resolvedTargetDir, skill.slug);
  const destPath = path.join(skillDir, 'SKILL.md');

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(destPath, rawText, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`addSkillFromPath: failed to write skill to "${destPath}": ${message}`);
  }

  return skill;
}