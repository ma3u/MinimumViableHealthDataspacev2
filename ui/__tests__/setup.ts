import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-auth (client-side hooks)
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { name: "Test User", email: "test@example.com" },
      roles: ["EDC_ADMIN"],
    },
    status: "authenticated",
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock next-auth/next (server-side getServerSession used by API route guards).
// Default: authenticated EDC_ADMIN session so API route tests exercise business
// logic rather than the auth guard. Override per-test with vi.mocked().
vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { name: "Test Admin", email: "admin@test.example" },
    roles: ["EDC_ADMIN"],
  }),
}));

// Mock auth-guard — Phase 24 added requireAuth() to all API routes.
// Default: returns authenticated EDC_ADMIN session so route tests exercise
// business logic. Override per-test with vi.mocked(requireAuth).
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    session: {
      user: {
        id: "test-admin",
        name: "Test Admin",
        email: "admin@test.example",
      },
      roles: ["EDC_ADMIN"],
      accessToken: "test-token",
    },
  }),
  isAuthError: vi.fn().mockReturnValue(false),
}));
