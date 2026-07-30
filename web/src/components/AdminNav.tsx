import type { ShellNavItem } from "./DashboardShell";
import { BanknoteIcon, BuildingIcon, ChartIcon, UsersIcon } from "./icons";

export type AdminSection = "users" | "disbursements" | "bi" | "clinics";

export function adminNavItems(active: AdminSection): ShellNavItem[] {
  return [
    {
      to: "/admin",
      label: "Users",
      icon: <UsersIcon />,
      active: active === "users",
    },
    {
      to: "/admin/disbursements",
      label: "Disbursements",
      icon: <BanknoteIcon />,
      active: active === "disbursements",
    },
    {
      to: "/admin/bi",
      label: "Business intelligence",
      icon: <ChartIcon />,
      active: active === "bi",
    },
    {
      to: "/admin/clinics",
      label: "Prospect clinics",
      icon: <BuildingIcon />,
      active: active === "clinics",
    },
  ];
}
