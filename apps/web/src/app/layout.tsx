import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Budi - AI-Powered Audio Mastering",
  description:
    "Professional audio mastering powered by AI. Analyze, fix, and master your tracks with intelligent processing.",
  keywords: ["audio mastering", "AI", "music production", "audio processing"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
