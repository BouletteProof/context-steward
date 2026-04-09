/**
 * @file skill-matcher.ts
 * @description Deterministic, keyword-based skill matching and ranking engine.
 *
 * Provides utilities to extract keywords from text, match skills based on trigger
 * overlaps, and rank them using historical outcome data.
 *
 * @module context-steward/core/skill-matcher
 */

import type { SkillDefinition } from '../types.js';

/**
 * Represents historical performance data for a skill.
 */
export interface SkillScore {
  /** The slug of the skill. */
  slug: string;
  /** Mean outcome score, typically in range [0, 1]. */
  meanScore: number;
}

/**
 * Common English stop words to filter out during keyword extraction.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'to', 'of', 'in', 'for', 'with', 'on', 'at', 'by', 'from', 'as'
]);

/**
 * Extracts unique, meaningful keywords from a text string.
 *
 * @param text - The input text to process.
 * @returns An array of unique, lowercased keywords.
 */
export function extractKeywords(text: string): string[] {
  if (typeof text !== 'string' || text.trim() === '') {
    return [];
  }

  const words = text.toLowerCase().split(/\W+/);
  const uniqueKeywords = new Set(
    words.filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );

  return Array.from(uniqueKeywords);
}

/**
 * Matches skills against task text and ranks them based on keyword hits and historical performance.
 *
 * @param skills - The pool of available skills.
 * @param taskText - The user intent or task description.
 * @param outcomeScores - Optional historical performance data for skills.
 * @returns A sorted array of matched skills.
 */
export function matchSkills(
  skills: SkillDefinition[],
  taskText: string,
  outcomeScores?: SkillScore[]
): SkillDefinition[] {
  if (!Array.isArray(skills)) return [];

  const keywords = extractKeywords(taskText);
  const scores = new Map(outcomeScores?.map((s) => [s.slug, s.meanScore]));

  const matched = skills
    .map((skill) => {
      const hits = skill.triggers.filter((trigger) =>
        keywords.includes(trigger.toLowerCase())
      ).length;

      if (hits === 0) return { skill, score: -1 };

      const historicalScore = scores.get(skill.slug);
      let weight = 0.5; // Neutral weight for new/unknown skills

      if (historicalScore !== undefined) {
        if (historicalScore < 0.3) {
          weight = 0.1; // Demote low-performing skills
        } else {
          weight = historicalScore;
        }
      }

      const finalScore = hits * weight + (skill.priority || 0);
      return { skill, score: finalScore };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return matched.map((item) => item.skill);
}

/**
 * Fits skills into a token budget, prioritizing higher-scoring skills and using
 * condensed content when necessary.
 *
 * @param matched - The list of matched skills (assumed sorted by relevance).
 * @param tokenBudget - The maximum allowed tokens for the context window.
 * @returns An object containing the kept and dropped skills.
 */
export function budgetSkills(
  matched: SkillDefinition[],
  tokenBudget: number
): { kept: SkillDefinition[]; dropped: SkillDefinition[] } {
  const kept: SkillDefinition[] = [];
  const dropped: SkillDefinition[] = [];
  let currentTokens = 0;

  // Simple heuristic: assume 1 char ≈ 0.25 tokens
  const estimateTokens = (text: string) => Math.ceil(text.length * 0.25);

  for (const skill of matched) {
    const fullTokens = estimateTokens(skill.content);
    const condensedTokens = skill.condensedContent ? estimateTokens(skill.condensedContent) : Infinity;

    if (currentTokens + fullTokens <= tokenBudget) {
      kept.push(skill);
      currentTokens += fullTokens;
    } else if (currentTokens + condensedTokens <= tokenBudget) {
      kept.push({ ...skill, content: skill.condensedContent! });
      currentTokens += condensedTokens;
    } else {
      dropped.push(skill);
    }
  }

  return { kept, dropped };
}