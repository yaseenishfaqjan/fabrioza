// POST /api/admin/leads/[id]/draft — create a Gmail DRAFT reply (never sends).
// Body: { subject?, reply }. Persists the edited reply and sets status='drafted'.
import { NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leads";
import { requireSession } from "@/lib/auth";
import { createGmailDraft } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireSession(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { subject?: unknown; reply?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const reply = typeof body.reply === "string" ? body.reply : "";
  const subject =
    (typeof body.subject === "string" && body.subject.trim()) || "Re: your FABRIOZA enquiry";

  if (!reply.trim()) {
    return NextResponse.json({ ok: false, error: "Reply is empty" }, { status: 400 });
  }

  const lead = await getLead(params.id);
  if (!lead) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!lead.email) {
    return NextResponse.json(
      { ok: false, error: "This lead has no email address to reply to." },
      { status: 400 }
    );
  }

  try {
    const draft = await createGmailDraft({ to: lead.email, subject, body: reply });
    // Persist the edited reply and mark as drafted.
    await updateLead(params.id, { ai_suggested_reply: reply, status: "drafted" });
    return NextResponse.json({ ok: true, draftId: draft.id });
  } catch (err) {
    // Includes the graceful "Gmail not configured" message.
    const message = (err as Error)?.message ?? "Draft failed";
    console.error("[admin/leads/:id/draft] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
