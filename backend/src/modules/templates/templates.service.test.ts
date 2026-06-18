import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TemplatesRepo } from "./templates.repo.js";

// ---- Unit tests: TemplatesService (mocked repo) ----

const makeRepo = () =>
  ({
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    pickRandomActive: vi.fn(),
  }) as unknown as TemplatesRepo;

describe("TemplatesService (unit, mocked repo)", () => {
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
  });

  it("create delegates to repo.create", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    const input = {
      name: "welcome",
      subject: "Welcome",
      body: "Hello {{name}}",
      category: "general",
    };
    const expected = { id: 1, ...input, version: 1, active: true };
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

    const result = await service.create(input);
    expect(repo.create).toHaveBeenCalledWith(input);
    expect(result).toEqual(expected);
  });

  it("list delegates to repo.list", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    const rows = [{ id: 1, name: "t1" }];
    (repo.list as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

    const result = await service.list();
    expect(repo.list).toHaveBeenCalled();
    expect(result).toEqual(rows);
  });

  it("get delegates to repo.getById and throws 404 when not found", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.get(99)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.getById).toHaveBeenCalledWith(99);
  });

  it("get returns template when found", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    const tpl = { id: 1, name: "t1", subject: "Sub", body: "Body" };
    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);

    const result = await service.get(1);
    expect(result).toEqual(tpl);
  });

  it("remove delegates to repo.remove and throws 404 when not found", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    (repo.remove as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.remove(99)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("remove succeeds when record is deleted", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    (repo.remove as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });
    await expect(service.remove(1)).resolves.toBeUndefined();
  });

  it("update increments version (version bump)", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    const existing = {
      id: 5,
      name: "old",
      subject: "Old Sub",
      body: "Old Body",
      category: "general",
      version: 3,
      active: true,
    };

    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...existing,
      subject: "New Sub",
      version: 4,
    });

    await service.update(5, { subject: "New Sub" });

    // repo.update must be called with version incremented to 4
    expect(repo.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ version: 4 }),
    );
  });

  it("preview returns interpolated subject and body", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    const tpl = {
      id: 1,
      name: "greet",
      subject: "Hello {{name}}",
      body: "Welcome to {{company}}!",
      category: "general",
      version: 1,
      active: true,
    };
    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);

    const result = await service.preview(1, { name: "Alice", company: "Acme" });
    expect(result.subject).toBe("Hello Alice");
    expect(result.body).toBe("Welcome to Acme!");
  });

  it("preview leaves placeholders when vars missing", async () => {
    const { TemplatesService } = await import("./templates.service.js");
    const service = new TemplatesService(repo);

    const tpl = {
      id: 2,
      name: "greet2",
      subject: "Hello {{name}}",
      body: "Hi there",
      category: "general",
      version: 1,
      active: true,
    };
    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);

    const result = await service.preview(2, {});
    expect(result.subject).toBe("Hello {{name}}");
    expect(result.body).toBe("Hi there");
  });
});
