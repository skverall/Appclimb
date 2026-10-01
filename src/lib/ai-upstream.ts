// Server-only DeepSeek client for the ASO assistant: one chat-completions
// round, streamed when the provider streams (text/event-stream) and parsed
// whole otherwise, with tool calls reassembled from their deltas.

export interface UpstreamToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface UpstreamMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string;
  tool_calls?: UpstreamToolCall[];
  tool_call_id?: string;
}

export interface UpstreamRound {
  content: string;
  reasoning: string;
  toolCalls: UpstreamToolCall[];
  /** "stop", "tool_calls", "length" (ran out of tokens), … */
  finishReason: string | null;
}

/** A failure with the HTTP status the route should answer with. */
export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export function upstreamErrorFor(status: number): UpstreamError {
  if (status === 429) {
    return new UpstreamError(
      429,
      "The model provider is rate-limiting right now. Please wait and retry.",
      30,
    );
  }
  if (status === 401 || status === 403) {
    return new UpstreamError(503, "Assistant authentication failed on the server.");
  }
  return new UpstreamError(502, `Assistant upstream error (${status}).`);
}

type Delta = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

function mergeToolDeltas(calls: UpstreamToolCall[], deltas: Delta["tool_calls"]): void {
  for (const delta of deltas ?? []) {
    const index = typeof delta.index === "number" ? delta.index : calls.length;
    const slot = (calls[index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
    if (delta.id) slot.id = delta.id;
    if (delta.function?.name) slot.function.name += delta.function.name;
    if (delta.function?.arguments) slot.function.arguments += delta.function.arguments;
  }
}

/**
 * Read one completion. `onContent` receives answer text as it arrives;
 * `onReasoning` fires once when the model starts thinking.
 */
export async function readUpstreamRound(
  response: Response,
  handlers: { onContent?: (text: string) => void; onReasoning?: () => void } = {},
): Promise<UpstreamRound> {
  const type = response.headers.get("content-type") ?? "";
  const round: UpstreamRound = { content: "", reasoning: "", toolCalls: [], finishReason: null };
  let reasoningAnnounced = false;
  const apply = (delta: Delta) => {
    if (delta.reasoning_content) {
      round.reasoning += delta.reasoning_content;
      if (!reasoningAnnounced) {
        reasoningAnnounced = true;
        handlers.onReasoning?.();
      }
    }
    if (delta.content) {
      round.content += delta.content;
      handlers.onContent?.(delta.content);
    }
    if (delta.tool_calls) mergeToolDeltas(round.toolCalls, delta.tool_calls);
  };

  if (!type.includes("text/event-stream") || !response.body) {
    let data: { choices?: Array<{ message?: Delta; finish_reason?: string | null }> };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new UpstreamError(502, "Invalid response from the assistant model.");
    }
    const message = data.choices?.[0]?.message;
    if (!message) throw new UpstreamError(502, "Invalid response from the assistant model.");
    round.finishReason = data.choices?.[0]?.finish_reason ?? null;
    apply({
      content: message.content,
      reasoning_content: message.reasoning_content,
      tool_calls: message.tool_calls?.map((call, index) => ({ ...call, index })),
    });
    round.toolCalls = round.toolCalls.filter(Boolean);
    return round;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: Delta; finish_reason?: string | null }>;
        };
        const choice = chunk.choices?.[0];
        if (choice?.delta) apply(choice.delta);
        if (choice?.finish_reason) round.finishReason = choice.finish_reason;
      } catch {
        // A malformed keep-alive or partial line; the next chunk carries on.
      }
    }
  }
  round.toolCalls = round.toolCalls.filter(Boolean);
  return round;
}
