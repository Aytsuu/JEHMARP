import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    ignores: ["dist/**", ".astro/**", ".vercel/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,mjs,ts,tsx,astro}"],
    languageOptions: {
      globals: {
        URL: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
