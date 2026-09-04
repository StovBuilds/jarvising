// One canonical host. Everything that is not `jarvising.com` 301s to it,
// preserving path and query:
//   www.jarvising.com    → jarvising.com
//   jarvising.pages.dev  → jarvising.com   (bare Pages alias; branch previews
//                                           like main.jarvising.pages.dev stay)
//
// Middleware rather than `_redirects` because Pages only matches *paths*
// there — an absolute-URL source is silently ignored. Not a zone Redirect Rule
// either: our Cloudflare API token cannot create those.
const CANONICAL = "jarvising.com";
const REDIRECT_HOSTS = new Set([
  "www.jarvising.com",
  "jarvising.pages.dev",
]);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (REDIRECT_HOSTS.has(url.hostname)) {
    url.hostname = CANONICAL;
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
