import type { ShellNavItem } from "./DashboardShell";
import {
  BanknoteIcon,
  BuildingIcon,
  ChartIcon,
  ClipboardIcon,
  UsersIcon,
} from "./icons";

export type AdminSection =
  | "users"
  | "new-loans"
  | "disbursements"
  | "bi"
  | "clinics";

export function adminNavItems(
  active: AdminSection,
  opts?: { newLoansCount?: number; pendingDisbursementsCount?: number },
): ShellNavItem[] {
  const newLoansCount = opts?.newLoansCount;
  const newLoansLabel =
    typeof newLoansCount === "number"
      ? `New loans (${newLoansCount})`
      : "New loans";

  const disbursementsCount = opts?.pendingDisbursementsCount;
  const disbursementsLabel =
    typeof disbursementsCount === "number"
      ? `Disbursements (${disbursementsCount})`
      : "Disbursements";

  return [
    {
      to: "/admin",
      label: "Users",
      icon: <UsersIcon />,
      active: active === "users",
    },
    {
      to: "/admin/new-loans",
      label: newLoansLabel,
      icon: <ClipboardIcon />,
      active: active === "new-loans",
    },
    {
      to: "/admin/disbursements",
      label: disbursementsLabel,
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
