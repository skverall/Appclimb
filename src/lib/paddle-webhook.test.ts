import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  parsePaddleSignature,
  verifyPaddleSignature,
} from "@/lib/paddle-webhook";

describe("Paddle webhook verification", () => {
  it("verifies the exact raw body and supports multiple h1 values", () => {
    const timestamp = 1710000000;
    const body = '{"event_id":"evt_1"}';
    const secret = "pdl_ntfset_test_secret";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}:${body}`)
      .digest("hex");

    expect(
      verifyPaddleSignature({
        rawBody: body,
        header: `ts=${timestamp};h1=${"0".repeat(64)};h1=${signature}`,
        secret,
        now: timestamp * 1000,
      }),
    ).toBe(true);
  });

  it("rejects modified bodies and replayed timestamps", () => {
    const timestamp = 1710000000;
    const body = '{"event_id":"evt_1"}';
    const secret = "secret";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}:${body}`)
      .digest("hex");
    const header = `ts=${timestamp};h1=${signature}`;

    expect(
      verifyPaddleSignature({
        rawBody: `${body} `,
        header,
        secret,
        now: timestamp * 1000,
      }),
    ).toBe(false);
    expect(
      verifyPaddleSignature({
        rawBody: body,
        header,
        secret,
        now: (timestamp + 30) * 1000,
      }),
    ).toBe(false);
  });

  it("rejects malformed headers", () => {
    expect(() => parsePaddleSignature("broken")).toThrow(
      "Malformed Paddle-Signature",
    );
  });
});
