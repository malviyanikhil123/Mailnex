import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Toaster } from "./Toaster";
import { toast, useToast } from "../../store/toast";

beforeEach(() => useToast.setState({ toasts: [] }));

describe("Toaster", () => {
  it("is a polite live region, present before any toast, so new ones are announced", () => {
    render(<Toaster />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");

    act(() => toast.error("Connect a sender first"));
    expect(region).toHaveTextContent("Connect a sender first");
  });
});
