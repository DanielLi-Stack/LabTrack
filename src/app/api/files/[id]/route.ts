import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadImage } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const file = await db.attachment.findUnique({ where: { id } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  try {
    const content = await loadImage(file.storageKey);
    return new NextResponse(content, { headers: { "Content-Type": file.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
