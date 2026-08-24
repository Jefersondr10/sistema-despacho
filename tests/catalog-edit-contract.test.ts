import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function sectionBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Inicio nao encontrado: ${start}`);

  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Fim nao encontrado: ${end}`);

  return source.slice(startIndex, endIndex);
}

function catalogSection(source: string, title: string) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`<CatalogSection\\s+title="${escapedTitle}"[\\s\\S]*?\\n\\s*/>`),
  );

  assert.ok(match, `Secao de cadastro nao encontrada: ${title}`);
  return match[0];
}

const viewSource = read("app/cadastros/cadastros-view.tsx");
const databaseSource = read("lib/database.ts");

const itemSource = sectionBetween(
  viewSource,
  "function CatalogListItem(",
  "function CatalogSection(",
);
const renameSource = sectionBetween(
  viewSource,
  "async function handleRename(",
  "async function handleCreateReportEmail(",
);
const normalizeNameSource = sectionBetween(
  databaseSource,
  "function normalizeCatalogName(",
  "function getCatalogPayload(",
);
const updateLojaSource = sectionBetween(
  databaseSource,
  "export async function updateLoja(",
  "export async function ativarLoja(",
);
const updateMarketplaceSource = sectionBetween(
  databaseSource,
  "export async function updateMarketplace(",
  "export async function ativarMarketplace(",
);
const updateTransportadoraSource = sectionBetween(
  databaseSource,
  "export async function updateTransportadora(",
  "export async function ativarTransportadora(",
);

test("edicao de nome aparece para lojas, marketplaces e transportadoras", () => {
  const stores = catalogSection(viewSource, "Lojas");
  const marketplaces = catalogSection(viewSource, "Marketplaces");
  const carriers = catalogSection(viewSource, "Transportadoras");

  assert.match(
    stores,
    /onRename=\{\(item, name\) => handleRename\("stores", item, name\)\}/,
  );
  assert.match(
    marketplaces,
    /onRename=\{\(item, name\) => handleRename\("marketplaces", item, name\)\}/,
  );
  assert.match(
    carriers,
    /onRename=\{\(item, name\) => handleRename\("carriers", item, name\)\}/,
  );

  assert.match(viewSource, /onEdit\?: \(\) => void/);
  assert.match(
    viewSource,
    /\{onEdit \? \([\s\S]*?onClick=\{onEdit\}[\s\S]*?Editar nome[\s\S]*?\) : null\}/,
  );
});

