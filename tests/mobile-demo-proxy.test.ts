import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRequest,
  createUpstreamHeaders,
  sanitizeUpstreamResponseHeaders,
} from "../scripts/mobile-demo-proxy.mjs";

test("proxy expõe somente a demonstração e os arquivos estáticos necessários", () => {
  assert.equal(classifyRequest("GET", "/"), "redirect");
  assert.equal(
    classifyRequest("GET", "/demonstracao-bipagem"),
    "proxy",
  );
  assert.equal(
    classifyRequest("HEAD", "/_next/static/chunks/app.js"),
    "proxy",
  );
  assert.equal(classifyRequest("GET", "/favicon.ico"), "proxy");

  assert.equal(classifyRequest("GET", "/_next/image"), "blocked");
  assert.equal(classifyRequest("GET", "/_next/webpack-hmr"), "blocked");
  assert.equal(
    classifyRequest("GET", "/api/supabase-health"),
    "blocked",
  );
  assert.equal(classifyRequest("GET", "/login"), "blocked");
  assert.equal(classifyRequest("GET", "/bipagem"), "blocked");
  assert.equal(
    classifyRequest("GET", "/demonstracao-bipagem/extra"),
    "blocked",
  );
});

test("proxy bloqueia qualquer método diferente de GET e HEAD, inclusive na raiz", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(classifyRequest(method, "/"), "blocked");
    assert.equal(
      classifyRequest(method, "/demonstracao-bipagem"),
      "blocked",
    );
    assert.equal(
      classifyRequest(method, "/_next/static/chunks/app.js"),
      "blocked",
    );
  }
});

test("proxy não encaminha host, cookie nem autorização recebidos", () => {
  const headers = createUpstreamHeaders({
    Host: "preview.example",
    Cookie: "session=segredo",
    Authorization: "Bearer segredo",
    Accept: "text/html",
    "User-Agent": "teste",
  });

  assert.deepEqual(headers, {
    host: "127.0.0.1:3002",
    accept: "text/html",
    "user-agent": "teste",
  });
});

test("proxy remove set-cookie da resposta antes de devolvê-la", () => {
  const headers = sanitizeUpstreamResponseHeaders({
    "content-type": "text/html; charset=utf-8",
    "Set-Cookie": ["session=segredo; HttpOnly"],
    etag: undefined,
  });

  assert.deepEqual(headers, {
    "content-type": "text/html; charset=utf-8",
  });
});
