import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit은 .env.local을 스스로 읽지 않는다.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: "require",
  },
  verbose: true,
  strict: true,
});
