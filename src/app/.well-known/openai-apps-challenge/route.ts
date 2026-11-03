export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ChatGPT directory domain verification. OpenAI's dashboard generates a
 * token that must be served here as plain text; it lives in the
 * OPENAI_APPS_CHALLENGE Worker secret so it can be set without a code change.
 */
export function GET() {
  const token = (process.env.OPENAI_APPS_CHALLENGE ?? "").trim();
  if (!token) return new Response("Not found", { status: 404 });
  return new Response(token, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
