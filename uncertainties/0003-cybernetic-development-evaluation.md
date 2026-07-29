# Uncertainty 0003: cybernetic development evaluation

## Current hypothesis

Semantic Systems can model both its development process and recursive runtime
components as explicit controllers: goals provide reference signals,
observations provide feedback, gates compare observations with obligations,
and bounded actions change the system.

This may improve the project graph by making feedback latency, sensor coverage,
controller authority, disturbances, and unobserved state explicit without
collapsing semantic meaning into process metrics.

## Supporting evidence

- The project already separates claims, evidence, gates, assumptions, work,
  runtime, observation, and responsibility.
- Tracer bullets define falsifiable reference behavior and feedback.
- Independent checking reduces correlated observation paths.
- Components are already treated as recursive open systems.
- Current agent work exposes real delays, noisy summaries, shared-state
  disturbances, and possible self-validation.

These are project observations, not yet evidence for any particular
cybernetic theory.

## Counterevidence and risks

- Control-system metaphors can erase agency, interpretation, and semantic
  disagreement.
- Good regulator, requisite variety, viable-system, and perceptual-control
  results have different hypotheses and should not be blended casually.
- Optimizing measured throughput or gate pass rate can damage semantic learning.
- Delayed high-gain correction can cause rework and oscillation.
- Multiple correlated sensors can look independent while sharing one defect.
- A graph rich enough to describe a controller may still be unable to predict
  its behavior.

## Downstream work that depends on it

- development feedback-loop design and evaluation;
- agent orchestration and autonomy boundaries;
- explanation and observability;
- runtime component recursion;
- evidence-policy design;
- resource and concurrency control;
- generated work and operational views.

## Resolving experiment

For three completed features, record:

- contract-to-first-signal and signal-to-correction latency;
- every sensor and the failure modes it observes;
- shared dependencies between sensors;
- disturbances and recovery actions;
- false acceptance, false rejection, and escaped falsifiers;
- rework cycles and metric-gaming opportunities.

Compare a plain checklist view with a controller view. The cybernetic model is
useful only if it predicts or exposes at least one actionable failure mode that
the checklist misses without hiding evidence categories or human authority.

Kill or narrow the model if it merely renames existing workflow concepts,
encourages metric optimization, or requires one universal controller for
semantically distinct systems.
