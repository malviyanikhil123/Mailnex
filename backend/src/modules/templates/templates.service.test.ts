import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TemplatesRepo, NewTemplateRow } from "./templates.repo.js";
import { TemplatesService, type TemplateAi } from "./templates.service.js";
import { TEMPLATE_SEED } from "../../db/seed/templates.js";
import { BUILTIN_TEMPLATE_VARS, LIMITS } from "../../config/constants.js";

// ---- Unit tests: TemplatesService (mocked repo) ----

const makeRepo = () =>
  ({
    create: vi.fn(),
    createMany: vi.fn(),
    listKeys: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
  }) as unknown as TemplatesRepo;

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe("TemplatesService (unit, mocked repo)", () => {
  let repo: ReturnType<typeof makeRepo>;
  const userId = 1;

  beforeEach(() => {
    repo = makeRepo();
  });

  it("create delegates to repo.create", async () => {
    const service = new TemplatesService(repo);

    const input = {
      name: "welcome",
      subject: "Welcome",
      body: "Hello {{name}}",
      category: "general",
    };
    const expected = { id: 1, userId, ...input, version: 1, active: true };
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

    const result = await service.create(userId, input);
    expect(repo.create).toHaveBeenCalledWith(userId, input);
    expect(result).toEqual(expected);
  });

  it("list delegates to repo.list", async () => {
    const service = new TemplatesService(repo);

    const rows = [{ id: 1, userId, name: "t1" }];
    (repo.list as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

    const result = await service.list(userId);
    expect(repo.list).toHaveBeenCalledWith(userId);
    expect(result).toEqual(rows);
  });

  it("get delegates to repo.getById and throws 404 when not found", async () => {
    const service = new TemplatesService(repo);

    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.get(userId, 99)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.getById).toHaveBeenCalledWith(userId, 99);
  });

  it("get returns template when found", async () => {
    const service = new TemplatesService(repo);

    const tpl = { id: 1, userId, name: "t1", subject: "Sub", body: "Body" };
    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);

    const result = await service.get(userId, 1);
    expect(result).toEqual(tpl);
  });

  it("remove delegates to repo.remove and throws 404 when not found", async () => {
    const service = new TemplatesService(repo);

    (repo.remove as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.remove(userId, 99)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("remove succeeds when record is deleted", async () => {
    const service = new TemplatesService(repo);

    (repo.remove as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });
    await expect(service.remove(userId, 1)).resolves.toBeUndefined();
  });

  it("update increments version (version bump)", async () => {
    const service = new TemplatesService(repo);

    const existing = {
      id: 5,
      userId,
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

    await service.update(userId, 5, { subject: "New Sub" });

    expect(repo.update).toHaveBeenCalledWith(
      userId,
      5,
      expect.objectContaining({ version: 4 }),
    );
  });

  it("preview returns interpolated subject and body", async () => {
    const service = new TemplatesService(repo);

    const tpl = {
      id: 1,
      userId,
      name: "greet",
      subject: "Hello {{name}}",
      body: "Welcome to {{company}}!",
      category: "general",
      version: 1,
      active: true,
    };
    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);

    const result = await service.preview(userId, 1, { name: "Alice", company: "Acme" });
    expect(result.subject).toBe("Hello Alice");
    expect(result.body).toBe("Welcome to Acme!");
  });

  it("preview leaves placeholders when vars missing", async () => {
    const service = new TemplatesService(repo);

    const tpl = {
      id: 2,
      userId,
      name: "greet2",
      subject: "Hello {{name}}",
      body: "Hi there",
      category: "general",
      version: 1,
      active: true,
    };
    (repo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);

    const result = await service.preview(userId, 2, {});
    expect(result.subject).toBe("Hello {{name}}");
    expect(result.body).toBe("Hi there");
  });
});

describe("TemplatesService — HTML templates", () => {
  let repo: ReturnType<typeof makeRepo>;
  const userId = 1;

  beforeEach(() => {
    repo = makeRepo();
    mocked(repo.create).mockImplementation(async (_u: number, input: object) => ({ id: 1, ...input }));
    mocked(repo.update).mockImplementation(async (_u: number, id: number, data: object) => ({ id, ...data }));
  });

  it("sanitizes the body of a new HTML template", async () => {
    const service = new TemplatesService(repo);
    await service.create(userId, {
      name: "Design",
      subject: "Hi",
      format: "html",
      body: '<p onclick="alert(1)">Hi {{first_name|there}}</p><script>alert(1)</script>',
    });
    expect(repo.create).toHaveBeenCalledWith(userId, expect.objectContaining({ format: "html", body: "<p>Hi {{first_name|there}}</p>" }));
  });

  it("stores a plain-text body exactly as written", async () => {
    const service = new TemplatesService(repo);
    const input = { name: "Plain", subject: "Hi", body: "<b>not html</b> {{company}}" };
    await service.create(userId, input);
    expect(repo.create).toHaveBeenCalledWith(userId, input);
  });

  it("refuses HTML that is empty once unsafe parts are removed", async () => {
    const service = new TemplatesService(repo);
    await expect(
      service.create(userId, { name: "x", subject: "x", format: "html", body: "<script>alert(1)</script>" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("sanitizes an edited HTML body and bumps the version", async () => {
    const service = new TemplatesService(repo);
    mocked(repo.getById).mockResolvedValue({ id: 5, name: "d", subject: "s", body: "<p>old</p>", format: "html", version: 2 });
    await service.update(userId, 5, { body: '<p>new</p><iframe src="https://x.example"></iframe>' });
    expect(repo.update).toHaveBeenCalledWith(userId, 5, expect.objectContaining({ body: "<p>new</p>", version: 3 }));
  });

  it("sanitizes the existing body when a template is switched to HTML", async () => {
    const service = new TemplatesService(repo);
    mocked(repo.getById).mockResolvedValue({ id: 5, name: "d", subject: "s", body: "Hi <img src=x onerror=alert(1)>", format: "text", version: 1 });
    await service.update(userId, 5, { format: "html" });
    expect(repo.update).toHaveBeenCalledWith(userId, 5, expect.objectContaining({ format: "html", body: 'Hi <img src="x" />', version: 2 }));
  });

  it("does not touch the body of a plain-text template on edit", async () => {
    const service = new TemplatesService(repo);
    mocked(repo.getById).mockResolvedValue({ id: 5, name: "d", subject: "s", body: "old", format: "text", version: 1 });
    await service.update(userId, 5, { body: "<script>kept as text</script>" });
    expect(repo.update).toHaveBeenCalledWith(userId, 5, expect.objectContaining({ body: "<script>kept as text</script>" }));
  });

  it("previews an HTML template with escaped values", async () => {
    const service = new TemplatesService(repo);
    mocked(repo.getById).mockResolvedValue({ id: 3, subject: "For {{company}}", body: "<p>Hi {{first_name|there}} at {{company}}</p>", format: "html" });
    const result = await service.preview(userId, 3, { company: "<b>Acme</b>" });
    expect(result).toEqual({ subject: "For <b>Acme</b>", body: "<p>Hi there at &lt;b&gt;Acme&lt;/b&gt;</p>", format: "html" });
  });
});

describe("TemplatesService — starter templates", () => {
  /** In-memory repo honouring the unique (name, category, user) key like ON CONFLICT DO NOTHING. */
  function fakeRepo(initial: { name: string; category: string }[] = []) {
    const rows = [...initial];
    const repo = makeRepo();
    mocked(repo.listKeys).mockImplementation(async () => rows.map(({ name, category }) => ({ name, category })));
    mocked(repo.createMany).mockImplementation(async (_userId: number, newRows: NewTemplateRow[]) => {
      const inserted = newRows.filter((r) => !rows.some((x) => x.name === r.name && x.category === (r.category ?? "general")));
      rows.push(...inserted.map((r) => ({ name: r.name, category: r.category ?? "general" })));
      return inserted;
    });
    return { repo, rows };
  }

  it("adds every starter template for a user who has none, then nothing on a second run", async () => {
    const { repo, rows } = fakeRepo();
    const service = new TemplatesService(repo);

    await expect(service.addStarterTemplates(1)).resolves.toEqual({ added: TEMPLATE_SEED.length });
    expect(rows).toHaveLength(TEMPLATE_SEED.length);

    await expect(service.addStarterTemplates(1)).resolves.toEqual({ added: 0 });
    expect(rows).toHaveLength(TEMPLATE_SEED.length);
    expect(mocked(repo.createMany).mock.calls[1][1]).toEqual([]);
  });

  it("only adds the missing ones and leaves the user's own templates alone", async () => {
    const [first, second] = TEMPLATE_SEED;
    const { repo, rows } = fakeRepo([
      { name: first.name, category: first.category },
      { name: second.name, category: "my-own-category" },
      { name: "My template", category: "general" },
    ]);
    const service = new TemplatesService(repo);

    await expect(service.addStarterTemplates(1)).resolves.toEqual({ added: TEMPLATE_SEED.length - 1 });
    const inserted = mocked(repo.createMany).mock.calls[0][1] as NewTemplateRow[];
    expect(inserted.map((t) => t.name)).not.toContain(first.name);
    expect(inserted.map((t) => t.name)).toContain(second.name);
    expect(rows).toHaveLength(3 + TEMPLATE_SEED.length - 1);
  });
});

describe("TEMPLATE_SEED", () => {
  it("is a generic set with follow-ups recognised as follow-ups", () => {
    expect(TEMPLATE_SEED.length).toBeGreaterThanOrEqual(8);
    expect(TEMPLATE_SEED.filter((t) => t.category === "followup")).toHaveLength(2);
    const keys = TEMPLATE_SEED.map((t) => `${t.category}/${t.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses only the new variables, greets with a fallback and signs off with {{signature}}", () => {
    const legacy = new Set(["candidateName", "name", "candidateEmail", "email", "phone", "role", "targetRole", "experience", "skills", "linkedin", "LinkedIn", "github", "GitHub", "portfolio", "Portfolio"]);
    for (const t of TEMPLATE_SEED) {
      expect(t.body.startsWith("Hi {{first_name|there}},")).toBe(true);
      expect(t.body.trimEnd().endsWith("{{signature}}")).toBe(true);
      for (const [, key] of `${t.subject} ${t.body}`.matchAll(/\{\{\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/g)) {
        expect(BUILTIN_TEMPLATE_VARS as readonly string[]).toContain(key);
        expect(legacy.has(key)).toBe(false);
      }
      expect(`${t.subject} ${t.body}`).not.toMatch(/hiring team|resume|candidate/i);
    }
  });
});

describe("TemplatesService.generateHtml", () => {
  const DOC = `<!DOCTYPE html><html><head><title>Spring sale &amp; more</title></head><body><table><tr><td><p onclick="x()">Hi {{first_name|there}}</p><script>alert(1)</script></td></tr></table></body></html>`;

  function serviceWith(answer: string | (() => Promise<string>)) {
    const reply = typeof answer === "string" ? async () => answer : answer;
    const ai = { generate: vi.fn<TemplateAi["generate"]>(reply) };
    return { service: new TemplatesService(makeRepo(), ai), ai };
  }

  const input = { description: "A spring sale announcement for our bakery", includeVariables: true };

  it("strips markdown fences and chatter, sanitizes, and suggests the <title> as subject", async () => {
    const { service } = serviceWith("Sure! Here is your email:\n```html\n" + DOC + "\n```\nLet me know if you need changes.");
    const result = await service.generateHtml(1, input);
    expect(result.subject).toBe("Spring sale & more");
    expect(result.html.startsWith("<!DOCTYPE html>\n<html>")).toBe(true);
    expect(result.html).toContain("<p>Hi {{first_name|there}}</p>");
    expect(result.html).not.toMatch(/<script|onclick|```|Sure!/);
  });

  it("passes the description, options, provider and model to the AI helper", async () => {
    const { service, ai } = serviceWith(DOC);
    await service.generateHtml(1, { ...input, tone: "playful", brandColor: "#e11d48", provider: "anthropic", model: "claude-x" });
    const req = ai.generate.mock.calls[0][1];
    expect(ai.generate).toHaveBeenCalledWith(1, expect.objectContaining({ provider: "anthropic", model: "claude-x" }));
    expect(req.prompt).toContain("A spring sale announcement for our bakery");
    expect(req.prompt).toContain("playful");
    expect(req.prompt).toContain("#e11d48");
    expect(req.system).toContain("600");
    expect(req.system).toContain("{{first_name|there}}");
    expect(req.maxOutputTokens).toBeGreaterThan(0);
  });

  it("asks for generic copy when variables are not wanted", async () => {
    const { service, ai } = serviceWith(DOC);
    await service.generateHtml(1, { ...input, includeVariables: false });
    expect(ai.generate.mock.calls[0][1].system).toContain("Do not use any {{placeholders}}");
  });

  it("passes the no-AI-key error through unchanged", async () => {
    const noKey = Object.assign(new Error("No AI provider is configured — add an API key in Settings → AI providers"), { statusCode: 400 });
    const { service } = serviceWith(async () => { throw noKey; });
    await expect(service.generateHtml(1, input)).rejects.toBe(noKey);
  });

  it("returns a 502 when the answer has no HTML", async () => {
    const { service } = serviceWith("I cannot help with that.");
    await expect(service.generateHtml(1, input)).rejects.toMatchObject({ statusCode: 502, expose: true });
  });

  it("returns a 502 when the design is over the size limit", async () => {
    const big = `<html><body><p>${"x".repeat(LIMITS.TEMPLATE_BODY_MAX_BYTES)}</p></body></html>`;
    const { service } = serviceWith(big);
    await expect(service.generateHtml(1, input)).rejects.toMatchObject({ statusCode: 502 });
  });
});
