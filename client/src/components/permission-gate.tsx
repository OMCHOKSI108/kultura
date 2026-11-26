"use client";

import React from "react";
import { useAuthorization } from "@/context/authorization-context";
import { AppPermission } from "@/lib/permissions";
import { ShieldAlert } from "lucide-react";

interface PermissionGateProps {
  permission: AppPermission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const { can } = useAuthorization();

  if (!can(permission)) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

export function AccessDeniedView({
  title = "Access Denied",
  message = "You do not have permission to view or manage this administrative resource.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-4 shadow-lg shadow-rose-500/5">
        <ShieldAlert className="w-7 h-7" aria-hidden="true" />
      </div>
      <h3 className="text-xl font-semibold tracking-tight text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
    </div>
  );
}
