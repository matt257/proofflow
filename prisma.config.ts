import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use the direct (non-pooled) Neon connection for schema operations.
    // Falls back to DATABASE_URL for local dev.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
