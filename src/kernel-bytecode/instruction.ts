/** Pure, closed, source-free baseline instruction graph. */
import type {
  ObservableComputationType,
  ObservableValueType,
} from "../kernel-interpreter/schema.ts";

export type BlockIndex = number;
export type ConstantSlot = number;
export type VmSlot = number;

export type Instruction =
  | { readonly kind: "PushUnit" }
  | { readonly kind: "PushBool"; readonly constantSlot: ConstantSlot }
  | { readonly kind: "PushInt"; readonly constantSlot: ConstantSlot }
  | { readonly kind: "LoadSlot"; readonly slot: VmSlot }
  | { readonly kind: "BindSlot"; readonly slot: VmSlot }
  | { readonly kind: "MakePair" }
  | {
      readonly kind: "MakeThunk";
      readonly entryBlock: BlockIndex;
      readonly capturedSlots: ReadonlyArray<VmSlot>;
    }
  | { readonly kind: "Force" }
  | {
      readonly kind: "MakeFunction";
      readonly entryBlock: BlockIndex;
      readonly parameterSlot: VmSlot;
      readonly capturedSlots: ReadonlyArray<VmSlot>;
    }
  | { readonly kind: "Call" }
  | {
      readonly kind: "EnterHandler";
      readonly labelConstantSlot: ConstantSlot;
      readonly returnBlock: BlockIndex;
      readonly returnSlot: VmSlot;
      readonly clauses: ReadonlyArray<{
        readonly operationConstantSlot: ConstantSlot;
        readonly entryBlock: BlockIndex;
        readonly argumentSlot: VmSlot;
        readonly resumptionSlot: VmSlot;
      }>;
    }
  | { readonly kind: "LeaveHandler" }
  | {
      readonly kind: "Request";
      readonly labelConstantSlot: ConstantSlot;
      readonly operationConstantSlot: ConstantSlot;
      readonly resultTypeConstantSlot: ConstantSlot;
    }
  | { readonly kind: "ResumeSlot"; readonly resumptionSlot: VmSlot }
  | { readonly kind: "Jump"; readonly targetBlock: BlockIndex }
  | { readonly kind: "Return" };

export type Constant =
  | { readonly kind: "BoolConstant"; readonly value: boolean }
  | { readonly kind: "IntConstant"; readonly value: number }
  | { readonly kind: "TextConstant"; readonly value: string }
  | {
      readonly kind: "ObservableTypeConstant";
      readonly descriptor: ObservableValueType | ObservableComputationType;
    };

export interface InstructionBlock {
  readonly instructions: ReadonlyArray<Instruction>;
}

export interface InstructionGraph {
  readonly entryBlock: BlockIndex;
  readonly blocks: ReadonlyArray<InstructionBlock>;
  readonly constants: ReadonlyArray<Constant>;
}
