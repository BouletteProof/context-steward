"""
Text Optimizer - Core optimization engine for Python.

Reduces token count through:
- Filler word removal
- Phrase simplification
- Redundancy elimination
- Smart truncation
"""

import re
from typing import Optional

try:
    import tiktoken
    HAS_TIKTOKEN = True
except ImportError:
    HAS_TIKTOKEN = False

from .types import OptimizeParams, OptimizationResult, OptimizationStrategy


# Default filler words to remove
FILLER_WORDS = [
    "very", "really", "quite", "rather", "somewhat", "fairly", "pretty",
    "just", "simply", "basically", "essentially", "generally", "typically",
    "obviously", "clearly", "certainly", "definitely", "absolutely",
    "completely", "totally", "entirely", "wholly", "actually", "literally"
]

# Phrase simplifications
PHRASE_REPLACEMENTS = [
    (r"in order to", "to"),
    (r"due to the fact that", "because"),
    (r"for the purpose of", "for"),
    (r"in the event that", "if"),
    (r"at this point in time", "now"),
    (r"in the near future", "soon"),
    (r"a large number of", "many"),
    (r"a small number of", "few"),
    (r"it should be noted that", ""),
    (r"it is important to note that", ""),
    (r"please be aware that", ""),
    (r"i would like to", "I'd like to"),
    (r"please kindly", "please"),
    (r"could you please", "please"),
    (r"would you be able to", "can you"),
    (r"i was wondering if", "can"),
    (r"as a matter of fact", ""),
    (r"at the present time", "now"),
    (r"despite the fact that", "although"),
    (r"in spite of the fact that", "although"),
    (r"has the ability to", "can"),
    (r"is able to", "can"),
    (r"make a decision", "decide"),
    (r"take into consideration", "consider"),
    (r"come to the conclusion", "conclude"),
    (r"give an explanation", "explain"),
]

# Aggressive-only patterns
AGGRESSIVE_REPLACEMENTS = [
    (r"\b(a|an|the)\s+(?=\w)", ""),
    (r",\s*which\s+", " that "),
]

# Transition words to remove in aggressive mode
TRANSITION_WORDS = [
    "however", "moreover", "furthermore", "additionally", "consequently",
    "therefore", "thus", "hence", "accordingly", "meanwhile", "nevertheless",
    "nonetheless", "alternatively", "specifically", "particularly"
]


