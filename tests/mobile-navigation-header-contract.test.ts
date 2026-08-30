import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(
  new URL("../app/_components/authenticated-app-shell.tsx", import.meta.url),
  "utf8",
);
const navigationSource = readFileSync(
  new URL("../app/_components/navigation.tsx", import.meta.url),
  "utf8",
);

const mobileHeader = shellSource.match(
  /<header className="mobile-app-shell-header[\s\S]*?<\/header>/,
)?.[0];

test("topo móvel mostra conta ativa e a marca retorna ao Dashboard", () => {
  assert.ok(mobileHeader, "cabeçalho móvel não encontrado");
  assert.match(mobileHeader, /<div className="md:hidden">/);
  assert.match(mobileHeader, /href="\/dashboard"/);
  assert.match(mobileHeader, /aria-label="Ir para o Dashboard"/);
  assert.match(mobileHeader, /Sistema Despacho/);
  assert.match(mobileHeader, /Conta ativa/);
  assert.match(mobileHeader, /title=\{accountEmail\}/);
  assert.match(mobileHeader, /\{accountEmail\}/);
  assert.ok((mobileHeader.match(/<UserSessionBox compact \/>/g)?.length ?? 0) >= 1);
});

test("menu sanduíche abre para baixo e fecha ao escolher uma opção", () => {
  assert.ok(mobileHeader, "cabeçalho móvel não encontrado");
  assert.match(shellSource, /const \[mobileMenuOpen, setMobileMenuOpen\] = useState\(false\)/);
  assert.match(mobileHeader, /aria-expanded=\{mobileMenuOpen\}/);
  assert.match(mobileHeader, /aria-controls="mobile-primary-menu"/);
  assert.match(mobileHeader, /"Fechar menu" : "Abrir menu"/);
  assert.match(mobileHeader, /id="mobile-primary-menu"/);
  assert.match(
    mobileHeader,
    /<Navigation onNavigate=\{\(\) => setMobileMenuOpen\(false\)\} \/>/,
  );
  assert.match(navigationSource, /onNavigate=\{onNavigate\}/);
  assert.match(navigationSource, /onNavigate\?: \(\) => void/);
});

test("desktop mantém menu lateral e conta completa", () => {
  const desktopAside = shellSource.match(/<aside[\s\S]*?<\/aside>/)?.[0];
  assert.ok(desktopAside, "menu lateral desktop não encontrado");
  assert.match(desktopAside, /<Navigation \/>/);
  assert.match(desktopAside, /<UserSessionBox \/>/);
  assert.match(desktopAside, /Controle de expedição/);
});

test("computador abaixo de xl preserva o menu horizontal anterior", () => {
  assert.ok(mobileHeader, "cabeçalho responsivo não encontrado");
  assert.match(mobileHeader, /<div className="hidden md:block">/);
  assert.match(mobileHeader, /<Navigation compact \/>/);
  assert.match(mobileHeader, /Controle de expedição/);
});
