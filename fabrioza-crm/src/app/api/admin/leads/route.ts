// GET /api/admin/leads — list leads (newest first), optional ?intent= & ?status=.
// Gated by middleware; re-checked here for defense in depth.
import { NextResponse } from "next/server";
import { listLeads } from "@/lib/leads";
import { requireSession } from "@/lib/auth";
import { LEAD_INTENTS, LEAD_STATUSES, type LeadIntent, type LeadStatus } from "@/types/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireSession(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const intentParam = url.searchParams.get("intent");
  const statusParam = url.searchParams.get("status");

  const intent =
    intentParam && (LEAD_INTENTS as readonly string[]).includes(intentParam)
      ? (intentParam as LeadIntent)
      : undefined;
  const status =
    statusParam && (LEAD_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as LeadStatus)
      : undefined;

  try {
    const leads = await listLeads({ intent, status, limit: 300 });
    return NextResponse.json({ ok: true, leads });
  } catch (err) {
    console.error("[admin/leads] list failed:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
