"""Inventory realization resolution tracer.

Stable interfaces (design spec 0001): `normalize_theory` and `run_demo`.

`run_demo`/`DemoResult` are re-exported lazily (PEP 562) rather than
imported eagerly here: `demo.py` pulls in the conformance runner and
operation registry, and Python always executes a package's `__init__.py`
before any of its submodules, so an eager import here would make merely
`import semantic_tracer.resolver` or `import semantic_tracer.checker`
transitively load the conformance runner -- exactly what design spec 0003
forbids those two modules from doing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from semantic_tracer.theory import Theory, normalize_theory

if TYPE_CHECKING:
    from semantic_tracer.demo import DemoResult, run_demo

__all__ = [
    "DemoResult",
    "Theory",
    "normalize_theory",
    "run_demo",
]

_LAZY = frozenset({"DemoResult", "run_demo"})


def __getattr__(name: str) -> Any:
    if name in _LAZY:
        from semantic_tracer import demo  # noqa: PLC0415 - deliberately lazy, see module docstring

        return getattr(demo, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
