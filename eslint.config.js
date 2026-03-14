import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ["**/dist/", "**/node_modules/", "packages/vscode/media/"],
  },
  {
    rules: {
      // Catch real bugs, not style
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-require-imports": "off",

      // Allow explicit any in test mocks and raw JSONL interfaces
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
