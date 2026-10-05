/**
 * The logins the hub creates for the Klarbefund app (ADR-054), told apart by
 * shape from the demo personas. No imports, so a page may use it too.
 */
const SANDBOX_USERNAME = /^kb-[a-hj-km-np-z2-9]{8}$/;

/** True for a login this hub created for the app, never for a demo persona. */
export function isSandboxUsername(username: string): boolean {
  return SANDBOX_USERNAME.test(username);
}

/** The record a sandbox login owns: `kb-ab3dk7mn` owns `KB-AB3DK7MN`. */
export function sandboxPatientId(username: string): string | null {
  return isSandboxUsername(username)
    ? `KB-${username.slice(3).toUpperCase()}`
    : null;
}
