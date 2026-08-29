import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(
  new URL("../app/_components/authenticated-app-shell.tsx", import.meta.url),
  "utf8",
);

test("marca do sistema no menu desktop retorna ao Dashboard", () => {
  assert.match(shellSource, /import Link from "next\/link"/);
  assert.match(
    shellSource,
    /<aside[\s\S]*?<Link[\s\S]*?href="\/dashboard"[\s\S]*?aria-label="Ir para o Dashboard"[\s\S]*?<BrandMark \/>[\s\S]*?Sistema Despacho[\s\S]*?<\/Link>[\s\S]*?<Navigation \/>/,
  );
});

test("atalho desktop possui retorno visual para mouse e teclado", () => {
  assert.match(
    shellSource,
    /aria-label="Ir para o Dashboard"[\s\S]*?hover:bg-white\/80[\s\S]*?focus-visible:ring-4/,
  );
});
