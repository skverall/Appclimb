import { describe, expect, it } from "vitest";

import {
  extractIconHrefs,
  fallbackIconUrls,
  isProxyableIconDomain,
  MAX_ICON_BYTES,
  sniffIconContentType,
} from "@/lib/site-icon";

function bytes(header: number[], length = 128): Uint8Array {
  const buffer = new Uint8Array(length);
  buffer.set(header, 0);
  return buffer;
}

function textBytes(value: string, length = 128): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  const buffer = new Uint8Array(Math.max(length, encoded.length));
  buffer.set(encoded, 0);
  return buffer;
}

describe("isProxyableIconDomain", () => {
  it("accepts ordinary public hostnames", () => {
    expect(isProxyableIconDomain("appclimb.app")).toBe(true);
    expect(isProxyableIconDomain("https://www.Stripe.com/pricing")).toBe(true);
    expect(isProxyableIconDomain("web:cdn.shopify.com")).toBe(true);
  });

  it("rejects internal and loopback targets", () => {
    expect(isProxyableIconDomain("localhost")).toBe(false);
    expect(isProxyableIconDomain("http://127.0.0.1:8080/x")).toBe(false);
    expect(isProxyableIconDomain("169.254.169.254")).toBe(false);
    expect(isProxyableIconDomain("db.internal")).toBe(false);
    expect(isProxyableIconDomain("printer.local")).toBe(false);
    expect(isProxyableIconDomain("service.test")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isProxyableIconDomain("")).toBe(false);
    expect(isProxyableIconDomain(null)).toBe(false);
    expect(isProxyableIconDomain(undefined)).toBe(false);
    expect(isProxyableIconDomain("no-dot")).toBe(false);
    expect(isProxyableIconDomain("bad_underscore.com")).toBe(false);
    expect(isProxyableIconDomain("trailing-.com")).toBe(false);
    expect(isProxyableIconDomain("example.c0m")).toBe(false);
    expect(isProxyableIconDomain(`${"a".repeat(250)}.com`)).toBe(false);
  });
});

describe("sniffIconContentType", () => {
  it("identifies the formats favicons ship in", () => {
    expect(
      sniffIconContentType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
    expect(sniffIconContentType(bytes([0x47, 0x49, 0x46, 0x38]))).toBe("image/gif");
    expect(sniffIconContentType(bytes([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(sniffIconContentType(bytes([0x42, 0x4d]))).toBe("image/bmp");
    expect(sniffIconContentType(bytes([0x00, 0x00, 0x01, 0x00]))).toBe(
      "image/x-icon",
    );
    expect(sniffIconContentType(bytes([0x00, 0x00, 0x02, 0x00]))).toBe(
      "image/x-icon",
    );
  });

  it("identifies webp only with the WEBP chunk marker", () => {
    const webp = bytes([0x52, 0x49, 0x46, 0x46]);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffIconContentType(webp)).toBe("image/webp");
    expect(sniffIconContentType(bytes([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });

  it("rejects svg, which cannot be served safely from our own origin", () => {
    expect(
      sniffIconContentType(
        textBytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).toBeNull();
  });

  it("rejects the HTML shell that SPA hosts serve for /favicon.ico", () => {
    expect(
      sniffIconContentType(
        textBytes("<!doctype html><html><head><title>Not found</title></head>"),
      ),
    ).toBeNull();
  });

  it("rejects empty bodies, tracking pixels and oversized files", () => {
    expect(sniffIconContentType(new Uint8Array(0))).toBeNull();
    // The classic 43-byte transparent GIF.
    expect(sniffIconContentType(bytes([0x47, 0x49, 0x46, 0x38], 43))).toBeNull();
    expect(
      sniffIconContentType(
        bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], MAX_ICON_BYTES + 1),
      ),
    ).toBeNull();
  });
});

describe("extractIconHrefs", () => {
  it("prefers the sharpest declared icon and resolves relative hrefs", () => {
    const html = `
      <link rel="icon" href="/favicon-16.png" sizes="16x16">
      <link rel="apple-touch-icon" href="//cdn.example.com/touch.png" sizes="180x180">
      <link rel="shortcut icon" href='favicon.ico'>
    `;
    expect(extractIconHrefs(html, "https://example.com/")).toEqual([
      "https://cdn.example.com/touch.png",
      "https://example.com/favicon.ico",
      "https://example.com/favicon-16.png",
    ]);
  });

  it("skips svg icons, which the proxy cannot serve", () => {
    const html = `
      <link rel="icon" href="/mark.svg" sizes="any" type="image/svg+xml">
      <link rel="icon" href="/mark.svg?v=2" sizes="any">
      <link rel="icon" href="/big.png" sizes="192x192">
    `;
    expect(extractIconHrefs(html, "https://example.com/")).toEqual([
      "https://example.com/big.png",
    ]);
  });

  it("ranks a raster sizes=any icon below a declared apple-touch-icon", () => {
    const html = `
      <link rel="icon" href="/any.png" sizes="any">
      <link rel="apple-touch-icon" href="/touch.png" sizes="180x180">
    `;
    expect(extractIconHrefs(html, "https://example.com/")).toEqual([
      "https://example.com/touch.png",
      "https://example.com/any.png",
    ]);
  });

  it("ranks an undeclared apple-touch-icon above an undeclared icon", () => {
    const html = `
      <link rel="icon" href="/plain.png">
      <link rel="apple-touch-icon" href="/touch.png">
    `;
    expect(extractIconHrefs(html, "https://example.com/")[0]).toBe(
      "https://example.com/touch.png",
    );
  });

  it("ignores non-icon links, data URIs and unproxyable hosts", () => {
    const html = `
      <link rel="stylesheet" href="/site.css">
      <link rel="mask-icon" href="/mask.svg" color="#000">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="icon" href="https://localhost/favicon.ico">
      <link rel="icon" href="javascript:alert(1)">
      <link rel="icon" href="">
    `;
    expect(extractIconHrefs(html, "https://example.com/")).toEqual([]);
  });

  it("deduplicates and respects the limit", () => {
    const html = `
      <link rel="icon" href="/a.png" sizes="64x64">
      <link rel="icon" href="/a.png" sizes="64x64">
      <link rel="icon" href="/b.png" sizes="48x48">
      <link rel="icon" href="/c.png" sizes="32x32">
    `;
    expect(extractIconHrefs(html, "https://example.com/", 2)).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
  });

  it("returns nothing for markup without links", () => {
    expect(extractIconHrefs("<p>hello</p>", "https://example.com/")).toEqual([]);
  });
});

describe("fallbackIconUrls", () => {
  it("lists well-known locations, fastest first", () => {
    expect(fallbackIconUrls("https://www.appclimb.app/")).toEqual([
      "https://icons.duckduckgo.com/ip3/appclimb.app.ico",
      "https://appclimb.app/apple-touch-icon.png",
      "https://appclimb.app/favicon.ico",
    ]);
  });

  it("returns nothing without a domain", () => {
    expect(fallbackIconUrls("")).toEqual([]);
  });
});
