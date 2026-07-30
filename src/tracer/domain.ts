import {
  DocumentError,
  requireInteger,
  requireKey,
  requireObject,
  requireString,
  type JsonObject,
} from "./json.ts";

export interface Reservation {
  readonly item: string;
  readonly quantity: number;
}

export interface State {
  readonly stock: Readonly<Record<string, number>>;
  readonly reservations: Readonly<Record<string, Reservation>>;
}

export type Message =
  | { readonly kind: "Reserve"; readonly item: string; readonly quantity: number }
  | { readonly kind: "Release"; readonly reservationId: string };

export type Event =
  | {
      readonly kind: "Reserved";
      readonly reservation_id: string;
      readonly item: string;
      readonly quantity: number;
    }
  | { readonly kind: "Released"; readonly reservation_id: string }
  | {
      readonly kind: "ReservationRejected";
      readonly item: string;
      readonly quantity: number;
      readonly reason: string;
    }
  | { readonly kind: "ReleaseRejected"; readonly reservation_id: string; readonly reason: string };

export type Transition = (
  message: Message,
  state: State,
  freshId: string | null,
) => readonly [State, Event];
export type Replay = (state: State, events: ReadonlyArray<Event>) => State;

export const stateToJson = (state: State): JsonObject => ({
  stock: { ...state.stock },
  reservations: Object.fromEntries(
    Object.entries(state.reservations).map(([id, reservation]) => [
      id,
      { item: reservation.item, quantity: reservation.quantity },
    ]),
  ),
});

export const parseState = (raw: JsonObject): State => {
  const stockRaw = requireObject(requireKey(raw, "stock", "state"), "state.stock");
  const stock = Object.fromEntries(
    Object.entries(stockRaw).map(([key, value]) => [
      key,
      requireInteger(value, `state.stock.${key}`),
    ]),
  );
  const reservationsRaw = requireObject(
    requireKey(raw, "reservations", "state"),
    "state.reservations",
  );
  const reservations: Record<string, Reservation> = {};
  for (const [reservationId, value] of Object.entries(reservationsRaw)) {
    const entry = requireObject(value, `state.reservations.${reservationId}`);
    reservations[reservationId] = {
      item: requireString(requireKey(entry, "item", "reservation"), "reservation.item"),
      quantity: requireInteger(
        requireKey(entry, "quantity", "reservation"),
        "reservation.quantity",
      ),
    };
  }
  return { stock, reservations };
};

export const parseMessage = (raw: JsonObject): Message => {
  const kind = requireString(requireKey(raw, "kind", "message"), "message.kind");
  if (kind === "Reserve") {
    return {
      kind,
      item: requireString(requireKey(raw, "item", "message"), "message.item"),
      quantity: requireInteger(requireKey(raw, "quantity", "message"), "message.quantity"),
    };
  }
  if (kind === "Release") {
    return {
      kind,
      reservationId: requireString(
        requireKey(raw, "reservation_id", "message"),
        "message.reservation_id",
      ),
    };
  }
  throw new DocumentError({ message: `unknown message kind '${kind}'` });
};

const reserve = (
  message: Extract<Message, { kind: "Reserve" }>,
  state: State,
  freshId: string | null,
  honorStockGuard: boolean,
): readonly [State, Event] => {
  if (message.quantity <= 0) {
    return [
      state,
      {
        kind: "ReservationRejected",
        item: message.item,
        quantity: message.quantity,
        reason: "invalid_quantity",
      },
    ];
  }
  const available = state.stock[message.item] ?? 0;
  if (honorStockGuard && message.quantity > available) {
    return [
      state,
      {
        kind: "ReservationRejected",
        item: message.item,
        quantity: message.quantity,
        reason: "insufficient_stock",
      },
    ];
  }
  if (freshId === null) {
    throw new DocumentError({ message: "Reserve requires a fresh reservation identifier" });
  }
  if (state.reservations[freshId] !== undefined) {
    return [
      state,
      {
        kind: "ReservationRejected",
        item: message.item,
        quantity: message.quantity,
        reason: "duplicate_reservation_id",
      },
    ];
  }
  return [
    {
      stock: { ...state.stock, [message.item]: available - message.quantity },
      reservations: {
        ...state.reservations,
        [freshId]: { item: message.item, quantity: message.quantity },
      },
    },
    {
      kind: "Reserved",
      reservation_id: freshId,
      item: message.item,
      quantity: message.quantity,
    },
  ];
};

const release = (
  message: Extract<Message, { kind: "Release" }>,
  state: State,
): readonly [State, Event] => {
  const reservation = state.reservations[message.reservationId];
  if (reservation === undefined) {
    return [
      state,
      {
        kind: "ReleaseRejected",
        reservation_id: message.reservationId,
        reason: "unknown_reservation",
      },
    ];
  }
  const reservations = { ...state.reservations };
  delete reservations[message.reservationId];
  return [
    {
      stock: {
        ...state.stock,
        [reservation.item]: (state.stock[reservation.item] ?? 0) + reservation.quantity,
      },
      reservations,
    },
    { kind: "Released", reservation_id: message.reservationId },
  ];
};

export const referenceTransition: Transition = (message, state, freshId) =>
  message.kind === "Reserve" ? reserve(message, state, freshId, true) : release(message, state);

export const brokenTransition: Transition = (message, state, freshId) =>
  message.kind === "Reserve" ? reserve(message, state, freshId, false) : release(message, state);

const applyEvent = (state: State, event: Event): State => {
  if (event.kind === "Reserved") {
    return {
      stock: {
        ...state.stock,
        [event.item]: (state.stock[event.item] ?? 0) - event.quantity,
      },
      reservations: {
        ...state.reservations,
        [event.reservation_id]: { item: event.item, quantity: event.quantity },
      },
    };
  }
  if (event.kind === "Released") {
    const reservation = state.reservations[event.reservation_id];
    if (reservation === undefined) {
      throw new DocumentError({
        message: `cannot replay unknown reservation ${event.reservation_id}`,
      });
    }
    const reservations = { ...state.reservations };
    delete reservations[event.reservation_id];
    return {
      stock: {
        ...state.stock,
        [reservation.item]: (state.stock[reservation.item] ?? 0) + reservation.quantity,
      },
      reservations,
    };
  }
  return state;
};

export const replay: Replay = (state, events) =>
  events.reduce((current, event) => applyEvent(current, event), state);

export const runSteps = (
  initialState: State,
  steps: ReadonlyArray<JsonObject>,
  transition: Transition,
): readonly [ReadonlyArray<Event>, State] => {
  let state = initialState;
  const events: Array<Event> = [];
  for (const [index, step] of steps.entries()) {
    const message = parseMessage(
      requireObject(requireKey(step, "message", "step"), `step[${index}].message`),
    );
    const freshRaw = step.fresh_id;
    const freshId =
      freshRaw === undefined || freshRaw === null
        ? null
        : requireString(freshRaw, `step[${index}].fresh_id`);
    const result = transition(message, state, freshId);
    state = result[0];
    events.push(result[1]);
  }
  return [events, state];
};
