# Context Steward

> **Universal LLM Context Optimization - 90% Token Reduction**

[![npm](https://img.shields.io/npm/v/context-steward)](https://www.npmjs.com/package/context-steward)
[![PyPI](https://img.shields.io/pypi/v/context-steward)](https://pypi.org/project/context-steward/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight, LLM-agnostic library that dramatically reduces token usage while maintaining response quality. Works with OpenAI, Anthropic, Google, Ollama, vLLM, and any OpenAI-compatible API.

## 🎯 Problem

LLM context windows are expensive real estate:
- **Tool schemas** consume 500-2000 tokens each before you even ask a question
- **Large results** (API responses, file contents) bloat context unnecessarily  
- **Conversation history** grows unbounded
- **Redundant text** wastes tokens on filler words and verbose phrases

## ✨ Solution

Context Steward applies four optimization strategies:

| Strategy | Reduction | Method |
|----------|-----------|--------|
| **Text Optimization** | 30-50% | Remove filler, simplify phrases |
| **File Externalization** | 50-80% | Store large results in temp files, return summaries |
| **Tool Consolidation** | 40-60% | Compress schemas, group related tools |
| **Context Management** | 20-40% | Sliding window, smart history pruning |

**Combined effect: 70-90% token reduction**

## 🚀 Quick Start

### JavaScript/TypeScript

```bash
npm install context-steward
```

```typescript
import { ContextSteward } from 'context-steward';

const steward = new ContextSteward({
  strategy: 'balanced',  // 'conservative' | 'balanced' | 'aggressive'
  maxContextTokens: 4000,
  tempDir: '/tmp/context-steward'
});

// Optimize a prompt
const optimized = await steward.optimize({
  text: "Please kindly help me to write a very detailed analysis...",
  preserveTerms: ['API', 'REST', 'GraphQL']
});

console.log(optimized.stats);
// { originalTokens: 1200, optimizedTokens: 340, reduction: '72%' }

// Externalize large tool results
const result = await steward.externalize({
  toolName: 'list_files',
  result: largeFileList,  // 50KB JSON
  summaryPrompt: 'List file names and sizes, highlight errors'
});
// Returns: { summary: "12 files, 3 errors...", filePath: "/tmp/cs/result_abc.json" }

// Manage conversation context
steward.addMessage({ role: 'user', content: userMessage });
steward.addMessage({ role: 'assistant', content: response });
const context = steward.getOptimizedContext({ maxTokens: 2000 });
```

### Python

```bash
pip install context-steward
```

```python
from context_steward import ContextSteward

steward = ContextSteward(
    strategy='balanced',
    max_context_tokens=4000
)

# Optimize a prompt
result = steward.optimize(
    text="Please kindly help me to write a very detailed analysis...",
    preserve_terms=['API', 'REST', 'GraphQL']
)

print(result.stats)
# {'original_tokens': 1200, 'optimized_tokens': 340, 'reduction': '72%'}
```

## 🔧 Core Features

### 1. Text Optimizer

Removes redundant language while preserving meaning:

```typescript
// Before (847 tokens)
"I would really appreciate it if you could please help me to understand 
in detail how to properly implement a REST API that is designed to be 
very performant and highly scalable..."

// After (312 tokens)  
"Help me implement a performant, scalable REST API..."
```

**Configurable strategies:**
- `conservative`: Minimal changes, safe for all content
- `balanced`: Good reduction, maintains readability (default)
- `aggressive`: Maximum reduction, may affect style

### 2. File Externalizer

Large tool results stay out of context:

```typescript
const steward = new ContextSteward();

// Tool returns 50KB of deployment data
const deployments = await myTool.listDeployments();

// Externalize: store full data, return summary
const { summary, filePath } = await steward.externalize({
  toolName: 'list_deployments',
  result: deployments,
  filter: { state: 'ERROR' },  // Optional: filter before summarizing
  maxSummaryTokens: 500
});

// summary: "23 deployments. 3 errors: [deploy-abc: timeout, ...]"
// filePath: "/tmp/context-steward/deployments_1234.json"

// Later, if Claude needs details:
const fullData = await steward.recall(filePath);
```

### 3. Tool Consolidator

Compress and group tool schemas:

```typescript
// Before: 20 tools × 500 tokens = 10,000 tokens
const tools = [
  { name: 'tavily_search', ... },  // 500 tokens
  { name: 'brave_search', ... },   // 500 tokens
  { name: 'google_search', ... },  // 500 tokens
  // ... 17 more tools
];

// After: 8 consolidated tools × 300 tokens = 2,400 tokens
const optimizedTools = steward.consolidateTools(tools, {
  groupBy: 'category',
  maxTokensPerTool: 300
});
// { name: 'web_search', params: { provider: 'tavily'|'brave'|'google', ... }}
```

### 4. Context Manager

Smart conversation history with sliding window:

```typescript
const steward = new ContextSteward({
  maxContextTokens: 4000,
  reserveTokens: 1000,  // Reserve for response
  pruneStrategy: 'smart'  // 'fifo' | 'smart' | 'summarize'
});

// Add messages as conversation progresses
steward.addMessage({ role: 'user', content: '...' });
steward.addMessage({ role: 'assistant', content: '...' });

// Get optimized context that fits budget
const messages = steward.getOptimizedContext();
// Older messages summarized, recent messages preserved
```

## 📊 LLM Adapters

Works with any LLM through adapters:

```typescript
import { ContextSteward, OpenAIAdapter, OllamaAdapter } from 'context-steward';

// OpenAI
const openai = new ContextSteward({
  adapter: new OpenAIAdapter({ model: 'gpt-4' })
});

// Anthropic
const claude = new ContextSteward({
  adapter: new AnthropicAdapter({ model: 'claude-3-sonnet' })
});

// Ollama (local)
const ollama = new ContextSteward({
  adapter: new OllamaAdapter({ 
    host: 'http://localhost:11434',
    model: 'deepseek-coder-v2:16b'
  })
});

// Any OpenAI-compatible API
const custom = new ContextSteward({
  adapter: new OpenAIAdapter({
    baseUrl: 'https://your-api.com/v1',
    apiKey: 'your-key',
    model: 'your-model'
  })
});
```

## 📈 Telemetry

Track your savings:

```typescript
const steward = new ContextSteward({ telemetry: true });

// After some usage...
const stats = steward.getStats();

console.log(stats);
// {
//   totalRequests: 150,
//   tokensOriginal: 450000,
//   tokensOptimized: 67500,
//   tokensSaved: 382500,
//   reductionPercent: 85,
//   estimatedCostSaved: '$38.25',  // Based on model pricing
//   cacheHits: 45,
//   externalizedResults: 23
// }
```

## 🔌 Integrations

### MCP Server

Use as an MCP server for Claude Desktop:

```bash
npx context-steward serve --port 6000
```

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "context-steward": {
      "command": "npx",
      "args": ["context-steward", "serve"]
    }
  }
}
```

### Express Middleware

```typescript
import express from 'express';
import { contextStewardMiddleware } from 'context-steward/express';

const app = express();
app.use(contextStewardMiddleware({ strategy: 'balanced' }));
```

### LangChain

```typescript
import { ContextStewardRetriever } from 'context-steward/langchain';

const retriever = new ContextStewardRetriever({
  steward: new ContextSteward(),
  baseRetriever: vectorStoreRetriever
});
```

## ⚙️ Configuration

```typescript
const steward = new ContextSteward({
  // Optimization strategy
  strategy: 'balanced',  // 'conservative' | 'balanced' | 'aggressive'
  
  // Token limits
  maxContextTokens: 4000,
  reserveTokens: 1000,
  
  // File externalization
  tempDir: '/tmp/context-steward',
  maxFileSizeMB: 10,
  cleanupAfterHours: 24,
  
  // Preserve important terms
  preserveTerms: ['API', 'error', 'warning'],
  preservePatterns: [/\b[A-Z]{2,}\b/g],  // Preserve acronyms
  
  // Context management
  pruneStrategy: 'smart',
  systemMessageBudget: 500,
  
  // Tool consolidation
  consolidateTools: true,
  maxToolTokens: 300,
  
  // Telemetry
  telemetry: true,
  telemetryEndpoint: 'https://your-analytics.com/events',
  
  // LLM adapter (for token counting)
  adapter: new OpenAIAdapter({ model: 'gpt-4' })
});
```

## 🏗️ Use Cases

### 1. AI Coding Assistant

```typescript
// Reduce codebase context for code review
const context = await steward.optimizeCodeContext({
  files: projectFiles,
  focusFile: 'src/api/users.ts',
  includeTypes: true,
  includeTests: false
});
// Returns: interfaces, function signatures, focused file content
```

### 2. Document Q&A

```typescript
// Large document → optimized chunks
const chunks = await steward.chunkDocument(largeDocument, {
  maxChunkTokens: 500,
  overlap: 50,
  preserveStructure: true
});
```

### 3. API Response Processing

```typescript
// Externalize large API responses
const result = await steward.externalize({
  toolName: 'database_query',
  result: queryResult,  // 10,000 rows
  summaryPrompt: 'Count by status, list top 5 errors'
});
```

## 📦 Packages

| Package | Description | Install |
|---------|-------------|---------|
| `context-steward` | Core library (JS/TS) | `npm install context-steward` |
| `context-steward` | Core library (Python) | `pip install context-steward` |
| `@context-steward/mcp` | MCP server | `npm install @context-steward/mcp` |
| `@context-steward/express` | Express middleware | `npm install @context-steward/express` |

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](./LICENSE).

---

**Built with ❤️ by [Bouletteproof](https://bouletteproof.com)**

⭐ Star us if Context Steward saves you tokens!
