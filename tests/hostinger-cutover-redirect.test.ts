import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const configSource = readFileSync(
  new URL("../next.config.ts", import.meta.url),
  "utf8",
);

test("a antiga publicação da Vercel encaminha todo acesso para a Hostinger", () => {
  assert.match(configSource, /process\.env\.VERCEL\s*===\s*"1"/);
  assert.match(configSource, /source:\s*"\/:path\*"/);
  assert.match(
    configSource,
    /destination:\s*"https:\/\/bipagem\.nucleodeoperacao\.com\.br\/:path\*"/,
  );
  assert.match(configSource, /permanent:\s*true/);
});

test("o build Docker da Hostinger continua gerando a saída standalone", () => {
  assert.match(
    configSource,
    /isVercelBuild\s*\?\s*\{\}\s*:\s*\{\s*output:\s*"standalone"/,
  );
});
