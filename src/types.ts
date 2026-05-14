/**
 * Context Steward Types
 */

// ============================================
// Configuration
// ============================================

export type OptimizationStrategy = 'conservative' | 'balanced' | 'aggressive';
export type PruneStrategy = 'fifo' | 'smart' | 'summarize';

export interface ContextStewardConfig {
  /** Optimization strategy */
  strategy?: OptimizationStrategy;
  
  /** Maximum tokens for context */
  maxContextTokens?: number;
  
  /** Reserve tokens for response */
  reserveTokens?: number;
  
  /** Temporary directory for externalized files */
  tempDir?: string;
  
  /** Maximum file size in MB */
  maxFileSizeMB?: number;
  
  /** Cleanup externalized files after hours */
  cleanupAfterHours?: number;
  
  /** Terms to preserve during optimization */
  preserveTerms?: string[];
  
  /** Patterns to preserve (regex) */
  preservePatterns?: RegExp[];
  
  /** Strategy for pruning conversation history */
  pruneStrategy?: PruneStrategy;
  
  /** Token budget for system message */
  systemMessageBudget?: number;
  
  /** Enable tool consolidation */
  consolidateTools?: boolean;
  
  /** Maximum tokens per tool schema */
  maxToolTokens?: number;
  
  /** Enable telemetry */
  telemetry?: boolean;
  
  /** Telemetry endpoint URL */
  telemetryEndpoint?: string;
  
  /** LLM adapter for token counting */
  adapter?: LLMAdapter;
}

// ============================================
// Text Optimization
// ============================================

export interface OptimizeParams {
  /** Text to optimize */
  text: string;
  
  /** Target reduction ratio (0-1) */
  targetReduction?: number;
  
  /** Preserve formatting (paragraphs, lists) */
  preserveFormatting?: boolean;
  
  /** Terms to preserve */
  preserveTerms?: string[];
  
  /** Optimization strategy */
  strategy?: OptimizationStrategy;
  
  /** Maximum output tokens */
  maxTokens?: number;
}

export interface OptimizationResult {
  /** Original text */
  originalText: string;
  
  /** Optimized text */
  optimizedText: string;
  
  /** Original token count */
  originalTokens: number;
  
  /** Optimized token count */
  optimizedTokens: number;
  
  /** Reduction ratio (0-1) */
  reductionRatio: number;
  
  /** Strategy used */
  strategy: OptimizationStrategy;
  
  /** Terms that were preserved */
  preservedTerms?: string[];
  
  /** Techniques applied */
  techniquesApplied?: string[];
}

// ============================================
// File Externalization
// ============================================

export interface ExternalizeParams {
  /** Tool or operation name */
  toolName: string;
  
  /** Result data to externalize */
  result: unknown;
  
  /** Filter to apply before summarizing */
  filter?: Record<string, unknown>;
  
  /** Custom summary prompt */
  summaryPrompt?: string;
  
  /** Maximum tokens for summary */
  maxSummaryTokens?: number;
  
  /** TTL for the externalized file (hours) */
  ttlHours?: number;
}

export interface ExternalizeResult {
  /** Generated summary */
  summary: string;
  
  /** Path to externalized file */
  filePath: string;
  
  /** Original size in bytes */
  originalBytes: number;
  
  /** Summary tokens */
  summaryTokens: number;
  
  /** Tokens saved */
  tokensSaved: number;
  
  /** Expiry timestamp */
  expiresAt: Date;
}

// ============================================
// Tool Consolidation
// ============================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  category?: string;
  [key: string]: unknown;
}

export interface ConsolidateToolsParams {
  /** Original tool definitions */
  tools: ToolDefinition[];
  
  /** Group by category */
  groupBy?: 'category' | 'prefix' | 'custom';
  
  /** Custom grouping function */
  groupFn?: (tool: ToolDefinition) => string;
  
  /** Maximum tokens per tool schema */
  maxTokensPerTool?: number;
  
  /** Keep examples in schema */
  keepExamples?: boolean;
}

export interface ConsolidatedTools {
  /** Consolidated tool definitions */
  tools: ToolDefinition[];
  
  /** Original tool count */
  originalCount: number;
  
  /** Consolidated tool count */
  consolidatedCount: number;
  
  /** Original tokens */
  originalTokens: number;
  
  /** Consolidated tokens */
  consolidatedTokens: number;
  
  /** Mapping from original to consolidated */
  mapping: Map<string, string>;
}

// ============================================
// Context Management
// ============================================

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  timestamp?: Date;
  tokens?: number;
}

export interface GetContextParams {
  /** Maximum tokens for context */
  maxTokens?: number;
  
  /** Include system message */
  includeSystem?: boolean;
  
  /** Minimum messages to keep */
  minMessages?: number;
  
  /** Always include first N user messages */
  preserveFirstN?: number;
}

export interface ContextResult {
  /** Optimized messages */
  messages: Message[];
  
  /** Total tokens */
  totalTokens: number;
  
  /** Messages pruned */
  prunedCount: number;
  
  /** Pruned message summary (if summarize strategy) */
  prunedSummary?: string;
}

// ============================================
// LLM Adapters
// ============================================

export interface LLMAdapter {
  /** Adapter name */
  name: string;
  
  /** Model identifier */
  model: string;
  
  /** Count tokens in text */
  countTokens(text: string): number;
  
  /** Count tokens in messages */
  countMessageTokens(messages: Message[]): number;
  
  /** Get model's max context length */
  getMaxContext(): number;
  
  /** Get pricing per 1K tokens */
  getPricing(): { input: number; output: number };
  
  /** Generate summary (optional, for smart pruning) */
  generateSummary?(text: string, maxTokens: number): Promise<string>;
}

export interface AdapterConfig {
  /** API base URL */
  baseUrl?: string;
  
  /** API key */
  apiKey?: string;
  
  /** Model identifier */
  model: string;
  
  /** Request timeout (ms) */
  timeout?: number;
}

// ============================================
// Telemetry
// ============================================

export interface TelemetryStats {
  /** Total requests processed */
  totalRequests: number;
  
  /** Original tokens (sum) */
  tokensOriginal: number;
  
  /** Optimized tokens (sum) */
  tokensOptimized: number;
  
  /** Tokens saved (sum) */
  tokensSaved: number;
  
  /** Average reduction percent */
  reductionPercent: number;
  
  /** Estimated cost saved (USD) */
  estimatedCostSaved: string;
  
  /** Cache hits */
  cacheHits: number;
  
  /** Files externalized */
  externalizedResults: number;
  
  /** Tools consolidated */
  toolsConsolidated: number;
  
  /** Messages pruned */
  messagesPruned: number;
  
  /** By strategy breakdown */
  byStrategy: Record<OptimizationStrategy, {
    requests: number;
    tokensSaved: number;
    avgReduction: number;
  }>;
  
  /** Session start time */
  sessionStart: Date;
}

export interface TelemetryEvent {
  type: 'optimize' | 'externalize' | 'consolidate' | 'prune' | 'cache_hit';
  timestamp: Date;
  tokensOriginal?: number;
  tokensOptimized?: number;
  strategy?: OptimizationStrategy;
  toolName?: string;
  filePath?: string;
  metadata?: Record<string, unknown>;
}
