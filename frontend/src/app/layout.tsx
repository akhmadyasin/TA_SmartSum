import "./globals.css";  // global utama
import "./auth.css";     // css auth (sekarang satu folder dgn layout)
import { Inter } from "next/font/google";

import { ReactNode } from "react";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Voice to Text",
  description: "Realtime transcription with Next.js + TypeScript",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
