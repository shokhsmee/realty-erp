import type { AppName } from "@/lib/permissions";

export interface NavItem {
  label: string;
  to: string;
  app: AppName;
  glyph: string;
  group: string;
}

/** Nav is filtered at render time by can(app, "view"). */
export const NAV: NavItem[] = [
  { group: "Sotuv", label: "Obyektlar", to: "/obyektlar", app: "shaxmatka", glyph: "▤" },
  { group: "Sotuv", label: "Showroom", to: "/showroom", app: "showroom", glyph: "◧" },
  { group: "Sotuv", label: "Shaxmatka", to: "/shaxmatka", app: "shaxmatka", glyph: "▦" },
  { group: "Sotuv", label: "Planirovkalar", to: "/planirovkalar", app: "shaxmatka", glyph: "◱" },
  { group: "Sotuv", label: "Bitimlar", to: "/deals", app: "deals", glyph: "₮" },
  { group: "Sotuv", label: "Sotuv sozlamalari", to: "/sales/settings", app: "deals", glyph: "⚙" },
  { group: "CRM", label: "Voronka", to: "/crm", app: "crm", glyph: "⇲" },
  { group: "CRM", label: "Kontaktlar", to: "/kontaktlar", app: "clients", glyph: "☏" },
  { group: "CRM", label: "Mijozlar", to: "/clients", app: "clients", glyph: "☺" },
  { group: "Moliya", label: "Buxgalteriya", to: "/accounting", app: "accounting", glyph: "₳" },
  { group: "Moliya", label: "Dashboard", to: "/dashboard", app: "dashboard", glyph: "◪" },
  { group: "Tizim", label: "Foydalanuvchilar", to: "/settings/users", app: "settings", glyph: "⚙" },
  { group: "Tizim", label: "Valyuta", to: "/settings/currency", app: "settings", glyph: "₵" },
];
