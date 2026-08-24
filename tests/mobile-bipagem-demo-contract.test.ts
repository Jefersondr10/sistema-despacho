import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const pageSource = read("app/demonstracao-bipagem/page.tsx");
const demoSource = read(
  "app/demonstracao-bipagem/mobile-bipagem-demo.tsx",
);
const shellSource = read("app/_components/app-shell.tsx");
const authenticatedShellSource = read(
  "app/_components/authenticated-app-shell.tsx",
);
const scannerSource = read("app/bipagem/mobile-camera-scanner.tsx");
const globalStyles = read("app/globals.css");
const fullscreenDialogSource = read(
  "app/bipagem/use-accessible-fullscreen-dialog.ts",
);

test("demonstração exige a flag e deixa autenticação fora do shell de entrada", () => {
  assert.match(pageSource, /ENABLE_MOBILE_BIPAGEM_DEMO/);
  assert.match(pageSource, /notFound\(\)/);
  assert.match(shellSource, /pathname === ["']\/demonstracao-bipagem["']/);
  assert.match(
    shellSource,
    /import\(["']\.\/authenticated-app-shell["']\)/,
  );
  assert.doesNotMatch(
    shellSource,
    /\bAuthProvider\b|\buseAuth\b|supabase/i,
  );
  assert.doesNotMatch(
    shellSource,
    /^import\s+.*authenticated-app-shell/m,
  );
  assert.match(authenticatedShellSource, /\bAuthProvider\b/);
  assert.match(authenticatedShellSource, /from ["']@\/app\/_lib\/auth-context["']/);
  assert.ok(
    shellSource.indexOf('pathname === "/demonstracao-bipagem"') <
      shellSource.lastIndexOf("<AuthenticatedAppShell>"),
  );
});

test("demonstração mantém leituras em memória e não chama dados operacionais", () => {
  assert.doesNotMatch(
    demoSource,
    /from\s+["'][^"']*(?:supabase|database|auth-context|supabase-dispatch-store)[^"']*["']/i,
  );
  assert.doesNotMatch(demoSource, /BipagemForm|fetch\s*\(/);
  assert.match(demoSource, /useState<DemoPackage\[\]>/);
  assert.match(demoSource, /MobileCameraScanner/);
  assert.match(
    demoSource,
    /parseTrackingCode\(rawCode,\s*\{[\s\S]*carrier:/,
  );
  assert.match(demoSource, /Nenhum dado foi salvo/);
});

test("demonstração cobre lista, duplicados e finalização móvel", () => {
  const manualInputPosition = demoSource.indexOf('id="demo-code"');
  const scannerPosition = demoSource.indexOf("<MobileCameraScanner");

  assert.match(demoSource, /type DemoStep = "setup" \| "scanning" \| "finished"/);
  assert.match(demoSource, /fixed inset-0[^"\n]*h-dvh[^"\n]*overflow-hidden/);
  assert.match(demoSource, /min-h-0 flex-1[^"\n]*overflow-y-auto/);
  assert.match(demoSource, /Remover repetição/);
  assert.match(demoSource, /Corrigir \$\{duplicateExcess\}/);
  assert.match(demoSource, /Finalizar bipagem/);
  assert.match(demoSource, /Adicionar código/);
  assert.match(demoSource, /Limpar leituras/);
  assert.match(demoSource, /Sair da bipagem/);
  assert.match(demoSource, /safe-area-inset-bottom/);
  assert.match(demoSource, /operationToken !== operationTokenRef\.current/);
  assert.match(demoSource, /function returnToScanning\(\)/);
  assert.match(demoSource, /const isLatest = item\.id === packages\[0\]\?\.id/);
  assert.match(demoSource, /MAIS RECENTE/);
  assert.match(
    demoSource,
    /replacePackages\(\[nextPackage, \.\.\.packagesRef\.current\]\)[\s\S]*listRef\.current\?\.scrollTo\(\{ top: 0/,
  );
  assert.match(
    demoSource,
    /flushSync\(\(\) => setManualEntryOpen\(true\)\)[\s\S]*manualInputRef\.current\?\.focus/,
  );
  assert.match(demoSource, /break-all font-mono/);
  assert.ok(manualInputPosition > 0 && manualInputPosition < scannerPosition);
});

test("demonstração gerencia duplicados em tela cheia no celular", () => {
  assert.match(
    demoSource,
    /showOnlyDuplicates \? \([\s\S]*fixed inset-0[^"\n]*h-dvh[^"\n]*xl:hidden/,
  );
  assert.match(
    demoSource,
    /aria-labelledby="demo-duplicate-manager-title"/,
  );
  assert.match(
    demoSource,
    /pause=\{[\s\S]*showOnlyDuplicates \|\|[\s\S]*packagesFullscreenOpen \|\|[\s\S]*manualEntryOpen \|\|[\s\S]*optionsOpen \|\|[\s\S]*Boolean\(pendingAction\)/,
  );
  assert.match(
    demoSource,
    /visiblePackages\.map[\s\S]*break-all font-mono text-base/,
  );
  assert.match(demoSource, /min-h-12 w-full[\s\S]*Remover esta repetição/);
  assert.match(
    demoSource,
    /demo-duplicate-manager-title[\s\S]*safe-area-inset-bottom/,
  );
});

test("demonstração abre todos os pacotes em diálogo de tela cheia", () => {
  assert.match(demoSource, /Ver pacotes em tela cheia/);
  assert.match(demoSource, /aria-haspopup="dialog"/);
  assert.match(
    demoSource,
    /packagesFullscreenOpen \? \([\s\S]*fixed inset-0[^"\n]*h-dvh[^"\n]*overflow-hidden/,
  );
  assert.match(
    demoSource,
    /ref=\{packagesFullscreenRef\}[\s\S]*role="dialog"[\s\S]*aria-modal="true"[\s\S]*aria-labelledby="demo-packages-fullscreen-title"/,
  );
  assert.match(
    demoSource,
    /open: packagesFullscreenOpen,[\s\S]*dialogRef: packagesFullscreenRef,[\s\S]*initialFocusRef:[\s\S]*manualRemovalInputRef[\s\S]*packagesFullscreenInitialFocusRef/,
  );
  assert.match(demoSource, /ref=\{packagesFullscreenInitialFocusRef\}/);
  assert.match(
    demoSource,
    /fullscreenPackages\.map\(\(item\)[\s\S]*title=\{item\.code\}/,
  );
  assert.match(demoSource, /break-all font-mono text-base/);
  assert.match(
    demoSource,
    /packagesFullscreenOpen[\s\S]*overflow-y-auto overscroll-contain[\s\S]*Remover pacote/,
  );
  assert.match(
    demoSource,
    /packagesFullscreenOpen[\s\S]*Corrigir \{duplicateExcess\} duplicado/,
  );
  assert.match(demoSource, /Voltar à bipagem/);
  assert.match(fullscreenDialogSource, /event\.key === "Escape"/);
  assert.match(fullscreenDialogSource, /event\.key !== "Tab"/);
});

test("demonstração mantém entrada manual somente nas opções", () => {
  assert.doesNotMatch(demoSource, /onManualEntry=\{openManualEntry\}/);
  assert.doesNotMatch(
    demoSource,
    /mobile-camera-shell[^"\n]*\[&>section>div:first-child>div>button\]:hidden/,
  );
  assert.match(demoSource, /Ver pacotes em tela cheia[\s\S]*Adicionar código/);
  assert.match(
    demoSource,
    /pause=\{[\s\S]*packagesFullscreenOpen \|\|[\s\S]*manualEntryOpen \|\|[\s\S]*optionsOpen \|\|/,
  );
  assert.match(demoSource, /const manualEntryFeedback =/);
  assert.match(demoSource, /id="demo-manual-feedback"/);
  assert.match(demoSource, /aria-describedby=\{[\s\S]*demo-manual-feedback/);
  assert.doesNotMatch(demoSource, /mobile-scan-notice/);
});

test("demonstração permite localizar e remover uma leitura manualmente", () => {
  assert.match(demoSource, /Remover código manualmente/);
  assert.match(
    demoSource,
    /type DemoPackagesFullscreenMode = "browse" \| "manual-remove"/,
  );
  assert.match(
    demoSource,
    /function openManualRemoval\(\)[\s\S]*setPackagesFullscreenMode\("manual-remove"\)[\s\S]*setPackagesFullscreenOpen\(true\)/,
  );
  assert.match(demoSource, /id="demo-manual-removal-query"/);
  assert.match(demoSource, /normalizeDemoTrackingCode\(item\.code\)\.includes\(normalizedQuery\)/);
  assert.match(demoSource, /fullscreenPackages\.map\(\(item\) =>/);
  assert.match(demoSource, /Remover do teste/);
  assert.match(demoSource, /manualRemovalStatus/);
  assert.match(demoSource, /Localize a leitura/);
});

test("menu de opções da demonstração funciona como diálogo acessível", () => {
  assert.match(
    demoSource,
    /useAccessibleFullscreenDialog\(\{[\s\S]*open: optionsOpen[\s\S]*dialogRef: optionsDialogRef[\s\S]*initialFocusRef: manualOptionRef/,
  );
  assert.match(
    demoSource,
    /ref=\{optionsDialogRef\}[\s\S]*role="dialog"[\s\S]*aria-modal="true"[\s\S]*aria-labelledby="demo-options-title"/,
  );
  assert.match(demoSource, /onClick=\{closeDemoOptions\}/);
});

test("demonstração restaura o foco e bloqueia o fundo dos duplicados", () => {
  assert.match(
    demoSource,
    /useAccessibleFullscreenDialog\(\{[\s\S]*open: showOnlyDuplicates/,
  );
  assert.match(
    demoSource,
    /ref=\{duplicateManagerRef\}[\s\S]*tabIndex=\{-1\}/,
  );
  assert.match(demoSource, /ref=\{duplicateManagerInitialFocusRef\}/);
  assert.match(fullscreenDialogSource, /initialFocusRef\.current/);
  assert.match(fullscreenDialogSource, /document\.addEventListener\("keydown"/);
  assert.match(fullscreenDialogSource, /onCloseRef\.current\(\)/);
  assert.match(fullscreenDialogSource, /restoreFocusTarget\?\.isConnected/);
  assert.match(fullscreenDialogSource, /previousBodyOverflow/);
  assert.match(fullscreenDialogSource, /previousRootOverflow/);
});

test("confirmações da demonstração prendem o foco e aceitam Escape", () => {
  assert.match(
    demoSource,
    /useAccessibleFullscreenDialog\(\{[\s\S]*open: Boolean\(pendingAction\)[\s\S]*dialogRef: pendingActionDialogRef[\s\S]*initialFocusRef: pendingActionInitialFocusRef/,
  );
  assert.match(
    demoSource,
    /ref=\{pendingActionDialogRef\}[\s\S]*tabIndex=\{-1\}[\s\S]*role="dialog"/,
  );
  assert.match(demoSource, /ref=\{pendingActionInitialFocusRef\}/);
  assert.match(demoSource, /optionsTriggerRef\.current\?\.focus/);
});

test("configuração da demonstração exige os mesmos campos do lote real", () => {
  assert.match(demoSource, />\s*Loja\s*</);
  assert.match(demoSource, />\s*Marketplace\s*</);
  assert.match(demoSource, /Tipo de operação/);
  assert.match(demoSource, /Usa Melhor Envio\?/);
  assert.match(demoSource, />\s*Transportadora\s*</);
  assert.match(demoSource, /setup\.melhorEnvio && !setup\.carrier/);
  assert.match(demoSource, /Iniciar bipagem/);
  assert.match(demoSource, /setStep\("scanning"\)/);
});

test("leitura antiga nunca libera o processamento de uma câmera nova", () => {
  assert.match(
    scannerSource,
    /\.finally\(\(\) => \{\s*if \(token !== startTokenRef\.current\) \{\s*return;\s*\}\s*processingRef\.current = false;/,
  );
});

test("modo paisagem preserva uma área útil para a lista", () => {
  assert.match(demoSource, /mobile-bipagem-main/);
  assert.match(demoSource, /mobile-camera-shell/);
  assert.match(demoSource, /mobile-package-list/);
  assert.match(
    globalStyles,
    /orientation: landscape[\s\S]*mobile-bipagem-main[\s\S]*grid-template-columns/,
  );
  assert.match(
    globalStyles,
    /mobile-immersive-session[\s\S]*mobile-session-list/,
  );
  assert.match(
    globalStyles,
    /mobile-manual-removal-dialog[\s\S]*grid-template-columns[\s\S]*mobile-manual-removal-results/,
  );
});
