"""
Basic Example - Context Steward (Python)

Demonstrates text optimization with different strategies
"""

from context_steward import ContextSteward, OptimizeParams, OptimizationStrategy

def main():
    # Initialize with default settings
    steward = ContextSteward()

    # Example verbose text
    verbose_text = """
    I would really appreciate it if you could please help me to understand 
    in detail how to properly implement a REST API that is designed to be 
    very performant and highly scalable. It should be noted that I am 
    basically a beginner and would definitely need a comprehensive explanation. 
    In order to achieve this, I was wondering if you could provide some 
    really good examples that clearly demonstrate the various best practices.
    Additionally, I would like to know how to handle errors in a way that 
    is essentially robust and provides helpful feedback to users.
    """

    print("=== Context Steward Demo ===\n")

    # Test different strategies
    strategies = [
        OptimizationStrategy.CONSERVATIVE,
        OptimizationStrategy.BALANCED,
        OptimizationStrategy.AGGRESSIVE,
    ]

    for strategy in strategies:
        result = steward.optimize(OptimizeParams(
            text=verbose_text,
            strategy=strategy,
            preserve_terms=["REST API", "errors"]
        ))

        print(f"Strategy: {strategy.value.upper()}")
        print(f"Original tokens: {result.original_tokens}")
        print(f"Optimized tokens: {result.optimized_tokens}")
        print(f"Reduction: {result.reduction_ratio:.1%}")
        print(f"Techniques: {', '.join(result.techniques_applied)}")
        print(f"Result: {result.optimized_text[:100]}...")
        print("---\n")

    # Show telemetry
    stats = steward.get_stats()
    print("=== Telemetry ===")
    print(f"Total requests: {stats.total_requests}")
    print(f"Tokens saved: {stats.tokens_saved}")
    print(f"Overall reduction: {stats.reduction_percent}%")
    print(f"Estimated cost saved: {stats.estimated_cost_saved}")


if __name__ == "__main__":
    main()
