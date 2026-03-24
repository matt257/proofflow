import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local first (Vercel env pull), then .env as fallback
dotenv.config({ path: ".env.local" });
dotenv.config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use the unpooled Neon connection for schema operations (migrations, db push).
    // Falls back to DATABASE_URL for local dev.
    url: process.env["DATABASE_URL_UNPOOLED"] ?? process.env["DATABASE_URL"],
  },
});
