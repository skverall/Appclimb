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

  it("neutralizes spreadsheet formula injection (OWASP CSV)", () => {
    expect(csvEscape("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvEscape("+cmd|'/C calc'!A0")).toBe("'+cmd|'/C calc'!A0");
    expect(csvEscape("@@SUM")).toBe("'@@SUM");
    expect(csvEscape("@HYPERLINK(\"http://x\")")).toBe(
      '"\'@HYPERLINK(""http://x"")"',
    );
    expect(csvEscape("-value")).toBe("'-value");
    expect(csvEscape("\t1+1")).toBe("'\t1+1");
  });

  it("does not touch legitimately non-formula values", () => {
    expect(csvEscape("baby-stroller")).toBe("baby-stroller");
    expect(csvEscape("2+2")).toBe("2+2");
    expect(csvEscape("-able")).toBe("'-able"); // leading dash is still risky
    expect(csvEscape("5 + 5")).toBe("5 + 5");
  });

  it("keeps quoting when a formula-prefixed value also needs quoting", () => {
    expect(csvEscape('=cmd,foo')).toBe('"\'=cmd,foo"');
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
