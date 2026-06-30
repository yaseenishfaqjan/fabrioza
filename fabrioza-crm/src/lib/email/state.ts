// IMAP UID watermark persisted in the worker_state table.
// We track the last processed UID (plus UIDVALIDITY) so the worker only
// fetches newer messages and NEVER modifies IMAP flags.
import { getDb } from "@/lib/db";

const KEY = "email_intake";

export interface IntakeState {
  uidValidity: string;
  lastUid: number;
}

export async function getIntakeState(): Promise<IntakeState | null> {
  const db = getDb();
  const { data, error } = await db
    .from("worker_state")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();

  if (error) throw new Error(`getIntakeState failed: ${error.message}`);
  if (!data?.value) return null;
  try {
    const parsed = JSON.parse(data.value as string);
    if (typeof parsed?.uidValidity === "string" && typeof parsed?.lastUid === "number") {
      return parsed as IntakeState;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setIntakeState(state: IntakeState): Promise<void> {
  const db = getDb();
  const { error } = await db.from("worker_state").upsert(
    { key: KEY, value: JSON.stringify(state), updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw new Error(`setIntakeState failed: ${error.message}`);
}
