import http from "node:http";
import { pathToFileURL } from "node:url";

const listenHost = "127.0.0.1";
const listenPort = 3100;
const appHost = "127.0.0.1";
const appPort = 3002;

export function isAllowedPath(pathname) {
  return (
    pathname === "/demonstracao-bipagem" ||
    pathname.startsWith("/_next/static/") ||
    pathname === "/favicon.ico"
  );
}

export function classifyRequest(method, pathname) {
  if (method !== "GET" && method !== "HEAD") {
    return "blocked";
  }

  if (pathname === "/") {
    return "redirect";
  }

  return isAllowedPath(pathname) ? "proxy" : "blocked";
}

export function createUpstreamHeaders(requestHeaders) {
  const upstreamHeaders = {
    host: `${appHost}:${appPort}`,
  };

  Object.entries(requestHeaders).forEach(([name, value]) => {
    const normalizedName = name.toLowerCase();

    if (
      value !== undefined &&
      normalizedName !== "authorization" &&
      normalizedName !== "cookie" &&
      normalizedName !== "host"
    ) {
      upstreamHeaders[normalizedName] = value;
    }
  });

  return upstreamHeaders;
}

export function sanitizeUpstreamResponseHeaders(responseHeaders) {
  const downstreamHeaders = {};

  Object.entries(responseHeaders).forEach(([name, value]) => {
    if (value !== undefined && name.toLowerCase() !== "set-cookie") {
      downstreamHeaders[name] = value;
    }
  });

  return downstreamHeaders;
}

function createDemoProxyServer() {
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://demo.local");
    const disposition = classifyRequest(request.method, requestUrl.pathname);

    if (disposition === "redirect") {
      response.writeHead(302, {
        Location: "/demonstracao-bipagem",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      });
      response.end();
      return;
    }

    if (disposition === "blocked") {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      });
      response.end(
        "Esta prévia disponibiliza somente a demonstração móvel.",
      );
      return;
    }

    const upstreamHeaders = createUpstreamHeaders(request.headers);

    const upstreamRequest = http.request(
      {
        host: appHost,
        port: appPort,
        method: request.method,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        headers: upstreamHeaders,
      },
      (upstreamResponse) => {
        response.statusCode = upstreamResponse.statusCode ?? 502;

        Object.entries(
          sanitizeUpstreamResponseHeaders(upstreamResponse.headers),
        ).forEach(([name, value]) => {
          response.setHeader(name, value);
        });

        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Permissions-Policy", "camera=(self)");
        response.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        );
        upstreamResponse.pipe(response);
      },
    );

    upstreamRequest.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(502, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
      }
      response.end(
        "A demonstração local está reiniciando. Tente novamente.",
      );
    });

    request.pipe(upstreamRequest);
  });
}

export function startDemoProxy() {
  if (process.env.ENABLE_MOBILE_BIPAGEM_DEMO_PROXY !== "1") {
    throw new Error("Proxy de demonstração não autorizado.");
  }

  const server = createDemoProxyServer();
  server.listen(listenPort, listenHost, () => {
    console.log(`Demonstração isolada em http://${listenHost}:${listenPort}`);
  });
  return server;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  startDemoProxy();
}
