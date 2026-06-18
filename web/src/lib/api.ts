import { getBorrowerToken } from "./borrowerAuth";
import { parseApiErrorPayload } from "./apiErrors";
export { ApiError } from "./apiErrors";
import { getPracticeToken } from "./practiceAuth";
import { getAdminToken } from "./adminAuth";

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured !== undefined && configured !== "") {
    return configured.replace(/\/$/, "");
  }
  if (import.meta.env.PROD) {
    return "";
  }
  return "http://localhost:3001";
}

const API_URL = resolveApiBaseUrl();

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  authToken?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = authToken ?? undefined;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw parseApiErrorPayload(data, response.status);
  }

  return data as T;
}

export function getApiBaseUrl(): string {
  return API_URL;
}

export type Customer = {
  id: string;
  clientUserId: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlaidAccountOption = {
  accountId: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  type: string;
  officialName: string | null;
};

export type LinkedPlaidAccount = PlaidAccountOption & {
  owners: Array<{
    names: string[];
    emails: string[];
    phoneNumbers: string[];
  }>;
  ach: { routing: string; account: string } | null;
};

export type CustomerProfile = {
  customer: Customer;
  plaidItems: Array<{
    id: string;
    itemId: string;
    institutionId: string | null;
    institutionName: string | null;
    createdAt: string;
  }>;
  bankAccounts: Array<{
    id: string;
    customerId: string;
    loanApplicationId: string | null;
    plaidItemId: string;
    plaidAccountId: string;
    name: string;
    mask: string | null;
    subtype: string | null;
    type: string;
    officialName: string | null;
    routing: string | null;
    accountNumberMask: string | null;
    owners: LinkedPlaidAccount["owners"];
    transactionCount: number;
    createdAt: string;
  }>;
};

export type BankTransaction = {
  id: string;
  customerId: string;
  loanApplicationId: string | null;
  bankAccountId: string;
  plaidTransactionId: string;
  plaidAccountId: string;
  amount: number;
  isoCurrencyCode: string | null;
  date: string;
  name: string;
  merchantName: string | null;
  categories: string[];
  pending: boolean;
  paymentChannel: string | null;
  createdAt: string;
};

export async function fetchPlaidStatus() {
  return apiFetch<{
    environment: string;
    sandboxInstitutionId: string;
    databasePath: string;
    encryptionEnabled: boolean;
  }>("/api/plaid/status");
}

export async function upsertCustomer(clientUserId: string, email?: string) {
  return apiFetch<{ customer: Customer }>("/api/customers", {
    method: "POST",
    body: JSON.stringify({ clientUserId, email }),
  });
}

export async function fetchCustomerProfile(customerId: string) {
  return apiFetch<CustomerProfile>(`/api/customers/${customerId}`);
}

export async function createLinkToken(customerId: string, clientUserId: string) {
  return apiFetch<{ linkToken: string; customerId: string }>(
    "/api/plaid/link-token",
    {
      method: "POST",
      body: JSON.stringify({ customerId, clientUserId }),
    },
  );
}

export async function exchangePublicToken(
  customerId: string,
  publicToken: string,
  institution?: { id?: string | null; name?: string | null },
) {
  return apiFetch<{
    customerId: string;
    plaidItemId: string;
    itemId: string;
    accessToken: string;
  }>("/api/plaid/exchange-public-token", {
    method: "POST",
    body: JSON.stringify({
      customerId,
      publicToken,
      institutionId: institution?.id ?? undefined,
      institutionName: institution?.name ?? undefined,
    }),
  });
}

export async function sandboxConnect(customerId: string) {
  return apiFetch<{
    customerId: string;
    plaidItemId: string;
    itemId: string;
    accessToken: string;
  }>("/api/plaid/sandbox/connect", {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
}

export async function listPlaidAccounts(customerId: string) {
  return apiFetch<{
    accounts: PlaidAccountOption[];
    plaidItemId: string;
    itemId: string;
  }>(`/api/plaid/accounts?customerId=${encodeURIComponent(customerId)}`);
}

export async function pullLinkedAccounts(
  customerId: string,
  accountIds: string[],
) {
  return apiFetch<{
    customerId: string;
    accounts: LinkedPlaidAccount[];
    transactionSync:
      | { added: number; modified: number; removed: number }
      | { error: string };
    transactions: BankTransaction[];
    stored: CustomerProfile;
  }>("/api/plaid/linked-accounts", {
    method: "POST",
    body: JSON.stringify({ customerId, accountIds }),
  });
}

export async function syncPlaidTransactions(
  customerId: string,
  accountIds?: string[],
) {
  return apiFetch<{
    customerId: string;
    added: number;
    modified: number;
    removed: number;
    transactions: BankTransaction[];
    stored: CustomerProfile;
  }>("/api/plaid/transactions/sync", {
    method: "POST",
    body: JSON.stringify({ customerId, accountIds }),
  });
}

export async function listBankTransactions(
  customerId: string,
  options?: { bankAccountId?: string; limit?: number },
) {
  const params = new URLSearchParams({ customerId });
  if (options?.bankAccountId) {
    params.set("bankAccountId", options.bankAccountId);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  return apiFetch<{ transactions: BankTransaction[] }>(
    `/api/plaid/transactions?${params}`,
  );
}

// —— Vet practice portal ——

export type VetPractice = {
  id: string;
  name: string;
  slug: string;
  email: string;
  contactName: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  mustChangePassword?: boolean;
  isLocked?: boolean;
  failedLoginAttempts?: number;
  createdAt: string;
  updatedAt: string;
};

export type PracticeReferral = {
  id: string;
  customerId: string;
  clientUserId: string;
  email: string | null;
  applicantName: string | null;
  applicationStatus: string;
  vetApproved: 0 | 1 | null;
  needsVetReview: boolean;
  statusLabel: string;
  referralSlug: string | null;
  applicationId: string | null;
  loanAmount: number | null;
  serviceType: string | null;
  animalType: string | null;
  animalName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PracticeStats = {
  totalApplications: number;
  submitted: number;
  vetApproved: number;
  fundingApproved: number;
  declined: number;
  started: number;
};

export type PracticeSignupInput = {
  name: string;
  email: string;
  password: string;
  contactName?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
  prospectClinicId?: string;
};

export type ProspectClinic = {
  id: string;
  category: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  stateShort: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  sourceUrl: string | null;
  email: string | null;
  signedUp: boolean;
  practiceId: string | null;
  createdAt: string;
  updatedAt: string;
};

function practiceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, init, getPracticeToken());
}

export async function practiceSignup(input: PracticeSignupInput) {
  return apiFetch<{
    practice: VetPractice;
    token: string;
    referralUrl: string;
  }>("/api/practices/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function searchProspectClinics(query: string) {
  const params = new URLSearchParams({ q: query });
  return apiFetch<{ clinics: ProspectClinic[] }>(
    `/api/practices/prospect-clinics/search?${params}`,
  );
}

export async function practiceLogin(email: string, password: string) {
  return apiFetch<{
    practice: VetPractice;
    token: string;
    referralUrl: string;
    redirectTo?: string;
    mustChangePassword?: boolean;
  }>("/api/practices/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function changePracticePassword(
  currentPassword: string,
  newPassword: string,
) {
  return practiceFetch<{ practice: VetPractice }>("/api/practices/me/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function fetchPracticeMe() {
  return practiceFetch<{
    practice: VetPractice;
    referralUrl: string;
    stats: PracticeStats;
  }>("/api/practices/me");
}

export async function fetchPracticeReferrals() {
  return practiceFetch<{
    referrals: PracticeReferral[];
    stats: PracticeStats;
  }>("/api/practices/me/referrals");
}

export async function vetApproveApplication(applicationId: string) {
  return practiceFetch<{ application: LoanApplication }>(
    `/api/practices/me/applications/${applicationId}/vet-approve`,
    { method: "POST" },
  );
}

export async function vetCancelApplication(applicationId: string) {
  return practiceFetch<{ application: LoanApplication }>(
    `/api/practices/me/applications/${applicationId}/vet-cancel`,
    { method: "POST" },
  );
}

export async function fetchPracticeQrData() {
  return practiceFetch<{ url: string; qrDataUrl: string }>(
    "/api/practices/me/qr-data",
  );
}

export async function fetchReferralPractice(slug: string) {
  return apiFetch<{
    practice: {
      id: string;
      name: string;
      slug: string;
      city: string | null;
      state: string | null;
    };
    referralUrl: string;
  }>(`/api/referral/${encodeURIComponent(slug)}`);
}

export async function submitLoanApplication(
  slug: string,
  input: { applicantName: string; email: string; phone?: string },
) {
  return apiFetch<{
    practice: VetPractice;
    application: {
      id: string;
      applicationStatus: string;
      createdAt: string;
    };
    message: string;
  }>(`/api/referral/${encodeURIComponent(slug)}/apply`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// —— Borrower accounts & loan applications ——

export type LoanApplication = {
  id: string;
  customerId: string;
  practiceId: string;
  practiceName: string | null;
  referralSlug: string;
  status: string;
  statusLabel?: string;
  vetApproved?: 0 | 1 | null;
  vetReviewedAt?: string | null;
  loanAmount: number | null;
  serviceType: string | null;
  animalType: string | null;
  animalName: string | null;
  amountRepaid: number | null;
  monthlyPayment: number | null;
  termMonths: number | null;
  termMonthsRemaining: number | null;
  interestRate: number | null;
  approvedAt: string | null;
  disbursementStatus?: "pending" | "disbursed" | null;
  disbursementStatusLabel?: string | null;
  disbursedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BorrowerDashboard = {
  borrower: BorrowerProfile;
  loans: LoanApplication[];
  inProgress: LoanApplication[];
  submitted: LoanApplication[];
  activeLoans: LoanApplication[];
  declined: LoanApplication[];
  practiceSlugs: Array<{ slug: string; practiceName: string }>;
};

export type BorrowerProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  applicantName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  hasSsnLast4: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  mustChangePassword?: boolean;
  isLocked?: boolean;
  failedLoginAttempts?: number;
};

function borrowerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, init, getBorrowerToken());
}

export async function borrowerSignup(input: {
  referralSlug: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  return apiFetch<{
    token: string;
    borrower: BorrowerProfile;
    application: LoanApplication;
    practice: { id: string; name: string; slug: string };
  }>("/api/borrowers/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function borrowerLogin(email: string, password: string) {
  return apiFetch<{
    token: string;
    borrower: BorrowerProfile;
    applications: LoanApplication[];
    redirectTo?: string;
    mustChangePassword?: boolean;
  }>("/api/borrowers/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function changeBorrowerPassword(
  currentPassword: string,
  newPassword: string,
) {
  return borrowerFetch<{ borrower: BorrowerProfile }>(
    "/api/borrowers/me/change-password",
    {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    },
  );
}

export async function fetchBorrowerMe() {
  return borrowerFetch<{
    borrower: BorrowerProfile;
    applications: LoanApplication[];
  }>("/api/borrowers/me");
}

export async function fetchBorrowerDashboard() {
  return borrowerFetch<BorrowerDashboard>("/api/borrowers/me/dashboard");
}

export async function updateBorrowerProfile(input: {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  ssnLast4: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
}) {
  return borrowerFetch<{ borrower: BorrowerProfile }>("/api/borrowers/me/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchCurrentApplication(referralSlug: string) {
  return borrowerFetch<{
    application: LoanApplication;
    practice: { id: string; name: string; slug: string };
    profile: BorrowerProfile | null;
  }>(`/api/applications/current?referralSlug=${encodeURIComponent(referralSlug)}`);
}

export async function completeApplicationProfile(applicationId: string) {
  return borrowerFetch<{ application: LoanApplication }>(
    `/api/applications/${applicationId}/complete-profile`,
    { method: "POST" },
  );
}

export async function updateApplicationLoan(
  applicationId: string,
  input: {
    loanAmount: number;
    serviceType: string;
    animalType: string;
    animalName?: string;
  },
) {
  return borrowerFetch<{ application: LoanApplication }>(
    `/api/applications/${applicationId}/loan`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function createApplicationLinkToken(applicationId: string) {
  return borrowerFetch<{ linkToken: string; customerId: string }>(
    `/api/applications/${applicationId}/plaid/link-token`,
    { method: "POST" },
  );
}

export async function exchangeApplicationPlaid(
  applicationId: string,
  publicToken: string,
  institution?: { id?: string | null; name?: string | null },
) {
  return borrowerFetch<{
    itemId: string;
    accounts: PlaidAccountOption[];
  }>(`/api/applications/${applicationId}/plaid/exchange`, {
    method: "POST",
    body: JSON.stringify({
      publicToken,
      institutionId: institution?.id ?? undefined,
      institutionName: institution?.name ?? undefined,
    }),
  });
}

export async function listApplicationPlaidAccounts(applicationId: string) {
  return borrowerFetch<{ accounts: PlaidAccountOption[]; itemId: string }>(
    `/api/applications/${applicationId}/plaid/accounts`,
  );
}

export async function linkApplicationBankAccounts(
  applicationId: string,
  accountIds: string[],
) {
  return borrowerFetch<{
    application: LoanApplication;
    accounts: LinkedPlaidAccount[];
  }>(`/api/applications/${applicationId}/plaid/linked-accounts`, {
    method: "POST",
    body: JSON.stringify({ accountIds }),
  });
}

export async function sandboxConnectApplication(applicationId: string) {
  return borrowerFetch<{ itemId: string; accounts: PlaidAccountOption[] }>(
    `/api/applications/${applicationId}/plaid/sandbox-connect`,
    { method: "POST" },
  );
}

export async function submitApplication(applicationId: string) {
  return borrowerFetch<{
    application: LoanApplication;
    practice: VetPractice | null;
  }>(`/api/applications/${applicationId}/submit`, { method: "POST" });
}

export async function cancelLoanApplication(applicationId: string) {
  return borrowerFetch<{ application: LoanApplication }>(
    `/api/applications/${applicationId}/cancel`,
    { method: "POST" },
  );
}

// —— Admin ——

export type AdminApplication = LoanApplication & {
  practiceStatusLabel: string;
  canApproveFunding: boolean;
  canDeclineFunding: boolean;
};

export type AdminBorrowerDetail = {
  borrower: BorrowerProfile;
  applications: AdminApplication[];
};

export type AdminUser = {
  id: string;
  type: "borrower" | "practice";
  email: string;
  displayName: string;
  hasLogin: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  createdAt: string;
};

function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, init, getAdminToken());
}

export async function adminLogin(username: string, password: string) {
  return apiFetch<{ token: string; username: string }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchAdminMe() {
  return adminFetch<{ username: string }>("/api/admin/me");
}

export async function fetchAdminUsers() {
  return adminFetch<{ practices: AdminUser[]; borrowers: AdminUser[] }>(
    "/api/admin/users",
  );
}

export async function adminUnlockUser(
  type: "borrower" | "practice",
  id: string,
) {
  return adminFetch<{ message: string }>(
    `/api/admin/users/${type}/${id}/unlock`,
    { method: "POST" },
  );
}

export async function adminResetUserPassword(
  type: "borrower" | "practice",
  id: string,
) {
  return adminFetch<{
    message: string;
    temporaryPassword: string;
  }>(`/api/admin/users/${type}/${id}/reset-password`, { method: "POST" });
}

export async function fetchAdminBorrower(id: string) {
  return adminFetch<AdminBorrowerDetail>(`/api/admin/borrowers/${id}`);
}

export async function adminApproveApplication(applicationId: string) {
  return adminFetch<{ application: LoanApplication }>(
    `/api/admin/applications/${applicationId}/approve`,
    { method: "POST" },
  );
}

export async function adminDeclineApplication(applicationId: string) {
  return adminFetch<{ application: LoanApplication }>(
    `/api/admin/applications/${applicationId}/decline`,
    { method: "POST" },
  );
}

export type AdminDisbursement = {
  applicationId: string;
  customerId: string;
  borrowerName: string;
  borrowerEmail: string | null;
  practiceName: string;
  loanAmount: number | null;
  serviceType: string | null;
  animalName: string | null;
  animalType: string | null;
  approvedAt: string | null;
  disbursementStatus: "pending" | "disbursed";
  disbursementStatusLabel: string;
  disbursedAt: string | null;
  updatedAt: string;
};

export async function fetchAdminDisbursements() {
  return adminFetch<{ disbursements: AdminDisbursement[] }>(
    "/api/admin/disbursements",
  );
}

export async function adminMarkDisbursementSent(applicationId: string) {
  return adminFetch<{
    disbursement?: AdminDisbursement;
    application: LoanApplication;
  }>(`/api/admin/disbursements/${applicationId}/mark-sent`, { method: "POST" });
}

export type AdminBiMonthlyCount = { month: string; count: number };
export type AdminBiMonthlyAmount = { month: string; amount: number; count: number };
export type AdminBiRepaymentBucket =
  | "paid_off"
  | "on_time"
  | "behind"
  | "pending_first";

export type AdminBiAnalytics = {
  generatedAt: string;
  practices: {
    total: number;
    monthlySignups: AdminBiMonthlyCount[];
    monthOverMonthGrowthPct: number | null;
  };
  borrowers: {
    total: number;
    totalWithLogin: number;
    monthlySignups: AdminBiMonthlyCount[];
    monthOverMonthGrowthPct: number | null;
  };
  disbursements: {
    totalAmount: number;
    totalCount: number;
    pendingAmount: number;
    pendingCount: number;
    monthly: AdminBiMonthlyAmount[];
    monthOverMonthGrowthPct: number | null;
  };
  repayments: {
    totalActiveLoans: number;
    byCount: Record<AdminBiRepaymentBucket, number>;
    byOutstandingPrincipal: Record<AdminBiRepaymentBucket, number>;
    delinquentAmount: number;
    countSharePct: Record<AdminBiRepaymentBucket, number>;
    principalSharePct: Record<AdminBiRepaymentBucket, number>;
  };
};

export async function fetchAdminBi() {
  return adminFetch<AdminBiAnalytics>("/api/admin/bi");
}

export type AdminProspectClinicFilters = {
  category?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  stateShort?: string;
  phone?: string;
  website?: string;
  rating?: string;
  sourceUrl?: string;
  email?: string;
  signedUp?: "yes" | "no" | "all";
  page?: number;
  limit?: number;
};

export type AdminProspectClinicsResponse = {
  clinics: ProspectClinic[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function fetchAdminProspectClinics(
  filters: AdminProspectClinicFilters = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === "signedUp") continue;
    if (value != null && value !== "") {
      params.set(key, String(value));
    }
  }
  if (filters.signedUp === "yes" || filters.signedUp === "no") {
    params.set("signedUp", filters.signedUp);
  }
  const qs = params.toString();
  return adminFetch<AdminProspectClinicsResponse>(
    `/api/admin/prospect-clinics${qs ? `?${qs}` : ""}`,
  );
}
