/** @internal Controlled adapters over an isolated non-production test custody. */
import { createControlledCompiledTestHarness } from "./custody.ts";

const testHarness = createControlledCompiledTestHarness();

export const compileAndProjectCheckedProgramForTest = testHarness.compileAndProject;
export const compileAndAuditCheckedProgramForTest = testHarness.compileAndAudit;
export const executePerturbedCheckedProgramForTest = testHarness.executePerturbed;
export const resumePerturbedExternalSuspensionForTest = testHarness.resumeExternal;
export const observeForgedCustodyRejectionForTest = testHarness.observeForged;
export const observeForeignCustodyRejectionForTest = testHarness.observeForeign;
export const observeNestedAliasMutationForTest = testHarness.observeNestedAliasMutation;

export type { CompiledGraphAudit, CompiledPerturbation } from "./custody.ts";
