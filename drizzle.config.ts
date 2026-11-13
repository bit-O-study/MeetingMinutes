import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { poolOptions } from "./src/lib/db/pool-options";

// drizzle-kit은 .env를 스스로 읽지 않는다. Next와 같은 순서로 둘 다 읽는다.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: poolOptions(process.env).ssl,
  },
  verbose: true,
  strict: true,
});
