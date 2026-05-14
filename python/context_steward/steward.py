"""
Context Steward - Main class that orchestrates all optimization.
"""

from typing import Optional

from .text_optimizer import TextOptimizer
from .file_externalizer import FileExternalizer
from .tool_consolidator import ToolConsolidator
from .context_manager import ContextManager
from .telemetry import Telemetry, TelemetryEvent
from .types import (
    ContextStewardConfig,
    OptimizeParams,
    OptimizationResult,
    OptimizationStrategy,
    TelemetryStats,
)


class ContextSteward:
    """
    Universal LLM Context Optimization.
    
    Combines:
    - TextOptimizer
    - FileExternalizer
    - ToolConsolidator
    - ContextManager
    - Telemetry
    
    Example:
        steward = ContextSteward(strategy=OptimizationStrategy.BALANCED)
        result = steward.optimize(OptimizeParams(
            text="Please kindly help me to understand...",
            preserve_terms=["API", "REST"]
        ))
        print(f"Reduced by {result.reduction_ratio:.1%}")
    """

    def __init__(self, config: Optional[ContextStewardConfig] = None):
        self.config = config or ContextStewardConfig()
        
        self.text_optimizer = TextOptimizer(
            preserve_terms=self.config.preserve_terms
        )
        self.file_externalizer = FileExternalizer(
            temp_dir=self.config.temp_dir
        )
        self.tool_consolidator = ToolConsolidator(
            max_tokens_per_tool=self.config.max_tool_tokens
        )
        self.context_manager = ContextManager(
            max_context_tokens=self.config.max_context_tokens,
            prune_strategy=self.config.prune_strategy
        )
        self.telemetry = Telemetry(enabled=self.config.telemetry)

    def optimize(self, params: OptimizeParams) -> OptimizationResult:
        """
        Optimize text to reduce token count.
        
        Args:
            params: Optimization parameters including text and strategy
            
        Returns:
            OptimizationResult with original and optimized text plus metrics
        """
        if params.strategy is None:
            params.strategy = self.config.strategy
        
        result = self.text_optimizer.optimize(params)
        
        # Record telemetry
        from datetime import datetime
        self.telemetry.record(TelemetryEvent(
            type="optimize",
            timestamp=datetime.now(),
            tokens_original=result.original_tokens,
            tokens_optimized=result.optimized_tokens,
            strategy=result.strategy
        ))
        
        return result

    def optimize_text(
        self,
        text: str,
        strategy: Optional[OptimizationStrategy] = None,
        preserve_terms: Optional[list[str]] = None,
        max_tokens: Optional[int] = None
    ) -> OptimizationResult:
        """
        Convenience method to optimize text.
        
        Args:
            text: Text to optimize
            strategy: Optimization strategy (default: config strategy)
            preserve_terms: Terms to preserve during optimization
            max_tokens: Maximum tokens for output
            
        Returns:
            OptimizationResult
        """
        return self.optimize(OptimizeParams(
            text=text,
            strategy=strategy or self.config.strategy,
            preserve_terms=preserve_terms or [],
            max_tokens=max_tokens
        ))

    def count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        return self.text_optimizer.count_tokens(text)

    def get_stats(self) -> TelemetryStats:
        """Get telemetry statistics."""
        return self.telemetry.get_stats()

    def reset_stats(self) -> None:
        """Reset telemetry."""
        self.telemetry.reset()
