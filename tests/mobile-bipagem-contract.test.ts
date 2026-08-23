import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const scannerSource = read("app/bipagem/mobile-camera-scanner.tsx");
const bipagemSource = read("app/bipagem/bipagem-form.tsx");
const authenticatedAppShellSource = read(
  "app/_components/authenticated-app-shell.tsx",
);
const globalStylesSource = read("app/globals.css");
const fullscreenDialogSource = read(
  "app/bipagem/use-accessible-fullscreen-dialog.ts",
);
const reportsPageSource = read("app/relatorios/page.tsx");
const reportsViewSource = read("app/relatorios/relatorios-view.tsx");
const legacyRomaneioSource = read(
  "app/romaneio/[loteId]/romaneio-lote-view.tsx",
);

test("a câmera é carregada sob demanda e prefere a lente traseira", () => {
  assert.match(scannerSource, /await import\(\s*["']@zxing\/browser["']\s*\)/);
  assert.match(scannerSource, /await import\(\s*["']@zxing\/library["']\s*\)/);
  assert.doesNotMatch(scannerSource, /from ["']@zxing\/browser["']/);
  assert.doesNotMatch(scannerSource, /from ["']@zxing\/library["']/);
  assert.match(
    scannerSource,
    /DecodeHintType\.RETURN_CODABAR_START_END, true/,
  );
  assert.match(
    scannerSource,
    /new BrowserMultiFormatReader\(readerHints,/,
  );
  assert.match(scannerSource, /facingMode:\s*\{ ideal: ["']environment["'] \}/);
  assert.match(scannerSource, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(scannerSource, /reader\.decodeFromStream/);
  assert.match(scannerSource, /document\.hidden/);
  assert.match(scannerSource, /addEventListener\("ended", handleTrackEnded\)/);
  assert.match(scannerSource, /addEventListener\("pagehide", handlePageHide\)/);
  assert.match(scannerSource, /isRecoverableCameraReaderError\(error\)/);
  assert.doesNotMatch(scannerSource, /reader\.decodeFromConstraints/);
  assert.match(
    scannerSource,
    /attemptStream = stream;[\s\S]*?releaseAttemptResources\(\);[\s\S]*?ownedStreamRef\.current = stream/,
  );
  assert.match(
    scannerSource,
    /attemptControls = controls;[\s\S]*?releaseAttemptResources\(\);[\s\S]*?controlsRef\.current = controls/,
  );
  assert.match(scannerSource, /playsInline/);
  assert.match(scannerSource, /safelyStopControls\(controlsRef\.current\)/);
  assert.match(
    scannerSource,
    /Promise\.resolve\(controls\.stop\(\)\)\.catch\(\(\) => undefined\)/,
  );
  assert.match(
    scannerSource,
    /ownedStream\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/,
  );
  assert.match(
    scannerSource,
    /processingRef\.current \|\| busyRef\.current[\s\S]*registerCameraDetection/,
  );
  assert.match(
    scannerSource,
    /controlsRef\.current \|\|[\s\S]*status === "starting"/,
  );
  assert.doesNotMatch(
    scannerSource,
    /document\.hidden[\s\S]{0,140}status === "starting"/,
  );
});

test("leitor fisico recebe foco antes do proximo tick", () => {
  const focusStart = bipagemSource.indexOf("function focusCodeField");
  const nextFunction = bipagemSource.indexOf(
    "function openMobileManualEntry",
    focusStart,
  );
  const focusSource = bipagemSource.slice(focusStart, nextFunction);

  const immediateFocus = focusSource.indexOf("currentCodeField?.focus");
  const fallbackTimer = focusSource.indexOf("window.setTimeout");
  assert.ok(immediateFocus > 0);
  assert.ok(fallbackTimer > immediateFocus);
  assert.match(
    focusSource,
    /window\.setTimeout\([\s\S]*codeRef\.current\?\.focus/,
  );
  assert.doesNotMatch(focusSource, /codeRef\.current !== currentCodeField/);
});

test("formulário manual e câmera compartilham a mesma rotina segura", () => {
  assert.match(
    bipagemSource,
    /function handleSubmit[\s\S]*processTrackingCode\(getCodeFieldValue\(\)\)/,
  );
  assert.match(bipagemSource, /onDetected=\{processTrackingCode\}/);
  assert.match(bipagemSource, /processingTrackingRef\.current/);
  assert.match(bipagemSource, /parseTrackingCode\(rawValue\)/);
  assert.match(bipagemSource, /await cancelPackageByCode\(rawValue\)/);
  assert.match(scannerSource, /\.then\(\(outcome\) =>/);
  assert.match(scannerSource, /scanFeedback\?\.accepted/);
  assert.match(bipagemSource, /Promise<CameraScanOutcome>/);
});

test("versão móvel mantém lista rolável e finalização fixa", () => {
  assert.match(bipagemSource, /h-\[54dvh\][^"\n]*overflow-y-auto/);
  assert.match(
    bipagemSource,
    /fixed inset-x-0 bottom-0[\s\S]*safe-area-inset-bottom/,
  );
  assert.match(bipagemSource, /Corrigir \$\{duplicateExcessCount\}/);
  assert.match(bipagemSource, /showDuplicatePackages/);
  assert.match(bipagemSource, /Remover repetição/);
});

test("mobile entra no modo imersivo antes do primeiro pacote sem tocar no banco", () => {
  assert.match(
    bipagemSource,
    /const \[mobileScanningStarted, setMobileScanningStarted\] =\s*useState\(false\)/,
  );
  assert.match(
    bipagemSource,
    /const mobileImmersiveSession =\s*\(sessionOpen \|\| mobileScanningStarted\) && !cancellationMode/,
  );
  assert.match(
    bipagemSource,
    /mobileImmersiveSession[\s\S]*max-xl:fixed[^"\n]*max-xl:inset-0[^"\n]*max-xl:h-dvh[^"\n]*max-xl:overflow-hidden/,
  );
  assert.match(bipagemSource, /max-xl:contents/);
  assert.match(
    bipagemSource,
    /max-xl:min-h-0 max-xl:flex-1[^"\n]*max-xl:overflow-hidden/,
  );
  assert.match(
    bipagemSource,
    /max-xl:h-auto max-xl:min-h-0 max-xl:max-h-none/,
  );
  assert.match(
    bipagemSource,
    /mobileImmersiveSession \? "max-xl:hidden"[^\n]*>[\s\S]{0,500}Histórico de lotes/,
  );
  assert.match(
    bipagemSource,
    /mobileImmersiveSession \? "max-xl:hidden" : ""[\s\S]{0,500}Configuração do lote/,
  );
  assert.match(
    bipagemSource,
    /!cancellationMode && !mobileImmersiveSession\s*\? "max-xl:hidden"/,
  );
  assert.match(
    bipagemSource,
    /\{!cancellationMode && mobileImmersiveSession \? \(\s*<MobileCameraScanner/,
  );
  assert.match(
    bipagemSource,
    /onClick=\{startMobileScanning\}[\s\S]{0,500}Iniciar bipagem/,
  );

  const startPosition = bipagemSource.indexOf("function startMobileScanning");
  const nextFunctionPosition = bipagemSource.indexOf(
    "function showDuplicatePackages",
    startPosition,
  );
  assert.ok(startPosition > 0 && nextFunctionPosition > startPosition);
  const startMobileScanningSource = bipagemSource.slice(
    startPosition,
    nextFunctionPosition,
  );
  assert.match(startMobileScanningSource, /setMobileScanningStarted\(true\)/);
  assert.doesNotMatch(
    startMobileScanningSource,
    /createSessaoBipagem|ensureOpenSession|adicionarItemSessaoBipagem|\.rpc\(|\.from\(/,
  );
  assert.match(bipagemSource, /xl:grid-cols-/);
});

test("opções móveis pausam a câmera e reutilizam confirmações do lote", () => {
  assert.match(
    bipagemSource,
    /const cameraPaused =[\s\S]*showMobileSessionOptions \|\|/,
  );
  assert.match(
    bipagemSource,
    /useAccessibleFullscreenDialog\(\{[\s\S]*open: showMobileSessionOptions && mobileImmersiveSession/,
  );
  assert.match(bipagemSource, /id="mobile-session-options"/);
  assert.match(bipagemSource, /aria-labelledby="mobile-session-options-title"/);
  assert.match(bipagemSource, /ref=\{mobileSessionOptionsInitialFocusRef\}/);
  assert.match(bipagemSource, /Adicionar código manualmente/);
  assert.match(bipagemSource, /discardSessionFromMobileOptions/);
  assert.match(
    bipagemSource,
    /function discardSessionFromMobileOptions\(\)[\s\S]*if \(!activeBatchId\)[\s\S]*setMobileScanningStarted\(false\)[\s\S]*return;[\s\S]*clearSession\(\)/,
  );
  assert.match(bipagemSource, /A câmera fica pausada enquanto este menu está aberto/);
});

test("rodapé móvel inicia a bipagem antes de criar o lote", () => {
  const mobileFooterPosition = bipagemSource.indexOf(
    "fixed inset-x-0 bottom-0",
  );
  const mobileOptionsPosition = bipagemSource.indexOf(
    'id="mobile-session-options"',
  );

  assert.ok(mobileFooterPosition > 0);
  const mobileFooterSource = bipagemSource.slice(
    mobileFooterPosition,
    mobileOptionsPosition,
  );
  assert.match(mobileFooterSource, /onClick=\{startMobileScanning\}/);
  assert.match(
    mobileFooterSource,
    /disabled=\{Boolean\(cameraDisabledMessage\) \|\| submitDisabled\}/,
  );
  assert.match(mobileFooterSource, /Iniciar bipagem/);
  assert.doesNotMatch(mobileFooterSource, /Adicionar manualmente/);
  assert.match(
    bipagemSource,
    /function resetSessionConfig\(\)[\s\S]*setMobileScanningStarted\(false\)/,
  );
});

test("entrada manual abre com foco e pausa a câmera", () => {
  assert.match(
    bipagemSource,
    /function openMobileManualEntry\(\)[\s\S]*setShowMobileManualInput\(true\)[\s\S]*codeRef\.current\?\.focus/,
  );
  assert.match(
    bipagemSource,
    /const cameraPaused =[\s\S]*showMobileManualInput \|\|/,
  );
  assert.match(
    bipagemSource,
    /<MobileCameraScanner[\s\S]*pause=\{cameraPaused\}/,
  );
  assert.match(
    bipagemSource,
    /type="submit"[\s\S]{0,100}disabled=\{submitDisabled \|\| Boolean\(cameraDisabledMessage\)\}/,
  );
  assert.doesNotMatch(scannerSource, /Adicionar manualmente/);
});

test("shell esconde o cabeçalho e trava o scroll durante a bipagem imersiva", () => {
  assert.match(
    authenticatedAppShellSource,
    /<header className="mobile-app-shell-header[^"\n]*xl:hidden"/,
  );
  assert.match(
    globalStylesSource,
    /html:has\(\.mobile-immersive-session\),\s*body:has\(\.mobile-immersive-session\)\s*\{\s*overflow: hidden;/,
  );
  assert.match(
    globalStylesSource,
    /body:has\(\.mobile-immersive-session\) \.mobile-app-shell-header\s*\{\s*display: none;/,
  );
});

test("correção de duplicados ocupa a tela do celular e pausa a câmera", () => {
  assert.match(
    bipagemSource,
    /showOnlySessionDuplicates \? \([\s\S]*fixed inset-0[^"\n]*h-dvh[^"\n]*xl:hidden/,
  );
  assert.match(bipagemSource, /aria-labelledby="duplicate-manager-title"/);
  assert.match(
    bipagemSource,
    /const cameraPaused =[\s\S]*showOnlySessionDuplicates \|\|/,
  );
  assert.match(
    bipagemSource,
    /duplicateSessionPackages\.map[\s\S]*break-all font-mono/,
  );
  assert.match(bipagemSource, /min-h-12 w-full[\s\S]*Remover esta repetição/);
  assert.match(
    bipagemSource,
    /closeDuplicatePackages[\s\S]*safe-area-inset-bottom/,
  );
});

test("gerenciador de duplicados mantém teclado e foco dentro do diálogo", () => {
  assert.match(
    bipagemSource,
    /useAccessibleFullscreenDialog\(\{[\s\S]*open: showOnlySessionDuplicates/,
  );
  assert.match(
    bipagemSource,
    /ref=\{duplicateManagerRef\}[\s\S]*tabIndex=\{-1\}/,
  );
  assert.match(bipagemSource, /ref=\{duplicateManagerInitialFocusRef\}/);
  assert.match(fullscreenDialogSource, /event\.key === "Escape"/);
  assert.match(fullscreenDialogSource, /event\.key !== "Tab"/);
  assert.match(fullscreenDialogSource, /firstElement\.focus/);
  assert.match(fullscreenDialogSource, /lastElement\.focus/);
  assert.match(
    fullscreenDialogSource,
    /document\.body\.style\.overflow = "hidden"/,
  );
  assert.match(
    fullscreenDialogSource,
    /document\.documentElement\.style\.overflow = "hidden"/,
  );
  assert.match(fullscreenDialogSource, /restoreFocusTarget\.focus/);
});

test("celular não abre o teclado virtual nem repete a entrada manual na câmera", () => {
  assert.match(bipagemSource, /pointer: coarse/);
  assert.match(bipagemSource, /shouldAutoFocusCodeField\(\)/);
  assert.doesNotMatch(scannerSource, /aria-label=["']Digitar código["']/);
  assert.doesNotMatch(scannerSource, />\s*Digitar\s*</);
});

test("controles compactos deixam a lista como área principal", () => {
  const cameraTitlePosition = scannerSource.indexOf("mobile-camera-title");
  const previewPosition = scannerSource.indexOf("<video");
  const manualInputPosition = bipagemSource.indexOf('id="tracking-code-input"');
  const scannerPosition = bipagemSource.indexOf("<MobileCameraScanner");

  assert.ok(cameraTitlePosition > 0 && cameraTitlePosition < previewPosition);
  assert.ok(manualInputPosition > 0 && manualInputPosition < scannerPosition);
  assert.match(scannerSource, /h-\[clamp\(7\.5rem,20dvh,10\.5rem\)\]/);
  assert.match(scannerSource, /aria-label="Parar câmera"/);
  assert.match(scannerSource, /title="Parar câmera"/);
  assert.match(scannerSource, /onClick=\{\(\) => stopCamera\("idle"\)\}/);
  assert.match(scannerSource, /absolute right-2 top-2[^"\n]*size-11/);
  assert.match(scannerSource, /<svg[\s\S]*aria-hidden="true"[\s\S]*<rect/);
  assert.doesNotMatch(scannerSource, />\s*Parar\s*</);
  assert.match(scannerSource, /Retomar câmera/);
  assert.match(
    scannerSource,
    /mobile-camera-preview[\s\S]*cameraRunning && statusText \? \([\s\S]*\{statusText\}/,
  );
  assert.doesNotMatch(scannerSource, /Câmera pronta/);
  assert.doesNotMatch(scannerSource, /Aponte a câmera para a etiqueta de envio/);
  assert.doesNotMatch(scannerSource, /mobile-camera-last-code|Última:/);
  assert.doesNotMatch(scannerSource, /setLastCode/);
  assert.match(
    scannerSource,
    /scanFeedback && \(scanFeedback\.tone !== "success" \|\| !scanFeedback\.accepted\)/,
  );
  assert.match(
    scannerSource,
    /className="sr-only" role="status" aria-live="polite"/,
  );
});

test("último pacote aceito fica destacado diretamente na lista", () => {
  assert.match(
    bipagemSource,
    /const isLatestSessionPackage =\s*latestSessionPackage\?\.id === item\.id/,
  );
  assert.match(bipagemSource, /border-emerald-400 bg-emerald-50/);
  assert.match(bipagemSource, /Último bipado/);
});

test("opções abrem todos os pacotes em um diálogo móvel de tela cheia", () => {
  assert.match(
    bipagemSource,
    /const cameraPaused =[\s\S]*showFullscreenSessionPackages \|\|/,
  );
  assert.match(
    bipagemSource,
    /useAccessibleFullscreenDialog\(\{[\s\S]*open: showFullscreenSessionPackages && mobileImmersiveSession[\s\S]*dialogRef: fullscreenPackagesRef[\s\S]*initialFocusRef:[\s\S]*manualPackageRemovalInputRef[\s\S]*fullscreenPackagesInitialFocusRef/,
  );
  assert.match(
    bipagemSource,
    /Ver pacotes em tela cheia \(\{sessionPackages\.length\}\)/,
  );
  assert.match(
    bipagemSource,
    /showFullscreenSessionPackages && mobileImmersiveSession \? \([\s\S]*fixed inset-0[^"\n]*h-dvh[^"\n]*xl:hidden/,
  );
  assert.match(bipagemSource, /aria-labelledby="fullscreen-packages-title"/);
  assert.match(bipagemSource, /ref=\{fullscreenPackagesInitialFocusRef\}/);
  assert.match(
    bipagemSource,
    /fullscreenSessionPackages\.map\(\(item\) => \{[\s\S]*break-all font-mono[\s\S]*DUPLICADO/,
  );
  assert.match(
    bipagemSource,
    /onClick=\{\(\) => removeSessionPackage\(item\)\}/,
  );
  assert.match(
    bipagemSource,
    /onClick=\{\(\) => cancelSessionPackageFromFullscreen\(item\)\}/,
  );
  assert.match(
    bipagemSource,
    /safe-area-inset-top[\s\S]*safe-area-inset-bottom/,
  );
});

test("opções permitem localizar e remover manualmente uma leitura do lote", () => {
  assert.match(bipagemSource, /Remover código manualmente/);
  assert.match(bipagemSource, /type FullscreenPackagesMode = "browse" \| "manual-remove"/);
  assert.match(
    bipagemSource,
    /function openManualPackageRemoval\(\)[\s\S]*setFullscreenPackagesMode\("manual-remove"\)[\s\S]*setShowFullscreenSessionPackages\(true\)/,
  );
  assert.match(bipagemSource, /id="manual-package-removal-query"/);
  assert.match(bipagemSource, /placeholder="Digite ou bipe para localizar"/);
  assert.match(
    bipagemSource,
    /normalizeTrackingCode\(item\.codigo_rastreio\)\.includes\(normalizedQuery\)/,
  );
  assert.match(bipagemSource, /fullscreenSessionPackages\.map\(\(item\) =>/);
  assert.match(bipagemSource, /Remover do lote/);
  assert.match(bipagemSource, /sessionPackageActionStatus/);
  assert.match(bipagemSource, /Localize a leitura/);
  assert.match(
    bipagemSource,
    /fullscreenPackagesMode === "browse" \? \([\s\S]*cancelSessionPackageFromFullscreen/,
  );
});

test("mobile oferece histórico e romaneios sem interromper o lote atual", () => {
  assert.match(bipagemSource, /Histórico e romaneios/);
  assert.match(
    bipagemSource,
    /const cameraPaused =[\s\S]*showMobileBatchHistory \|\|/,
  );
  assert.match(
    bipagemSource,
    /useAccessibleFullscreenDialog\(\{[\s\S]*open: showMobileBatchHistory && mobileImmersiveSession[\s\S]*dialogRef: mobileBatchHistoryRef/,
  );
  assert.match(bipagemSource, /aria-labelledby="mobile-batch-history-title"/);
  assert.match(bipagemSource, /openBatchFromMobileHistory\(batch\.id\)/);
  assert.match(bipagemSource, /closeBatchFromMobileHistory/);
  assert.match(
    bipagemSource,
    /function openStoreRomaneio\(batch:[\s\S]*modo: "romaneio"[\s\S]*lojaId: batch\.loja_id[\s\S]*marketplace: batch\.marketplace[\s\S]*data: getSaoPauloDateString/,
  );
  assert.match(bipagemSource, /openStoreRomaneio\(batch\)/);
  assert.match(bipagemSource, /openStoreRomaneio\(selectedBatch\)/);
  assert.match(
    bipagemSource,
    /window\.open\(\s*`\/relatorios\?\$\{params\.toString\(\)\}`/,
  );
  assert.doesNotMatch(bipagemSource, /openBatchRomaneio/);
});

test("romaneio aberto pelo histórico consolida loja, marketplace e dia", () => {
  assert.match(reportsPageSource, /searchParams: Promise<RelatoriosSearchParams>/);
  assert.match(reportsPageSource, /requestedMode === "romaneio"/);
  assert.match(reportsPageSource, /initialStoreId=\{requestedStoreId/);
  assert.match(
    reportsPageSource,
    /initialMarketplace=\{requestedMarketplace/,
  );
  assert.match(reportsPageSource, /initialDate=\{initialDate\}/);
  assert.match(
    reportsViewSource,
    /mode === "romaneio" \? \{ \.\.\.filters, codigoLote: "" \} : filters/,
  );
  assert.match(
    reportsViewSource,
    /showBatchCodeSearch=\{mode !== "romaneio"\}/,
  );
  assert.match(
    reportsViewSource,
    /groupRomaneioPackagesByStoreAndMarketplace\(/,
  );
  assert.match(legacyRomaneioSource, /marketplace: batch\.marketplace/);
  assert.match(legacyRomaneioSource, /window\.location\.replace\(destinationUrl\)/);
});
