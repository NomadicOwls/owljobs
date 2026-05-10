import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("niches/wind-turbine.ts — Wave 1 activation contract (D-13, D-21)", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("niches/wind-turbine.ts", "utf-8");
  });

  // Helper: strip line-comments so we only test what's actually in the array
  function uncommented(source: string): string {
    return source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
  }

  const REQUIRED_WAVE_1 = [
    "Nordex",
    "Blattner Energy",
    "Invenergy",
    "Avangrid Renewables",
    "Global Wind Service",
    "Deutsche Windtechnik",
  ];

  for (const employer of REQUIRED_WAVE_1) {
    it(`activates ${employer} in atsTargets`, () => {
      const code = uncommented(src);
      expect(code).toContain(`"${employer}"`);
    });
  }

  it("keeps Siemens Energy commented out (D-11 — no Workday scraping)", () => {
    const code = uncommented(src);
    expect(code).not.toContain('"Siemens Energy (ex-SGRE)"');
  });

  it("keeps Ørsted commented out until Plan 07 ships Trakstar adapter (D-21)", () => {
    const code = uncommented(src);
    // Ørsted is referenced by string only inside a commented block; uncommented should NOT contain `employer: "Ørsted"`
    expect(code).not.toMatch(/employer:\s*["']Ørsted["']/);
  });

  it("keeps Quanta Services commented out (iCIMS adapter deferred)", () => {
    const code = uncommented(src);
    expect(code).not.toMatch(/employer:\s*["']Quanta Services["']/);
  });
});
