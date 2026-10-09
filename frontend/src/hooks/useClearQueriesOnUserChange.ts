import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useAuth } from "../store/auth";

/** Drops every cached query when the signed-in user changes: sign-out (here or in another
 *  tab) or someone else signing in, so they never see the previous user's data. */
export function useClearQueriesOnUserChange(queryClient: QueryClient) {
  useEffect(
    () =>
      useAuth.subscribe((state, prev) => {
        if (state.user?.id !== prev.user?.id) queryClient.clear();
      }),
    [queryClient],
  );
}
