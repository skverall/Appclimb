/**
 * Server-only route to Apple's iTunes Search API for the MCP endpoint.
 *
 * Apple rejects Cloudflare Worker IPs, so the browser normally makes these
 * calls (see itunes.ts). An agent has no AppClimb browser tab, so the Worker
 * goes through the small proxy on the Hostinger VPS (ops/itunes-proxy),
 * which caches answers and paces calls to Apple's rate limit. The returned
 * function is a drop-in `fetchImpl` for the existing iTunes helpers.
 */
import { ITUNES_ORIGIN } from "./itunes";

export interface ItunesProxyConfig {
  url: string;
  secret: string;
}

export function readItunesProxyConfig(): ItunesProxyConfig | null {
  const url = (process.env.ITUNES_PROXY_URL ?? "").trim().replace(/\/+$/u, "");
  const secret = (process.env.ITUNES_PROXY_SECRET ?? "").trim();
  if (!url.startsWith("https://") || secret.length < 32) return null;
  return { url, secret };
}

/** A fetch that sends iTunes requests through the proxy and nothing else. */
export function proxiedItunesFetch(config: ItunesProxyConfig, fetchImpl: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!target.startsWith(`${ITUNES_ORIGIN}/`)) {
      return Promise.reject(new Error("itunes_proxy_only"));
    }
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${config.secret}`);
    return fetchImpl(`${config.url}${target.slice(ITUNES_ORIGIN.length)}`, { ...init, headers });
  };
}
