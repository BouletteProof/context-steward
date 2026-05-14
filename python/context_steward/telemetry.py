"""Telemetry - Track optimization metrics and savings."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .types import TelemetryStats, OptimizationStrategy


@dataclass
class TelemetryEvent:
    type: str
    timestamp: datetime
    tokens_original: Optional[int] = None
    tokens_optimized: Optional[int] = None
    strategy: Optional[OptimizationStrategy] = None


class Telemetry:
    """Track optimization metrics and savings."""
    
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.events: list[TelemetryEvent] = []
        self.session_start = datetime.now()
        self._stats = {
            "total_requests": 0,
            "tokens_original": 0,
            "tokens_optimized": 0,
            "cache_hits": 0,
            "externalized_results": 0,
            "tools_consolidated": 0,
            "messages_pruned": 0,
        }
    
    def record(self, event: TelemetryEvent) -> None:
        """Record a telemetry event."""
        if not self.enabled:
            return
        
        self.events.append(event)
        self._stats["total_requests"] += 1
        
        if event.tokens_original:
            self._stats["tokens_original"] += event.tokens_original
        if event.tokens_optimized:
            self._stats["tokens_optimized"] += event.tokens_optimized
    
    def get_stats(self) -> TelemetryStats:
        """Get aggregated statistics."""
        tokens_saved = self._stats["tokens_original"] - self._stats["tokens_optimized"]
        reduction_percent = (
            int((tokens_saved / self._stats["tokens_original"]) * 100)
            if self._stats["tokens_original"] > 0
            else 0
        )
        
        # Estimate cost saved (rough GPT-4 pricing)
        cost_saved = (tokens_saved / 1000) * 0.03
        
        return TelemetryStats(
            total_requests=self._stats["total_requests"],
            tokens_original=self._stats["tokens_original"],
            tokens_optimized=self._stats["tokens_optimized"],
            tokens_saved=tokens_saved,
            reduction_percent=reduction_percent,
            estimated_cost_saved=f"${cost_saved:.2f}",
            cache_hits=self._stats["cache_hits"],
            externalized_results=self._stats["externalized_results"],
            tools_consolidated=self._stats["tools_consolidated"],
            messages_pruned=self._stats["messages_pruned"],
            session_start=self.session_start,
        )
    
    def reset(self) -> None:
        """Reset telemetry."""
        self.events = []
        self.session_start = datetime.now()
        for key in self._stats:
            self._stats[key] = 0
