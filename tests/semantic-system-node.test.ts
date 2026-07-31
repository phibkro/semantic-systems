import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import {
  command,
  deterministicFreshIdentifierRegistry,
  inventorySemanticComponent,
  inventorySemanticState,
  projectInventoryReferenceState,
  runDirect,
} from "../src/semantic-system/index.ts";

const expected =
  '{"status":"completed","state":{"stock":{"widget":1},"reservations":{"reservation-1":{"item":"widget","quantity":2}}},"events":[{"_tag":"Reserved","reservationId":"reservation-1","item":"widget","quantity":2}],"effects":[{"_tag":"FreshIdentifierRequested","item":"widget","quantity":2}],"observations":[{"_tag":"FreshIdentifierAllocated","identifier":"reservation-1"}],"attempts":[{"actionId":"reserve-1:fresh-identifier","requestMessageId":"reserve-1:fresh-identifier-request","outcome":"observed","observationMessageId":"reserve-1:fresh-identifier-request:observation"}]}';

const normalizedJourney = Effect.gen(function* () {
  const component = yield* inventorySemanticComponent;
  const registry = yield* deterministicFreshIdentifierRegistry(component, ["reservation-1"]);
  const reserve = yield* command(
    component,
    { messageId: "reserve-1", correlationId: "journey-1" },
    { _tag: "Reserve", item: "widget", quantity: 2 },
  );
  const result = yield* runDirect(
    component,
    registry,
    inventorySemanticState({ stock: { widget: 3 }, reservations: {} }),
    [reserve],
    {
      maximumInputs: 8,
      maximumEffects: 4,
      maximumQueueStock: 8,
      maximumObservations: 4,
    },
  );
  return JSON.stringify({
    status: result.status,
    state: projectInventoryReferenceState(result.state),
    events: result.events.map((event) => event.payload),
    effects: result.effects.map((request) => request.payload),
    observations: result.observations.map((observation) => observation.payload),
    attempts: result.attempts,
  });
});

test("genuine Node observes the frozen portable inventory journey", async () => {
  assert.equal(await Effect.runPromise(normalizedJourney), expected);
});
