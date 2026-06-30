// FABRIOZA lead agent (OpenAI Agents SDK).
// One agent reads a lead's content and returns structured analysis.
// Output is strictly validated with zod; malformed output is retried once.

import { Agent, run } from "@openai/agents";
import { z } from "zod";

export const LeadAnalysisSchema = z.object({
  summary: z.string().max(600),
  intent: z.enum(["hot", "warm", "cold", "spam"]),
  product_type: z.string().max(200),
  missing_info: z.array(z.string().max(160)).max(20),
  suggested_reply: z.string().max(3000),
});

export type LeadAnalysis = z.infer<typeof LeadAnalysisSchema>;

const INSTRUCTIONS = `You are the lead analyst for FABRIOZA, a custom apparel manufacturer that works as a DEVELOPMENT PARTNER for brands — not just a factory. Your tone is warm, professional, and concise.

Facts you may rely on (never invent anything beyond these):
- ISO 9001 certified; MOQ from 50 pieces per style; free quote within 24 hours.
- Factory-direct pricing; OEM and ODM; worldwide shipping.
- Sampling in 5-7 days (sample cost credited to the bulk order); bulk production in 2-4 weeks.
- Decoration: sublimation, screen print, DTG/DTF, heat transfer, 3D puff & flat embroidery.

Analyze the customer's enquiry and produce a JSON object with EXACTLY these keys:
- "summary": one or two sentences capturing what they want.
- "intent": one of:
    "hot"  = clear buying intent (specific product + quantity/deadline, ready to proceed),
    "warm" = interested and asking questions with some detail,
    "cold" = vague or very early,
    "spam" = irrelevant, promotional, or not a genuine apparel enquiry.
- "product_type": the garment/product they're asking about (e.g. "hoodies", "t-shirts", "team uniforms"); empty string "" if unclear.
- "missing_info": an array of the quote essentials NOT yet provided, using EXACTLY these labels when missing:
    "design/artwork (vector or high-res)",
    "garment style + colour/fabric",
    "embroidery/print placement + size",
    "sizes",
    "quantity".
  Include only the ones still missing; use [] if all are present.
- "suggested_reply": a warm, professional, concise email (about 120-160 words) that:
    1) thanks them,
    2) shows we understood their SPECIFIC enquiry,
    3) asks them to provide the items listed in missing_info so we can prepare a quote,
    4) NEVER states or invents a price — if they asked about price, say we will send an exact quote once the details are received,
    5) signs off exactly as: "Warm regards,\\nThe FABRIOZA Team".

Special rule: if "intent" is "spam", set "suggested_reply" to "" (empty string) and "missing_info" to []. Do not write a real reply for spam.

Output ONLY the JSON object. No markdown, no code fences, no commentary.`;

let _agent: Agent | null = null;

function getAgent(): Agent {
  if (_agent) return _agent;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const t = Number.parseFloat(process.env.OPENAI_TEMPERATURE ?? "0.4");
  _agent = new Agent({
    name: "FABRIOZA Lead Analyst",
    instructions: INSTRUCTIONS,
    model,
    modelSettings: { temperature: Number.isFinite(t) ? t : 0.4 },
  });
  return _agent;
}

/** Strip ```json … ``` fences if the model added them despite instructions. */
function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}

/**
 * Run the agent on a lead's content. Validates with zod, retries once on
 * malformed output, and returns null if both attempts fail (caller then
 * stores a safe fallback and keeps the lead).
 */
export async function analyzeLead(content: string): Promise<LeadAnalysis | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await run(getAgent(), content);
      const raw = (result.finalOutput ?? "").toString();
      const obj = JSON.parse(stripFences(raw));
      const parsed = LeadAnalysisSchema.safeParse(obj);
      if (parsed.success) {
        const data = parsed.data;
        // Enforce the spam rule regardless of what the model produced.
        if (data.intent === "spam") {
          data.suggested_reply = "";
          data.missing_info = [];
        }
        return data;
      }
      console.warn(`[agent] attempt ${attempt}: zod validation failed: ${parsed.error.issues[0]?.message}`);
    } catch (err) {
      console.warn(`[agent] attempt ${attempt} failed: ${(err as Error)?.message}`);
    }
  }
  return null;
}