class TextOptimizer:
    """Text optimization engine."""

    def __init__(
        self,
        preserve_terms: Optional[list[str]] = None,
        model: str = "gpt-4"
    ):
        self.preserve_terms = preserve_terms or []
        self.model = model
        self._encoder = None

    def _get_encoder(self):
        """Get or create tiktoken encoder."""
        if self._encoder is None and HAS_TIKTOKEN:
            try:
                self._encoder = tiktoken.encoding_for_model(self.model)
            except KeyError:
                self._encoder = tiktoken.get_encoding("cl100k_base")
        return self._encoder

    def count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        encoder = self._get_encoder()
        if encoder:
            return len(encoder.encode(text))
        # Fallback: rough estimate
        return len(text) // 4

    def optimize(self, params: OptimizeParams) -> OptimizationResult:
        """Optimize text to reduce token count."""
        text = params.text
        strategy = params.strategy or OptimizationStrategy.BALANCED
        all_preserve_terms = list(set(self.preserve_terms + params.preserve_terms))
        
        original_tokens = self.count_tokens(text)
        techniques_applied = []

        # Apply strategy-based optimization
        if strategy == OptimizationStrategy.CONSERVATIVE:
            optimized = self._conservative_optimization(text, all_preserve_terms)
            techniques_applied = ["whitespace_cleanup", "minimal_filler_removal"]
        elif strategy == OptimizationStrategy.AGGRESSIVE:
            optimized = self._aggressive_optimization(text, all_preserve_terms)
            techniques_applied = ["filler_removal", "phrase_simplification", "article_removal", "transition_removal"]
        else:  # balanced
            optimized = self._balanced_optimization(text, all_preserve_terms)
            techniques_applied = ["filler_removal", "phrase_simplification"]

        # Truncate if max_tokens specified
        if params.max_tokens:
            current_tokens = self.count_tokens(optimized)
            if current_tokens > params.max_tokens:
                optimized = self._truncate_to_token_limit(optimized, params.max_tokens, all_preserve_terms)
                techniques_applied.append("truncation")

        # Preserve formatting if requested
        if params.preserve_formatting:
            optimized = self._preserve_basic_formatting(optimized, text)

        # Ensure preserved terms
        optimized = self._ensure_preserved_terms(optimized, text, all_preserve_terms)

        optimized_tokens = self.count_tokens(optimized)
        reduction_ratio = 1 - (optimized_tokens / original_tokens) if original_tokens > 0 else 0

        return OptimizationResult(
            original_text=text,
            optimized_text=optimized,
            original_tokens=original_tokens,
            optimized_tokens=optimized_tokens,
            reduction_ratio=reduction_ratio,
            strategy=strategy,
            preserved_terms=all_preserve_terms,
            techniques_applied=techniques_applied
        )

    def _conservative_optimization(self, text: str, preserve_terms: list[str]) -> str:
        """Minimal changes, safe for all content."""
        optimized = text
        
        # Remove extra whitespace only
        optimized = " ".join(optimized.split())
        
        # Remove only the most redundant words
        for word in ["very", "really", "quite", "rather"]:
            optimized = re.sub(rf"\b{word}\s+", "", optimized, flags=re.IGNORECASE)
        
        return optimized

    def _balanced_optimization(self, text: str, preserve_terms: list[str]) -> str:
        """Good reduction while maintaining readability."""
        optimized = text
        
        # Remove filler words
        for word in FILLER_WORDS:
            optimized = re.sub(rf"\b{word}\s+", "", optimized, flags=re.IGNORECASE)
        
        # Apply phrase simplifications
        for pattern, replacement in PHRASE_REPLACEMENTS:
            optimized = re.sub(pattern, replacement, optimized, flags=re.IGNORECASE)
        
        # Clean up extra spaces
        optimized = " ".join(optimized.split())
        
        return optimized

    def _aggressive_optimization(self, text: str, preserve_terms: list[str]) -> str:
        """Maximum reduction, may affect style."""
        optimized = self._balanced_optimization(text, preserve_terms)
        
        # Apply aggressive patterns
        for pattern, replacement in AGGRESSIVE_REPLACEMENTS:
            optimized = re.sub(pattern, replacement, optimized, flags=re.IGNORECASE)
        
        # Remove transition words
        for word in TRANSITION_WORDS:
            optimized = re.sub(rf"\b{word},?\s*", "", optimized, flags=re.IGNORECASE)
        
        # Abbreviate common phrases
        abbreviations = [
            (r"for example", "e.g."),
            (r"that is", "i.e."),
            (r"and so forth", "etc."),
            (r"with respect to", "re:"),
        ]
        for pattern, replacement in abbreviations:
            optimized = re.sub(pattern, replacement, optimized, flags=re.IGNORECASE)
        
        # Clean up
        optimized = " ".join(optimized.split())
        optimized = re.sub(r"\s*,\s*", ", ", optimized)
        optimized = re.sub(r"\s*\.\s*", ". ", optimized)
        
        return optimized.strip()

    def _truncate_to_token_limit(
        self, text: str, token_limit: int, preserve_terms: list[str]
    ) -> str:
        """Truncate text to fit token limit, prioritizing preserved terms."""
        sentences = re.split(r"(?<=[.!?])\s+", text)
        
        with_terms = []
        without_terms = []
        
        for sentence in sentences:
            has_term = any(
                term.lower() in sentence.lower() for term in preserve_terms
            )
            if has_term:
                with_terms.append(sentence)
            else:
                without_terms.append(sentence)
        
        result = ""
        current_tokens = 0
        
        for sentence in with_terms + without_terms:
            sentence_tokens = self.count_tokens(sentence)
            if current_tokens + sentence_tokens <= token_limit:
                result += (" " if result else "") + sentence
                current_tokens += sentence_tokens
            else:
                break
        
        return result or text[:token_limit * 4]

    def _preserve_basic_formatting(self, optimized: str, original: str) -> str:
        """Preserve paragraph breaks from original."""
        paragraphs = original.split("\n\n")
        if len(paragraphs) > 1:
            sentences = re.split(r"(?<=[.!?])\s+", optimized)
            sentences_per_para = max(1, len(sentences) // len(paragraphs))
            
            formatted = ""
            for i in range(0, len(sentences), sentences_per_para):
                para_sentences = sentences[i:i + sentences_per_para]
                formatted += " ".join(para_sentences) + "\n\n"
            
            return formatted.strip()
        
        return optimized

    def _ensure_preserved_terms(
        self, optimized: str, original: str, preserve_terms: list[str]
    ) -> str:
        """Ensure preserved terms weren't accidentally removed."""
        result = optimized
        
        for term in preserve_terms:
            pattern = re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)
            if pattern.search(original) and not pattern.search(result):
                result += f" (Note: {term})"
        
        return result


# Patch: Add cleanup method to fix edge cases
def _cleanup_artifacts(text: str) -> str:
    """Clean up artifacts from optimization."""
    import re
    
    # Fix orphaned punctuation
    text = re.sub(r',\s*,', ',', text)
    text = re.sub(r'\s+,', ',', text)
    text = re.sub(r',\s+\.', '.', text)
    
    # Fix double spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Fix "i. e." -> "i.e."
    text = re.sub(r'i\.\s*e\.', 'i.e.', text)
    text = re.sub(r'e\.\s*g\.', 'e.g.', text)
    
    # Fix sentence start after removal
    text = re.sub(r'\.\s+([a-z])', lambda m: '. ' + m.group(1).upper(), text)
    
    # Fix double verbs from pattern overlap
    text = re.sub(r'\bcan you could\b', 'could you', text, flags=re.IGNORECASE)
    text = re.sub(r'\bcan you please\b', 'please', text, flags=re.IGNORECASE)
    
    return text.strip()

# Monkey-patch into the class
TextOptimizer._cleanup_artifacts = staticmethod(_cleanup_artifacts)
_original_optimize = TextOptimizer.optimize

def _patched_optimize(self, params):
    result = _original_optimize(self, params)
    result.optimized_text = _cleanup_artifacts(result.optimized_text)
    result.optimized_tokens = self.count_tokens(result.optimized_text)
    result.reduction_ratio = 1 - (result.optimized_tokens / result.original_tokens) if result.original_tokens > 0 else 0
    return result

TextOptimizer.optimize = _patched_optimize
