// Enrichment orchestrator: runs the lead agent on a stored lead and writes the
// result back. Resilient by design — it NEVER throws, so it can be awaited from
// the form route and the email worker without risking intake (the lead is always
// stored first; enrichment is best-effort).

import { analyzeLead } from "@/agent/leadAgent";
import { getLead, applyAiEnrichment, storeAiFallback } from "@/lib/leads";
import type { Lead } from "@/types/lead";

const FALLBACK_REPLY =
  "Thank you for reaching out to FABRIOZA. We've received your enquiry and a member " +
  "of our team will get back to you shortly with the details needed to prepare your quote.\n\n" +
  "Warm regards,\nThe FABRIOZA Team";

function buildContent(lead: Lead): string {
  const parts = [
    lead.name && `Name: ${lead.name}`,
    lead.email && `Email: ${lead.email}`,
    lead.company && `Company: ${lead.company}`,
    lead.product_type && `Product type: ${lead.product_type}`,
    lead.quantity && `Quantity: ${lead.quantity}`,
    lead.message && `Message: ${lead.message}`,
  ].filter(Boolean);
  const text = parts.join("\n");
  return text || (lead.raw_content ?? "").slice(0, 4000);
}

/** Analyze a lead by id and persist the result. Safe to await; never throws. */
export async function enrichLead(id: string): Promise<void> {
  try {
    const lead = await getLead(id);
    if (!lead) return;

    const analysis = await analyzeLead(buildContent(lead));
    if (analysis) {
      await applyAiEnrichment(id, {
        ai_summary: analysis.summary,
        ai_intent: analysis.intent,
        ai_suggested_reply: analysis.suggested_reply,
        status: "drafted",
      });
    } else {
      // Both attempts failed → keep the lead, store a safe reply, leave status 'new'.
      await storeAiFallback(id, FALLBACK_REPLY);
    }
  } catch (err) {
    // Swallow: the lead is already stored (status 'new'); nothing is lost.
    console.error(`[enrich] failed for lead ${id}: ${(err as Error)?.message}`);
  }
}
