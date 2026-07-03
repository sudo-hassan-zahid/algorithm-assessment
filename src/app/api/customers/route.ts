import { listCustomers } from "@/server/queries";

export async function GET() {
  return Response.json(await listCustomers());
}

