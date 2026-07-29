"""Inventory domain semantics: state, messages, events, transition, replay.

This module is the Stage A execution adapter referenced in design spec 0001:
manifest operation keys are bound to these typed Python functions, but the
bindings are replaceable and are not the semantic identity of the theory.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from semantic_tracer.jsonutil import (
    DocumentError,
    require_int,
    require_key,
    require_object,
    require_str,
)
from semantic_tracer.types import JsonObject


class DomainError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Reservation:
    item: str
    quantity: int


@dataclass(frozen=True, slots=True)
class State:
    stock: dict[str, int]
    reservations: dict[str, Reservation]

    def to_dict(self) -> JsonObject:
        return {
            "stock": dict(self.stock),
            "reservations": {
                reservation_id: {"item": reservation.item, "quantity": reservation.quantity}
                for reservation_id, reservation in self.reservations.items()
            },
        }


@dataclass(frozen=True, slots=True)
class ReserveMessage:
    item: str
    quantity: int


@dataclass(frozen=True, slots=True)
class ReleaseMessage:
    reservation_id: str


type Message = ReserveMessage | ReleaseMessage


@dataclass(frozen=True, slots=True)
class Reserved:
    reservation_id: str
    item: str
    quantity: int

    def to_dict(self) -> JsonObject:
        return {
            "kind": "Reserved",
            "reservation_id": self.reservation_id,
            "item": self.item,
            "quantity": self.quantity,
        }


@dataclass(frozen=True, slots=True)
class Released:
    reservation_id: str

    def to_dict(self) -> JsonObject:
        return {"kind": "Released", "reservation_id": self.reservation_id}


@dataclass(frozen=True, slots=True)
class ReservationRejected:
    item: str
    quantity: int
    reason: str

    def to_dict(self) -> JsonObject:
        return {
            "kind": "ReservationRejected",
            "item": self.item,
            "quantity": self.quantity,
            "reason": self.reason,
        }


@dataclass(frozen=True, slots=True)
class ReleaseRejected:
    reservation_id: str
    reason: str

    def to_dict(self) -> JsonObject:
        return {
            "kind": "ReleaseRejected",
            "reservation_id": self.reservation_id,
            "reason": self.reason,
        }


type Event = Reserved | Released | ReservationRejected | ReleaseRejected
type TransitionFn = Callable[[Message, State, str | None], tuple[State, Event]]
type ReplayFn = Callable[[State, list[Event]], State]


def parse_state(raw: JsonObject) -> State:
    stock_raw = require_object(require_key(raw, "stock", "state"), "state.stock")
    stock = {key: require_int(value, f"state.stock.{key}") for key, value in stock_raw.items()}
    reservations_raw = require_object(
        require_key(raw, "reservations", "state"), "state.reservations"
    )
    reservations: dict[str, Reservation] = {}
    for reservation_id, value in reservations_raw.items():
        entry = require_object(value, f"state.reservations.{reservation_id}")
        item = require_str(require_key(entry, "item", "reservation"), "reservation.item")
        quantity = require_int(
            require_key(entry, "quantity", "reservation"), "reservation.quantity"
        )
        reservations[reservation_id] = Reservation(item=item, quantity=quantity)
    return State(stock=stock, reservations=reservations)


def parse_message(raw: JsonObject) -> Message:
    kind = require_str(require_key(raw, "kind", "message"), "message.kind")
    if kind == "Reserve":
        item = require_str(require_key(raw, "item", "message"), "message.item")
        quantity = require_int(require_key(raw, "quantity", "message"), "message.quantity")
        return ReserveMessage(item=item, quantity=quantity)
    if kind == "Release":
        reservation_id = require_str(
            require_key(raw, "reservation_id", "message"), "message.reservation_id"
        )
        return ReleaseMessage(reservation_id=reservation_id)
    raise DocumentError(f"unknown message kind {kind!r}")


def _reserve(
    message: ReserveMessage, state: State, fresh_id: str | None, *, honor_stock_guard: bool
) -> tuple[State, Event]:
    if message.quantity <= 0:
        rejection = ReservationRejected(
            item=message.item, quantity=message.quantity, reason="invalid_quantity"
        )
        return state, rejection

    available = state.stock.get(message.item, 0)
    if honor_stock_guard and message.quantity > available:
        rejection = ReservationRejected(
            item=message.item, quantity=message.quantity, reason="insufficient_stock"
        )
        return state, rejection

    if fresh_id is None:
        raise DomainError("Reserve requires a fresh reservation identifier")
    if fresh_id in state.reservations:
        rejection = ReservationRejected(
            item=message.item, quantity=message.quantity, reason="duplicate_reservation_id"
        )
        return state, rejection

    new_stock = dict(state.stock)
    new_stock[message.item] = available - message.quantity
    new_reservations = dict(state.reservations)
    new_reservations[fresh_id] = Reservation(item=message.item, quantity=message.quantity)
    new_state = State(stock=new_stock, reservations=new_reservations)
    reserved = Reserved(reservation_id=fresh_id, item=message.item, quantity=message.quantity)
    return new_state, reserved


def _release(message: ReleaseMessage, state: State) -> tuple[State, Event]:
    reservation = state.reservations.get(message.reservation_id)
    if reservation is None:
        rejection = ReleaseRejected(
            reservation_id=message.reservation_id, reason="unknown_reservation"
        )
        return state, rejection

    new_stock = dict(state.stock)
    new_stock[reservation.item] = new_stock.get(reservation.item, 0) + reservation.quantity
    new_reservations = dict(state.reservations)
    del new_reservations[message.reservation_id]
    new_state = State(stock=new_stock, reservations=new_reservations)
    return new_state, Released(reservation_id=message.reservation_id)


def reference_transition(
    message: Message, state: State, fresh_id: str | None
) -> tuple[State, Event]:
    """`inventory.reference.v0`: honors every rule in design spec 0001."""
    if isinstance(message, ReserveMessage):
        return _reserve(message, state, fresh_id, honor_stock_guard=True)
    return _release(message, state)


def broken_transition(message: Message, state: State, fresh_id: str | None) -> tuple[State, Event]:
    """`inventory.broken-ignore-stock.v0`: the standing negative fixture.

    Deliberately ignores the insufficient-stock guard so conformance evidence
    catches it; see examples/inventory/README.md.
    """
    if isinstance(message, ReserveMessage):
        return _reserve(message, state, fresh_id, honor_stock_guard=False)
    return _release(message, state)


def _apply_event(state: State, event: Event) -> State:
    if isinstance(event, Reserved):
        new_stock = dict(state.stock)
        new_stock[event.item] = new_stock.get(event.item, 0) - event.quantity
        new_reservations = dict(state.reservations)
        new_reservations[event.reservation_id] = Reservation(
            item=event.item, quantity=event.quantity
        )
        return State(stock=new_stock, reservations=new_reservations)
    if isinstance(event, Released):
        reservation = state.reservations[event.reservation_id]
        new_stock = dict(state.stock)
        new_stock[reservation.item] = new_stock.get(reservation.item, 0) + reservation.quantity
        new_reservations = dict(state.reservations)
        del new_reservations[event.reservation_id]
        return State(stock=new_stock, reservations=new_reservations)
    return state


def replay(state: State, events: list[Event]) -> State:
    """`inventory.replay.v0`: rejections are no-ops per rule 8."""
    current = state
    for event in events:
        current = _apply_event(current, event)
    return current


def run_steps(
    initial_state: State, steps: list[JsonObject], transition: TransitionFn
) -> tuple[list[Event], State]:
    state = initial_state
    events: list[Event] = []
    for index, step in enumerate(steps):
        message_raw = require_object(require_key(step, "message", "step"), f"step[{index}].message")
        message = parse_message(message_raw)
        fresh_raw = step.get("fresh_id")
        fresh_id = (
            require_str(fresh_raw, f"step[{index}].fresh_id") if fresh_raw is not None else None
        )
        state, event = transition(message, state, fresh_id)
        events.append(event)
    return events, state
