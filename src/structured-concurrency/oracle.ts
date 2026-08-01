/** Total deterministic reference oracle for the finite task/scope algebra. */
import { compareCodePoints } from "../normalized-core/canonical.ts";
import {
  deepFreeze,
  structuredConcurrencyBounds,
  structuredConcurrencyFailure,
  type AuthoredTaskOutcome,
  type ScheduleDecision,
  type StructuredConcurrencyFailure,
  type StructuredConcurrencyObservation,
  type StructuredConcurrencyRun,
  type StructuredConcurrencyScopeReport,
  type StructuredConcurrencyScript,
  type StructuredConcurrencyTaskReport,
  type TaskHappensBefore,
  type TaskProgram,
  type TaskTerminalOutcome,
} from "./schema.ts";

interface OracleScope {
  readonly scope: string;
  readonly parent: string | null;
  state: "open" | "closed";
}

interface OracleTask {
  readonly task: string;
  readonly spawnScope: string;
  readonly program: TaskProgram;
  ownerScope: string | null;
  state: "suspended" | "terminal";
  nextStep: number;
  cancellationRequested: boolean;
  outcome: TaskTerminalOutcome | null;
}

const copyAuthoredOutcome = (outcome: AuthoredTaskOutcome): AuthoredTaskOutcome =>
  outcome.tag === "succeeded" ? { tag: "succeeded" } : { tag: "failed", message: outcome.message };

const copyTerminalOutcome = (outcome: TaskTerminalOutcome): TaskTerminalOutcome =>
  outcome.tag === "failed" ? { tag: "failed", message: outcome.message } : { tag: outcome.tag };

const sameOutcome = (left: TaskTerminalOutcome, right: TaskTerminalOutcome): boolean =>
  left.tag === right.tag &&
  (left.tag !== "failed" || (right.tag === "failed" && left.message === right.message));

