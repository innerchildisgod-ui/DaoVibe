import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function importedNames(source: string): Set<string> {
  const names = new Set<string>();
  const importPattern = /import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];/g;

  for (const match of source.matchAll(importPattern)) {
    const importList = match[1] ?? "";

    for (const rawName of importList.split(",")) {
      const name = rawName
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[1] ?? rawName.trim().replace(/^type\s+/, "");

      if (name) {
        names.add(name);
      }
    }
  }

  return names;
}

function locallyDeclaredFunctions(source: string): Set<string> {
  const names = new Set<string>();
  const functionPattern = /function\s+([A-Za-z0-9_]+)\s*\(/g;

  for (const match of source.matchAll(functionPattern)) {
    const name = match[1];

    if (name) {
      names.add(name);
    }
  }

  return names;
}

describe("main app entrypoint render references", () => {
  it("does not call missing render helpers", () => {
    const source = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    const availableNames = new Set([
      ...importedNames(source),
      ...locallyDeclaredFunctions(source),
    ]);

    const calledRenderNames = Array.from(
      source.matchAll(/\$\{(render[A-Za-z0-9_]+)\(/g),
      (match) => match[1]
    ).filter((name): name is string => Boolean(name));

    expect(calledRenderNames.length).toBeGreaterThan(0);

    for (const calledRenderName of calledRenderNames) {
      expect(availableNames.has(calledRenderName), calledRenderName).toBe(true);
    }
  });
});
