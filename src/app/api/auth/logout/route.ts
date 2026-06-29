// POST /api/auth/logout
import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("qz-auth", "", { maxAge: 0, path: "/" });
  return res;
}
