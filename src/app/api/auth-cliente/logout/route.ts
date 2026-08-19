import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_CLIENTE } from "@/lib/get-cliente";

export async function POST() {
  const jar = await cookies();
  jar.delete(COOKIE_CLIENTE);
  return NextResponse.json({ ok: true });
}
