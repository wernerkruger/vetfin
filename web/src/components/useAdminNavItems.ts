import { useEffect, useMemo, useState } from "react";
import {
  fetchAdminPendingDisbursementsCount,
  fetchAdminPendingFundingCount,
} from "../lib/api";
import { adminNavItems, type AdminSection } from "./AdminNav";
import type { ShellNavItem } from "./DashboardShell";

export const ADMIN_PENDING_FUNDING_EVENT = "vetfin-admin-pending-funding";
export const ADMIN_PENDING_DISBURSEMENTS_EVENT =
  "vetfin-admin-pending-disbursements";

export function notifyAdminPendingFundingChanged() {
  window.dispatchEvent(new Event(ADMIN_PENDING_FUNDING_EVENT));
}

export function notifyAdminPendingDisbursementsChanged() {
  window.dispatchEvent(new Event(ADMIN_PENDING_DISBURSEMENTS_EVENT));
}

/** Admin sidebar items with live new-loans and pending-disbursements counts. */
export function useAdminNavItems(active: AdminSection): ShellNavItem[] {
  const [newLoansCount, setNewLoansCount] = useState(0);
  const [pendingDisbursementsCount, setPendingDisbursementsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function refreshFunding() {
      void fetchAdminPendingFundingCount()
        .then((data) => {
          if (!cancelled) setNewLoansCount(data.count);
        })
        .catch(() => {
          if (!cancelled) setNewLoansCount(0);
        });
    }

    function refreshDisbursements() {
      void fetchAdminPendingDisbursementsCount()
        .then((data) => {
          if (!cancelled) setPendingDisbursementsCount(data.count);
        })
        .catch(() => {
          if (!cancelled) setPendingDisbursementsCount(0);
        });
    }

    function refreshAll() {
      refreshFunding();
      refreshDisbursements();
    }

    refreshAll();
    window.addEventListener(ADMIN_PENDING_FUNDING_EVENT, refreshFunding);
    window.addEventListener(
      ADMIN_PENDING_DISBURSEMENTS_EVENT,
      refreshDisbursements,
    );
    return () => {
      cancelled = true;
      window.removeEventListener(ADMIN_PENDING_FUNDING_EVENT, refreshFunding);
      window.removeEventListener(
        ADMIN_PENDING_DISBURSEMENTS_EVENT,
        refreshDisbursements,
      );
    };
  }, [active]);

  return useMemo(
    () =>
      adminNavItems(active, { newLoansCount, pendingDisbursementsCount }),
    [active, newLoansCount, pendingDisbursementsCount],
  );
}
