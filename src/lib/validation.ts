import { z } from "zod";

export const createRequestSchema = z.object({
  customerId: z.uuid(),
  message: z.string().trim().min(3).max(2000),
});

export const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reviewer: z.string().trim().min(2).max(100),
});
