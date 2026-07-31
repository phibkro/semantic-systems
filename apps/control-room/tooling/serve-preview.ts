const root = `${import.meta.dirname}/../dist`;
const contentTypes: Readonly<Record<string, string>> = {
  css: "text/css",
  html: "text/html; charset=utf-8",
  js: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  webmanifest: "application/manifest+json",
};

const contentType = (path: string): string =>
  contentTypes[path.split(".").at(-1) ?? ""] ?? "application/octet-stream";

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(Bun.env.PORT ?? 4173),
  async fetch(request) {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname.slice(1));
    if (relative.includes("..") || relative.includes("\\") || relative.includes("\0")) {
      return new Response("Not found", { status: 404 });
    }
    const requested = relative === "" ? `${root}/index.html` : `${root}/${relative}`;
    const candidate = Bun.file(requested);
    const file = (await candidate.exists()) ? candidate : Bun.file(`${root}/index.html`);
    return new Response(file, {
      headers: {
        "cache-control": "no-store",
        "content-type": contentType(file.name ?? requested),
      },
    });
  },
});
