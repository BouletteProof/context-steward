/**
 * Basic Example - Context Steward
 * 
 * Demonstrates text optimization with different strategies
 */

import { ContextSteward, OpenAIAdapter } from 'context-steward';

async function main() {
  // Initialize with default settings
  const steward = new ContextSteward({
    strategy: 'balanced',
    maxContextTokens: 4000,
    telemetry: true
  });

  // Example verbose text
  const verboseText = `
    I would really appreciate it if you could please help me to understand 
    in detail how to properly implement a REST API that is designed to be 
    very performant and highly scalable. It should be noted that I am 
    basically a beginner and would definitely need a comprehensive explanation. 
    In order to achieve this, I was wondering if you could provide some 
    really good examples that clearly demonstrate the various best practices.
    Additionally, I would like to know how to handle errors in a way that 
    is essentially robust and provides helpful feedback to users.
  `;

  console.log('=== Context Steward Demo ===\n');

  // Test different strategies
  const strategies = ['conservative', 'balanced', 'aggressive'] as const;

  for (const strategy of strategies) {
    const result = await steward.optimize({
      text: verboseText,
      strategy,
      preserveTerms: ['REST API', 'errors']
    });

    console.log(`Strategy: ${strategy.toUpperCase()}`);
    console.log(`Original tokens: ${result.originalTokens}`);
    console.log(`Optimized tokens: ${result.optimizedTokens}`);
    console.log(`Reduction: ${(result.reductionRatio * 100).toFixed(1)}%`);
    console.log(`Techniques: ${result.techniquesApplied?.join(', ')}`);
    console.log(`Result: ${result.optimizedText.slice(0, 100)}...`);
    console.log('---\n');
  }

  // Show telemetry
  const stats = steward.getStats();
  console.log('=== Telemetry ===');
  console.log(`Total requests: ${stats.totalRequests}`);
  console.log(`Tokens saved: ${stats.tokensSaved}`);
  console.log(`Overall reduction: ${stats.reductionPercent}%`);
  console.log(`Estimated cost saved: ${stats.estimatedCostSaved}`);
}

main().catch(console.error);
