import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const pageSource = read("app/feedback/page.tsx");
const adminPageSource = read("app/admin/feedback/page.tsx");
const viewSource = read("app/feedback/feedback-view.tsx");
const navigationSource = read("app/_components/navigation.tsx");
const adminAccessSource = read("app/_lib/feedback-admin-access.tsx");
const authenticatedShellSource = read(
  "app/_components/authenticated-app-shell.tsx",
);

test("feedback do funcionário e gerência usam rotas próprias responsivas", () => {
  assert.match(navigationSource, /href: "\/feedback", label: "Feedback"/);
  assert.match(navigationSource, /icon: "feedback"/);
  assert.match(pageSource, /PageHeader/);
  assert.match(pageSource, /title="Feedback"/);
  assert.match(pageSource, /<FeedbackView/);
  assert.doesNotMatch(pageSource, /mode="management"/);
  assert.match(adminPageSource, /PageHeader/);
  assert.match(adminPageSource, /title="Gerenciar feedbacks"/);
  assert.match(adminPageSource, /<FeedbackView mode="management"/);
  assert.match(navigationSource, /href: "\/admin\/feedback"/);
  assert.match(viewSource, /"use client"/);
  assert.match(viewSource, /grid-cols-2/);
  assert.match(viewSource, /xl:grid-cols-/);
});

test("provider administrativo tri-state é compartilhado pelo shell", () => {
  for (const status of ["checking", "allowed", "denied", "error"]) {
    assert.match(adminAccessSource, new RegExp(`\\| "${status}"|= "${status}"`));
  }

  assert.match(adminAccessSource, /createContext/);
  assert.match(adminAccessSource, /useAuth\(\)/);
  assert.match(adminAccessSource, /getFeedbackAdminStatus\(\{ userId, accessToken \}\)/);
  assert.match(adminAccessSource, /retrySupabaseReadForJwtClockSkew/);
  assert.match(adminAccessSource, /const requestId = \+\+requestIdRef\.current/);
  assert.match(adminAccessSource, /const keepsCurrentScreen = resolvedUserIdRef\.current === userId/);
  assert.match(adminAccessSource, /if \(!keepsCurrentScreen\) setStatus\("checking"\)/);
  assert.match(adminAccessSource, /setStatus\(admin \? "allowed" : "denied"\)/);
  assert.match(adminAccessSource, /if \(!keepsCurrentScreen\) setStatus\("error"\)/);
  assert.match(adminAccessSource, /refresh: \(\) => Promise<void>/);
  assert.match(
    authenticatedShellSource,
    /<AuthProvider>[\s\S]*<FeedbackAdminAccessProvider>[\s\S]*<AppShellContent>[\s\S]*<\/FeedbackAdminAccessProvider>[\s\S]*<\/AuthProvider>/,
  );
});

