import type { SourceProvider } from "@/lib/contracts";

export type ConnectorProvider = Exclude<SourceProvider, "appclimb-rank">;

export interface ConnectorVerification {
  ok: boolean;
  provider: ConnectorProvider;
  accountLabel?: string;
  message: string;
  checkedAt: string;
}

export interface ConnectorClient<TCredentials> {
  provider: ConnectorProvider;
  verify(credentials: TCredentials): Promise<ConnectorVerification>;
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export async function checkedJson(
  response: Response,
  provider: ConnectorProvider,
): Promise<unknown> {
  if (response.ok) {
    return response.json();
  }

  const retryable = response.status === 429 || response.status >= 500;
  throw new ConnectorError(
    `${provider} returned ${response.status}`,
    response.status,
    retryable,
  );
}
