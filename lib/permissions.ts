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

export const permissionLabels: Record<Permission, string> = {
  "dashboard:view": "لوحة التحكم",
  "sales:manage": "البيع والعملاء",
  "purchases:manage": "التوريد والموردين",
  "inventory:manage": "المخزون والأصناف",
  "operations:manage": "الخزنة والورديات",
  "reports:view": "التقارير",
  "settings:manage": "الإعدادات",
};

export type StaffRoleTemplate = {
  key: string;
  title: string;
  role: StaffRole;
  description: string;
};

export function staffTemplatesForActivity(activityType: string): StaffRoleTemplate[] {
  const common: StaffRoleTemplate[] = [
    { key: "owner", title: "مالك / مدير عام", role: "owner", description: "كل الصلاحيات والإعدادات والتقارير." },
    { key: "manager", title: "مدير تشغيل", role: "manager", description: "متابعة المبيعات والمشتريات والمخزون والعمليات بدون إدارة الإعدادات." },
    { key: "cashier", title: "كاشير", role: "cashier", description: "بيع وتحصيل وفتح/قفل وردية." },
    { key: "inventory", title: "مسؤول مخزن", role: "inventory", description: "إدارة الأصناف وحركة المخزون." },
    { key: "accountant", title: "محاسب", role: "accountant", description: "تقارير وخزنة ومراجعة أرصدة." },
  ];

  if (activityType === "pharmacy") {
    return [
      { key: "pharmacy-manager", title: "مدير صيدلية", role: "manager", description: "بيع وتوريد ومخزون وتقارير، مناسب لمتابعة الصلاحية والتشغيلات." },
      { key: "pharmacy-cashier", title: "صيدلي / كاشير", role: "cashier", description: "بيع وتحصيل وعمليات وردية." },
      { key: "pharmacy-stock", title: "مسؤول نواقص وصلاحية", role: "inventory", description: "إدارة المخزون والأصناف بدون صلاحيات مالية واسعة." },
      ...common.filter((item) => item.role === "owner" || item.role === "accountant"),
    ];
  }

  if (activityType === "clothes") {
    return [
      { key: "clothes-sales", title: "بائع ملابس", role: "cashier", description: "بيع ومرتجعات وتحصيل." },
      { key: "clothes-stock", title: "مسؤول مقاسات وألوان", role: "inventory", description: "إدارة الأصناف والمخزون حسب اللون والمقاس." },
      ...common.filter((item) => item.role === "owner" || item.role === "manager" || item.role === "accountant"),
    ];
  }

  if (activityType === "services") {
    return [
      { key: "service-frontdesk", title: "استقبال / كاشير", role: "cashier", description: "تحصيل وعمليات يومية." },
      { key: "service-accountant", title: "محاسب خدمات", role: "accountant", description: "تقارير وخزنة وأرصدة." },
      ...common.filter((item) => item.role === "owner" || item.role === "manager"),
    ];
  }

  return common;
}

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
