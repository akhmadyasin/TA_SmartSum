"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login"); // ubah ke /dashboard kalau mau langsung ke dashboard
  }, [router]);
  return null;
}
