/**
 * @file programmatic-usage.ts
 * @description Demonstrates how to use context-steward as a library.
 */

import { ContextSteward } from '../src/index';
import { SkillDefinition } from '../src/types';

/**
 * Main execution function for the programmatic usage example.
 * 
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  // Initialize the steward with a local skills directory and token budget
  const steward = new ContextSteward({
    skillsDir: './skills',
    budget: {
      maxTokens: 4000,
      allocations: {
        skills: 0.5,
        system: 0.2,
        history: 0.3
      }
    }
  });

  // Load skills from the specified directory
  await steward.loadSkills();

  // Pack context for a specific user intent
  const packed = await steward.packContext({
    intent: 'Implement a new TypeScript service',
    messageHistory: [
      { role: 'user', content: 'I need to create a service for file uploads.' }
    ]
  });

  console.log('--- Packed Context ---');
  console.log('System Prompt Length:', packed.systemPrompt.length);
  console.log('Included Skills:', packed.skills.map((s: SkillDefinition) => s.name).join(', '));
}

main().catch((error: unknown) => {
  console.error('Error in programmatic usage example:', error);
  process.exit(1);
});