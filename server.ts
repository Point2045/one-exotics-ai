// Vercel entry point. Vercel's zero-config Hono support detects a
// default-exported Hono app at this location and routes all non-static
// requests to it: https://vercel.com/docs/frameworks/backend/hono
// The local/Docker runtime uses dist/boot.js (npm start) instead.
import app from "./api/boot";

export default app;
