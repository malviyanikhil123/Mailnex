import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LineTrend, RatePie, hasTrendData } from "./Charts";

describe("charts without data", () => {
  it("say there is no data yet instead of drawing an empty plot", () => {
    render(<LineTrend data={[]} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("treat a range of all-zero days as no data", () => {
    const zeros = [{ bucket: "2026-10-01", sent: 0, failed: 0 }, { bucket: "2026-10-02", sent: 0, failed: 0 }];
    expect(hasTrendData(zeros)).toBe(false);
    expect(hasTrendData([...zeros, { bucket: "2026-10-03", sent: 0, failed: 1 }])).toBe(true);
    render(<LineTrend data={zeros} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("show no pie before the first send attempt", () => {
    render(<RatePie success={0} failure={0} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });
});
