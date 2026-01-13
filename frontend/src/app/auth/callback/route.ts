import { NextResponse } from "next/server";

export async function GET(req: Request) {
  // Supabase JS di browser akan ambil token dari hash URL.
  // Kita cukup redirect ke halaman setelah login.
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
