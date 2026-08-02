// oxlint-disable-next-line import/no-unassigned-import -- Dev-only assertion matchers install into Vitest's expect.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class TestResizeObserver implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: TestResizeObserver,
});
Object.defineProperty(Element.prototype, "getAnimations", {
  configurable: true,
  value: (): ReadonlyArray<Animation> => [],
});

afterEach(cleanup);
