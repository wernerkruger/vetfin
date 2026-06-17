const TOKEN_KEY = "vetfin_practice_token";

export function getPracticeToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setPracticeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearPracticeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
