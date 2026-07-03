import { AppError, errorMessage } from "@/lib/errors";
import { reviewSchema } from "@/lib/validation";
import { reviewEscalation } from "@/server/escalations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, input] = await Promise.all([params, request.json().then((body) => reviewSchema.parse(body))]);
    return Response.json(await reviewEscalation(id, input.decision, input.reviewer));
  } catch (error) {
    const status = error instanceof AppError ? error.status : 400;
    return Response.json(
      {
        error: errorMessage(error),
        code: error instanceof AppError ? error.code : "INVALID_REQUEST",
        details: error instanceof AppError ? error.details : undefined,
      },
      { status },
    );
  }
}

