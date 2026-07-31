// oxlint-disable-next-line import/no-unassigned-import -- Dev-only assertion matchers install into Vitest's expect.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
