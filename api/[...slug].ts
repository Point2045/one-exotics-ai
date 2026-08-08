// Vercel catch-all Serverless Function: every /api/* request lands here with
// its original path intact, and the Hono app routes it (tRPC + 404 JSON).
// The local/Docker runtime uses api/boot.ts (npm start) instead.
import { getRequestListener } from "@hono/node-server";
import app from "./boot";

export default getRequestListener(app.fetch);
