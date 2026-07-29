"""Inventory realization resolution tracer.

Stable interfaces (design spec 0001): `normalize_theory` and `run_demo`.
"""

from semantic_tracer.demo import DemoResult, run_demo
from semantic_tracer.theory import Theory, normalize_theory

__all__ = [
    "DemoResult",
    "Theory",
    "normalize_theory",
    "run_demo",
]
