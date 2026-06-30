// POST /api/email/poll
// Manual, on-demand trigger that runs ONE IMAP poll cycle (for testing).
// Protected by the same shared secret as form intake: header x-api-key == FORM_INTAKE_SECRET.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { pollOnce } from "@/lib/email/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const secret = process.env.FORM_INTAKE_SECRET;
  if (!secret) {
    console.error("[email/poll] FORM_INTAKE_SECRET is not set");
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const provided = req.headers.get("x-api-key") ?? "";
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollOnce();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[email/poll] failed:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
