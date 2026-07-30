/** RBAC helpers — mirror of the backend's app/level vocabulary. */

export const APPS = [
  "showroom",
  "shaxmatka",
  "deals",
  "crm",
  "clients",
  "accounting",
  "dashboard",
  "settings",
] as const;

export type AppName = (typeof APPS)[number];
export type Level = "none" | "view" | "edit" | "manage";

const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, manage: 3 };

/** Does `access` grant at least `action` on `app`? Superusers always pass. */
export function can(
  access: Record<string, string>,
  superuser: boolean,
  app: AppName,
  action: Level,
): boolean {
  if (superuser) return true;
  const current = (access[app] ?? "none") as Level;
  return RANK[current] >= RANK[action];
}
