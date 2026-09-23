import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const root = resolve(".");
const output = join(root, "dist");
const server = join(output, "server");
const ignoredRoots = new Set([".git", ".openai", ".sites", "dist"]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

async function collect(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || ignoredRoots.has(entry.name) || entry.name === "build-site.mjs") continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(absolute));
    if (entry.isFile()) result.push(absolute);
  }
  return result;
}

await rm(output, { recursive: true, force: true });
await mkdir(server, { recursive: true });

const files = {};
for (const absolute of await collect(root)) {
  const pathname = "/" + relative(root, absolute).split(sep).join("/");
  files[pathname] = {
    body: (await readFile(absolute)).toString("base64"),
    type: mimeTypes[extname(absolute).toLowerCase()] || "application/octet-stream"
  };
}

const worker = `const FILES = ${JSON.stringify(files)};

function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function resolvePath(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  if (pathname === "/") return "/index.html";
  if (FILES[pathname]) return pathname;
  if (!pathname.includes(".") && FILES[pathname + ".html"]) return pathname + ".html";
  return null;
}

export default {
  async fetch(request) {
    const pathname = resolvePath(request.url);
    if (!pathname) {
      return new Response("<!doctype html><html lang=\\\"cs\\\"><meta charset=\\\"utf-8\\\"><title>Stránka nenalezena</title><body><h1>Stránka nebyla nalezena</h1><p><a href=\\\"/\\\">Zpět na Resilium</a></p></body></html>", {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    const file = FILES[pathname];
    const headers = new Headers({
      "content-type": file.type,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    });
    if (/\.(?:jpe?g|png|webp|woff2)$/i.test(pathname)) {
      headers.set("cache-control", "public, max-age=86400");
    } else {
      headers.set("cache-control", "public, max-age=300, must-revalidate");
    }

    if (request.method === "HEAD") return new Response(null, { headers });
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    return new Response(decode(file.body), { headers });
  }
};
`;

await writeFile(join(server, "index.js"), worker);
console.log(`Prepared ${Object.keys(files).length} site files.`);
