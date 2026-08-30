import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  parseAuthorizationCallback,
  requireBandOAuthEnv,
} from "./lib/bandOAuth.js";

const config = requireBandOAuthEnv(process.env);
const redirect = new URL(config.redirectUri);
if (redirect.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(redirect.hostname)) {
  throw new Error("BAND_REDIRECT_URI must be a local http://localhost or http://127.0.0.1 URL");
}

const state = randomBytes(24).toString("hex");
const authorizationUrl = buildAuthorizationUrl({
  clientId: config.clientId,
  redirectUri: config.redirectUri,
  state,
});

let finished = false;
const finish = (exitCode) => {
  if (finished) return;
  finished = true;
  server.close(() => {
    process.exitCode = exitCode;
  });
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", config.redirectUri);
  if (requestUrl.pathname !== redirect.pathname) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const code = parseAuthorizationCallback(request.url, state);
    const token = await exchangeAuthorizationCode({ code, ...config });
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<h1>BAND 인증 완료</h1><p>이 창을 닫고 터미널로 돌아가세요.</p>");
    console.log("\nBAND_ACCESS_TOKEN");
    console.log(token.accessToken);
    if (token.refreshToken) {
      console.log("\nBAND_REFRESH_TOKEN");
      console.log(token.refreshToken);
    }
    if (token.expiresIn) console.log(`\n만료 정보: ${token.expiresIn}초`);
    console.log("\n위 토큰을 GitHub Actions Secret에 등록한 뒤 이 터미널 기록을 닫아 주세요.");
    finish(0);
  } catch (error) {
    response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
    response.end("<h1>BAND 인증 실패</h1><p>터미널의 오류를 확인하세요.</p>");
    console.error(`\nBAND 인증 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    finish(1);
  }
});

const port = Number(redirect.port || 80);
server.listen(port, redirect.hostname, () => {
  console.log(`BAND OAuth 콜백 서버가 ${config.redirectUri}에서 대기 중입니다.`);
  console.log("아래 주소를 브라우저에서 여세요. 서버 실행 전에는 열리지 않습니다.\n");
  console.log(authorizationUrl);
});

server.on("error", (error) => {
  console.error(`BAND OAuth 서버 시작 실패: ${error.message}`);
  process.exitCode = 1;
});

setTimeout(() => {
  if (finished) return;
  console.error("\n5분 동안 콜백이 없어 인증을 종료합니다.");
  finish(1);
}, 5 * 60 * 1000).unref();
