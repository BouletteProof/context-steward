/**
 * @file token-estimator.ts
 * @description Token estimation utilities for context packing.
 * Provides fast, heuristic-based token counting without external dependencies.
 */

import { PackInput, BudgetConfig } from '../types.js';

/**
 * Estimates the number of tokens in a string based on a 4 characters/token heuristic.
 * 
 * @param text - The text to estimate tokens for.
 * @returns The approximate token count. Returns 0 for null or undefined.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (text === null || text === undefined) {
    return 0;
  }
  
  if (typeof text !== 'string') {
    return 0;
  }

  // Heuristic: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Breaks down the estimated token count of a PackInput by component.
 * 
 * @param input - The packing input to analyze.
 * @returns An object containing token counts for system, messages, skills, tools, and the total.
 */
export function estimatePromptTokens(input: PackInput): {
  system: number;
  messages: number;
  skills: number;
  tools: number;
  total: number;
} {
  if (!input) {
    return { system: 0, messages: 0, skills: 0, tools: 0, total: 0 };
  }

  const system = estimateTokens(input.system);
  
  let messages = 0;
  if (Array.isArray(input.messages)) {
    for (const msg of input.messages) {
      // Estimate content and role if available
      messages += estimateTokens(msg.content);
      if ('role' in msg && typeof msg.role === 'string') {
        messages += estimateTokens(msg.role);
      }
    }
  }

  let skills = 0;
  if (Array.isArray(input.skills)) {
    for (const skill of input.skills) {
      // Estimate based on JSON representation of the skill
      try {
        skills += estimateTokens(skill.content || skill.condensedContent || "");
      } catch {
        // Fallback if stringify fails
        skills += 0;
      }
    }
  }

  let tools = 0;
  if (Array.isArray(input.tools)) {
    for (const tool of input.tools) {
      // Estimate based on JSON representation of the tool
      try {
        tools += estimateTokens(JSON.stringify(tool));
      } catch {
        // Fallback if stringify fails
        tools += 0;
      }
    }
  }

  const total = system + messages + skills + tools;

  return {
    system,
    messages,
    skills,
    tools,
    total
  };
}

/**
 * Checks if the given input fits within the specified token budget.
 * 
 * @param input - The packing input to check.
 * @param budget - The budget configuration.
 * @returns An object indicating if it fits, the total tokens, the budget limit, and any overflow.
 */
export function fitsInBudget(input: PackInput, budget: BudgetConfig): {
  fits: boolean;
  total: number;
  budget: number;
  overflow: number;
} {
  if (!budget || typeof budget.maxTokens !== 'number') {
    throw new Error('Invalid budget configuration: maxTokens is required');
  }

  const breakdown = estimatePromptTokens(input);
  const total = breakdown.total;
  const limit = budget.maxTokens;
  const overflow = Math.max(0, total - limit);

  return {
    fits: total <= limit,
    total,
    budget: limit,
    overflow
  };
}