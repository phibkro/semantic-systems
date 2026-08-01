/** Thin independent Effect v4 realization of the bounded task/scope script. */
import { Deferred, Effect, Exit, Fiber, FiberSet, Option, Queue, Ref, type Scope } from "effect";
import { compareCodePoints } from "../normalized-core/canonical.ts";
import {
  deepFreeze,
  structuredConcurrencyBounds,
  structuredConcurrencyFailure,
  type AuthoredTaskOutcome,
  type ScheduleDecision,
  type StructuredConcurrencyEvent,
  type StructuredConcurrencyFailure,
  type StructuredConcurrencyObservation,
  type StructuredConcurrencyRun,
  type StructuredConcurrencyScript,
  type TaskHappensBefore,
  type TaskProgram,
  type TaskTerminalOutcome,
} from "./schema.ts";

interface AdapterScope {
  readonly scope: string;
  readonly parent: string | null;
  state: "open" | "closed";
}

interface AdapterTask {
  readonly task: string;
  readonly spawnScope: string;
  readonly program: TaskProgram;
  ownerScope: string | null;
  state: "suspended" | "terminal";
  nextStep: number;
  cancellationRequested: boolean;
  outcome: TaskTerminalOutcome | null;
}

class AdapterTaskFailed extends Error {
  readonly _tag = "AdapterTaskFailed";
}
class AdapterTaskCancelled extends Error {
  readonly _tag = "AdapterTaskCancelled";
}
type AdapterTaskExit = Exit.Exit<void, AdapterTaskFailed | AdapterTaskCancelled>;

interface AdapterTaskRuntime {
  readonly terminal: Deferred.Deferred<AdapterTaskExit>;
}

interface AdapterWorld {
  readonly scopes: Map<string, AdapterScope>;
  readonly tasks: Map<string, AdapterTask>;
  readonly runtimes: Map<string, AdapterTaskRuntime>;
  readonly observations: Array<StructuredConcurrencyObservation>;
  readonly schedule: Array<ScheduleDecision>;
  readonly happensBefore: Array<TaskHappensBefore>;
  readonly lastTaskEvent: Map<string, number>;
  totalYields: number;
}

interface DriverEnvelope {
  readonly eventIndex: number;
  readonly event: StructuredConcurrencyEvent;
  readonly acknowledgement: Deferred.Deferred<void, StructuredConcurrencyFailure>;
}

const copyAuthoredOutcome = (outcome: AuthoredTaskOutcome): AuthoredTaskOutcome =>
  outcome.tag === "succeeded" ? { tag: "succeeded" } : { tag: "failed", message: outcome.message };

const copyTerminalOutcome = (outcome: TaskTerminalOutcome): TaskTerminalOutcome =>
  outcome.tag === "failed" ? { tag: "failed", message: outcome.message } : { tag: outcome.tag };

const sameOutcome = (left: TaskTerminalOutcome, right: TaskTerminalOutcome): boolean =>
  left.tag === right.tag &&
  (left.tag !== "failed" || (right.tag === "failed" && left.message === right.message));

const taskExit = (outcome: TaskTerminalOutcome): AdapterTaskExit => {
  switch (outcome.tag) {
    case "succeeded":
      return Exit.succeed(undefined);
    case "failed":
      return Exit.fail(new AdapterTaskFailed(outcome.message));
    case "cancelled":
      return Exit.fail(new AdapterTaskCancelled("script cancellation was delivered"));
  }
};

const touchTask = (world: AdapterWorld, task: string, eventIndex: number): void => {
  const previous = world.lastTaskEvent.get(task);
  if (previous !== undefined && previous !== eventIndex) {
    world.happensBefore.push({
      task,
      before_event_index: previous,
      after_event_index: eventIndex,
    });
  }
  world.lastTaskEvent.set(task, eventIndex);
};

const missingTask = (eventIndex: number): StructuredConcurrencyFailure =>
  structuredConcurrencyFailure(
    "task.missing",
    eventIndex,
    `/events/${eventIndex}/task`,
    "task does not exist",
  );

