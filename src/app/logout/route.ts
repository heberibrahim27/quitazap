import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function GET() {
  const jar = await cookies();
  jar.delete("qz_auth");
  redirect("/login");
}
