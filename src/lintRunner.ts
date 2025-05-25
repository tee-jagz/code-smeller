// src/lintRunner.ts
import { ESLint } from "eslint";
import * as tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import { tmpdir } from "os";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import { exec as _exec } from "child_process";

const exec = promisify(_exec);

export interface LintStats {
  errors: number;
  warnings: number;
}

export async function runLinter(
  languageId: string,
  code: string
): Promise<LintStats> {
  switch (languageId) {
    case "javascript":
      return await lintWithESLint(code, false);
    case "typescript":
      return await lintWithESLint(code, true);
    case "python":
      return await lintWithPylint(code);
    default:
      return { errors: 0, warnings: 0 };
  }
}

async function lintWithESLint(code: string, isTypeScript: boolean): Promise<LintStats> {
  const eslint = new ESLint({
    overrideConfigFile: null,
    overrideConfig: {
      languageOptions: {
        parser: isTypeScript ? (tsParser as any) : undefined, 
        sourceType: "module",
        ecmaVersion: 2022,
      },
      plugins: isTypeScript ? { "@typescript-eslint": tsPlugin as any } : {},
      rules: {
        "@typescript-eslint/explicit-function-return-type": "warn",
        "@typescript-eslint/no-floating-promises": "warn",
        "@typescript-eslint/await-thenable": "warn",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/ban-types": "warn",
      },
    },
  });

  const results = await eslint.lintText(code, {
    filePath: isTypeScript ? "file.ts" : "file.js",
  });

  let errors = 0;
  let warnings = 0;
  for (const r of results) {
    errors += r.errorCount;
    warnings += r.warningCount;
  }

  return { errors, warnings };
}

async function lintWithPylint(code: string): Promise<LintStats> {
  const tempFile = path.join(tmpdir(), `lint-${Date.now()}.py`);
  await fs.writeFile(tempFile, code, "utf-8");

  try {
    const { stdout } = await exec(
      `python -m pylint --output-format=json --score=n --exit-zero "${tempFile}"`
    );
    const messages = JSON.parse(stdout) as { type: string }[];
    const errors = messages.filter(m => m.type === "error" || m.type === "fatal").length;
    const warnings = messages.filter(m => m.type === "warning").length;
    return { errors, warnings };
  } catch (err) {
    console.error("Pylint failed:", err);
    return { errors: 0, warnings: 0 };
  } finally {
    await fs.unlink(tempFile).catch(() => void 0);
  }
}
