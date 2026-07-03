import { db } from "@/db";
import { actionEvents, supportRequests } from "@/db/schema";
import { AppError, errorMessage } from "@/lib/errors";
import { createRequestSchema } from "@/lib/validation";
import { processSupportRequest } from "@/server/agent/run";
import { listSupportRequests } from "@/server/queries";

export async function GET() {
  return Response.json(await listSupportRequests());
}

export async function POST(request: Request) {
  try {
    const input = createRequestSchema.parse(await request.json());
    const created = await db.transaction(async (tx) => {
      const [supportRequest] = await tx.insert(supportRequests).values(input).returning();
      await tx.insert(actionEvents).values({
        requestId: supportRequest.id,
        actorType: "CUSTOMER",
        actorId: input.customerId,
        eventType: "REQUEST_RECEIVED",
        details: { message: input.message },
      });
      return supportRequest;
    });

    await processSupportRequest(created.id);
    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 400;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

