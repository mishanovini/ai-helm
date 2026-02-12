import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  orgId: string | null;
  role: string;
}

interface AuthResponse {
  authRequired: boolean;
  user: AuthUser | null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AuthResponse>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await fetch("/auth/me");
      if (!res.ok) throw new Error("Failed to fetch auth status");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST" });
    queryClient.setQueryData(["auth", "me"], { authRequired: data?.authRequired ?? false, user: null });
    queryClient.invalidateQueries({ queryKey: ["auth"] });
  };

  return {
    user: data?.user ?? null,
    authRequired: data?.authRequired ?? false,
    isLoading,
    isAuthenticated: !!data?.user,
    isAdmin: data?.user?.role === "admin",
    error,
    logout,
  };
}
