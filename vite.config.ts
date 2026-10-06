import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/pigball/",
  test: {
    include: ["src/**/*.test.ts"],
  },
});
