import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function readPngDimensions(relativePath: string) {
  const data = readFileSync(new URL(`../${relativePath}`, import.meta.url));
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  assert.deepEqual(data.subarray(0, 8), pngSignature);
  assert.equal(data.toString("ascii", 12, 16), "IHDR");

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

const manifestSource = read("app/manifest.ts");
const layoutSource = read("app/layout.tsx");
const installSource = read("app/_components/pwa-install.tsx");
const shellSource = read("app/_components/authenticated-app-shell.tsx");
const loginSource = read("app/login/login-view.tsx");

test("manifesto instala o Sistema de Despacho sem bloquear a orientação", () => {
  assert.match(manifestSource, /name: "Sistema de Despacho"/);
  assert.match(manifestSource, /short_name: "Despacho"/);
  assert.match(manifestSource, /start_url: "\/dashboard"/);
  assert.match(manifestSource, /scope: "\/"/);
  assert.match(manifestSource, /display: "standalone"/);
  assert.match(manifestSource, /orientation: "any"/);
  assert.match(manifestSource, /url: "\/bipagem"/);
  assert.match(manifestSource, /purpose: "maskable"/);
});

test("metadados oferecem instalação no iPhone sem invadir recortes ou desativar zoom", () => {
  assert.match(layoutSource, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layoutSource, /appleWebApp:[\s\S]*capable: true/);
  assert.match(layoutSource, /themeColor: "#0f766e"/);
  assert.doesNotMatch(layoutSource, /viewportFit: "cover"/);
  assert.doesNotMatch(layoutSource, /userScalable:\s*false/);
  assert.doesNotMatch(layoutSource, /maximumScale:\s*1/);
});

test("instalação usa o recurso nativo e explica o caminho manual", () => {
  assert.match(installSource, /beforeinstallprompt/);
  assert.match(installSource, /activePrompt\.prompt\(\)/);
  assert.match(installSource, /activePrompt\.userChoice/);
  assert.match(installSource, /display-mode: standalone/);
  assert.match(installSource, /pathname === "\/demonstracao-bipagem"/);
  assert.match(installSource, /Boolean\(deferredPrompt\) \|\| manualInstallAvailable/);
  assert.match(installSource, /Adicionar à Tela de Início/);
  assert.match(installSource, /Instalar aplicativo/);
  assert.doesNotMatch(installSource, /serviceWorker|caches\.|CacheStorage/);
});

test("atalho de instalação aparece no login, desktop e celular", () => {
  assert.match(loginSource, /<InstallAppButton className="mt-5/);
  assert.match(shellSource, /<InstallAppButton className="mb-3" \/>/);
  assert.match(shellSource, /<InstallAppButton compact className="mt-2" \/>/);
});

test("ícones PWA possuem os tamanhos declarados", () => {
  assert.deepEqual(readPngDimensions("public/pwa/icon-192.png"), {
    width: 192,
    height: 192,
  });
  assert.deepEqual(readPngDimensions("public/pwa/icon-512.png"), {
    width: 512,
    height: 512,
  });
  assert.deepEqual(readPngDimensions("public/pwa/icon-maskable-512.png"), {
    width: 512,
    height: 512,
  });
  assert.deepEqual(readPngDimensions("app/apple-icon.png"), {
    width: 180,
    height: 180,
  });
});
