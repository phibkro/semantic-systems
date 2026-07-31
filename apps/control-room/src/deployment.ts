const PRODUCTION_ROOT_DOMAIN = "semantic.phibkro.org";
const PREVIEW_STAGE_PATTERN = /^p([1-9][0-9]{0,61})$/;
const PREVIEW_BRAND: unique symbol = Symbol("control-room.preview-deployment");

export interface ProductionDeployment {
  readonly kind: "production";
  readonly stage: "prod";
  readonly domain: typeof PRODUCTION_ROOT_DOMAIN;
  readonly url: `https://${typeof PRODUCTION_ROOT_DOMAIN}`;
}

export interface PreviewDeployment {
  readonly kind: "preview";
  readonly stage: string;
  readonly domain: string;
  readonly url: string;
  readonly [PREVIEW_BRAND]: true;
}

export type Deployment = ProductionDeployment | PreviewDeployment;

export interface CleanupTarget {
  readonly stage: string;
}

const brandPreview = <A extends object>(value: A): A & { readonly [PREVIEW_BRAND]: true } =>
  Object.defineProperty(value, PREVIEW_BRAND, {
    value: true,
    enumerable: false,
  }) as A & { readonly [PREVIEW_BRAND]: true };

/**
 * Parses the complete external identity. No normalization is performed:
 * only `prod` and canonical `p<positive ASCII decimal>` stages exist.
 */
export const parseDeploymentStage = (input: string): Deployment => {
  if (input === "prod") {
    return {
      kind: "production",
      stage: "prod",
      domain: PRODUCTION_ROOT_DOMAIN,
      url: `https://${PRODUCTION_ROOT_DOMAIN}`,
    };
  }
  if (PREVIEW_STAGE_PATTERN.test(input)) {
    const domain = `${input}.${PRODUCTION_ROOT_DOMAIN}`;
    return brandPreview({
      kind: "preview" as const,
      stage: input,
      domain,
      url: `https://${domain}`,
    });
  }
  throw new Error(`invalid deployment stage: ${JSON.stringify(input)}`);
};

/**
 * Production is unrepresentable at ordinary call sites. The runtime reparse
 * also rejects forged types crossing an unchecked TypeScript boundary.
 */
export const previewCleanupTarget = (deployment: PreviewDeployment): CleanupTarget => {
  const reparsed = parseDeploymentStage(deployment.stage);
  if (reparsed.kind !== "preview" || reparsed.stage !== deployment.stage) {
    throw new Error("cleanup target requires a preview deployment");
  }
  return { stage: reparsed.stage };
};
