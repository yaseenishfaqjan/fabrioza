// GET  /api/admin/leads/[id]  — fetch one lead.
// PATCH /api/admin/leads/[id] — update edited reply and/or status.
import { NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leads";
import { requireSession } from "@/lib/auth";
import { LEAD_STATUSES, type LeadStatus } from "@/types/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireSession(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const lead = await getLead(params.id);
  if (!lead) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, lead });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireSession(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { ai_suggested_reply?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { ai_suggested_reply?: string; status?: LeadStatus } = {};
  if (typeof body.ai_suggested_reply === "string") {
    patch.ai_suggested_reply = body.ai_suggested_reply.slice(0, 5000);
  }
  if (
    typeof body.status === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(body.status)
  ) {
    patch.status = body.status as LeadStatus;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  try {
    const lead = await updateLead(params.id, patch);
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    console.error("[admin/leads/:id] update failed:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
