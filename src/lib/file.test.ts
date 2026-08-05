import { afterEach, describe, expect, it, vi } from "vitest";

import { csvEscape, downloadTextFile } from "./file";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("csvEscape", () => {
  it("passes plain values through unchanged", () => {
    expect(csvEscape("meditation")).toBe("meditation");
    expect(csvEscape("123")).toBe("123");
    expect(csvEscape("")).toBe("");
    expect(csvEscape("habit tracker")).toBe("habit tracker");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

describe("downloadTextFile", () => {
  it("is a no-op when there is no document (SSR/node)", () => {
    expect(() => downloadTextFile("x.csv", "a,b")).not.toThrow();
  });

  it("creates a blob link, clicks it, and cleans up in the browser", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const anchor: Record<string, unknown> = {
      click,
      remove,
      href: "",
      download: "",
      rel: "",
    };
    const createElement = vi.fn(() => anchor);
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => "blob:fake-url");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("document", {
      createElement,
      body: { appendChild },
    });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadTextFile("keywords.csv", "keyword,store\nmeditation,US\n");

    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe("blob:fake-url");
    expect(anchor.download).toBe("keywords.csv");
    expect(anchor.rel).toBe("noopener");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });
});
