/**
 * @file skill-parser.ts
 * @description Pure parsing helpers for the Anthropic v2 SKILL.md format.
 *
 * This module is intentionally side-effect free:
 *   - no filesystem I/O
 *   - no network I/O
 *   - no external dependencies beyond `node:path`
 *
 * Consumers in this codebase:
 *   - skill-fs.ts        — reads SKILL.md bytes from disk and hands them here
 *   - skill-install.ts   — fetches/copies SKILL.md bytes and hands them here
 *
 * Keeping parsing isolated means the format logic can be reviewed and tested
 * without spinning up the filesystem or an HTTP mock.
 *
 * @module context-steward/core/skill-parser
 */

import * as path from 'node:path';
import { SkillDefinition } from '../types.js';

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
export function parseYamlFrontmatter(yaml: string): RawFrontmatter {
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
export function splitFrontmatter(rawText: string): { frontmatter: string; body: string } | null {
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
export function slugify(input: string): string {
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
export function extractTriggersFromDescription(description: string): string[] {
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
 * @param filePath - Absolute path to the file. Used to derive the slug as a
 *                   fallback and recorded on the returned skill as `sourcePath`
 *                   so downstream code can write learnings back without a
 *                   directory re-scan.
 * @returns A parsed {@link SkillDefinition} or `null` on failure.
 */
export function parseSkillFile(rawText: string, filePath: string): SkillDefinition | null {
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
