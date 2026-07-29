.PHONY: validate generate report test check

validate:
	PYTHONPATH=src python -m semantic_project_model validate

generate:
	PYTHONPATH=src python -m semantic_project_model generate

report:
	PYTHONPATH=src python -m semantic_project_model report

test:
	PYTHONPATH=src pytest

check:
	./scripts/check.sh
