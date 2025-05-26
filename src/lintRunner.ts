// src/lintRunner.ts
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
    case "typescript":
      return await lintWithBiome(languageId, code);
    case "python":
      return await lintWithPylint(code);
    default:
      return { errors: 0, warnings: 0 };
  }
}

async function lintWithBiome(languageId: string, code: string): Promise<LintStats> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), "biome-"));
  const ext = languageId === "typescript" ? "ts" : "js";
  const tempFile = path.join(tempDir, `lint.${ext}`);
  await fs.writeFile(tempFile, code, "utf-8");

  try {
    const { stdout, stderr } = await exec(`npx biome lint --no-ignore --files-max-size=1mb --output-format json "${tempFile}"`);

    if (!stdout?.trim()) {
      console.error("Biome lint returned empty output.");
      if (stderr) console.error("Biome stderr:", stderr);
      return { errors: 0, warnings: 0 };
    }

    const output = JSON.parse(stdout);

    let errors = 0;
    let warnings = 0;

    for (const diag of output.diagnostics || []) {
      if (diag.severity === "error") errors++;
      if (diag.severity === "warning") warnings++;
    }

    return { errors, warnings };
  } catch (err: any) {
    console.error("Biome lint failed:", err.message);
    return { errors: 0, warnings: 0 };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
