import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const authSource = read("app/_lib/auth-context.tsx");
const loginSource = read("app/login/login-view.tsx");
const shellSource = read("app/_components/authenticated-app-shell.tsx");

test("autenticacao oferece OAuth do Google pelo cliente Supabase", () => {
  assert.match(authSource, /signInWithGoogle:\s*\(\)\s*=>\s*Promise<void>/);
  assert.match(authSource, /auth\.signInWithOAuth\(\{/);
  assert.match(authSource, /provider:\s*"google"/);
  assert.match(authSource, /redirectTo:\s*getRedirectUrl\(\)/);
  assert.match(authSource, /window\.location\.origin}\/login/);
  assert.match(authSource, /provider is not enabled/);
  assert.match(authSource, /acesso com Google ainda não está disponível/);
});

test("login e cadastro exibem Google sem remover email e senha", () => {
  assert.match(
    loginSource,
    /activeMode === "login" \|\| activeMode === "signup"/,
  );
  assert.match(loginSource, /Continuar com Google/);
  assert.match(loginSource, /onClick=\{handleGoogleSignIn\}/);
  assert.match(loginSource, /aria-busy=\{oauthSubmitting\}/);
  assert.match(loginSource, /await signInWithGoogle\(\)/);
  assert.match(loginSource, /await signIn\(cleanEmail, password\)/);
  assert.match(loginSource, /await signUp\(\{/);
  assert.match(loginSource, /Recuperar senha/);
  assert.match(loginSource, /href="\/privacidade"/);
  assert.match(loginSource, /href="\/termos"/);
});

test("retorno OAuth continua respeitando a primeira area permitida", () => {
  assert.match(shellSource, /getFirstAllowedTeamRoute\(teamContext\)/);
  assert.match(
    shellSource,
    /session && isLoginRoute && !passwordRecovery[\s\S]*router\.replace\(firstAllowedRoute\)/,
  );
});
