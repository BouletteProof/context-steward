/**
 * Text Optimizer - Core optimization engine
 * 
 * Reduces token count through:
 * - Filler word removal
 * - Phrase simplification
 * - Redundancy elimination
 * - Smart truncation
 */

import type { 
  OptimizeParams, 
  OptimizationResult, 
  OptimizationStrategy,
  LLMAdapter 
} from '../types';

// Default filler words to remove
const FILLER_WORDS = [
  'very', 'really', 'quite', 'rather', 'somewhat', 'fairly', 'pretty',
  'just', 'simply', 'basically', 'essentially', 'generally', 'typically',
  'obviously', 'clearly', 'certainly', 'definitely', 'absolutely',
  'completely', 'totally', 'entirely', 'wholly', 'actually', 'literally'
];

// Phrase simplifications
const PHRASE_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string; aggressive?: boolean }> = [
  { pattern: /in order to/gi, replacement: 'to' },
  { pattern: /due to the fact that/gi, replacement: 'because' },
  { pattern: /for the purpose of/gi, replacement: 'for' },
  { pattern: /in the event that/gi, replacement: 'if' },
  { pattern: /at this point in time/gi, replacement: 'now' },
  { pattern: /in the near future/gi, replacement: 'soon' },
  { pattern: /a large number of/gi, replacement: 'many' },
  { pattern: /a small number of/gi, replacement: 'few' },
  { pattern: /it should be noted that/gi, replacement: '' },
  { pattern: /it is important to note that/gi, replacement: '' },
  { pattern: /please be aware that/gi, replacement: '' },
  { pattern: /i would like to/gi, replacement: "I'd like to" },
  { pattern: /please kindly/gi, replacement: 'please' },
  { pattern: /could you please/gi, replacement: 'please' },
  { pattern: /would you be able to/gi, replacement: 'can you' },
  { pattern: /i was wondering if/gi, replacement: 'can' },
  { pattern: /as a matter of fact/gi, replacement: '' },
  { pattern: /at the present time/gi, replacement: 'now' },
  { pattern: /despite the fact that/gi, replacement: 'although' },
  { pattern: /in spite of the fact that/gi, replacement: 'although' },
  { pattern: /has the ability to/gi, replacement: 'can' },
  { pattern: /is able to/gi, replacement: 'can' },
  { pattern: /make a decision/gi, replacement: 'decide' },
  { pattern: /take into consideration/gi, replacement: 'consider' },
  { pattern: /come to the conclusion/gi, replacement: 'conclude' },
  { pattern: /give an explanation/gi, replacement: 'explain' },
  // Aggressive only
  { pattern: /\b(a|an|the)\s+(?=\w)/gi, replacement: '', aggressive: true },
  { pattern: /,\s*which\s+/gi, replacement: ' that ', aggressive: true },
];

// Transition words to remove in aggressive mode
const TRANSITION_WORDS = [
  'however', 'moreover', 'furthermore', 'additionally', 'consequently',
  'therefore', 'thus', 'hence', 'accordingly', 'meanwhile', 'nevertheless',
  'nonetheless', 'alternatively', 'specifically', 'particularly'
];

export class TextOptimizer {
  private adapter?: LLMAdapter;
  private preserveTerms: string[];
  private preservePatterns: RegExp[];