export const runStructuredConcurrencyOracle = (
  script: StructuredConcurrencyScript,
): StructuredConcurrencyRun | StructuredConcurrencyFailure => {
  const scopes = new Map<string, OracleScope>([
    [script.root_scope, { scope: script.root_scope, parent: null, state: "open" }],
  ]);
  const tasks = new Map<string, OracleTask>();
  const observations: Array<StructuredConcurrencyObservation> = [];
  const schedule: Array<ScheduleDecision> = [];
  const happensBefore: Array<TaskHappensBefore> = [];
  const lastTaskEvent = new Map<string, number>();
  let totalYields = 0;

  const touchTask = (task: string, eventIndex: number): void => {
    const previous = lastTaskEvent.get(task);
    if (previous !== undefined && previous !== eventIndex) {
      happensBefore.push({
        task,
        before_event_index: previous,
        after_event_index: eventIndex,
      });
    }
    lastTaskEvent.set(task, eventIndex);
  };

  const requireTask = (
    taskId: string,
    eventIndex: number,
  ): OracleTask | StructuredConcurrencyFailure =>
    tasks.get(taskId) ??
    structuredConcurrencyFailure(
      "task.missing",
      eventIndex,
      `/events/${eventIndex}/task`,
      "task does not exist",
    );

  for (let eventIndex = 0; eventIndex < script.events.length; eventIndex += 1) {
    const event = script.events[eventIndex]!;
    switch (event.tag) {
      case "open_scope": {
        if (scopes.has(event.scope)) {
          return structuredConcurrencyFailure(
            "scope.identity-duplicate",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "scope identity was already used",
          );
        }
        const parent = scopes.get(event.parent);
        if (parent === undefined || parent.state !== "open") {
          return structuredConcurrencyFailure(
            "scope.parent-not-open",
            eventIndex,
            `/events/${eventIndex}/parent`,
            "parent scope does not exist or is closed",
          );
        }
        if (scopes.size >= structuredConcurrencyBounds.maximumScopes) {
          return structuredConcurrencyFailure(
            "scope.limit-exceeded",
            eventIndex,
            `/events/${eventIndex}`,
            "scope count exceeds the version-one bound",
          );
        }
        scopes.set(event.scope, { scope: event.scope, parent: event.parent, state: "open" });
        observations.push({
          tag: "scope-opened",
          event_index: eventIndex,
          scope: event.scope,
          parent: event.parent,
        });
        break;
      }
      case "spawn": {
        if (tasks.has(event.task)) {
          return structuredConcurrencyFailure(
            "task.identity-duplicate",
            eventIndex,
            `/events/${eventIndex}/task`,
            "task identity was already used",
          );
        }
        const scope = scopes.get(event.scope);
        if (scope === undefined || scope.state !== "open") {
          return structuredConcurrencyFailure(
            "scope.not-open",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "spawn scope does not exist or is closed",
          );
        }
        if (tasks.size >= structuredConcurrencyBounds.maximumTasks) {
          return structuredConcurrencyFailure(
            "task.limit-exceeded",
            eventIndex,
            `/events/${eventIndex}`,
            "task count exceeds the version-one bound",
          );
        }
        totalYields += event.program.yields.length;
        if (totalYields > structuredConcurrencyBounds.maximumYields) {
          return structuredConcurrencyFailure(
            "yield.limit-exceeded",
            eventIndex,
            `/events/${eventIndex}/program/yields`,
            "total authored yield count exceeds the version-one bound",
          );
        }
        tasks.set(event.task, {
          task: event.task,
          spawnScope: event.scope,
          ownerScope: event.scope,
          program: {
            yields: [...event.program.yields],
            terminal: copyAuthoredOutcome(event.program.terminal),
          },
          state: "suspended",
          nextStep: 0,
          cancellationRequested: false,
          outcome: null,
        });
        observations.push({
          tag: "task-spawned",
          event_index: eventIndex,
          task: event.task,
          scope: event.scope,
        });
        touchTask(event.task, eventIndex);
        break;
      }
      case "transfer": {
        const task = requireTask(event.task, eventIndex);
        if (task instanceof Error) return task;
        if (task.state !== "suspended" || task.ownerScope !== event.from_scope) {
          return structuredConcurrencyFailure(
            "task.owner-mismatch",
            eventIndex,
            `/events/${eventIndex}/from_scope`,
            "transfer source does not own a live task",
          );
        }
        if (event.from_scope === event.to_scope) {
          return structuredConcurrencyFailure(
            "task.transfer-same-scope",
            eventIndex,
            `/events/${eventIndex}/to_scope`,
            "transfer target must differ from source",
          );
        }
        const source = scopes.get(event.from_scope);
        const target = scopes.get(event.to_scope);
        if (source?.state !== "open" || target?.state !== "open") {
          return structuredConcurrencyFailure(
            "scope.transfer-not-open",
            eventIndex,
            `/events/${eventIndex}`,
            "transfer source and target scopes must both be open",
          );
        }
        task.ownerScope = target.scope;
        observations.push({
          tag: "task-transferred",
          event_index: eventIndex,
          task: task.task,
          from_scope: source.scope,
          to_scope: target.scope,
        });
        touchTask(task.task, eventIndex);
        break;
      }
      case "dispatch": {
        const task = requireTask(event.task, eventIndex);
        if (task instanceof Error) return task;
        if (task.state !== "suspended") {
          return structuredConcurrencyFailure(
            "task.already-terminal",
            eventIndex,
            `/events/${eventIndex}/task`,
            "cannot dispatch a terminal task",
          );
        }
        const stepIndex = task.nextStep;
        if (stepIndex < task.program.yields.length) {
          observations.push({
            tag: "task-yielded",
            event_index: eventIndex,
            task: task.task,
            yield_index: stepIndex,
            label: task.program.yields[stepIndex]!,
          });
          task.nextStep += 1;
          schedule.push({
            dispatch_index: schedule.length,
            event_index: eventIndex,
            task: task.task,
            step_index: stepIndex,
            result: "yielded",
          });
        } else {
          const outcome = copyAuthoredOutcome(task.program.terminal);
          task.nextStep += 1;
          task.state = "terminal";
          task.ownerScope = null;
          task.outcome = outcome;
          observations.push({
            tag: "task-settled",
            event_index: eventIndex,
            task: task.task,
            outcome,
          });
          schedule.push({
            dispatch_index: schedule.length,
            event_index: eventIndex,
            task: task.task,
            step_index: stepIndex,
            result: "settled",
          });
        }
        touchTask(task.task, eventIndex);
        break;
      }
      case "request_cancel": {
        const task = requireTask(event.task, eventIndex);
        if (task instanceof Error) return task;
        if (task.state !== "suspended") {
          return structuredConcurrencyFailure(
            "task.already-terminal",
            eventIndex,
            `/events/${eventIndex}/task`,
            "cannot request cancellation of a terminal task",
          );
        }
        const first = !task.cancellationRequested;
        task.cancellationRequested = true;
        observations.push({
          tag: "cancel-requested",
          event_index: eventIndex,
          task: task.task,
          source: "explicit",
          first_request: first,
        });
        touchTask(task.task, eventIndex);
        break;
      }
      case "deliver_cancel": {
        const task = requireTask(event.task, eventIndex);
        if (task instanceof Error) return task;
        if (task.state !== "suspended") {
          return structuredConcurrencyFailure(
            "task.already-terminal",
            eventIndex,
            `/events/${eventIndex}/task`,
            "cannot deliver cancellation to a terminal task",
          );
        }
        if (!task.cancellationRequested) {
          return structuredConcurrencyFailure(
            "cancel.not-requested",
            eventIndex,
            `/events/${eventIndex}/task`,
            "cancellation delivery requires a prior request",
          );
        }
        const outcome = { tag: "cancelled" } as const;
        task.state = "terminal";
        task.ownerScope = null;
        task.outcome = outcome;
        observations.push({
          tag: "task-settled",
          event_index: eventIndex,
          task: task.task,
          outcome,
        });
        touchTask(task.task, eventIndex);
        break;
      }
      case "join": {
        const task = requireTask(event.task, eventIndex);
        if (task instanceof Error) return task;
        observations.push(
          task.outcome === null
            ? { tag: "join-blocked", event_index: eventIndex, task: task.task }
            : {
                tag: "join-observed",
                event_index: eventIndex,
                task: task.task,
                outcome: copyTerminalOutcome(task.outcome),
              },
        );
        touchTask(task.task, eventIndex);
        break;
      }
      case "exit_scope": {
        const scope = scopes.get(event.scope);
        if (scope === undefined || scope.state !== "open") {
          return structuredConcurrencyFailure(
            "scope.not-open",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "scope does not exist or is already closed",
          );
        }
        const openChildren = [...scopes.values()]
          .filter((candidate) => candidate.parent === scope.scope && candidate.state === "open")
          .map((candidate) => candidate.scope)
          .sort(compareCodePoints);
        const liveTasks = [...tasks.values()]
          .filter(
            (candidate) => candidate.ownerScope === scope.scope && candidate.state === "suspended",
          )
          .sort((left, right) => compareCodePoints(left.task, right.task));
        for (const task of liveTasks) {
          const first = !task.cancellationRequested;
          task.cancellationRequested = true;
          observations.push({
            tag: "cancel-requested",
            event_index: eventIndex,
            task: task.task,
            source: "scope-exit",
            first_request: first,
          });
          touchTask(task.task, eventIndex);
        }
        const blocked = openChildren.length > 0 || liveTasks.length > 0;
        if (!blocked) scope.state = "closed";
        observations.push({
          tag: "scope-exit",
          event_index: eventIndex,
          scope: scope.scope,
          result: blocked ? "blocked" : "closed",
          open_children: openChildren,
          live_tasks: liveTasks.map((task) => task.task),
        });
        break;
      }
    }
  }

  const scopeReports: Array<StructuredConcurrencyScopeReport> = [...scopes.values()]
    .sort((left, right) => compareCodePoints(left.scope, right.scope))
    .map((scope) => ({ scope: scope.scope, parent: scope.parent, state: scope.state }));
  const taskReports: Array<StructuredConcurrencyTaskReport> = [...tasks.values()]
    .sort((left, right) => compareCodePoints(left.task, right.task))
    .map((task) => ({
      task: task.task,
      spawn_scope: task.spawnScope,
      owner_scope: task.ownerScope,
      state: task.state,
      next_step: task.nextStep,
      cancellation_requested: task.cancellationRequested,
      outcome: task.outcome === null ? null : copyTerminalOutcome(task.outcome),
    }));
  const joinObservations = observations.filter(
    (
      observation,
    ): observation is Extract<StructuredConcurrencyObservation, { tag: "join-observed" }> =>
      observation.tag === "join-observed",
  );
  const requests = observations.filter(
    (
      observation,
    ): observation is Extract<StructuredConcurrencyObservation, { tag: "cancel-requested" }> =>
      observation.tag === "cancel-requested",
  );
  const dispatches = script.events.filter((event) => event.tag === "dispatch");
  const run: StructuredConcurrencyRun = {
    observations,
    scopes: scopeReports,
    tasks: taskReports,
    schedule,
    happens_before: happensBefore,
    laws: {
      singular_ownership: taskReports.every((task) =>
        task.state === "terminal"
          ? task.owner_scope === null && task.outcome !== null
          : task.owner_scope !== null && scopes.get(task.owner_scope)?.state === "open",
      ),
      scope_exit_waits: observations.every(
        (observation) =>
          observation.tag !== "scope-exit" ||
          (observation.result === "closed"
            ? observation.open_children.length === 0 && observation.live_tasks.length === 0
            : observation.open_children.length > 0 || observation.live_tasks.length > 0),
      ),
      stable_terminal_join: joinObservations.every((join) => {
        const outcome = tasks.get(join.task)?.outcome;
        return outcome !== null && outcome !== undefined && sameOutcome(join.outcome, outcome);
      }),
      idempotent_cancel_request: taskReports.every(
        (task) =>
          requests.filter((request) => request.task === task.task && request.first_request)
            .length <= 1,
      ),
      one_shot_dispatch:
        dispatches.length === schedule.length &&
        schedule.every(
          (decision, index) =>
            decision.dispatch_index === index &&
            schedule
              .slice(0, index)
              .filter((earlier) => earlier.task === decision.task)
              .every((earlier) => earlier.step_index < decision.step_index),
        ),
    },
  };
  return deepFreeze(run);
};
