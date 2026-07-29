from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACCEPTANCE = ROOT / "scripts" / "accept" / "0007-reuse-first-engineering.sh"


def run_acceptance(agent_map: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["sh", str(ACCEPTANCE)],
        cwd=ROOT,
        env={**os.environ, "REUSE_FIRST_AGENT_MAP": str(agent_map)},
        text=True,
        capture_output=True,
        check=False,
    )


def test_reuse_first_assignment_contract_accepts_the_canonical_map() -> None:
    result = run_acceptance(ROOT / "AGENTS.md")

    assert result.returncode == 0, result.stderr
    assert "all reuse-first delegation clauses are present" in result.stdout


def test_reuse_first_assignment_contract_rejects_a_removed_clause(tmp_path: Path) -> None:
    agent_map = (ROOT / "AGENTS.md").read_text()
    incomplete = agent_map.replace(
        "Work like a lazy senior engineer",
        "Work with unspecified implementation posture",
    )
    fixture = tmp_path / "AGENTS.md"
    fixture.write_text(incomplete)

    result = run_acceptance(fixture)

    assert result.returncode != 0
    assert "required delegation clause is missing" in result.stderr
