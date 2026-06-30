// POST /api/auth/login — verify DASHBOARD_PASSWORD, set a signed session cookie.
import { NextResponse } from "next/server";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!process.env.DASHBOARD_PASSWORD || !process.env.AUTH_SESSION_SECRET) {
    return NextResponse.json({ ok: false, error: "Auth not configured" }, { status: 500 });
  }

  let password = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    /* fall through to invalid */
  }

  // Small fixed delay to blunt brute-force attempts.
  await new Promise((r) => setTimeout(r, 250));

  if (!verifyPassword(password)) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
