/**
 * Tests for Auth and Query pages
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import SignInPage from "@/app/auth/signin/page";
import QueryPage from "@/app/query/page";

function mockResponse(data: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
}

describe("SignInPage", () => {
  it("renders heading", () => {
    render(<SignInPage />);
    expect(screen.getByText("Health Dataspace Login")).toBeInTheDocument();
  });

  it("renders sign-in button", () => {
    render(<SignInPage />);
    expect(screen.getByText(/Sign in with Keycloak/)).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(<SignInPage />);
    expect(
      screen.getByText(/Sign in with your Keycloak account/),
    ).toBeInTheDocument();
  });
});

describe("QueryPage (Natural Language Query)", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders heading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<QueryPage />);
    expect(screen.getByText("Natural Language Query")).toBeInTheDocument();
  });

  it("renders example questions", () => {
    mockFetchApi.mockReturnValue(mockResponse({ templates: [], stats: {} }));
    render(<QueryPage />);
    expect(
      screen.getByText("How many patients are there?"),
    ).toBeInTheDocument();
  });

  it("renders search input", () => {
    mockFetchApi.mockReturnValue(mockResponse({ templates: [], stats: {} }));
    render(<QueryPage />);
    expect(screen.getByPlaceholderText(/Ask a question/i)).toBeInTheDocument();
  });
});
