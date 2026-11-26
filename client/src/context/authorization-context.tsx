"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { AppPermission, hasPermission } from "@/lib/permissions";

interface AuthorizationContextType {
  can: (permission: AppPermission) => boolean;
  isAdmin: boolean;
  role: string | null;
}

const AuthorizationContext = createContext<AuthorizationContextType | undefined>(undefined);

export function AuthorizationProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  const value = useMemo<AuthorizationContextType>(() => {
    return {
      can: (permission: AppPermission) => {
        if (loading || !user) return false;
        return hasPermission(user.role, permission);
      },
      isAdmin: !loading && user?.role === "admin",
      role: user?.role || null,
    };
  }, [user, loading]);

  return (
    <AuthorizationContext.Provider value={value}>
      {children}
    </AuthorizationContext.Provider>
  );
}

export function useAuthorization() {
  const ctx = useContext(AuthorizationContext);
  if (!ctx) {
    throw new Error("useAuthorization must be used within an AuthorizationProvider");
  }
  return ctx;
}
