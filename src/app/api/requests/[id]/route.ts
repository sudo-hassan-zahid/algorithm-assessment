import { getSupportRequest } from "@/server/queries";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getSupportRequest(id);
  return request
    ? Response.json(request)
    : Response.json({ error: "Support request not found" }, { status: 404 });
}

