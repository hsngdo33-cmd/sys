export type StaffRole = "owner" | "manager" | "cashier" | "inventory" | "accountant";

export type Permission =
  | "dashboard:view"
  | "sales:manage"
  | "purchases:manage"
  | "inventory:manage"
  | "operations:manage"
  | "reports:view"
  | "settings:manage";

export const roleLabels: Record<StaffRole, string> = {
  owner: "مالك / مدير",
  manager: "مدير فرع",
  cashier: "كاشير",
  inventory: "مسؤول مخزن",
  accountant: "محاسب",
};

export const rolePermissions: Record<StaffRole, Permission[]> = {
  owner: ["dashboard:view", "sales:manage", "purchases:manage", "inventory:manage", "operations:manage", "reports:view", "settings:manage"],
  manager: ["dashboard:view", "sales:manage", "purchases:manage", "inventory:manage", "operations:manage", "reports:view"],
  cashier: ["dashboard:view", "sales:manage", "purchases:manage", "operations:manage"],
  inventory: ["dashboard:view", "inventory:manage", "operations:manage"],
  accountant: ["dashboard:view", "operations:manage", "reports:view"],
};

export function normalizeStaffRole(role: unknown): StaffRole {
  if (role === "owner" || role === "manager" || role === "cashier" || role === "inventory" || role === "accountant") {
    return role;
  }
  return "cashier";
}

export function hasPermission(role: unknown, permission: Permission) {
  return rolePermissions[normalizeStaffRole(role)].includes(permission);
}

export function permissionForPath(pathname: string): Permission {
  if (pathname.startsWith("/settings")) return "settings:manage";
  if (pathname.startsWith("/reports")) return "reports:view";
  if (pathname.startsWith("/operations")) return "operations:manage";
  if (pathname.startsWith("/inventory")) return "inventory:manage";
  if (pathname.startsWith("/suppliers")) return "purchases:manage";
  if (pathname.startsWith("/customer")) return "sales:manage";
  return "dashboard:view";
}
