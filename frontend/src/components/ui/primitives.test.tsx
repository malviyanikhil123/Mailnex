import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge, Button } from "./primitives";

describe("UI primitives", () => {
  it("StatusBadge renders the status text", () => {
    render(<StatusBadge status="SENT" />);
    expect(screen.getByText("SENT")).toBeInTheDocument();
  });

  it("Button renders children and fires onClick", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });
});
