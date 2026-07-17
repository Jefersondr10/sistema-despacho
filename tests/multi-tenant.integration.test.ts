import assert from "node:assert/strict";
import test from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_MULTI_TENANT_TEST_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "";
const key =
  process.env.SUPABASE_MULTI_TENANT_TEST_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";
const credentials = {
  userA: {
    email: process.env.SUPABASE_TEST_USER_A_EMAIL ?? "",
    password: process.env.SUPABASE_TEST_USER_A_PASSWORD ?? "",
  },
  userB: {
    email: process.env.SUPABASE_TEST_USER_B_EMAIL ?? "",
    password: process.env.SUPABASE_TEST_USER_B_PASSWORD ?? "",
  },
};
const integrationConfigured = Boolean(
  url &&
    key &&
    credentials.userA.email &&
    credentials.userA.password &&
    credentials.userB.email &&
    credentials.userB.password,
);

type CreatedIds = {
  store?: string;
  marketplace?: string;
  session?: string;
};

async function signIn(email: string, password: string) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  assert.ok(data.user);
  return client;
}

async function cleanup(client: SupabaseClient, ids: CreatedIds) {
  if (ids.session) {
    await client.from("movimentacoes").delete().eq("sessao_id", ids.session);
    await client.from("pacotes_cancelados").delete().eq("sessao_id", ids.session);
    await client.from("pacotes").delete().eq("sessao_id", ids.session);
    await client.from("sessoes_bipagem").delete().eq("id", ids.session);
  }
  if (ids.marketplace) {
    await client.from("marketplaces").delete().eq("id", ids.marketplace);
  }
  if (ids.store) {
    await client.from("lojas").delete().eq("id", ids.store);
  }
  await client.auth.signOut();
}

test(
  "duas contas permanecem isoladas por RLS, FKs compostas e RPCs",
  { skip: integrationConfigured ? false : "credenciais das duas contas de teste nao configuradas" },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const slugStore = `brasilia-${suffix}`;
    const slugMarketplace = `amazon-${suffix}`;
    const packageCode = "TESTE-A";
    const idsA: CreatedIds = {};
    const idsB: CreatedIds = {};
    const clientA = await signIn(credentials.userA.email, credentials.userA.password);
    const clientB = await signIn(credentials.userB.email, credentials.userB.password);

    try {
      const { data: storeA, error: storeAError } = await clientA
        .from("lojas")
        .insert({ nome: "Brasília", slug: slugStore })
        .select("id")
        .single();
      assert.ifError(storeAError);
      idsA.store = storeA.id;

      const { data: marketplaceA, error: marketplaceAError } = await clientA
        .from("marketplaces")
        .insert({ nome: "Amazon", slug: slugMarketplace })
        .select("id")
        .single();
      assert.ifError(marketplaceAError);
      idsA.marketplace = marketplaceA.id;

      const { data: sessionA, error: sessionAError } = await clientA
        .from("sessoes_bipagem")
        .insert({
          loja_id: idsA.store,
          marketplace_id: idsA.marketplace,
          tipo_operacao: "postagem",
        })
        .select("id")
        .single();
      assert.ifError(sessionAError);
      idsA.session = sessionA.id;

      const { error: addAError } = await clientA.rpc(
        "adicionar_item_sessao_bipagem",
        { p_codigo: packageCode, p_sessao_id: idsA.session },
      );
      assert.ifError(addAError);

      const { data: storesVisibleToB } = await clientB
        .from("lojas")
        .select("id")
        .eq("id", idsA.store);
      const { data: marketplacesVisibleToB } = await clientB
        .from("marketplaces")
        .select("id")
        .eq("id", idsA.marketplace);
      assert.deepEqual(storesVisibleToB, []);
      assert.deepEqual(marketplacesVisibleToB, []);

      const { error: finishAByBError } = await clientB.rpc(
        "finalizar_sessao_bipagem",
        { p_sessao_id: idsA.session },
      );
      assert.ok(finishAByBError);

      const { data: changedByB, error: updateByBError } = await clientB
        .from("lojas")
        .update({ nome: "INVASAO" })
        .eq("id", idsA.store)
        .select("id");
      assert.ifError(updateByBError);
      assert.deepEqual(changedByB, []);

      const { data: deletedByB, error: deleteByBError } = await clientB
        .from("marketplaces")
        .delete()
        .eq("id", idsA.marketplace)
        .select("id");
      assert.ifError(deleteByBError);
      assert.deepEqual(deletedByB, []);

      const { data: storeB, error: storeBError } = await clientB
        .from("lojas")
        .insert({ nome: "Brasília", slug: slugStore })
        .select("id")
        .single();
      assert.ifError(storeBError);
      idsB.store = storeB.id;

      const { data: marketplaceB, error: marketplaceBError } = await clientB
        .from("marketplaces")
        .insert({ nome: "Amazon", slug: slugMarketplace })
        .select("id")
        .single();
      assert.ifError(marketplaceBError);
      idsB.marketplace = marketplaceB.id;

      const { error: crossAccountPackageError } = await clientB
        .from("pacotes")
        .insert({
          codigo: packageCode,
          loja_id: idsA.store,
          marketplace_id: idsB.marketplace,
          tipo_operacao: "postagem",
        });
      assert.ok(crossAccountPackageError);

      const { error: finishAError } = await clientA.rpc(
        "finalizar_sessao_bipagem",
        { p_sessao_id: idsA.session },
      );
      assert.ifError(finishAError);

      const { data: packagesAVisibleToB } = await clientB
        .from("pacotes")
        .select("id")
        .eq("codigo", packageCode);
      assert.deepEqual(packagesAVisibleToB, []);

      const { data: sessionB, error: sessionBError } = await clientB
        .from("sessoes_bipagem")
        .insert({
          loja_id: idsB.store,
          marketplace_id: idsB.marketplace,
          tipo_operacao: "postagem",
        })
        .select("id")
        .single();
      assert.ifError(sessionBError);
      idsB.session = sessionB.id;

      const { error: addBError } = await clientB.rpc(
        "adicionar_item_sessao_bipagem",
        { p_codigo: packageCode, p_sessao_id: idsB.session },
      );
      assert.ifError(addBError);
      const { error: finishBError } = await clientB.rpc(
        "finalizar_sessao_bipagem",
        { p_sessao_id: idsB.session },
      );
      assert.ifError(finishBError);

      const { data: ownPackageB, error: ownPackageBError } = await clientB
        .from("pacotes")
        .select("id")
        .eq("codigo", packageCode)
        .eq("loja_id", idsB.store)
        .single();
      assert.ifError(ownPackageBError);
      assert.ok(ownPackageB.id);
    } finally {
      await cleanup(clientA, idsA);
      await cleanup(clientB, idsB);
    }
  },
);
