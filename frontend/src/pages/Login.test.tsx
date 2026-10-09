import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const authApi = { login: vi.fn(), register: vi.fn(), me: vi.fn(), logout: vi.fn() };
vi.mock("../services/auth.api", () => ({ authApi }));

const { default: Login } = await import("./Login");
const { AUTH_STORAGE_KEY, useAuth } = await import("../store/auth");

const user = { id: 1, name: "Jane", email: "jane@example.com" };

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: " jane@example.com " } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter22" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.getState().clear();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Login", () => {
  it("has a show-password toggle", () => {
    renderLogin();
    const password = screen.getByLabelText("Password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
  });

  it("signs in for this browser session only by default", async () => {
    authApi.login.mockResolvedValue({ accessToken: "a", refreshToken: "r", rememberMe: false, user });
    renderLogin();
    signIn();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith("jane@example.com", "hunter22", false));
    await waitFor(() => expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toContain('"refreshToken":"r"'));
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("keeps the session in localStorage when 'Remember me' is ticked", async () => {
    authApi.login.mockResolvedValue({ accessToken: "a", refreshToken: "r", rememberMe: true, user });
    renderLogin();
    signIn();

    fireEvent.click(screen.getByLabelText("Remember me (30 days)"));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith("jane@example.com", "hunter22", true));
    await waitFor(() => expect(useAuth.getState().rememberMe).toBe(true));
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toContain('"refreshToken":"r"');
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toContain("hunter22");
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
