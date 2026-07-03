import { AppError } from "@/lib/errors";

export function assertRefundAllowed(
  orderStatus: string,
  paidAmount: string,
  requestedAmount: string,
) {
  if (orderStatus === "CANCELLED") {
    throw new AppError(
      "ORDER_CANCELLED",
      "A cancelled order cannot be refunded",
      409,
    );
  }

  const refundAmount = Number(requestedAmount);
  const totalPaid = Number(paidAmount);
  if (
    !Number.isFinite(refundAmount) ||
    refundAmount <= 0 ||
    refundAmount > totalPaid
  ) {
    throw new AppError(
      "INVALID_REFUND_AMOUNT",
      "Refund amount must be positive and no more than the amount paid",
      422,
    );
  }
}

export function assertCancellationAllowed(orderStatus: string) {
  if (orderStatus !== "PROCESSING") {
    throw new AppError(
      "ORDER_NOT_CANCELLABLE",
      "Only unshipped processing orders can be cancelled",
      409,
    );
  }
}
