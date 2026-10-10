import { describe, it, expect, vi, afterEach } from "vitest";
import axios from "axios";
import { useAuth } from "../store/auth";
import { refreshAccessToken } from "./client";

const user = { id: 1, name: "Jane", email: "jane@example.com" };

afterEach(() => {
  vi.restoreAllMocks();
  useAuth.getState().clear();
});

describe("refreshAccessToken", () => {
  it("stores the rotated tokens", async () => {
    useAuth.getState().setAuth({ accessToken: "a1", refreshToken: "r1", user, rememberMe: true });
    vi.spyOn(axios, "post").mockResolvedValue({ data: { accessToken: "a2", refreshToken: "r2" } });

    expect(await refreshAccessToken()).toBe("a2");
    expect(useAuth.getState()).toMatchObject({ accessToken: "a2", refreshToken: "r2" });
  });

  it("doesn't sign back in when the user signed out while the refresh was in flight", async () => {
    useAuth.getState().setAuth({ accessToken: "a1", refreshToken: "r1", user, rememberMe: true });
    vi.spyOn(axios, "post").mockImplementation(async () => {
      useAuth.getState().clear();
      return { data: { accessToken: "a2", refreshToken: "r2" } };
    });

    expect(await refreshAccessToken()).toBeNull();
    expect(useAuth.getState()).toMatchObject({ accessToken: null, refreshToken: null, user: null });
  });

  it("keeps a newer token another tab stored meanwhile", async () => {
    useAuth.getState().setAuth({ accessToken: "a1", refreshToken: "r1", user, rememberMe: true });
    vi.spyOn(axios, "post").mockImplementation(async () => {
      useAuth.getState().setTokens("a9", "r9");
      return { data: { accessToken: "a2", refreshToken: "r2" } };
    });

    expect(await refreshAccessToken()).toBe("a9");
    expect(useAuth.getState().refreshToken).toBe("r9");
  });
});
