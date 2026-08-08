// Vercel Serverless Function entry. Bundled to a self-contained api/index.mjs
// by the buildCommand in vercel.json (Vercel's own TS pipeline doesn't resolve
// this repo's path aliases, so we pre-bundle with the same esbuild setup as
// the Docker runtime). The /api/(.*) rewrite in vercel.json forwards every API
// request here with the original path suffix preserved in ?__path=.
import { getRequestListener } from "@hono/node-server";
import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./boot";

const listener = getRequestListener(app.fetch);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const incoming = new URL(req.url ?? "/", "http://localhost");
  const path = incoming.searchParams.get("__path");
  if (path) {
    incoming.searchParams.delete("__path");
    req.url = `/api/${path}${incoming.search}`;
  }
  return listener(req, res);
}
