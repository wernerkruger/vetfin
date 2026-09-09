import type { ShellNavItem } from "./DashboardShell";
import {
  CheckCircleIcon,
  ClipboardIcon,
  ClockIcon,
  HomeIcon,
  XCircleIcon,
} from "./icons";

export type PracticeSection =
  | "dashboard"
  | "review"
  | "open"
  | "approved"
  | "declined";

export function practiceNavItems(active: PracticeSection): ShellNavItem[] {
  return [
    {
      to: "/practice/dashboard",
      label: "Dashboard",
      icon: <HomeIcon />,
      active: active === "dashboard",
    },
    {
      to: "/practice/loans/review",
      label: "Needs review",
      icon: <ClipboardIcon />,
      active: active === "review",
    },
    {
      to: "/practice/loans/open",
      label: "Open loans",
      icon: <ClockIcon />,
      active: active === "open",
    },
    {
      to: "/practice/loans/approved",
      label: "Approved loans",
      icon: <CheckCircleIcon />,
      active: active === "approved",
    },
    {
      to: "/practice/loans/declined",
      label: "Declined",
      icon: <XCircleIcon />,
      active: active === "declined",
    },
  ];
}
