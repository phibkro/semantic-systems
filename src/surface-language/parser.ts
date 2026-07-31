import { Effect } from "effect";
import {
  makeSurfaceDocument,
  type LocatedName,
  type SurfaceComputation,
  type SurfaceComputationType,
  type SurfaceDocument,
  type SurfaceEffectRow,
  type SurfaceGrade,
  type SurfaceOperationClause,
  type SurfaceSignatureOperation,
  type SurfaceValue,
  type SurfaceValueType,
} from "./ast.ts";
import { SurfaceParseError, type SourceSpan } from "./errors.ts";
import { defaultSurfaceLanguageBounds, type SurfaceLanguageBounds, type Token } from "./lexer.ts";

export const surfacePrattRules = Object.freeze({
  valueTypeProduct: Object.freeze({ token: "*", leftBindingPower: 30, rightBindingPower: 29 }),
  computationApplication: Object.freeze({
    token: "(",
    leftBindingPower: 50,
    rightBindingPower: 51,
  }),
});

const reserved = new Set([
  "kernel",
  "effect",
  "run",
  "Unit",
  "Bool",
  "Int",
  "U",
  "F",
  "omega",
  "true",
  "false",
  "thunk",
  "resumption",
  "return",
  "let",
  "in",
  "force",
  "fun",
  "perform",
  "handle",
  "with",
  "operation",
  "resume",
]);

const spanFrom = (start: SourceSpan, end: SourceSpan): SourceSpan =>
  Object.freeze({ start: start.start, end: end.end });

class ParseSignal extends Error {
  readonly diagnostic: SurfaceParseError;

  constructor(diagnostic: SurfaceParseError) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

class Parser {
  readonly #tokens: ReadonlyArray<Token>;
  readonly #bounds: SurfaceLanguageBounds;
  #cursor = 0;
  #depth = 0;

  constructor(tokens: ReadonlyArray<Token>, bounds: SurfaceLanguageBounds) {
    this.#tokens = tokens;
    this.#bounds = bounds;
  }

  #current(): Token {
    return this.#tokens[this.#cursor] ?? this.#tokens[this.#tokens.length - 1]!;
  }

