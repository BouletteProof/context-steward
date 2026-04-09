/**
 * @file feedback-loop.ts
 * @description Demonstrates the full feedback loop: loading, working, and reporting outcomes.
 */

import { ContextSteward } from '../src/index';
import { SkillDefinition } from '../src/types';

/**
 * Runs the feedback loop example.
 * 
 * @returns {Promise<void>}
 */
async function runFeedbackLoop(): Promise<void> {
  const steward = new ContextSteward({ skillsDir: './skills' });
  
  // 1. Load skills into memory
  await steward.loadSkills();

  // 2. Get context for a task
  const context = await steward.packContext({
    intent: 'Refactor the database layer'
  });

  console.log('Working with skills:', context.skills.map((s: SkillDefinition) => s.slug));

  // 3. Simulate work being done and evaluated
  const workOutcome = {
    success: true,
    score: 0.85,
    feedback: 'The refactor was successful, but the TypeScript skill could be more specific about generics.'
  };

  // 4. Report the outcome back to the steward for each used skill
  // This allows the steward to update skill scores and "learned" metadata over time
  for (const skill of context.skills) {
    await steward.reportOutcome(skill.slug, {
      score: workOutcome.score,
      observations: [workOutcome.feedback]
    });
  }

  console.log('Outcomes reported. Steward has updated internal scores and learned metadata.');
}

runFeedbackLoop().catch((error: unknown) => {
  console.error('Error in feedback loop example:', error);
  process.exit(1);
});