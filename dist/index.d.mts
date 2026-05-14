/**
 * Context Steward Types
 */
type OptimizationStrategy = 'conservative' | 'balanced' | 'aggressive';
type PruneStrategy = 'fifo' | 'smart' | 'summarize';
interface ContextStewardConfig {
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
interface OptimizeParams {
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
interface OptimizationResult {
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
interface ExternalizeParams {
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
interface ExternalizeResult {
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
interface ToolDefinition {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    category?: string;
    [key: string]: unknown;
}
interface ConsolidateToolsParams {
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
interface ConsolidatedTools {
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
interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    toolCallId?: string;
    timestamp?: Date;
    tokens?: number;
}
interface GetContextParams {
    /** Maximum tokens for context */
    maxTokens?: number;
    /** Include system message */
    includeSystem?: boolean;
    /** Minimum messages to keep */
    minMessages?: number;
    /** Always include first N user messages */
    preserveFirstN?: number;
}
interface ContextResult {
    /** Optimized messages */
    messages: Message[];
    /** Total tokens */
    totalTokens: number;
    /** Messages pruned */
    prunedCount: number;
    /** Pruned message summary (if summarize strategy) */
    prunedSummary?: string;
}
interface LLMAdapter {
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
    getPricing(): {
        input: number;
        output: number;
    };
    /** Generate summary (optional, for smart pruning) */
    generateSummary?(text: string, maxTokens: number): Promise<string>;
}
interface AdapterConfig {
    /** API base URL */
    baseUrl?: string;
    /** API key */
    apiKey?: string;
    /** Model identifier */
    model: string;
    /** Request timeout (ms) */
    timeout?: number;
}
interface TelemetryStats {
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
interface TelemetryEvent {
    type: 'optimize' | 'externalize' | 'consolidate' | 'prune' | 'cache_hit';
    timestamp: Date;
    tokensOriginal?: number;
    tokensOptimized?: number;
    strategy?: OptimizationStrategy;
    toolName?: string;
    filePath?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Context Steward - Main class that orchestrates all optimization
 *
 * Combines:
 * - TextOptimizer
 * - FileExternalizer
 * - ToolConsolidator
 * - ContextManager
 * - Telemetry
 */

declare class ContextSteward {
    private textOptimizer;
    private fileExternalizer;
    private toolConsolidator;
    private contextManager;
    private telemetry;
    private adapter?;
    private config;
    constructor(config?: ContextStewardConfig);
    /**
     * Optimize text to reduce token count
     */
    optimize(params: OptimizeParams): Promise<OptimizationResult>;
    /**
     * Optimize text to fit within token limit
     */
    optimizeToLimit(text: string, tokenLimit: number, preserveTerms?: string[]): Promise<OptimizationResult>;
    /**
     * Externalize large result to file, return summary
     */
    externalize(params: ExternalizeParams): Promise<ExternalizeResult>;
    /**
     * Recall full data from externalized file
     */
    recall(filePath: string): Promise<unknown>;
    /**
     * Check if externalized file exists
     */
    fileExists(filePath: string): Promise<boolean>;
    /**
     * Cleanup expired externalized files
     */
    cleanupFiles(): Promise<number>;
    /**
     * Consolidate tools to reduce schema overhead
     */
    consolidateTools(tools: ToolDefinition[], params?: Partial<ConsolidateToolsParams>): ConsolidatedTools;
    /**
     * Add message to context
     */
    addMessage(message: Omit<Message, 'timestamp' | 'tokens'>): void;
    /**
     * Set system message
     */
    setSystemMessage(content: string): void;
    /**
     * Get optimized context that fits token budget
     */
    getOptimizedContext(params?: GetContextParams): Promise<ContextResult>;
    /**
     * Clear conversation context
     */
    clearContext(): void;
    /**
     * Get current context token count
     */
    getContextTokens(): number;
    /**
     * Count tokens in text
     */
    countTokens(text: string): number;
    /**
     * Count tokens in messages
     */
    countMessageTokens(messages: Message[]): number;
    /**
     * Get telemetry statistics
     */
    getStats(): TelemetryStats;
    /**
     * Reset telemetry
     */
    resetStats(): void;
    /**
     * Optimize a complete request (messages + tools + new input)
     */
    optimizeRequest(request: {
        messages?: Message[];
        tools?: ToolDefinition[];
        userInput: string;
        maxTotalTokens?: number;
    }): Promise<{
        messages: Message[];
        tools: ToolDefinition[];
        userInput: string;
        stats: {
            originalTokens: number;
            optimizedTokens: number;
            reduction: string;
        };
    }>;
    /**
     * Process a tool result - externalize if large, otherwise return as-is
     */
    processToolResult(toolName: string, result: unknown, options?: {
        externalizeThreshold?: number;
        summaryPrompt?: string;
    }): Promise<{
        content: string;
        externalized: boolean;
        filePath?: string;
    }>;
}

/**
 * Text Optimizer - Core optimization engine
 *
 * Reduces token count through:
 * - Filler word removal
 * - Phrase simplification
 * - Redundancy elimination
 * - Smart truncation
 */

declare class TextOptimizer {
    private adapter?;
    private preserveTerms;
    private preservePatterns;
    constructor(config?: {
        adapter?: LLMAdapter;
        preserveTerms?: string[];
        preservePatterns?: RegExp[];
    });
    /**
     * Count tokens in text
     */
    countTokens(text: string): number;
    /**
     * Optimize text to reduce token count
     */
    optimize(params: OptimizeParams): Promise<OptimizationResult>;
    /**
     * Conservative optimization - minimal changes
     */
    private conservativeOptimization;
    /**
     * Balanced optimization - good reduction while maintaining readability
     */
    private balancedOptimization;
    /**
     * Aggressive optimization - maximum reduction
     */
    private aggressiveOptimization;
    /**
     * Truncate text to fit token limit
     */
    private truncateToTokenLimit;
    /**
     * Preserve basic formatting from original
     */
    private preserveBasicFormatting;
    /**
     * Ensure preserved terms weren't accidentally removed
     */
    private ensurePreservedTerms;
    /**
     * Escape string for use in regex
     */
    private escapeRegex;
}

/**
 * File Externalizer - Store large results outside context
 *
 * Large tool results are:
 * 1. Saved to temp files
 * 2. Summarized for context
 * 3. Available for recall if needed
 */

declare class FileExternalizer {
    private tempDir;
    private maxFileSizeMB;
    private cleanupAfterHours;
    private adapter?;
    private fileRegistry;
    constructor(config?: {
        tempDir?: string;
        maxFileSizeMB?: number;
        cleanupAfterHours?: number;
        adapter?: LLMAdapter;
    });
    /**
     * Initialize temp directory
     */
    init(): Promise<void>;
    /**
     * Externalize a large result
     */
    externalize(params: ExternalizeParams): Promise<ExternalizeResult>;
    /**
     * Recall full data from externalized file
     */
    recall(filePath: string): Promise<unknown>;
    /**
     * Check if a file exists and is valid
     */
    exists(filePath: string): Promise<boolean>;
    /**
     * Delete an externalized file
     */
    delete(filePath: string): Promise<void>;
    /**
     * Cleanup expired files
     */
    cleanup(): Promise<number>;
    /**
     * Apply filter to array results
     */
    private applyFilter;
    /**
     * Generate summary of externalized data
     */
    private generateSummary;
    /**
     * Generate basic summary without LLM
     */
    private generateBasicSummary;
    /**
     * Count tokens in text
     */
    private countTokens;
    /**
     * Get registry stats
     */
    getStats(): {
        files: number;
        totalBytes: number;
        oldestFile: Date | null;
    };
}

/**
 * Tool Consolidator - Compress and group tool schemas
 *
 * Reduces tool overhead by:
 * 1. Compressing verbose descriptions
 * 2. Grouping related tools
 * 3. Removing redundant examples
 */

declare class ToolConsolidator {
    private adapter?;
    private maxTokensPerTool;
    constructor(config?: {
        adapter?: LLMAdapter;
        maxTokensPerTool?: number;
    });
    /**
     * Consolidate tools to reduce token overhead
     */
    consolidate(params: ConsolidateToolsParams): ConsolidatedTools;
    /**
     * Compress a single tool definition
     */
    compressTool(tool: ToolDefinition, maxTokens: number, keepExamples: boolean): ToolDefinition;
    /**
     * Merge multiple tools into one
     */
    private mergeTools;
    /**
     * Group tools by category, prefix, or custom function
     */
    private groupTools;
    /**
     * Extract prefix from tool name
     */
    private extractPrefix;
    /**
     * Compress a description to fit token budget
     */
    private compressDescription;
    /**
     * Compress parameters object
     */
    private compressParameters;
    /**
     * Compress a single parameter definition
     */
    private compressParamDef;
    /**
     * Count tokens for array of tools
     */
    private countToolsTokens;
    /**
     * Count tokens in text
     */
    private countTokens;
}

/**
 * Context Manager - Smart conversation history management
 *
 * Manages context window with:
 * 1. Sliding window pruning
 * 2. Smart summarization
 * 3. Token budget enforcement
 */

declare class ContextManager {
    private messages;
    private systemMessage;
    private maxContextTokens;
    private reserveTokens;
    private pruneStrategy;
    private adapter?;
    private prunedSummary;
    private totalPruned;
    constructor(config?: {
        maxContextTokens?: number;
        reserveTokens?: number;
        pruneStrategy?: PruneStrategy;
        adapter?: LLMAdapter;
        systemMessage?: string;
    });
    /**
     * Add a message to the context
     */
    addMessage(message: Omit<Message, 'timestamp' | 'tokens'>): void;
    /**
     * Set or update system message
     */
    setSystemMessage(content: string): void;
    /**
     * Get optimized context that fits within token budget
     */
    getOptimizedContext(params?: GetContextParams): Promise<ContextResult>;
    /**
     * Apply pruning strategy to messages
     */
    private applyPruneStrategy;
    /**
     * FIFO pruning - remove oldest messages first
     */
    private fifoPrune;
    /**
     * Smart pruning - prioritize important messages
     */
    private smartPrune;
    /**
     * Summarize pruning - summarize old messages
     */
    private summarizePrune;
    /**
     * Score message importance
     */
    private scoreMessageImportance;
    /**
     * Clear all messages
     */
    clear(): void;
    /**
     * Get message count
     */
    getMessageCount(): number;
    /**
     * Get total tokens in context
     */
    getTotalTokens(): number;
    /**
     * Count tokens in text
     */
    private countTokens;
}

/**
 * Telemetry - Track optimization metrics and savings
 */

declare class Telemetry {
    private enabled;
    private endpoint?;
    private adapter?;
    private events;
    private sessionStart;
    private stats;
    constructor(config?: {
        enabled?: boolean;
        endpoint?: string;
        adapter?: LLMAdapter;
    });
    /**
     * Record a telemetry event
     */
    record(event: TelemetryEvent): void;
    /**
     * Get aggregated statistics
     */
    getStats(): TelemetryStats;
    /**
     * Get recent events
     */
    getEvents(limit?: number): TelemetryEvent[];
    /**
     * Reset telemetry
     */
    reset(): void;
    /**
     * Export telemetry data
     */
    export(): {
        stats: TelemetryStats;
        events: TelemetryEvent[];
        sessionDuration: number;
    };
    /**
     * Calculate cost saved based on adapter pricing
     */
    private calculateCostSaved;
    /**
     * Calculate average reduction for a strategy
     */
    private calculateAvgReduction;
    /**
     * Send event to remote endpoint
     */
    private sendToEndpoint;
}

/**
 * Base Adapter - Abstract class for LLM adapters
 */

declare abstract class BaseAdapter implements LLMAdapter {
    abstract name: string;
    model: string;
    protected baseUrl?: string;
    protected apiKey?: string;
    protected timeout: number;
    constructor(config: AdapterConfig);
    /**
     * Count tokens in text - must be implemented by subclass
     */
    abstract countTokens(text: string): number;
    /**
     * Count tokens in messages
     */
    countMessageTokens(messages: Message[]): number;
    /**
     * Get model's max context length - should be overridden
     */
    abstract getMaxContext(): number;
    /**
     * Get pricing per 1K tokens - should be overridden
     */
    abstract getPricing(): {
        input: number;
        output: number;
    };
    /**
     * Generate summary using the LLM
     */
    generateSummary(text: string, maxTokens: number): Promise<string>;
    /**
     * Make API request - helper for subclasses
     */
    protected makeRequest(endpoint: string, body: Record<string, unknown>): Promise<unknown>;
}

/**
 * OpenAI Adapter - Works with OpenAI API and compatible APIs
 */

declare class OpenAIAdapter extends BaseAdapter {
    name: string;
    private encoder;
    constructor(config: AdapterConfig);
    /**
     * Count tokens using tiktoken
     */
    countTokens(text: string): number;
    /**
     * Get max context for model
     */
    getMaxContext(): number;
    /**
     * Get pricing for model
     */
    getPricing(): {
        input: number;
        output: number;
    };
    /**
     * Generate summary using OpenAI API
     */
    generateSummary(text: string, maxTokens: number): Promise<string>;
}

/**
 * Anthropic Adapter - Claude models
 */

declare class AnthropicAdapter extends BaseAdapter {
    name: string;
    constructor(config: AdapterConfig);
    /**
     * Count tokens - Anthropic uses similar tokenization to GPT
     */
    countTokens(text: string): number;
    /**
     * Get max context for model
     */
    getMaxContext(): number;
    /**
     * Get pricing for model
     */
    getPricing(): {
        input: number;
        output: number;
    };
    /**
     * Generate summary using Anthropic API
     */
    generateSummary(text: string, maxTokens: number): Promise<string>;
}

/**
 * Ollama Adapter - Local models via Ollama
 */

declare class OllamaAdapter extends BaseAdapter {
    name: string;
    constructor(config: AdapterConfig & {
        host?: string;
    });
    /**
     * Count tokens - use Ollama's tokenize endpoint if available
     */
    countTokens(text: string): number;
    /**
     * Count tokens async using Ollama API
     */
    countTokensAsync(text: string): Promise<number>;
    /**
     * Get max context for model
     */
    getMaxContext(): number;
    /**
     * Get pricing - Ollama is free/local
     */
    getPricing(): {
        input: number;
        output: number;
    };
    /**
     * Generate summary using Ollama
     */
    generateSummary(text: string, maxTokens: number): Promise<string>;
    /**
     * Check if Ollama is healthy
     */
    isHealthy(): Promise<boolean>;
    /**
     * List available models
     */
    listModels(): Promise<string[]>;
}

/**
 * Gemini Adapter - Google's Gemini models
 */

declare class GeminiAdapter extends BaseAdapter {
    name: string;
    constructor(config: AdapterConfig);
    /**
     * Count tokens - Gemini uses similar tokenization
     */
    countTokens(text: string): number;
    /**
     * Count tokens using Gemini API
     */
    countTokensAsync(text: string): Promise<number>;
    /**
     * Get max context for model
     */
    getMaxContext(): number;
    /**
     * Get pricing for model
     */
    getPricing(): {
        input: number;
        output: number;
    };
    /**
     * Generate summary using Gemini
     */
    generateSummary(text: string, maxTokens: number): Promise<string>;
}

/**
 * @file skill-auditor.ts
 * @description Static security analysis for SKILL.md files.
 *
 * Checks for prompt injection, data exfiltration, privilege escalation,
 * metadata mismatch, obfuscation, and credential harvesting.
 *
 * Each skill receives a score (0–100) and a grade (GREEN / AMBER / RED).
 *
 * @module context-steward/core/skill-auditor
 */
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type Category = 'injection' | 'exfiltration' | 'escalation' | 'mismatch' | 'obfuscation' | 'credential';
type Grade = 'GREEN' | 'AMBER' | 'RED';
interface Finding {
    severity: Severity;
    category: Category;
    rule: string;
    message: string;
    line: number;
    evidence: string;
}
interface SkillAudit {
    name: string;
    slug: string;
    path: string;
    score: number;
    grade: Grade;
    findings: Finding[];
    lines: number;
    bytes: number;
    description: string;
}
/** Add a domain to the trusted set (e.g. from config). */
declare function addTrustedDomain(domain: string): void;
/**
 * Audit a single SKILL.md file. Returns the full audit with score and grade.
 */
declare function auditSkill(filePath: string): SkillAudit;
/**
 * Audit SKILL.md content directly (for use with add_skill before writing).
 */
declare function auditSkillContent(content: string, filePath?: string): SkillAudit;
/**
 * Discover and audit all SKILL.md files under a directory.
 */
declare function auditDirectory(dir: string): SkillAudit[];
declare function formatAuditReport(audits: SkillAudit[]): string;

export { type AdapterConfig, AnthropicAdapter, BaseAdapter, type Category, type ConsolidateToolsParams, type ConsolidatedTools, ContextManager, type ContextResult, ContextSteward, type ContextStewardConfig, type ExternalizeParams, type ExternalizeResult, FileExternalizer, type Finding, GeminiAdapter, type GetContextParams, type Grade, type LLMAdapter, type Message, OllamaAdapter, OpenAIAdapter, type OptimizationResult, type OptimizationStrategy, type OptimizeParams, type PruneStrategy, type Severity, type SkillAudit, Telemetry, type TelemetryEvent, type TelemetryStats, TextOptimizer, ToolConsolidator, type ToolDefinition, addTrustedDomain, auditDirectory, auditSkill, auditSkillContent, formatAuditReport };
