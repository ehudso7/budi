"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Music } from "lucide-react";
import { useAuthStore } from "@/lib/store";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden w-1/2 bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-foreground/10">
            <Music className="h-12 w-12 text-primary-foreground" />
          </div>
          <h1 className="mb-2 text-4xl font-bold text-primary-foreground">
            Budi
          </h1>
          <p className="text-lg text-primary-foreground/80">
            AI-Powered Audio Mastering
          </p>
        </div>
        <div className="mt-12 max-w-md px-8 text-center">
          <p className="text-primary-foreground/70">
            Professional audio mastering powered by AI. Analyze, fix, and master
            your tracks with intelligent processing.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex w-full items-center justify-center p-8 lg:w-1/2">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
