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
  const response = await context.next();
  // Pages answers any unknown path with the app's index.html (200), because
  // there is no 404.html. For /.well-known/ that is wrong: a personal agent that
  // finds an app page at /.well-known/oauth-protected-resource refuses the whole
  // /.well-known/poppy.json (Poppy spec 3.2). Real files there (poppy.json,
  // mcp.json, security.txt) are not HTML and pass through untouched.
  if (url.pathname.startsWith("/.well-known/") && (response.headers.get("content-type") || "").includes("text/html")) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  }
  return response;
}
