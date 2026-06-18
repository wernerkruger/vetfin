import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  borrowerLogin,
  fetchBorrowerMe,
  type BorrowerProfile,
} from "../lib/api";
import {
  clearBorrowerToken,
  getBorrowerToken,
  setBorrowerToken,
} from "../lib/borrowerAuth";

type BorrowerAuthContextValue = {
  borrower: BorrowerProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const BorrowerAuthContext = createContext<BorrowerAuthContextValue | null>(null);

export function BorrowerAuthProvider({ children }: { children: ReactNode }) {
  const [borrower, setBorrower] = useState<BorrowerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getBorrowerToken();
    if (!token) {
      setBorrower(null);
      setLoading(false);
      return;
    }

    try {
      const data = await fetchBorrowerMe();
      setBorrower(data.borrower);
    } catch {
      clearBorrowerToken();
      setBorrower(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await borrowerLogin(email, password);
    setBorrowerToken(result.token);
    setBorrower(result.borrower);
    return (
      result.redirectTo ??
      (result.mustChangePassword
        ? "/borrower/change-password"
        : "/borrower/dashboard")
    );
  }, []);

  const logout = useCallback(() => {
    clearBorrowerToken();
    setBorrower(null);
  }, []);

  const value = useMemo(
    () => ({
      borrower,
      loading,
      login,
      logout,
      refresh,
    }),
    [borrower, loading, login, logout, refresh],
  );

  return (
    <BorrowerAuthContext.Provider value={value}>
      {children}
    </BorrowerAuthContext.Provider>
  );
}

export function useBorrowerAuth(): BorrowerAuthContextValue {
  const ctx = useContext(BorrowerAuthContext);
  if (!ctx) {
    throw new Error("useBorrowerAuth must be used within BorrowerAuthProvider");
  }
  return ctx;
}
