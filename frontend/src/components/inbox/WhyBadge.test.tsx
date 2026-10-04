import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WhyBadge, JobStatusChip, jobStatusLabel } from "./WhyBadge";

describe("WhyBadge", () => {
  it("names the matched rule so the user can see exactly why", () => {
    render(<WhyBadge source="RULE" ruleLabel={'subject contains "interview"'} />);
    expect(screen.getByText(/subject contains "interview"/)).toBeInTheDocument();
  });

  it("falls back to a generic rule label when none was rendered", () => {
    render(<WhyBadge source="RULE" ruleLabel={null} />);
    expect(screen.getByText("Your rule")).toBeInTheDocument();
  });

  it("shows the AI confidence", () => {
    render(<WhyBadge source="AI" confidence={82} reason="sender is a bank" />);
    expect(screen.getByText("AI · 82%")).toBeInTheDocument();
  });

  it("puts the AI reason in the tooltip", () => {
    render(<WhyBadge source="AI" confidence={82} reason="sender is a bank" />);
    expect(screen.getByTitle("AI: sender is a bank")).toBeInTheDocument();
  });

  it("renders AI without a confidence number when none was recorded", () => {
    render(<WhyBadge source="AI" confidence={null} reason={null} />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("states plainly that a manual move is permanent", () => {
    render(<WhyBadge source="MANUAL" />);
    expect(screen.getByText("You moved this")).toBeInTheDocument();
    expect(screen.getByTitle(/never change it/i)).toBeInTheDocument();
  });

  it("labels an unclassified message as unsorted", () => {
    render(<WhyBadge source="NONE" />);
    expect(screen.getByText("Unsorted")).toBeInTheDocument();
  });

  it("does not crash when every optional field is missing", () => {
    expect(() => render(<WhyBadge source="RULE" />)).not.toThrow();
  });
});

describe("JobStatusChip", () => {
  it("renders a readable label rather than the raw enum", () => {
    render(<JobStatusChip status="INTERVIEW_INVITE" />);
    expect(screen.getByText("Interview")).toBeInTheDocument();
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(jobStatusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});
