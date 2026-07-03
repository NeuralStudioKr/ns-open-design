import { NetworkError } from "@teamver/app-sdk";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";

export type ByokBillingFinalizeInput = {
  workspaceId: string;
  runId: string;
  runStatus: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  tokenCountSource?: "provider_usage" | "estimated" | "unknown";
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  providerReportedModel?: string;
};

export type ByokBillingFinalizeResult = {
  ok: boolean;
  usageId?: string | null;
  billingStatus: string;
  creditsCommitted: boolean;
  creditsAmountT?: number;
  error?: string | null;
  idempotent?: boolean;
};

type ByokBillingFinalizeResponse = {
  ok?: boolean;
  usageId?: string | null;
  billingStatus?: string;
  creditsCommitted?: boolean;
  creditsAmountT?: number;
  error?: string | null;
  idempotent?: boolean;
};

function isRetryableBillingError(err: unknown): boolean {
  if (err instanceof NetworkError) {
    const status = err.status ?? 0;
    if (status === 0) return true;
    return status >= 500 || status === 429;
  }
  if (err instanceof TypeError) return true;
  return false;
}

function emitByokBillingDropMarker(
  stage: string,
  input: ByokBillingFinalizeInput,
  err: unknown,
): void {
  try {
    console.warn(
      JSON.stringify({
        metric: "teamver_usage_5xx",
        stage,
        ts: Date.now(),
        workspaceId: input.workspaceId,
        runId: input.runId,
        runStatus: input.runStatus,
        modelName: input.modelName,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  } catch {
    // never let observability break the chat finalize flow.
  }
}

function normalizeByokBillingResponse(
  response: ByokBillingFinalizeResponse | null | undefined,
): ByokBillingFinalizeResult | null {
  if (!response || typeof response.billingStatus !== "string") return null;
  return {
    ok: response.ok === true,
    usageId: response.usageId ?? null,
    billingStatus: response.billingStatus,
    creditsCommitted: response.creditsCommitted === true,
    creditsAmountT:
      typeof response.creditsAmountT === "number" && response.creditsAmountT >= 0
        ? response.creditsAmountT
        : undefined,
    error: typeof response.error === "string" ? response.error : null,
    idempotent: response.idempotent === true,
  };
}

async function postFinalizeByokRun(
  client: NonNullable<ReturnType<typeof getDesignBffClient>>,
  input: ByokBillingFinalizeInput,
): Promise<ByokBillingFinalizeResult | null> {
  const response = await client.http.post<ByokBillingFinalizeResponse>(
    "/billing/finalize-byok-run",
    {
      workspaceId: input.workspaceId,
      runId: input.runId,
      runStatus: input.runStatus,
      modelName: input.modelName,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      tokenCountSource: input.tokenCountSource ?? "unknown",
      ...(input.cacheReadInputTokens != null && input.cacheReadInputTokens > 0
        ? { cacheReadInputTokens: input.cacheReadInputTokens }
        : {}),
      ...(input.cacheCreationInputTokens != null && input.cacheCreationInputTokens > 0
        ? { cacheCreationInputTokens: input.cacheCreationInputTokens }
        : {}),
      ...(input.providerReportedModel
        ? { providerReportedModel: input.providerReportedModel }
        : {}),
    },
    {
      workspaceId: input.workspaceId,
      ...TEAMVER_BFF_REQUEST_OPTIONS,
    },
  );
  return normalizeByokBillingResponse(response);
}

export async function finalizeTeamverByokBilling(
  input: ByokBillingFinalizeInput,
): Promise<ByokBillingFinalizeResult | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  try {
    return await withDesignBffCookieAuthRecovery(() => postFinalizeByokRun(client, input));
  } catch (err) {
    if (!isRetryableBillingError(err)) {
      emitByokBillingDropMarker("billing.finalize_byok_client_drop", input, err);
      return null;
    }
    try {
      return await withDesignBffCookieAuthRecovery(() => postFinalizeByokRun(client, input));
    } catch (retryErr) {
      emitByokBillingDropMarker("billing.finalize_byok_client_retry_drop", input, retryErr);
      return null;
    }
  }
}
