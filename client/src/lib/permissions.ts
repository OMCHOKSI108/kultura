/**
 * Kultura Centralized Frontend Permissions & RBAC Module
 * Defines canonical resource:action permissions and role mappings.
 */

export type AppPermission =
  | "chat:create"
  | "sessions:manage"
  | "models:select"
  | "models:load"
  | "models:download"
  | "providers:manage"
  | "observability:view"
  | "observability:export"
  | "users:manage"
  | "api_keys:manage"
  | "profile:edit";

export const ROLE_PERMISSIONS: Record<string, AppPermission[]> = {
  admin: [
    "chat:create",
    "sessions:manage",
    "models:select",
    "models:load",
    "models:download",
    "providers:manage",
    "observability:view",
    "observability:export",
    "users:manage",
    "api_keys:manage",
    "profile:edit",
  ],
  user: [
    "chat:create",
    "sessions:manage",
    "models:select",
    "models:load",
    "api_keys:manage",
    "profile:edit",
  ],
};

export function hasPermission(
  role: string | undefined | null,
  permission: AppPermission
): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}
