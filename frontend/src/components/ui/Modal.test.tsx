import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { Modal } from "./Modal";

afterEach(() => vi.restoreAllMocks());

function Opener({ confirmClose }: { confirmClose?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Modal title="Edit thing" onClose={() => setOpen(false)} confirmClose={confirmClose}>
          <input aria-label="First" />
          <button>Last</button>
        </Modal>
      )}
    </>
  );
}

const backdrop = () => screen.getByRole("dialog").parentElement!;
function clickBackdrop() {
  fireEvent.mouseDown(backdrop());
  fireEvent.click(backdrop());
}

describe("Modal", () => {
  it("is a modal dialog labelled by its title, focused when opened", () => {
    render(<Modal title="Edit thing" onClose={() => {}}><p>Body</p></Modal>);
    const dialog = screen.getByRole("dialog", { name: "Edit thing" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
  });

  it("closes on Escape, the ✕ and the backdrop", () => {
    const onClose = vi.fn();
    render(<Modal title="T" onClose={onClose}><p>Body</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    clickBackdrop();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("ignores clicks inside, and a text selection dragged out onto the backdrop", () => {
    const onClose = vi.fn();
    render(<Modal title="T" onClose={onClose}><p>Body</p></Modal>);
    fireEvent.click(screen.getByText("Body"));
    fireEvent.mouseDown(screen.getByText("Body"));
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks before discarding unsaved changes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Opener confirmClose="Discard your changes?" />);
    fireEvent.click(screen.getByText("Open"));

    clickBackdrop();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledWith("Discard your changes?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    confirm.mockReturnValue(true);
    clickBackdrop();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab inside the dialog and returns focus to the opener", () => {
    render(<Opener />);
    const open = screen.getByText("Open");
    open.focus();
    fireEvent.click(open);

    const first = screen.getByLabelText("First");
    const last = screen.getByText("Last");
    const close = screen.getByRole("button", { name: "Close dialog" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus(); // the ✕ comes first in the dialog
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    expect(first).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it("only the innermost of stacked dialogs answers Escape", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Modal title="Outer" onClose={outer}><p>a</p></Modal>
        <Modal title="Inner" onClose={inner}><p>b</p></Modal>
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
