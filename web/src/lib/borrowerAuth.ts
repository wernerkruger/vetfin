const TOKEN_KEY = "vetfin_borrower_token";

export function getBorrowerToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setBorrowerToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearBorrowerToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
