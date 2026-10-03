import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
const app = new Hono();

const basePath = "/make-server-ce9e62c6";
const collections = ["events", "bookings", "exchange", "posts", "fraud", "organizers"] as const;
type Collection = (typeof collections)[number];

const keyFor = (collection: Collection) => `eventease:${collection}`;

const isCollection = (value: string): value is Collection =>
  collections.includes(value as Collection);

const readState = async () => {
  const values = await Promise.all(collections.map((collection) => kv.get(keyFor(collection))));
  return Object.fromEntries(collections.map((collection, index) => [collection, values[index]]));
};

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get(`${basePath}/health`, (c) => {
  return c.json({ status: "ok" });
});

app.post(`${basePath}/state/bootstrap`, async (c) => {
  const seed = await c.req.json<Record<Collection, unknown>>();
  const current = await readState();

  await Promise.all(
    collections.map((collection) => {
      if (current[collection] !== undefined) return Promise.resolve();
      const value = seed[collection];
      if (!Array.isArray(value)) throw new Error(`Invalid ${collection} seed data`);
      return kv.set(keyFor(collection), value);
    }),
  );

  return c.json(await readState());
});

app.put(`${basePath}/state/:collection`, async (c) => {
  const collection = c.req.param("collection");
  if (!isCollection(collection)) return c.json({ error: "Unknown collection" }, 404);

  const value = await c.req.json();
  if (!Array.isArray(value)) return c.json({ error: "Collection must be an array" }, 400);

  await kv.set(keyFor(collection), value);
  return c.json({ ok: true });
});

app.get(`${basePath}/tickets/:ref`, async (c) => {
  const [bookings, events] = await Promise.all([
    kv.get(keyFor("bookings")),
    kv.get(keyFor("events")),
  ]);
  const booking = Array.isArray(bookings)
    ? bookings.find((item) => item?.ref === c.req.param("ref"))
    : undefined;

  if (!booking) return c.json(null);

  const event = Array.isArray(events)
    ? events.find((item) => item?.id === booking.eventId) ?? null
    : null;

  return c.json({ booking, event });
});

Deno.serve(app.fetch);
