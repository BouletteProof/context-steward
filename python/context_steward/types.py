"""Type definitions for Context Steward."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Literal, Optional


class OptimizationStrategy(str, Enum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


class PruneStrategy(str, Enum):
    FIFO = "fifo"
    SMART = "smart"
    SUMMARIZE = "summarize"


@dataclass
class ContextStewardConfig:
    """Configuration for Context Steward."""
    
    strategy: OptimizationStrategy = OptimizationStrategy.BALANCED
    max_context_tokens: int = 4000
    reserve_tokens: int = 1000
    temp_dir: str = "/tmp/context-steward"
    max_file_size_mb: int = 10
    cleanup_after_hours: int = 24
    preserve_terms: list[str] = field(default_factory=list)
    prune_strategy: PruneStrategy = PruneStrategy.SMART
    system_message_budget: int = 500
    consolidate_tools: bool = True
    max_tool_tokens: int = 300
    telemetry: bool = True
    telemetry_endpoint: Optional[str] = None


@dataclass
class OptimizeParams:
    """Parameters for text optimization."""
    
    text: str
    target_reduction: float = 0.3
    preserve_formatting: bool = False
    preserve_terms: list[str] = field(default_factory=list)
    strategy: Optional[OptimizationStrategy] = None
    max_tokens: Optional[int] = None


@dataclass
class OptimizationResult:
    """Result of text optimization."""
    
    original_text: str
    optimized_text: str
    original_tokens: int
    optimized_tokens: int
    reduction_ratio: float
    strategy: OptimizationStrategy
    preserved_terms: list[str] = field(default_factory=list)
    techniques_applied: list[str] = field(default_factory=list)


@dataclass
class ExternalizeParams:
    """Parameters for file externalization."""
    
    tool_name: str
    result: Any
    filter: Optional[dict[str, Any]] = None
    summary_prompt: Optional[str] = None
    max_summary_tokens: int = 500
    ttl_hours: Optional[int] = None


@dataclass
class ExternalizeResult:
    """Result of file externalization."""
    
    summary: str
    file_path: str
    original_bytes: int
    summary_tokens: int
    tokens_saved: int
    expires_at: datetime


@dataclass
class Message:
    """Chat message."""
    
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    tokens: Optional[int] = None


@dataclass
class ToolDefinition:
    """Tool definition for consolidation."""
    
    name: str
    description: str
    parameters: Optional[dict[str, Any]] = None
    category: Optional[str] = None


@dataclass
class ConsolidatedTools:
    """Result of tool consolidation."""
    
    tools: list[ToolDefinition]
    original_count: int
    consolidated_count: int
    original_tokens: int
    consolidated_tokens: int
    mapping: dict[str, str]


@dataclass
class ContextResult:
    """Result of context optimization."""
    
    messages: list[Message]
    total_tokens: int
    pruned_count: int
    pruned_summary: Optional[str] = None


@dataclass
class TelemetryStats:
    """Telemetry statistics."""
    
    total_requests: int
    tokens_original: int
    tokens_optimized: int
    tokens_saved: int
    reduction_percent: int
    estimated_cost_saved: str
    cache_hits: int
    externalized_results: int
    tools_consolidated: int
    messages_pruned: int
    session_start: datetime
