/**
 * @file skill-scorer.ts
 * @description Aggregates raw outcome records into per-skill effectiveness scores.
 * Provides analytical functions to calculate performance metrics and generate
 * human-readable reports for skill optimization.
 *
 * @module context-steward/core/skill-scorer
 */

import { OutcomeRecord, SkillScore } from '../types.js';


/**
 * Aggregates raw outcome records into per-skill effectiveness scores.
 *
 * @param outcomes - Array of outcome records to process.
 * @returns An array of {@link SkillScore} objects.
 */
export function scoreSkills(outcomes: OutcomeRecord[]): SkillScore[] {
  if (!Array.isArray(outcomes)) {
    throw new Error('Invalid input: outcomes must be an array.');
  }

  const skillMap: Record<string, OutcomeRecord[]> = {};

  for (const outcome of outcomes) {
    if (!outcome.skillSlugs || !Array.isArray(outcome.skillSlugs)) continue;
    for (const slug of outcome.skillSlugs) {
      if (!skillMap[slug]) {
        skillMap[slug] = [];
      }
      skillMap[slug].push(outcome);
    }
  }

  return Object.entries(skillMap).map(([slug, records]) => {
    // Sort by timestamp descending if available, or just use order
    const sorted = [...records].sort((a, b) => 
      new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()
    );

    const scores = sorted.map(r => r.score ?? 0);
    const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Trend: last 5 vs previous 5
    const recent = scores.slice(0, 5);
    const previous = scores.slice(5, 10);
    
    let recentTrend: SkillScore['recentTrend'] = 'stable';
    if (recent.length >= 5 && previous.length >= 5) {
      const recentAvg = recent.reduce((a, b) => a + b, 0) / 5;
      const prevAvg = previous.reduce((a, b) => a + b, 0) / 5;
      const delta = recentAvg - prevAvg;
      if (delta > 0.1) recentTrend = 'improving';
      else if (delta < -0.1) recentTrend = 'declining';
    }

    // Tools
    const toolScores: Record<string, number[]> = {};
    for (const r of sorted) {
      if (r.tool) {
        if (!toolScores[r.tool]) toolScores[r.tool] = [];
        toolScores[r.tool].push(r.score ?? 0);
      }
    }

    let bestWithTool: string | undefined = undefined;
    let worstWithTool: string | undefined = undefined;
    let maxAvg = -1;
    let minAvg = 2;

    for (const [tool, s] of Object.entries(toolScores)) {
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      if (avg > maxAvg) { maxAvg = avg; bestWithTool = tool; }
      if (avg < minAvg) { minAvg = avg; worstWithTool = tool; }
    }

    return {
      slug,
      meanScore,
      recentTrend,
      bestWithTool,
      worstWithTool,
      totalOutcomes: scores.length
    };
  });
}

/**
 * Generates a human-readable report from calculated skill scores.
 *
 * @param scores - Array of {@link SkillScore} objects.
 * @returns A formatted string report.
 */
export function getSkillReport(scores: SkillScore[]): string {
  if (!Array.isArray(scores)) return 'No scores available.';
  
  const lines = ['Skill Performance Report', '========================'];
  
  for (const s of scores) {
    const trendArrow = s.recentTrend === 'improving' ? '↑' : s.recentTrend === 'declining' ? '↓' : '→';
    const status = s.meanScore < 0.3 ? '[NEEDS REVISION]' : s.meanScore > 0.8 ? '[HIGH PERFORMING]' : '';
    
    lines.push(
      `${s.slug.padEnd(20)} | Score: ${s.meanScore.toFixed(2)} ${trendArrow} | ${status}`
    );
  }
  
  return lines.join('\n');
}