  constructor(config?: {
    adapter?: LLMAdapter;
    preserveTerms?: string[];
    preservePatterns?: RegExp[];
  }) {
    this.adapter = config?.adapter;
    this.preserveTerms = config?.preserveTerms || [];
    this.preservePatterns = config?.preservePatterns || [];
  }

  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    if (this.adapter) {
      return this.adapter.countTokens(text);
    }
    // Fallback: rough estimate (1 token ≈ 4 chars)
    return Math.ceil(text.length / 4);
  }

  /**
   * Optimize text to reduce token count
   */
  async optimize(params: OptimizeParams): Promise<OptimizationResult> {
    const {
      text,
      targetReduction = 0.3,
      preserveFormatting = false,
      preserveTerms = [],
      strategy = 'balanced',
      maxTokens
    } = params;

    const allPreserveTerms = [...this.preserveTerms, ...preserveTerms];
    const originalTokens = this.countTokens(text);
    
    let optimizedText = text;
    const techniquesApplied: string[] = [];

    // Apply strategy-based optimization
    switch (strategy) {
      case 'conservative':
        optimizedText = this.conservativeOptimization(optimizedText, allPreserveTerms);
        techniquesApplied.push('whitespace_cleanup', 'minimal_filler_removal');
        break;
      
      case 'aggressive':
        optimizedText = this.aggressiveOptimization(optimizedText, allPreserveTerms);
        techniquesApplied.push('filler_removal', 'phrase_simplification', 'article_removal', 'transition_removal');
        break;
      
      case 'balanced':
      default:
        optimizedText = this.balancedOptimization(optimizedText, allPreserveTerms);
        techniquesApplied.push('filler_removal', 'phrase_simplification');
        break;
    }

    // If max tokens specified, truncate if needed
    if (maxTokens) {
      const currentTokens = this.countTokens(optimizedText);
      if (currentTokens > maxTokens) {
        optimizedText = this.truncateToTokenLimit(optimizedText, maxTokens, allPreserveTerms);
        techniquesApplied.push('truncation');
      }
    }

    // Preserve formatting if requested
    if (preserveFormatting) {
      optimizedText = this.preserveBasicFormatting(optimizedText, text);
    }

    // Restore preserved terms if accidentally removed
    optimizedText = this.ensurePreservedTerms(optimizedText, text, allPreserveTerms);

    const optimizedTokens = this.countTokens(optimizedText);
    const reductionRatio = 1 - (optimizedTokens / originalTokens);

    return {
      originalText: text,
      optimizedText,
      originalTokens,
      optimizedTokens,
      reductionRatio,
      strategy,
      preservedTerms: allPreserveTerms,
      techniquesApplied
    };
  }

  /**
   * Conservative optimization - minimal changes
   */
  private conservativeOptimization(text: string, preserveTerms: string[]): string {
    let optimized = text;

    // Remove extra whitespace only
    optimized = optimized.replace(/\s+/g, ' ').trim();

    // Remove only the most redundant words
    const minimalFillers = ['very', 'really', 'quite', 'rather'];
    for (const word of minimalFillers) {
      const regex = new RegExp(`\\b${word}\\s+`, 'gi');
      optimized = optimized.replace(regex, '');
    }

    return optimized;
  }

  /**
   * Balanced optimization - good reduction while maintaining readability
   */
  private balancedOptimization(text: string, preserveTerms: string[]): string {
    let optimized = text;

    // Remove filler words
    for (const word of FILLER_WORDS) {
      const regex = new RegExp(`\\b${word}\\s+`, 'gi');
      optimized = optimized.replace(regex, '');
    }

    // Apply phrase simplifications (non-aggressive only)
    for (const { pattern, replacement, aggressive } of PHRASE_REPLACEMENTS) {
      if (!aggressive) {
        optimized = optimized.replace(pattern, replacement);
      }
    }

    // Clean up extra spaces
    optimized = optimized.replace(/\s+/g, ' ').trim();

    return optimized;
  }

  /**
   * Aggressive optimization - maximum reduction
   */
  private aggressiveOptimization(text: string, preserveTerms: string[]): string {
    let optimized = text;

    // Start with balanced optimization
    optimized = this.balancedOptimization(optimized, preserveTerms);

    // Apply aggressive phrase replacements
    for (const { pattern, replacement, aggressive } of PHRASE_REPLACEMENTS) {
      if (aggressive) {
        optimized = optimized.replace(pattern, replacement);
      }
    }

    // Remove transition words
    for (const word of TRANSITION_WORDS) {
      const regex = new RegExp(`\\b${word},?\\s*`, 'gi');
      optimized = optimized.replace(regex, '');
    }

    // Abbreviate common phrases
    const abbreviations = [
      { pattern: /for example/gi, replacement: 'e.g.' },
      { pattern: /that is/gi, replacement: 'i.e.' },
      { pattern: /and so forth/gi, replacement: 'etc.' },
      { pattern: /with respect to/gi, replacement: 're:' },
    ];

    for (const { pattern, replacement } of abbreviations) {
      optimized = optimized.replace(pattern, replacement);
    }

    // Clean up spaces and punctuation
    optimized = optimized.replace(/\s+/g, ' ');
    optimized = optimized.replace(/\s*,\s*/g, ', ');
    optimized = optimized.replace(/\s*\.\s*/g, '. ');
    optimized = optimized.trim();

    return optimized;
  }

  /**
   * Truncate text to fit token limit
   */
  private truncateToTokenLimit(text: string, tokenLimit: number, preserveTerms: string[]): string {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    
    // Separate sentences with and without preserved terms
    const withTerms: string[] = [];
    const withoutTerms: string[] = [];

    for (const sentence of sentences) {
      const hasPreservedTerm = preserveTerms.some(term =>
        sentence.toLowerCase().includes(term.toLowerCase())
      );
      
      if (hasPreservedTerm) {
        withTerms.push(sentence);
      } else {
        withoutTerms.push(sentence);
      }
    }

    // Build result prioritizing sentences with preserved terms
    let result = '';
    let currentTokens = 0;

    for (const sentence of [...withTerms, ...withoutTerms]) {
      const sentenceTokens = this.countTokens(sentence);
      if (currentTokens + sentenceTokens <= tokenLimit) {
        result += (result ? ' ' : '') + sentence;
        currentTokens += sentenceTokens;
      } else {
        break;
      }
    }

    return result || text.substring(0, tokenLimit * 4); // Fallback
  }

  /**
   * Preserve basic formatting from original
   */
  private preserveBasicFormatting(optimized: string, original: string): string {
    // Preserve paragraph breaks
    const originalParagraphs = original.split(/\n\s*\n/);
    if (originalParagraphs.length > 1) {
      const sentences = optimized.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      const sentencesPerParagraph = Math.ceil(sentences.length / originalParagraphs.length);
      
      let formatted = '';
      for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
        const paragraphSentences = sentences.slice(i, i + sentencesPerParagraph);
        formatted += paragraphSentences.join(' ') + '\n\n';
      }
      return formatted.trim();
    }

    return optimized;
  }

  /**
   * Ensure preserved terms weren't accidentally removed
   */
  private ensurePreservedTerms(optimized: string, original: string, preserveTerms: string[]): string {
    let result = optimized;
    
    for (const term of preserveTerms) {
      const termRegex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
      
      // Check if term exists in original but not in optimized
      if (termRegex.test(original) && !termRegex.test(result)) {
        // Find context in original and append
        const match = original.match(new RegExp(`[^.!?]*\\b${this.escapeRegex(term)}\\b[^.!?]*`, 'i'));
        if (match) {
          result += ` (Note: ${term})`;
        }
      }
    }
    
    return result;
  }

  /**
   * Escape string for use in regex
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
