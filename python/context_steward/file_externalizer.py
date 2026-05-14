"""
File Externalizer - Store large results outside context.

Large tool results are:
1. Saved to temp files
2. Summarized for context
3. Available for recall if needed
"""

import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from .types import ExternalizeParams, ExternalizeResult


class FileExternalizer:
    """Externalize large results to temp files."""

    def __init__(
        self,
        temp_dir: str = "/tmp/context-steward",
        max_file_size_mb: int = 10,
        cleanup_after_hours: int = 24,
    ):
        self.temp_dir = Path(temp_dir)
        self.max_file_size_mb = max_file_size_mb
        self.cleanup_after_hours = cleanup_after_hours
        self._registry: dict[str, dict] = {}
        self._ensure_dir()

    def _ensure_dir(self) -> None:
        """Ensure temp directory exists."""
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def _count_tokens(self, text: str) -> int:
        """Count tokens (rough estimate)."""
        try:
            import tiktoken
            encoder = tiktoken.get_encoding("cl100k_base")
            return len(encoder.encode(text))
        except ImportError:
            return len(text) // 4

    def externalize(self, params: ExternalizeParams) -> ExternalizeResult:
        """
        Externalize a large result to a temp file.
        
        Args:
            params: ExternalizeParams with tool_name, result, optional filter
            
        Returns:
            ExternalizeResult with summary, file_path, and metrics
        """
        self._ensure_dir()

        tool_name = params.tool_name
        result = params.result
        filter_dict = params.filter
        max_summary_tokens = params.max_summary_tokens
        ttl_hours = params.ttl_hours or self.cleanup_after_hours

        # Convert result to string
        if isinstance(result, str):
            result_string = result
        else:
            result_string = json.dumps(result, indent=2, default=str)

        original_bytes = len(result_string.encode('utf-8'))

        # Check size limit
        max_bytes = self.max_file_size_mb * 1024 * 1024
        if original_bytes > max_bytes:
            raise ValueError(
                f"Result too large: {original_bytes / 1024 / 1024:.2f}MB "
                f"exceeds {self.max_file_size_mb}MB limit"
            )

        # Apply filter if provided and result is a list
        filtered_result = result
        if filter_dict and isinstance(result, list):
            filtered_result = self._apply_filter(result, filter_dict)

        # Generate file path
        file_id = uuid.uuid4().hex[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_name = f"{tool_name}_{timestamp}_{file_id}.json"
        file_path = self.temp_dir / file_name

        # Save to file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(result_string)

        # Generate summary
        summary = self._generate_summary(
            filtered_result,
            tool_name,
            params.summary_prompt,
            max_summary_tokens
        )

        # Calculate tokens
        original_tokens = self._count_tokens(result_string)
        summary_tokens = self._count_tokens(summary)
        tokens_saved = original_tokens - summary_tokens

        # Set expiry
        expires_at = datetime.now() + timedelta(hours=ttl_hours)

        # Register file
        self._registry[str(file_path)] = {
            "path": str(file_path),
            "expires_at": expires_at,
            "tool_name": tool_name,
            "original_tokens": original_tokens,
        }

        return ExternalizeResult(
            summary=summary,
            file_path=str(file_path),
            original_bytes=original_bytes,
            summary_tokens=summary_tokens,
            tokens_saved=tokens_saved,
            expires_at=expires_at,
        )

    def recall(self, file_path: str) -> Any:
        """
        Recall full data from externalized file.
        
        Args:
            file_path: Path to the externalized file
            
        Returns:
            Original data (parsed JSON or string)
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Externalized file not found: {file_path}")

        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return content

    def exists(self, file_path: str) -> bool:
        """Check if externalized file exists and is valid."""
        entry = self._registry.get(file_path)
        if not entry:
            # Check if file exists on disk
            return Path(file_path).exists()

        if datetime.now() > entry["expires_at"]:
            self.delete(file_path)
            return False

        return Path(file_path).exists()

    def delete(self, file_path: str) -> None:
        """Delete an externalized file."""
        try:
            Path(file_path).unlink(missing_ok=True)
            self._registry.pop(file_path, None)
        except Exception:
            pass

    def cleanup(self) -> int:
        """
        Cleanup expired files.
        
        Returns:
            Number of files cleaned up
        """
        self._ensure_dir()
        cleaned = 0
        now = datetime.now()

        # Clean from registry
        expired_paths = [
            path for path, entry in self._registry.items()
            if now > entry["expires_at"]
        ]
        for path in expired_paths:
            self.delete(path)
            cleaned += 1

        # Scan directory for orphaned files
        try:
            for file_path in self.temp_dir.iterdir():
                if file_path.is_file():
                    # Check file age
                    mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                    age_hours = (now - mtime).total_seconds() / 3600

                    if age_hours > self.cleanup_after_hours:
                        if str(file_path) not in self._registry:
                            file_path.unlink()
                            cleaned += 1
        except Exception:
            pass

        return cleaned

    def _apply_filter(
        self, data: list[Any], filter_dict: dict[str, Any]
    ) -> list[Any]:
        """Apply filter to list data."""
        filtered = []
        for item in data:
            if not isinstance(item, dict):
                filtered.append(item)
                continue

            match = True
            for key, value in filter_dict.items():
                if item.get(key) != value:
                    match = False
                    break

            if match:
                filtered.append(item)

        return filtered

    def _generate_summary(
        self,
        data: Any,
        tool_name: str,
        custom_prompt: Optional[str],
        max_tokens: int,
    ) -> str:
        """
        Generate a concise summary of the data.
        
        This is a rule-based summary generator. For LLM-based summaries,
        pass an adapter to the ContextSteward.
        """
        if isinstance(data, list):
            return self._summarize_list(data, tool_name, max_tokens)
        elif isinstance(data, dict):
            return self._summarize_dict(data, tool_name, max_tokens)
        elif isinstance(data, str):
            return self._summarize_string(data, tool_name, max_tokens)
        else:
            return f"{tool_name}: {type(data).__name__} value"

    def _summarize_list(
        self, data: list[Any], tool_name: str, max_tokens: int
    ) -> str:
        """Summarize a list result."""
        count = len(data)
        
        if count == 0:
            return f"{tool_name}: Empty list (0 items)"

        # Try to detect structure
        if isinstance(data[0], dict):
            keys = list(data[0].keys())
            
            # Look for status/state/type fields to group by
            group_key = None
            for candidate in ['status', 'state', 'type', 'kind', 'category', 'level']:
                if candidate in keys:
                    group_key = candidate
                    break

            if group_key:
                # Group by status field
                groups: dict[str, int] = {}
                for item in data:
                    status = str(item.get(group_key, 'unknown'))
                    groups[status] = groups.get(status, 0) + 1

                group_summary = ", ".join(
                    f"{k}: {v}" for k, v in sorted(groups.items())
                )
                
                # Get sample of important items (errors, failures, etc.)
                important = [
                    item for item in data
                    if any(
                        word in str(item.get(group_key, '')).lower()
                        for word in ['error', 'fail', 'critical', 'warn']
                    )
                ][:3]

                summary = f"{tool_name}: {count} items. By {group_key}: {group_summary}."
                
                if important:
                    important_str = json.dumps(important, default=str)
                    if self._count_tokens(important_str) < max_tokens // 2:
                        summary += f" Notable: {important_str}"
                
                return summary

            # No status field, show structure
            return (
                f"{tool_name}: {count} items. "
                f"Fields: {', '.join(keys[:10])}{'...' if len(keys) > 10 else ''}. "
                f"Sample: {json.dumps(data[0], default=str)[:200]}..."
            )

        # Simple list
        sample = data[:5]
        return f"{tool_name}: {count} items. Sample: {sample}"

    def _summarize_dict(
        self, data: dict[str, Any], tool_name: str, max_tokens: int
    ) -> str:
        """Summarize a dict result."""
        keys = list(data.keys())
        
        # Check for nested lists (common in API responses)
        list_keys = [k for k, v in data.items() if isinstance(v, list)]
        
        summary_parts = [f"{tool_name}: Object with {len(keys)} properties."]
        
        if list_keys:
            for lk in list_keys[:3]:
                summary_parts.append(f"{lk}: {len(data[lk])} items")
        
        summary_parts.append(f"Keys: {', '.join(keys[:15])}{'...' if len(keys) > 15 else ''}")
        
        return " ".join(summary_parts)

    def _summarize_string(
        self, data: str, tool_name: str, max_tokens: int
    ) -> str:
        """Summarize a string result."""
        char_count = len(data)
        line_count = data.count('\n') + 1
        
        # Extract first meaningful lines
        lines = [l.strip() for l in data.split('\n') if l.strip()][:5]
        preview = " | ".join(lines)[:200]
        
        return (
            f"{tool_name}: {char_count} chars, {line_count} lines. "
            f"Preview: {preview}..."
        )

    def get_stats(self) -> dict:
        """Get registry statistics."""
        total_tokens_saved = sum(
            entry.get("original_tokens", 0)
            for entry in self._registry.values()
        )
        
        return {
            "files": len(self._registry),
            "total_tokens_externalized": total_tokens_saved,
            "temp_dir": str(self.temp_dir),
        }
