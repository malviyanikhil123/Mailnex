import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useAuthSync } from "../store/auth-sync";
import { GuestRoute } from "./GuestRoute";

const user = { id: 1, name: "Jane", email: "jane@example.com" };

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<p>Login page</p>} />
          <Route path="/register" element={<p>Register page</p>} />
        </Route>
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.getState().clear();
  localStorage.clear();
  sessionStorage.clear();
  useAuthSync.setState({ ready: true });
});

describe("GuestRoute", () => {
  it("shows the login and register pages when signed out", () => {
    renderAt("/login");
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it.each(["/login", "/register"])("sends a signed-in browser from %s to the app", (path) => {
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user, rememberMe: true });
    renderAt(path);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText(/page$/)).not.toBeInTheDocument();
  });

  it("waits until the other tabs were asked for their session", () => {
    useAuthSync.setState({ ready: false });
    renderAt("/login");
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });
});
