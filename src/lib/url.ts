// Resolves the public origin to redirect back to from a route handler.
//
// Behind Render's proxy `request.url` is the internal http://localhost:10000,
// so a naive `new URL(path, request.url)` sends users to a dead address. The
// real host is in `x-forwarded-host` — but a client can forge that header on a
// direct request, so we only honour it when it's allow-listed (otherwise it's a
// host-header injection / open redirect, since auth routes hand back session
// state). Set the prod host via NEXT_PUBLIC_SITE_URL; localhost covers dev.
const SITE_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host
      : null;
  } catch {
    return null;
  }
})();

const ALLOWED_HOSTS = new Set(
  [SITE_HOST, "localhost:3000", "127.0.0.1:3000"].filter(
    (h): h is string => !!h,
  ),
);

export function publicOrigin(request: Request): string {
  const rawOrigin = new URL(request.url).origin;
  const forwardedHost = request.headers.get("x-forwarded-host")?.toLowerCase();
  // Only trust the forwarded host if allow-listed; force https in production.
  return forwardedHost && ALLOWED_HOSTS.has(forwardedHost)
    ? `${process.env.NODE_ENV === "production" ? "https" : "http"}://${forwardedHost}`
    : rawOrigin;
}