  #take(): Token {
    const token = this.#current();
    if (token.kind !== "eof") this.#cursor += 1;
    return token;
  }

  #matches(text: string): boolean {
    return this.#current().text === text;
  }

  #fail(code: SurfaceParseError["code"], message: string, token = this.#current()): never {
    throw new ParseSignal(
      new SurfaceParseError({ phase: "parse", code, message, span: token.span }),
    );
  }

  #expect(text: string): Token {
    const token = this.#current();
    if (token.text !== text) {
      return this.#fail(
        "surface.parse.expected",
        `expected ${JSON.stringify(text)}, found ${token.kind === "eof" ? "end of input" : JSON.stringify(token.text)}`,
        token,
      );
    }
    return this.#take();
  }

  #expectKind(kind: Token["kind"], description: string): Token {
    const token = this.#current();
    if (token.kind !== kind) {
      return this.#fail(
        "surface.parse.expected",
        `expected ${description}, found ${token.kind === "eof" ? "end of input" : JSON.stringify(token.text)}`,
        token,
      );
    }
    return this.#take();
  }

  #name(): LocatedName {
    const token = this.#expectKind("identifier", "an identifier");
    if (reserved.has(token.text)) {
      return this.#fail(
        "surface.parse.reserved-name",
        `${JSON.stringify(token.text)} is reserved and cannot be used as a name`,
        token,
      );
    }
    return Object.freeze({ text: token.text, span: token.span });
  }

  #withinDepth<Value>(parse: () => Value): Value {
    if (this.#depth >= this.#bounds.maximumDepth) {
      return this.#fail(
        "surface.parse.depth",
        `surface nesting exceeds the ${this.#bounds.maximumDepth} level limit`,
      );
    }
    this.#depth += 1;
    try {
      return parse();
    } finally {
      this.#depth -= 1;
    }
  }

  #grade(): SurfaceGrade {
    const token = this.#take();
    if (token.text === "0" || token.text === "1" || token.text === "omega") return token.text;
    return this.#fail(
      "surface.parse.expected",
      `expected grade 0, 1, or omega; found ${JSON.stringify(token.text)}`,
      token,
    );
  }

  #effectRow(): SurfaceEffectRow {
    const open = this.#expect("{");
    const labels: Array<LocatedName> = [];
    if (!this.#matches("}")) {
      labels.push(this.#name());
      while (this.#matches(",")) {
        this.#take();
        labels.push(this.#name());
      }
    }
    const close = this.#expect("}");
    return Object.freeze({ labels: Object.freeze(labels), span: spanFrom(open.span, close.span) });
  }

  #valueTypeAtom(): SurfaceValueType {
    return this.#withinDepth(() => {
      const token = this.#current();
      if (token.text === "Unit" || token.text === "Bool" || token.text === "Int") {
        this.#take();
        const tag =
          token.text === "Unit" ? "UnitType" : token.text === "Bool" ? "BoolType" : "IntType";
        return Object.freeze({ _tag: tag, span: token.span });
      }
      if (token.text === "U") {
        const start = this.#take();
        this.#expect("[");
        const effects = this.#effectRow();
        this.#expect("]");
        const computation = this.#computationType();
        return Object.freeze({
          _tag: "ThunkType" as const,
          effects,
          computation,
          span: spanFrom(start.span, computation.span),
        });
      }
      if (token.text === "(") {
        this.#take();
        const type = this.#valueType(0);
        this.#expect(")");
        return type;
      }
      return this.#fail(
        "surface.parse.expected",
        `expected a value type, found ${token.kind === "eof" ? "end of input" : JSON.stringify(token.text)}`,
        token,
      );
    });
  }

  #valueType(minimumBindingPower: number): SurfaceValueType {
    let left = this.#valueTypeAtom();
    const rule = surfacePrattRules.valueTypeProduct;
    while (this.#matches(rule.token) && rule.leftBindingPower > minimumBindingPower) {
      this.#take();
      const right = this.#valueType(rule.rightBindingPower);
      left = Object.freeze({
        _tag: "PairType" as const,
        first: left,
        second: right,
        span: spanFrom(left.span, right.span),
      });
    }
    return left;
  }

  #computationType(): SurfaceComputationType {
    return this.#withinDepth(() => {
      if (this.#matches("F")) {
        const start = this.#take();
        this.#expect("[");
        const grade = this.#grade();
        this.#expect("]");
        const value = this.#valueType(0);
        return Object.freeze({
          _tag: "ReturnType" as const,
          grade,
          value,
          span: spanFrom(start.span, value.span),
        });
      }
      const parameter = this.#valueType(0);
      this.#expect("->");
      this.#expect("[");
      const grade = this.#grade();
      this.#expect(";");
      const effects = this.#effectRow();
      this.#expect("]");
      const result = this.#computationType();
      return Object.freeze({
        _tag: "FunctionType" as const,
        parameter,
        grade,
        effects,
        result,
        span: spanFrom(parameter.span, result.span),
      });
    });
  }

  #value(): SurfaceValue {
    return this.#withinDepth(() => {
      const token = this.#current();
      if (token.text === "(") {
        const open = this.#take();
        if (this.#matches(")")) {
          const close = this.#take();
          return Object.freeze({ _tag: "Unit" as const, span: spanFrom(open.span, close.span) });
        }
        const first = this.#value();
        if (this.#matches(",")) {
          this.#take();
          const second = this.#value();
          const close = this.#expect(")");
          return Object.freeze({
            _tag: "Pair" as const,
            first,
            second,
            span: spanFrom(open.span, close.span),
          });
        }
        this.#expect(")");
        return first;
      }
      if (token.text === "true" || token.text === "false") {
        this.#take();
        return Object.freeze({
          _tag: "Bool" as const,
          value: token.text === "true",
          span: token.span,
        });
      }
      if (token.kind === "integer") {
        this.#take();
        const value = Number(token.text);
        if (!Number.isSafeInteger(value)) {
          return this.#fail(
            "surface.parse.unsafe-integer",
            `${token.text} is outside the signed safe-integer range`,
            token,
          );
        }
        return Object.freeze({ _tag: "Int" as const, value, span: token.span });
      }
      if (token.text === "thunk") {
        const start = this.#take();
        this.#expect("{");
        const body = this.#computation(0);
        const close = this.#expect("}");
        return Object.freeze({
          _tag: "Thunk" as const,
          body,
          span: spanFrom(start.span, close.span),
        });
      }
      if (token.text === "resumption") {
        const start = this.#take();
        const name = this.#name();
        return Object.freeze({
          _tag: "ResumptionValue" as const,
          name,
          span: spanFrom(start.span, name.span),
        });
      }
      if (token.kind === "identifier" && !reserved.has(token.text)) {
        const name = this.#name();
        return Object.freeze({ _tag: "Variable" as const, name, span: name.span });
      }
      return this.#fail(
        "surface.parse.expected",
        `expected a value, found ${token.kind === "eof" ? "end of input" : JSON.stringify(token.text)}`,
        token,
      );
    });
  }

  #handler(): {
    readonly returnClause: {
      readonly binder: LocatedName;
      readonly body: SurfaceComputation;
      readonly span: SourceSpan;
    };
    readonly operationClauses: ReadonlyArray<SurfaceOperationClause>;
    readonly span: SourceSpan;
  } {
    const open = this.#expect("{");
    const returnStart = this.#expect("return");
    const binder = this.#name();
    this.#expect("=>");
    const returnBody = this.#computation(0);
    const returnClose = this.#expect(";");
    const returnClause = Object.freeze({
      binder,
      body: returnBody,
      span: spanFrom(returnStart.span, returnClose.span),
    });
    const clauses: Array<SurfaceOperationClause> = [];
    while (this.#matches("operation")) {
      if (clauses.length >= this.#bounds.maximumOperationClauses) {
        this.#fail(
          "surface.parse.expected",
          `handler exceeds the ${this.#bounds.maximumOperationClauses} operation-clause limit`,
        );
      }
      const start = this.#take();
      const operation = this.#name();
      this.#expect("(");
      const argumentBinder = this.#name();
      this.#expect(",");
      const resumptionBinder = this.#name();
      this.#expect(")");
      this.#expect("=>");
      const body = this.#computation(0);
      const close = this.#expect(";");
      clauses.push(
        Object.freeze({
          operation,
          argumentBinder,
          resumptionBinder,
          body,
          span: spanFrom(start.span, close.span),
        }),
      );
    }
    if (clauses.length === 0) {
      this.#fail("surface.parse.expected", "a handler requires at least one operation clause");
    }
    const close = this.#expect("}");
    return Object.freeze({
      returnClause,
      operationClauses: Object.freeze(clauses),
      span: spanFrom(open.span, close.span),
    });
  }

  #computationPrefix(): SurfaceComputation {
    return this.#withinDepth(() => {
      const token = this.#current();
      if (token.text === "return") {
        const start = this.#take();
        this.#expect("[");
        const grade = this.#grade();
        this.#expect("]");
        const value = this.#value();
        return Object.freeze({
          _tag: "Return" as const,
          grade,
          value,
          span: spanFrom(start.span, value.span),
        });
      }
      if (token.text === "let") {
        const start = this.#take();
        const binder = this.#name();
        this.#expect("=");
        const bound = this.#computation(0);
        this.#expect("in");
        const body = this.#computation(0);
        return Object.freeze({
          _tag: "Let" as const,
          binder,
          bound,
          body,
          span: spanFrom(start.span, body.span),
        });
      }
      if (token.text === "force") {
        const start = this.#take();
        const value = this.#value();
        return Object.freeze({
          _tag: "Force" as const,
          value,
          span: spanFrom(start.span, value.span),
        });
      }
      if (token.text === "fun") {
        const start = this.#take();
        this.#expect("(");
        const binder = this.#name();
        this.#expect(":");
        const parameterType = this.#valueType(0);
        this.#expect(")");
        this.#expect("[");
        const grade = this.#grade();
        this.#expect("]");
        this.#expect("=>");
        const body = this.#computation(0);
        return Object.freeze({
          _tag: "Lambda" as const,
          binder,
          parameterType,
          grade,
          body,
          span: spanFrom(start.span, body.span),
        });
      }
      if (token.text === "perform") {
        const start = this.#take();
        this.#expect("[");
        const grade = this.#grade();
        this.#expect("]");
        const label = this.#name();
        this.#expect(".");
        const operation = this.#name();
        this.#expect("(");
        const argument = this.#value();
        const close = this.#expect(")");
        return Object.freeze({
          _tag: "Operation" as const,
          grade,
          label,
          operation,
          argument,
          span: spanFrom(start.span, close.span),
        });
      }
      if (token.text === "handle") {
        const start = this.#take();
        const label = this.#name();
        this.#expect("(");
        const computation = this.#computation(0);
        this.#expect(")");
        this.#expect("with");
        const handler = this.#handler();
        return Object.freeze({
          _tag: "Handle" as const,
          label,
          computation,
          returnClause: handler.returnClause,
          operationClauses: handler.operationClauses,
          span: spanFrom(start.span, handler.span),
        });
      }
      if (token.text === "resume") {
        const start = this.#take();
        const resumption = this.#name();
        this.#expect("(");
        const value = this.#value();
        const close = this.#expect(")");
        return Object.freeze({
          _tag: "Resume" as const,
          resumption,
          value,
          span: spanFrom(start.span, close.span),
        });
      }
      if (token.text === "(") {
        this.#take();
        const computation = this.#computation(0);
        this.#expect(")");
        return computation;
      }
      return this.#fail(
        "surface.parse.expected",
        `expected a computation, found ${token.kind === "eof" ? "end of input" : JSON.stringify(token.text)}`,
        token,
      );
    });
  }

  #computation(minimumBindingPower: number): SurfaceComputation {
    let left = this.#computationPrefix();
    const rule = surfacePrattRules.computationApplication;
    while (this.#matches(rule.token) && rule.leftBindingPower > minimumBindingPower) {
      this.#take();
      const argument = this.#value();
      const close = this.#expect(")");
      left = Object.freeze({
        _tag: "Apply" as const,
        computation: left,
        argument,
        span: spanFrom(left.span, close.span),
      });
    }
    return left;
  }

  parseDocument(): SurfaceDocument {
    const start = this.#expect("kernel");
    const kernel = this.#expectKind("string", "the quoted kernel marker");
    if (kernel.text !== "semantic.kernel-calculus/0018/v1") {
      this.#fail(
        "surface.parse.expected",
        `expected kernel marker "semantic.kernel-calculus/0018/v1"`,
        kernel,
      );
    }
    this.#expect(";");
    const signature: Array<SurfaceSignatureOperation> = [];
    while (this.#matches("effect")) {
      if (signature.length >= this.#bounds.maximumSignatureOperations) {
        this.#fail(
          "surface.parse.expected",
          `signature exceeds the ${this.#bounds.maximumSignatureOperations} declaration limit`,
        );
      }
      const declarationStart = this.#take();
      const label = this.#name();
      this.#expect(".");
      const operation = this.#name();
      this.#expect(":");
      const argumentType = this.#valueType(0);
      this.#expect("->");
      const resultType = this.#valueType(0);
      const close = this.#expect(";");
      signature.push(
        Object.freeze({
          label,
          operation,
          argumentType,
          resultType,
          span: spanFrom(declarationStart.span, close.span),
        }),
      );
    }
    this.#expect("run");
    const program = this.#computation(0);
    const end = this.#current();
    if (end.kind !== "eof") {
      this.#fail(
        "surface.parse.trailing-input",
        `unexpected trailing token ${JSON.stringify(end.text)}`,
        end,
      );
    }
    return makeSurfaceDocument({
      kernel: "semantic.kernel-calculus/0018/v1",
      signature: Object.freeze(signature),
      program,
      span: spanFrom(start.span, program.span),
    });
  }
}

export const parseSurfaceTokens = (
  tokens: ReadonlyArray<Token>,
  bounds: SurfaceLanguageBounds = defaultSurfaceLanguageBounds,
): Effect.Effect<SurfaceDocument, SurfaceParseError> => {
  try {
    return Effect.succeed(new Parser(tokens, bounds).parseDocument());
  } catch (cause) {
    if (cause instanceof ParseSignal) return Effect.fail(cause.diagnostic);
    throw cause;
  }
};
