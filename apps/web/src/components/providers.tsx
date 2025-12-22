"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import { authApi, api } from "@/lib/api";

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      authApi
        .me()
        .then(({ user }) => setUser(user))
        .catch(() => {
          api.setToken(null);
          setUser(null);
        });
    } else {
      setLoading(false);
    }
  }, [setUser, setLoading]);

  return <>{children}</>;
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = localStorage.getItem("ui-storage");
    if (theme) {
      try {
        const { state } = JSON.parse(theme);
        if (state.theme === "dark") {
          document.documentElement.classList.add("dark");
        } else if (state.theme === "light") {
          document.documentElement.classList.remove("dark");
        } else {
          // System preference
          if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            document.documentElement.classList.add("dark");
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