test("editor inline salva por formulario e permite cancelar ou usar Escape", () => {
  assert.match(itemSource, /const \[editing, setEditing\] = useState\(false\)/);
  assert.match(itemSource, /const \[draftName, setDraftName\] = useState\(name\)/);
  assert.match(itemSource, /\{editing && onRename \? \(/);
  assert.match(itemSource, /<form[\s\S]*?onSubmit=\{submitRename\}/);
  assert.match(
    itemSource,
    /const saved = await onRename\(draftName\);[\s\S]*?if \(saved\) \{[\s\S]*?closeRenameEditor\(\)/,
  );

  // O input esta dentro do form: Enter usa o submit nativo e o botao Salvar
  // compartilha exatamente o mesmo caminho de persistencia.
  assert.match(
    itemSource,
    /<form[\s\S]*?<input[\s\S]*?<button\s+type="submit"[\s\S]*?>[\s\S]*?Salvar/,
  );
  assert.doesNotMatch(itemSource, /event\.key === "Enter"[\s\S]*?preventDefault/);

  assert.match(
    itemSource,
    /event\.key === "Escape"[\s\S]*?event\.preventDefault\(\);[\s\S]*?cancelRename\(\)/,
  );
  assert.match(
    itemSource,
    /function cancelRename\(\) \{[\s\S]*?setDraftName\(name\);[\s\S]*?closeRenameEditor\(\)/,
  );
  assert.match(
    itemSource,
    /function closeRenameEditor\(\) \{[\s\S]*?setEditing\(false\);[\s\S]*?requestAnimationFrame\(\(\) => editButtonRef\.current\?\.focus\(\)\)/,
  );
  assert.match(
    itemSource,
    /<button\s+type="button"[\s\S]*?onClick=\{cancelRename\}[\s\S]*?Cancelar/,
  );
  assert.match(itemSource, /<input[\s\S]*?autoFocus[\s\S]*?maxLength=\{120\}/);
});

test("rename aplica trim, permite corrigir capitalização e bloqueia duplicados", () => {
  assert.match(renameSource, /const cleanName = name\.trim\(\)/);
  assert.match(renameSource, /if \(!cleanName\)[\s\S]*?return false/);
  assert.match(
    renameSource,
    /if \(cleanName === item\.name\.trim\(\)\)/,
  );
  assert.match(
    renameSource,
    /const items = catalogs\[kind\]/,
  );
  assert.match(
    renameSource,
    /items\.some\([\s\S]*?candidate\.id !== item\.id[\s\S]*?normalizeCatalogDisplayName\(candidate\.name\) ===\s*normalizeCatalogDisplayName\(cleanName\)/,
  );
  assert.match(renameSource, /if \(duplicate\)[\s\S]*?return false/);
  assert.match(
    viewSource,
    /function normalizeCatalogDisplayName\(value: string\) \{[\s\S]*?value\.trim\(\)\.normalize\("NFKC"\)\.toLocaleLowerCase\("pt-BR"\)/,
  );
});

test("UI envia somente o nome limpo e preserva o editor quando falha", () => {
  assert.match(
    renameSource,
    /updateLoja\(item\.id, \{ nome: cleanName \}, \{ userId \}\)/,
  );
  assert.match(
    renameSource,
    /updateMarketplace\(item\.id, \{ nome: cleanName \}, \{ userId \}\)/,
  );
  assert.match(
    renameSource,
    /updateTransportadora\(item\.id, \{ nome: cleanName \}, \{ userId \}\)/,
  );
  assert.doesNotMatch(renameSource, /slug\s*:/);
  assert.match(
    renameSource,
    /setNotice\(\{ tone: "success", text: "Nome atualizado com sucesso\." \}\);[\s\S]*?await loadCatalogs\(\);[\s\S]*?return true/,
  );
  assert.match(
    renameSource,
    /catch \(error\)[\s\S]*?Erro ao atualizar nome:[\s\S]*?return false/,
  );
});

test("helpers validam o nome e restringem update ao id da conta autenticada", () => {
  assert.match(normalizeNameSource, /const nome = value\.trim\(\)/);
  assert.match(
    normalizeNameSource,
    /if \(!nome\) \{[\s\S]*?throw new Error\("Informe um nome valido\."\)/,
  );
  assert.match(
    normalizeNameSource,
    /Array\.from\(nome\)\.length > 120[\s\S]*?throw new Error\("O nome deve ter no maximo 120 caracteres\."\)/,
  );

  for (const [label, source, table] of [
    ["loja", updateLojaSource, "lojas"],
    ["marketplace", updateMarketplaceSource, "marketplaces"],
    ["transportadora", updateTransportadoraSource, "transportadoras"],
  ] as const) {
    assert.match(
      source,
      /const \{ supabase, userId \} = await getDatabaseContext\(context\)/,
      `${label}: contexto autenticado`,
    );
    assert.match(
      source,
      /values\.nome !== undefined[\s\S]*?nome: normalizeCatalogName\(values\.nome\)/,
      `${label}: vazio fornecido nao pode ser ignorado`,
    );
    assert.match(source, new RegExp(`\\.from\\("${table}"\\)`), `${label}: tabela`);
    assert.match(
      source,
      /\.update\([\s\S]*?\)\s*\.eq\("id", id\)\s*\.eq\("user_id", userId\)/,
      `${label}: escopo por id e usuario`,
    );
    assert.match(source, /\.select\("\*"\)\s*\.single<\w+Row>\(\)/);
  }
});
