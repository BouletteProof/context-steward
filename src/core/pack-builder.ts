/**
 * @file pack-builder.ts
 * @description Core logic for packing context components into a constrained token budget.
 *
 * This module implements the context-steward's packing strategy, ensuring that
 * system prompts, messages, skills, and tools fit within a defined token budget
 * while prioritizing critical information.
 *
 * @module context-steward/core/pack-builder
 */

import type { 
  PackInput, 
  BudgetConfig, 
  PackResult, 
  SkillDefinition,
  ToolDefinition,
  MessageEntry
} from '../types.js';

/**
 * Packs the provided context components into the specified token budget.
 *
 * @param input - The components to pack (system, messages, skills, tools).
 * @param budget - Configuration defining total tokens and per-category allocations.
 * @returns A {@link PackResult} containing the packed context and token statistics.
 * @throws Error if input or budget parameters are invalid.
 */
export function packContext(input: PackInput, budget: BudgetConfig): PackResult {
  if (!input || !budget) {
    throw new Error('Invalid input or budget configuration provided to packContext.');
  }

  const { maxTokens, allocations = {} } = budget;
  
  // Calculate raw token budgets per category
  const budgets = {
    system: Math.floor(maxTokens * (allocations.system ?? 0.2)),
    messages: Math.floor(maxTokens * (allocations.messages ?? 0.4)),
    skills: Math.floor(maxTokens * (allocations.skills ?? 0.2)),
    tools: Math.floor(maxTokens * (allocations.tools ?? 0.2)),
  };

  // 1. Process System Prompt
  const system = input.system ?? '';
  const systemTokens = system.length; // Simplified token estimation

  // 2. Process Messages (Newest-first)
  const messages: MessageEntry[] = [];
  let messageTokens = 0;
  if (input.messages) {
    for (const msg of [...input.messages].reverse()) {
      const msgTokens = msg.content.length;
      if (messageTokens + msgTokens <= budgets.messages) {
        messages.unshift(msg);
        messageTokens += msgTokens;
      } else {
        break;
      }
    }
  }

  // 3. Process Skills (Priority-based)
  const skills: SkillDefinition[] = [];
  let skillTokens = 0;
  if (input.skills) {
    const sortedSkills = [...input.skills].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const skill of sortedSkills) {
      const fullContent = skill.content;
      const condensed = skill.condensedContent ?? '';
      
      if (skillTokens + fullContent.length <= budgets.skills) {
        skills.push({ ...skill, content: fullContent });
        skillTokens += fullContent.length;
      } else if (condensed && skillTokens + condensed.length <= budgets.skills) {
        skills.push({ ...skill, content: condensed });
        skillTokens += condensed.length;
      }
    }
  }

  // 4. Process Tools (Progressive disclosure)
  const tools: ToolDefinition[] = [];
  let toolTokens = 0;
  if (input.tools) {
    for (const tool of input.tools) {
      // Full tool representation
      const full = JSON.stringify(tool);
      if (toolTokens + full.length <= budgets.tools) {
        tools.push(tool);
        toolTokens += full.length;
      } else {
        // Fallback: Name + Description only
        const partial = JSON.stringify({ name: tool.name, description: tool.description });
        if (toolTokens + partial.length <= budgets.tools) {
          tools.push({ name: tool.name, description: tool.description } as ToolDefinition);
          toolTokens += partial.length;
        }
      }
    }
  }

  return {
    packed: {
      system,
      messages,
      skills,
      tools
    },
    stats: {
      tokensBefore: maxTokens,
      tokensAfter: systemTokens + messageTokens + skillTokens + toolTokens,
      skillsLoaded: skills.length,
      skillsDropped: (input.skills?.length || 0) - skills.length,
      messagesKept: messages.length,
      messagesTruncated: (input.messages?.length || 0) - messages.length,
    }
  };
}