const applyAdapterEvent = (
  world: AdapterWorld,
  taskFibers: FiberSet.FiberSet<AdapterTaskExit>,
  event: StructuredConcurrencyEvent,
  eventIndex: number,
): Effect.Effect<StructuredConcurrencyFailure | null> =>
  Effect.gen(function* () {
    switch (event.tag) {
      case "open_scope": {
        if (world.scopes.has(event.scope)) {
          return structuredConcurrencyFailure(
            "scope.identity-duplicate",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "scope identity was already used",
          );
        }
        const parent = world.scopes.get(event.parent);
        if (parent === undefined || parent.state !== "open") {
          return structuredConcurrencyFailure(
            "scope.parent-not-open",
            eventIndex,
            `/events/${eventIndex}/parent`,
            "parent scope does not exist or is closed",
          );
        }
        if (world.scopes.size >= structuredConcurrencyBounds.maximumScopes) {
          return structuredConcurrencyFailure(
            "scope.limit-exceeded",
            eventIndex,
            `/events/${eventIndex}`,
            "scope count exceeds the version-one bound",
          );
        }
        world.scopes.set(event.scope, {
          scope: event.scope,
          parent: event.parent,
          state: "open",
        });
        world.observations.push({
          tag: "scope-opened",
          event_index: eventIndex,
          scope: event.scope,
          parent: event.parent,
        });
        return null;
      }
      case "spawn": {
        if (world.tasks.has(event.task)) {
          return structuredConcurrencyFailure(
            "task.identity-duplicate",
            eventIndex,
            `/events/${eventIndex}/task`,
            "task identity was already used",
          );
        }
        const scope = world.scopes.get(event.scope);
        if (scope === undefined || scope.state !== "open") {
          return structuredConcurrencyFailure(
            "scope.not-open",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "spawn scope does not exist or is closed",
          );
        }
        if (world.tasks.size >= structuredConcurrencyBounds.maximumTasks) {
          return structuredConcurrencyFailure(
            "task.limit-exceeded",
            eventIndex,
            `/events/${eventIndex}`,
            "task count exceeds the version-one bound",
          );
        }
        world.totalYields += event.program.yields.length;
        if (world.totalYields > structuredConcurrencyBounds.maximumYields) {
          return structuredConcurrencyFailure(
            "yield.limit-exceeded",
            eventIndex,
            `/events/${eventIndex}/program/yields`,
            "total authored yield count exceeds the version-one bound",
          );
        }
        const terminal = yield* Deferred.make<AdapterTaskExit>();
        yield* FiberSet.run(taskFibers, Deferred.await(terminal));
        world.runtimes.set(event.task, { terminal });
        world.tasks.set(event.task, {
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
        world.observations.push({
          tag: "task-spawned",
          event_index: eventIndex,
          task: event.task,
          scope: event.scope,
        });
        touchTask(world, event.task, eventIndex);
        return null;
      }
      case "transfer": {
        const task = world.tasks.get(event.task);
        if (task === undefined) return missingTask(eventIndex);
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
        const source = world.scopes.get(event.from_scope);
        const target = world.scopes.get(event.to_scope);
        if (source?.state !== "open" || target?.state !== "open") {
          return structuredConcurrencyFailure(
            "scope.transfer-not-open",
            eventIndex,
            `/events/${eventIndex}`,
            "transfer source and target scopes must both be open",
          );
        }
        task.ownerScope = null;
        task.ownerScope = target.scope;
        world.observations.push({
          tag: "task-transferred",
          event_index: eventIndex,
          task: task.task,
          from_scope: source.scope,
          to_scope: target.scope,
        });
        touchTask(world, task.task, eventIndex);
        return null;
      }
      case "dispatch": {
        const task = world.tasks.get(event.task);
        if (task === undefined) return missingTask(eventIndex);
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
          world.observations.push({
            tag: "task-yielded",
            event_index: eventIndex,
            task: task.task,
            yield_index: stepIndex,
            label: task.program.yields[stepIndex]!,
          });
          task.nextStep += 1;
          world.schedule.push({
            dispatch_index: world.schedule.length,
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
          world.observations.push({
            tag: "task-settled",
            event_index: eventIndex,
            task: task.task,
            outcome,
          });
          yield* Deferred.succeed(world.runtimes.get(task.task)!.terminal, taskExit(outcome));
        }
        world.schedule.push(
          ...(world.schedule.at(-1)?.event_index === eventIndex
            ? []
            : [
                {
                  dispatch_index: world.schedule.length,
                  event_index: eventIndex,
                  task: task.task,
                  step_index: stepIndex,
                  result: "settled" as const,
                },
              ]),
        );
        touchTask(world, task.task, eventIndex);
        return null;
      }
      case "request_cancel": {
        const task = world.tasks.get(event.task);
        if (task === undefined) return missingTask(eventIndex);
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
        world.observations.push({
          tag: "cancel-requested",
          event_index: eventIndex,
          task: task.task,
          source: "explicit",
          first_request: first,
        });
        touchTask(world, task.task, eventIndex);
        return null;
      }
      case "deliver_cancel": {
        const task = world.tasks.get(event.task);
        if (task === undefined) return missingTask(eventIndex);
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
        world.observations.push({
          tag: "task-settled",
          event_index: eventIndex,
          task: task.task,
          outcome,
        });
        yield* Deferred.succeed(world.runtimes.get(task.task)!.terminal, taskExit(outcome));
        touchTask(world, task.task, eventIndex);
        return null;
      }
      case "join": {
        const task = world.tasks.get(event.task);
        if (task === undefined) return missingTask(eventIndex);
        const runtime = world.runtimes.get(task.task)!;
        const polled: Option.Option<Effect.Effect<AdapterTaskExit>> = yield* Deferred.poll(
          runtime.terminal,
        );
        if (Option.isNone(polled)) {
          world.observations.push({
            tag: "join-blocked",
            event_index: eventIndex,
            task: task.task,
          });
        } else {
          const observedExit = yield* polled.value;
          if (
            task.outcome === null ||
            Exit.isSuccess(observedExit) !== Exit.isSuccess(taskExit(task.outcome))
          ) {
            return structuredConcurrencyFailure(
              "adapter.terminal-mismatch",
              eventIndex,
              `/events/${eventIndex}/task`,
              "Effect terminal gate disagrees with the task ledger",
            );
          }
          world.observations.push({
            tag: "join-observed",
            event_index: eventIndex,
            task: task.task,
            outcome: copyTerminalOutcome(task.outcome),
          });
        }
        touchTask(world, task.task, eventIndex);
        return null;
      }
      case "exit_scope": {
        const scope = world.scopes.get(event.scope);
        if (scope === undefined || scope.state !== "open") {
          return structuredConcurrencyFailure(
            "scope.not-open",
            eventIndex,
            `/events/${eventIndex}/scope`,
            "scope does not exist or is already closed",
          );
        }
        const openChildren = [...world.scopes.values()]
          .filter((candidate) => candidate.parent === scope.scope && candidate.state === "open")
          .map((candidate) => candidate.scope)
          .sort(compareCodePoints);
        const liveTasks = [...world.tasks.values()]
          .filter(
            (candidate) => candidate.ownerScope === scope.scope && candidate.state === "suspended",
          )
          .sort((left, right) => compareCodePoints(left.task, right.task));
        for (const task of liveTasks) {
          const first = !task.cancellationRequested;
          task.cancellationRequested = true;
          world.observations.push({
            tag: "cancel-requested",
            event_index: eventIndex,
            task: task.task,
            source: "scope-exit",
            first_request: first,
          });
          touchTask(world, task.task, eventIndex);
        }
        const blocked = openChildren.length > 0 || liveTasks.length > 0;
        if (!blocked) scope.state = "closed";
        world.observations.push({
          tag: "scope-exit",
          event_index: eventIndex,
          scope: scope.scope,
          result: blocked ? "blocked" : "closed",
          open_children: openChildren,
          live_tasks: liveTasks.map((task) => task.task),
        });
        return null;
      }
    }
  });

const projectRun = (world: AdapterWorld): StructuredConcurrencyRun => {
  const scopes = [...world.scopes.values()]
    .sort((left, right) => compareCodePoints(left.scope, right.scope))
    .map((scope) => ({ scope: scope.scope, parent: scope.parent, state: scope.state }));
  const tasks = [...world.tasks.values()]
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
  const joinObservations = world.observations.filter(
    (
      observation,
    ): observation is Extract<StructuredConcurrencyObservation, { tag: "join-observed" }> =>
      observation.tag === "join-observed",
  );
  const requests = world.observations.filter(
    (
      observation,
    ): observation is Extract<StructuredConcurrencyObservation, { tag: "cancel-requested" }> =>
      observation.tag === "cancel-requested",
  );
  return deepFreeze({
    observations: world.observations,
    scopes,
    tasks,
    schedule: world.schedule,
    happens_before: world.happensBefore,
    laws: {
      singular_ownership: tasks.every((task) =>
        task.state === "terminal"
          ? task.owner_scope === null && task.outcome !== null
          : task.owner_scope !== null && world.scopes.get(task.owner_scope)?.state === "open",
      ),
      scope_exit_waits: world.observations.every(
        (observation) =>
          observation.tag !== "scope-exit" ||
          (observation.result === "closed"
            ? observation.open_children.length === 0 && observation.live_tasks.length === 0
            : observation.open_children.length > 0 || observation.live_tasks.length > 0),
      ),
      stable_terminal_join: joinObservations.every((join) => {
        const outcome = world.tasks.get(join.task)?.outcome;
        return outcome !== null && outcome !== undefined && sameOutcome(join.outcome, outcome);
      }),
      idempotent_cancel_request: tasks.every(
        (task) =>
          requests.filter((request) => request.task === task.task && request.first_request)
            .length <= 1,
      ),
      one_shot_dispatch: world.schedule.every(
        (decision, index) =>
          decision.dispatch_index === index &&
          world.schedule
            .slice(0, index)
            .filter((earlier) => earlier.task === decision.task)
            .every((earlier) => earlier.step_index < decision.step_index),
      ),
    },
  });
};

export const runStructuredConcurrencyEffect = (
  script: StructuredConcurrencyScript,
): Effect.Effect<StructuredConcurrencyRun, StructuredConcurrencyFailure> =>
  Effect.scoped(
    Effect.gen(function* () {
      // Force the exact Scope module into the adapter boundary; FiberSet is
      // still the sole owner of task fibers within this ambient scope.
      const adapterScope: Scope.Scope = yield* Effect.scope;
      void adapterScope;
      const taskFibers = yield* FiberSet.make<AdapterTaskExit>();
      const queue = yield* Queue.bounded<DriverEnvelope>(1);
      const worldRef = yield* Ref.make<AdapterWorld>({
        scopes: new Map([
          [script.root_scope, { scope: script.root_scope, parent: null, state: "open" }],
        ]),
        tasks: new Map(),
        runtimes: new Map(),
        observations: [],
        schedule: [],
        happensBefore: [],
        lastTaskEvent: new Map(),
        totalYields: 0,
      });
      const driver = yield* Effect.forkScoped(
        Effect.forever(
          Effect.gen(function* () {
            const envelope = yield* Queue.take(queue);
            const world = yield* Ref.get(worldRef);
            const result = yield* applyAdapterEvent(
              world,
              taskFibers,
              envelope.event,
              envelope.eventIndex,
            );
            yield* Ref.set(worldRef, world);
            if (result === null) {
              yield* Deferred.succeed(envelope.acknowledgement, undefined);
            } else {
              yield* Deferred.fail(envelope.acknowledgement, result);
            }
          }),
        ),
      );

      for (let eventIndex = 0; eventIndex < script.events.length; eventIndex += 1) {
        const acknowledgement = yield* Deferred.make<void, StructuredConcurrencyFailure>();
        yield* Queue.offer(queue, {
          eventIndex,
          event: script.events[eventIndex]!,
          acknowledgement,
        });
        yield* Deferred.await(acknowledgement);
      }
      yield* Fiber.interrupt(driver);
      return projectRun(yield* Ref.get(worldRef));
    }),
  );