test("link administrativo só aparece depois da autorização compartilhada", () => {
  assert.match(
    navigationSource,
    /const \{ status: adminAccessStatus \} = useFeedbackAdminAccess\(\)/,
  );
  assert.match(
    navigationSource,
    /const isAdmin = adminAccessStatus === "allowed"/,
  );
  assert.match(navigationSource, /\{isAdmin \? \(/);
  assert.match(navigationSource, /item=\{adminNavItem\}/);
  assert.match(navigationSource, />\s*Administração\s*</);
});

test("formulário cobre tipos, áreas, limites Unicode e foco do primeiro erro", () => {
  for (const category of [
    "sugestao",
    "reclamacao",
    "problema",
    "duvida",
    "elogio",
  ]) {
    assert.match(viewSource, new RegExp(`value: "${category}"`));
  }

  for (const area of [
    "bipagem",
    "pacotes",
    "relatorios",
    "cadastros",
    "geral",
  ]) {
    assert.match(viewSource, new RegExp(`value: "${area}"`));
  }

  assert.match(viewSource, /return Array\.from\(value\)\.length/);
  assert.match(viewSource, /trimmedSubjectLength < 3/);
  assert.match(viewSource, /trimmedSubjectLength > 120/);
  assert.match(viewSource, /trimmedMessageLength < 20/);
  assert.match(viewSource, /trimmedMessageLength > 4000/);
  assert.match(viewSource, /\{subjectLength\}\/120/);
  assert.match(viewSource, /\{messageLength\}\/4\.000/);
  assert.match(viewSource, /const categoryRef = useRef<HTMLSelectElement>/);
  assert.match(viewSource, /const firstInvalidField = !category/);
  assert.match(viewSource, /firstInvalidField\?\.focus\(\)/);
  assert.match(viewSource, /aria-invalid=/);
  assert.match(viewSource, /aria-describedby=/);
});

test("envio é autenticado, idempotente e mantém o texto em caso de erro", () => {
  assert.match(viewSource, /submittingRef\.current/);
  assert.match(viewSource, /submissionIdRef\.current \?\? createSubmissionId\(\)/);
  assert.match(viewSource, /crypto\.randomUUID\(\)/);
  assert.match(viewSource, /bytes\[6\].*0x40/);
  assert.match(viewSource, /fetch\("\/api\/feedback"/);
  assert.match(viewSource, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(
    viewSource,
    /submissionId,[\s\S]*category,[\s\S]*area,[\s\S]*subject:[\s\S]*message:[\s\S]*pagePath:/,
  );
  assert.match(viewSource, /result\.message \|\| "Feedback enviado com sucesso\."/);
  assert.match(viewSource, /Protocolo:/);
  assert.match(viewSource, /notificationSent === false/);

  const catchBlock = viewSource.match(
    /catch \(submitError\) \{[\s\S]*?\n    \} finally/,
  )?.[0];
  assert.ok(catchBlock);
  assert.doesNotMatch(catchBlock, /setSubject\(""\)|setMessage\(""\)/);
});

test("Meus feedbacks usa paginação do servidor, atualização e estados corretos", () => {
  assert.match(viewSource, /const FEEDBACK_PAGE_SIZE = 10/);
  assert.match(
    viewSource,
    /getOwnFeedbackPage\([\s\S]*page: targetPage,[\s\S]*pageSize: FEEDBACK_PAGE_SIZE[\s\S]*databaseContext/,
  );
  assert.match(viewSource, /setOwnFeedbacks\(result\.items\)/);
  assert.match(viewSource, /setOwnTotal\(result\.total\)/);
  assert.match(viewSource, /activeTab !== "mine"/);
  assert.match(viewSource, /void loadOwnPage\(\)/);
  assert.match(viewSource, /\{loading \? "Atualizando\.\.\." : "Atualizar"\}/);
  assert.match(viewSource, /onPageChange\(page - 1\)/);
  assert.match(viewSource, /onPageChange\(page \+ 1\)/);
  assert.match(viewSource, /feedback\.admin_response/);
  assert.match(viewSource, /Resposta da equipe/);
  assert.match(viewSource, /Atendimento encerrado sem resposta registrada\./);
  assert.match(viewSource, /feedback\.status === "resolvido"/);
  assert.match(viewSource, /feedback\.status === "arquivado"/);
});

test("fluxo comum não mistura a gerência e modo administrativo exige acesso", () => {
  assert.match(viewSource, /type FeedbackViewMode = "user" \| "management"/);
  assert.match(viewSource, /mode = "user"/);
  assert.match(viewSource, /const managementMode = mode === "management"/);
  assert.match(
    viewSource,
    /useFeedbackAdminAccess\(\)/,
  );
  assert.match(viewSource, /const isAdmin = adminAccessStatus === "allowed"/);
  assert.match(viewSource, /if \(managementMode\) \{/);
  assert.match(viewSource, /aria-label="Administração de feedbacks"/);
  assert.match(viewSource, /<ManagementPanel[\s\S]*isAdmin=\{isAdmin\}/);
  assert.match(viewSource, /Somente administradores podem gerenciar feedbacks/);

  const employeeTabs = viewSource.match(
    /const tabs: Array<[\s\S]*?= \[[\s\S]*?\n  \];/,
  )?.[0];
  assert.ok(employeeTabs, "abas do fluxo comum não encontradas");
  assert.match(employeeTabs, /id: "submit"/);
  assert.match(employeeTabs, /id: "mine"/);
  assert.doesNotMatch(employeeTabs, /id: "manage"/);
  assert.doesNotMatch(viewSource, /id="feedback-panel-manage"/);
});

test("gerenciamento consulta filtros, busca e páginas globalmente no servidor", () => {
  assert.match(
    viewSource,
    /getFeedbacksForManagement\([\s\S]*status: statusFilter \|\| undefined,[\s\S]*category: categoryFilter \|\| undefined,[\s\S]*area: areaFilter \|\| undefined,[\s\S]*search: managementSearch \|\| undefined,[\s\S]*page: managementPage,[\s\S]*pageSize: FEEDBACK_PAGE_SIZE,[\s\S]*databaseContext/,
  );
  assert.match(viewSource, /setManagedFeedbacks\(result\.items\)/);
  assert.match(viewSource, /setManagementTotal\(result\.total\)/);
  assert.match(viewSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(viewSource, /setManagementSearch\(managementSearchInput\.trim\(\)\)/);
  assert.match(viewSource, /\}, 300\)/);
  assert.match(viewSource, /setManagementPage\(1\)/);
  assert.doesNotMatch(viewSource, /normalizeSearch|\.filter\(\(feedback\)/);
});

test("gerenciamento corrige página vazia que ficou além do último resultado", () => {
  assert.match(
    viewSource,
    /const lastPage = Math\.max\([\s\S]*Math\.ceil\(result\.total \/ FEEDBACK_PAGE_SIZE\)/,
  );
  assert.match(viewSource, /if \(result\.page > lastPage\) \{/);
  assert.match(viewSource, /setManagedFeedbacks\(\[\]\)/);
  assert.match(viewSource, /setManagementPage\(lastPage\)/);
  assert.match(
    viewSource,
    /setManagementPage\(lastPage\);[\s\S]*return;[\s\S]*setManagedFeedbacks\(result\.items\)/,
  );
});

test("resumo administrativo é global e todos os contadores são mostrados", () => {
  assert.match(viewSource, /getFeedbackManagementSummary\(databaseContext\)/);
  assert.match(viewSource, /setManagementSummary\(summary\)/);
  assert.match(viewSource, /summary\.total/);
  assert.match(viewSource, /summary\.novos/);
  assert.match(viewSource, /summary\.emAnalise/);
  assert.match(viewSource, /summary\.respondidos/);
  assert.match(viewSource, /summary\.resolvidos/);
  assert.match(viewSource, /summary\.arquivados/);
  assert.match(viewSource, /Os números abaixo consideram todos os feedbacks recebidos\./);
  assert.match(viewSource, /void loadManagementSummary\(\)/);
});

test("central administrativa tem filtros, protocolo, paginação e dados do usuário", () => {
  assert.match(viewSource, /feedback-status-filter/);
  assert.match(viewSource, /feedback-category-filter/);
  assert.match(viewSource, /feedback-area-filter/);
  assert.match(viewSource, /type="search"/);
  assert.match(viewSource, /protocolo FB-/);
  assert.match(viewSource, /Página \{page\} de \{totalPages\}/);
  assert.match(viewSource, /feedback\.sender_email/);
  assert.match(viewSource, /feedback\.user_id/);
  assert.match(viewSource, /feedback\.page_path/);
  assert.match(viewSource, /aria-pressed=\{selected\}/);
});

test("administrador valida resposta, salva e informa corretamente o e-mail", () => {
  assert.match(viewSource, /const trimmedResponseLength = textLength\(value\.trim\(\)\)/);
  assert.match(viewSource, /nextStatus === "respondido" && trimmedResponseLength < 3/);
  assert.match(viewSource, /trimmedResponseLength > 4000/);
  assert.match(viewSource, /\{responseLength\}\/4\.000/);
  assert.match(viewSource, /responseRef\.current\?\.focus\(\)/);
  assert.match(viewSource, /fetch\(`\/api\/feedback\/\$\{feedback\.id\}`/);
  assert.match(viewSource, /method: "PATCH"/);
  assert.match(
    viewSource,
    /body: JSON\.stringify\(\{[\s\S]*status: requestStatus,[\s\S]*response: requestResponse\.trim\(\),[\s\S]*expectedUpdatedAt: baseline\.updatedAt/,
  );
  assert.match(viewSource, /request\.status === 409/);
  assert.match(viewSource, /result\?\.message\?\.trim\(\)/);
  assert.match(viewSource, /Seu rascunho foi preservado\. Atualize a lista/);
  assert.match(viewSource, /Salvar alterações/);
  assert.match(viewSource, /resposta nova ou alterada será enviada ao usuário por e-mail/);
  assert.match(viewSource, /result\.notificationSent === false/);
  assert.match(viewSource, /result\.message \|\|/);
  assert.match(viewSource, /e-mail de resposta não foi enviado/);
  assert.match(viewSource, /onSaved\(result\.feedback\)/);
});

test("seleção administrativa reconcilia versões sem apagar rascunho", () => {
  assert.match(viewSource, /feedback\.id === selectedFeedback\.id/);
  assert.match(
    viewSource,
    /refreshedFeedback\.updated_at === selectedFeedback\.updated_at/,
  );
  assert.match(viewSource, /if \(dirtyRef\.current\) \{/);
  assert.match(viewSource, /Seu rascunho foi preservado; use Atualizar/);
  assert.match(viewSource, /setSelectedFeedback\(refreshedFeedback\)/);
  assert.match(viewSource, /key=\{selectedFeedback\.id\}/);
  assert.doesNotMatch(viewSource, /key=\{`\$\{selectedFeedback\.id\}:/);
  assert.match(viewSource, /const \[baseline, setBaseline\] = useState/);
  assert.match(viewSource, /feedback\.updated_at === baseline\.updatedAt/);
});

test("conflito oferece atualização e adoção da versão recente dentro do editor", () => {
  assert.match(viewSource, />\s*Atualizar lista\s*</);
  assert.match(viewSource, />\s*Usar versão mais recente\s*</);
  assert.match(viewSource, /latestExternalFeedback\.updated_at !== baseline\.updatedAt/);
  assert.match(viewSource, /function adoptLatestVersion\(\)/);
  assert.match(
    viewSource,
    /updatedAt: latestExternalFeedback\.updated_at[\s\S]*onAdoptLatestVersion\(latestExternalFeedback\)/,
  );
  const adoptBlock = viewSource.match(
    /function adoptLatestVersion\(\) \{[\s\S]*?\n  \}/,
  )?.[0];
  assert.ok(adoptBlock);
  assert.doesNotMatch(adoptBlock, /setStatus|setResponse/);
});

test("falha de e-mail mantém aviso e oferece retry no-op idempotente", () => {
  assert.match(viewSource, /setCanRetryEmail\(result\.notificationSent === false\)/);
  assert.match(viewSource, /Tentar enviar e-mail novamente/);
  assert.match(viewSource, /void updateFeedback\("retry-email"\)/);
  assert.match(viewSource, /mode === "retry-email"/);
  assert.match(viewSource, /isEmailRetry \? baseline\.status : status/);
  assert.match(viewSource, /isEmailRetry \? baseline\.response : response/);
  assert.match(viewSource, /expectedUpdatedAt: baseline\.updatedAt/);
  assert.match(viewSource, /key=\{selectedFeedback\.id\}/);
  assert.match(viewSource, /setNotice\(\{[\s\S]*result\.notificationSent === false/);
});

test("perda ou falha do acesso administrativo fecha e limpa a área protegida", () => {
  assert.match(viewSource, /if \(!managementMode \|\| isAdmin\) return;/);
  assert.match(viewSource, /managementRequestRef\.current \+= 1/);
  assert.match(viewSource, /summaryRequestRef\.current \+= 1/);
  assert.match(viewSource, /setManagedFeedbacks\(\[\]\)/);
  assert.match(viewSource, /setManagementTotal\(0\)/);
  assert.match(viewSource, /setManagementSummary\(emptyManagementSummary\)/);
  assert.match(viewSource, /if \(isAdmin\) return;[\s\S]*setSelectedFeedback\(null\)/);
  assert.match(viewSource, /adminAccessStatus === "error"/);
  assert.match(viewSource, /onClick=\{\(\) => void refreshAdminAccess\(\)\}/);
  assert.match(viewSource, />\s*Tentar novamente\s*</);
});

test("contagem do funcionário só aparece depois de carregar o total real", () => {
  assert.match(viewSource, /const \[ownLoaded, setOwnLoaded\] = useState\(false\)/);
  assert.match(viewSource, /setOwnLoaded\(true\)/);
  assert.match(viewSource, /count: ownLoaded \? ownTotal : undefined/);
});

test("editor mobile é fullscreen, prende foco e protege alterações não salvas", () => {
  assert.match(viewSource, /useMobileManagementViewport\(\)/);
  assert.match(viewSource, /useAccessibleFullscreenDialog\(\{/);
  assert.match(viewSource, /role=\{mobileViewport && selectedFeedback \? "dialog"/);
  assert.match(viewSource, /aria-modal=\{mobileViewport && selectedFeedback \? true/);
  assert.match(viewSource, /fixed inset-0 z-50 h-dvh overflow-y-auto/);
  assert.match(viewSource, /safe-area-inset-bottom/);
  assert.match(viewSource, /aria-label="Fechar detalhes do feedback"/);
  assert.match(viewSource, /window\.confirm\("Descartar as alterações ainda não salvas\?"\)/);
  assert.match(viewSource, /editorSavingRef\.current/);
  assert.match(viewSource, /dirtyRef\.current/);
});

test("abas do funcionário permanecem montadas e suportam teclado", () => {
  assert.match(viewSource, /role="tablist"/);
  assert.match(viewSource, /role="tab"/);
  assert.match(viewSource, /tabIndex=\{active \? 0 : -1\}/);
  assert.match(viewSource, /aria-selected=\{active\}/);
  assert.match(viewSource, /event\.key === "ArrowRight"/);
  assert.match(viewSource, /event\.key === "ArrowLeft"/);
  assert.match(viewSource, /event\.key === "Home"/);
  assert.match(viewSource, /event\.key === "End"/);
  assert.match(viewSource, /tabRefs\.current\[nextIndex\]\?\.focus\(\)/);

  for (const tab of ["submit", "mine"]) {
    assert.match(viewSource, new RegExp(`id="feedback-panel-${tab}"`));
    assert.match(viewSource, new RegExp(`aria-labelledby="feedback-tab-${tab}"`));
  }

  assert.match(viewSource, /hidden=\{activeTab !== "submit"\}/);
  assert.match(viewSource, /hidden=\{activeTab !== "mine"\}/);
  assert.doesNotMatch(viewSource, /id="feedback-panel-manage"/);
});
