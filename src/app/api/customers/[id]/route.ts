import { AppError, errorMessage } from "@/lib/errors";
import { getCustomer } from "@/server/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const customer = await getCustomer(id);
    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    }
    return Response.json(customer);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
