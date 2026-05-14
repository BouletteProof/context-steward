"""
Context Steward - Universal LLM Context Optimization

Reduces token usage by 70-90% through:
- Text optimization (filler removal, phrase simplification)
- File externalization (large results → temp files)
- Tool consolidation (compress schemas, group tools)
- Context management (sliding window, smart pruning)
"""

from .steward import ContextSteward
from .text_optimizer import TextOptimizer
from .file_externalizer import FileExternalizer
from .tool_consolidator import ToolConsolidator
from .context_manager import ContextManager
from .telemetry import Telemetry
from .types import (
    OptimizationStrategy,
    PruneStrategy,
    ContextStewardConfig,
    OptimizeParams,
    OptimizationResult,
    ExternalizeParams,
    ExternalizeResult,
    Message,
)

__version__ = "0.1.0"
__all__ = [
    "ContextSteward",
    "TextOptimizer",
    "FileExternalizer",
    "ToolConsolidator",
    "ContextManager",
    "Telemetry",
    "OptimizationStrategy",
    "PruneStrategy",
    "ContextStewardConfig",
    "OptimizeParams",
    "OptimizationResult",
    "ExternalizeParams",
    "ExternalizeResult",
    "Message",
]
