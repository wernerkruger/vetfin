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
  fetchPracticeMe,
  practiceLogin,
  practiceSignup,
  type PracticeSignupInput,
  type VetPractice,
} from "../lib/api";
import {
  clearPracticeToken,
  getPracticeToken,
  setPracticeToken,
} from "../lib/practiceAuth";

type PracticeAuthContextValue = {
  practice: VetPractice | null;
  referralUrl: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string>;
  signup: (input: PracticeSignupInput) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const PracticeAuthContext = createContext<PracticeAuthContextValue | null>(
  null,
);

export function PracticeAuthProvider({ children }: { children: ReactNode }) {
  const [practice, setPractice] = useState<VetPractice | null>(null);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getPracticeToken();
    if (!token) {
      setPractice(null);
      setReferralUrl(null);
      setLoading(false);
      return;
    }

    try {
      const data = await fetchPracticeMe();
      setPractice(data.practice);
      setReferralUrl(data.referralUrl);
    } catch {
      clearPracticeToken();
      setPractice(null);
      setReferralUrl(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await practiceLogin(email, password);
    setPracticeToken(result.token);
    setPractice(result.practice);
    setReferralUrl(result.referralUrl);
    return (
      result.redirectTo ??
      (result.mustChangePassword
        ? "/practice/change-password"
        : "/practice/dashboard")
    );
  }, []);

  const signup = useCallback(async (input: PracticeSignupInput) => {
    const result = await practiceSignup(input);
    setPracticeToken(result.token);
    setPractice(result.practice);
    setReferralUrl(result.referralUrl);
  }, []);

  const logout = useCallback(() => {
    clearPracticeToken();
    setPractice(null);
    setReferralUrl(null);
  }, []);

  const value = useMemo(
    () => ({
      practice,
      referralUrl,
      loading,
      login,
      signup,
      logout,
      refresh,
    }),
    [practice, referralUrl, loading, login, signup, logout, refresh],
  );

  return (
    <PracticeAuthContext.Provider value={value}>
      {children}
    </PracticeAuthContext.Provider>
  );
}

export function usePracticeAuth(): PracticeAuthContextValue {
  const ctx = useContext(PracticeAuthContext);
  if (!ctx) {
    throw new Error("usePracticeAuth must be used within PracticeAuthProvider");
  }
  return ctx;
}
