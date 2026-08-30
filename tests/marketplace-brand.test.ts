import assert from "node:assert/strict";
import test from "node:test";

import { resolveMarketplaceBrand } from "../app/_lib/marketplace-brand.ts";

test("reconhece as marcas locais usadas pelo romaneio", () => {
  assert.equal(resolveMarketplaceBrand("Amazon"), "amazon");
  assert.equal(resolveMarketplaceBrand("Amazon.com.br"), "amazon");
  assert.equal(resolveMarketplaceBrand("Mercado Livre"), "mercado-livre");
  assert.equal(resolveMarketplaceBrand("Mercado Lívrê Brasil"), "mercado-livre");
  assert.equal(resolveMarketplaceBrand("Mercado Libre"), "mercado-livre");
  assert.equal(resolveMarketplaceBrand("Shopee"), "shopee");
  assert.equal(resolveMarketplaceBrand("Shopee Brasil"), "shopee");
});

test("não atribui logo incorreta a marketplace desconhecido", () => {
  assert.equal(resolveMarketplaceBrand("Marketplace da Loja"), null);
  assert.equal(resolveMarketplaceBrand("Amazônia Encomendas"), null);
  assert.equal(resolveMarketplaceBrand(""), null);
});
