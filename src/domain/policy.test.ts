import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { assertCancellationAllowed, assertRefundAllowed } from "./policy";

function expectCode(action: () => void, code: string) {
  try {
    action();
    throw new Error("Expected policy to reject the action");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe("refund policy", () => {
  it("accepts a refund up to the paid amount", () => {
    expect(() => assertRefundAllowed("DELIVERED", "100.00", "100.00")).not.toThrow();
  });

  it("rejects over-refunds and non-positive amounts", () => {
    expectCode(() => assertRefundAllowed("DELIVERED", "100.00", "100.01"), "INVALID_REFUND_AMOUNT");
    expectCode(() => assertRefundAllowed("DELIVERED", "100.00", "0"), "INVALID_REFUND_AMOUNT");
  });

  it("rejects refunds for cancelled orders", () => {
    expectCode(() => assertRefundAllowed("CANCELLED", "100.00", "50.00"), "ORDER_CANCELLED");
  });
});

describe("cancellation policy", () => {
  it("accepts processing orders", () => {
    expect(() => assertCancellationAllowed("PROCESSING")).not.toThrow();
  });

  it.each(["SHIPPED", "DELIVERED", "CANCELLED"])("rejects %s orders", (status) => {
    expectCode(() => assertCancellationAllowed(status), "ORDER_NOT_CANCELLABLE");
  });
});

