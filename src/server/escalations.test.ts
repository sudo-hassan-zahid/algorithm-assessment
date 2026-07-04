/*
 * Verifies that escalation review rejects unsafe approvals and routes approved actions through guardrails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  transactionMock,
  executeRefundInTransaction,
  executeCancellationInTransaction,
  inspectOwnedOrder,
} = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  executeRefundInTransaction: vi.fn(),
  executeCancellationInTransaction: vi.fn(),
  inspectOwnedOrder: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("./guardrails", () => ({
  executeRefundInTransaction,
  executeCancellationInTransaction,
  inspectOwnedOrder,
}));

import { reviewEscalation } from "./escalations";

type EscalationRow = {
  id: string;
  request_id: string;
  order_id: string | null;
  action: "REFUND" | "CANCEL" | "REPLACEMENT" | "OTHER";
  proposed_amount: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

function createTx(escalation: EscalationRow, updatedRows = [{}]) {
  const query = {
    returning: vi.fn().mockResolvedValue(updatedRows),
    then: (resolve: (value: undefined) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve, reject),
  };

  return {
    execute: vi.fn().mockResolvedValue({ rows: [escalation] }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => query),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

describe("reviewEscalation", () => {
  beforeEach(() => {
    transactionMock.mockReset();
    executeRefundInTransaction.mockReset();
    executeCancellationInTransaction.mockReset();
    inspectOwnedOrder.mockReset();
  });

  it("rejects an already reviewed escalation", async () => {
    const tx = createTx({
      id: "esc-1",
      request_id: "req-1",
      order_id: "ord-1",
      action: "REFUND",
      proposed_amount: "49.99",
      status: "APPROVED",
    });
    transactionMock.mockImplementation(async (work) => work(tx));

    await expect(
      reviewEscalation("esc-1", "APPROVE", "Reviewer"),
    ).rejects.toMatchObject({
      code: "ALREADY_REVIEWED",
      status: 409,
    });
    expect(executeRefundInTransaction).not.toHaveBeenCalled();
    expect(executeCancellationInTransaction).not.toHaveBeenCalled();
  });

  it("records a rejection without executing any action", async () => {
    const tx = createTx({
      id: "esc-2",
      request_id: "req-2",
      order_id: "ord-2",
      action: "REFUND",
      proposed_amount: "20.00",
      status: "PENDING",
    });
    transactionMock.mockImplementation(async (work) => work(tx));

    await expect(
      reviewEscalation("esc-2", "REJECT", "Reviewer"),
    ).resolves.toEqual({ status: "REJECTED" });
    expect(executeRefundInTransaction).not.toHaveBeenCalled();
    expect(executeCancellationInTransaction).not.toHaveBeenCalled();
  });

  it("executes a refund approval through the guarded transaction helper", async () => {
    const tx = createTx({
      id: "esc-3",
      request_id: "req-3",
      order_id: "ord-3",
      action: "REFUND",
      proposed_amount: "59.00",
      status: "PENDING",
    });
    transactionMock.mockImplementation(async (work) => work(tx));

    await expect(
      reviewEscalation("esc-3", "APPROVE", "Reviewer"),
    ).resolves.toEqual({ status: "APPROVED" });
    expect(executeRefundInTransaction).toHaveBeenCalledWith(
      tx,
      "req-3",
      "ord-3",
      "59.00",
      { type: "REVIEWER", id: "Reviewer" },
    );
  });

  it("rejects approval when an escalation has no verified order", async () => {
    const tx = createTx({
      id: "esc-4",
      request_id: "req-4",
      order_id: null,
      action: "REFUND",
      proposed_amount: "59.00",
      status: "PENDING",
    });
    transactionMock.mockImplementation(async (work) => work(tx));

    await expect(
      reviewEscalation("esc-4", "APPROVE", "Reviewer"),
    ).rejects.toMatchObject({
      code: "ORDER_REQUIRED",
      status: 422,
    });
    expect(executeRefundInTransaction).not.toHaveBeenCalled();
  });

  it("rejects unsupported actions even if the model requested approval", async () => {
    const tx = createTx({
      id: "esc-5",
      request_id: "req-5",
      order_id: "ord-5",
      action: "REPLACEMENT",
      proposed_amount: null,
      status: "PENDING",
    });
    transactionMock.mockImplementation(async (work) => work(tx));

    await expect(
      reviewEscalation("esc-5", "APPROVE", "Reviewer"),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_ACTION",
      status: 422,
    });
    expect(executeRefundInTransaction).not.toHaveBeenCalled();
    expect(executeCancellationInTransaction).not.toHaveBeenCalled();
  });
});
