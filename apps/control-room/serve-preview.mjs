const prefix = "/semantic-systems";
const root = `${import.meta.dir}/dist`;
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

function contentType(path) {
  const extension = Object.keys(contentTypes).find((candidate) => path.endsWith(candidate));
  return extension ? contentTypes[extension] : "application/octet-stream";
}

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4173),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === prefix) {
      return Response.redirect(`${url.origin}${prefix}/`, 308);
    }
    if (!url.pathname.startsWith(`${prefix}/`)) {
      return new Response("Not found", { status: 404 });
    }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length + 1));
    if (relative.includes("..")) {
      return new Response("Not found", { status: 404 });
    }
    const requested = relative ? `${root}/${relative}` : `${root}/index.html`;
    let file = Bun.file(requested);
    if (!(await file.exists())) {
      file = Bun.file(`${root}/index.html`);
    }
    return new Response(file, {
      headers: {
        "content-type": contentType(file.name ?? requested),
        "cache-control": "no-store",
      },
    });
  },
});
