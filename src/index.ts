/**
 * Context Steward - Universal LLM Context Optimization
 * 
 * Reduces token usage by 70-90% through:
 * - Text optimization (filler removal, phrase simplification)
 * - File externalization (large results → temp files)
 * - Tool consolidation (compress schemas, group tools)
 * - Context management (sliding window, smart pruning)
 */

export { ContextSteward } from './core/context-steward';
export { TextOptimizer } from './core/text-optimizer';
export { FileExternalizer } from './core/file-externalizer';
export { ToolConsolidator } from './core/tool-consolidator';
export { ContextManager } from './core/context-manager';
export { Telemetry } from './core/telemetry';

// Adapters
export { BaseAdapter } from './adapters/base';
export { OpenAIAdapter } from './adapters/openai';
export { AnthropicAdapter } from './adapters/anthropic';
export { OllamaAdapter } from './adapters/ollama';
export { GeminiAdapter } from './adapters/gemini';

// Types
export * from './types';

// Skill Security Auditor
export { auditSkill, auditSkillContent, auditDirectory, formatAuditReport, addTrustedDomain } from './core/skill-auditor';
export type { SkillAudit, Finding, Grade, Severity, Category } from './core/skill-auditor';
