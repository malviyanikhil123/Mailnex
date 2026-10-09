import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useAuth } from "../store/auth";
import { useClearQueriesOnUserChange } from "./useClearQueriesOnUserChange";

const jane = { id: 1, name: "Jane", email: "jane@example.com" };

beforeEach(() => {
  useAuth.getState().clear();
});

describe("useClearQueriesOnUserChange", () => {
  it("drops cached data on sign-out but keeps it across token refreshes", () => {
    const qc = new QueryClient();
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user: jane });
    renderHook(() => useClearQueriesOnUserChange(qc));
    qc.setQueryData(["contacts"], ["someone"]);

    useAuth.getState().setTokens("a2", "r2");
    expect(qc.getQueryData(["contacts"])).toEqual(["someone"]);

    useAuth.getState().clear();
    expect(qc.getQueryData(["contacts"])).toBeUndefined();
  });

  it("drops cached data when another user signs in", () => {
    const qc = new QueryClient();
    useAuth.getState().setAuth({ accessToken: "a", refreshToken: "r", user: jane });
    renderHook(() => useClearQueriesOnUserChange(qc));
    qc.setQueryData(["dashboard"], { sent: 1 });

    useAuth.getState().setAuth({ accessToken: "b", refreshToken: "s", user: { ...jane, id: 2 } });

    expect(qc.getQueryData(["dashboard"])).toBeUndefined();
  });
});
