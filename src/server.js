import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, resetDatabase } from "./db.js";
import { BusinessError } from "./domain/messages.js";
import { changeAssignee, changeStatus, getInquiryDetail } from "./services/inquiry-service.js";

const PORT = Number(process.env.PORT ?? 3000);
const db = createDatabase(process.env.DB_FILE ?? "data/nexus.sqlite");
const publicDir = fileURLToPath(new URL("../public", import.meta.url));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function serveStatic(pathname, response) {
  const relative = pathname === "/" || /^\/inquiries\/\d+$/.test(pathname)
    ? "index.html"
    : pathname.slice(1);
  const filePath = join(publicDir, relative);
  if (!filePath.startsWith(publicDir)) return false;
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(content);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    const detailMatch = url.pathname.match(/^\/api\/inquiries\/(\d+)$/);
    const statusMatch = url.pathname.match(/^\/api\/inquiries\/(\d+)\/status$/);
    const assigneeMatch = url.pathname.match(/^\/api\/inquiries\/(\d+)\/assignee$/);

    if (request.method === "POST" && url.pathname === "/api/reset") {
      resetDatabase(db);
      return sendJson(response, 200, { message: "確認用データを初期状態に戻しました。" });
    }

    if (request.method === "GET" && detailMatch) {
      const actorId = Number(url.searchParams.get("actorId") ?? 2);
      return sendJson(response, 200, getInquiryDetail(db, Number(detailMatch[1]), actorId));
    }
    if (request.method === "POST" && statusMatch) {
      const body = await readJson(request);
      return sendJson(response, 200, changeStatus(db, { ...body, inquiryId: Number(statusMatch[1]) }));
    }
    if (request.method === "POST" && assigneeMatch) {
      const body = await readJson(request);
      return sendJson(response, 200, changeAssignee(db, { ...body, inquiryId: Number(assigneeMatch[1]) }));
    }
    if (request.method === "GET" && await serveStatic(url.pathname, response)) return;
    sendJson(response, 404, { message: "Not Found" });
  } catch (error) {
    if (error instanceof BusinessError) {
      return sendJson(response, error.statusCode, { message: error.message });
    }
    console.error(error);
    sendJson(response, 500, { message: "サーバーエラーが発生しました。" });
  }
});

server.listen(PORT, () => {
  console.log(`NEXUS inquiry management: http://localhost:${PORT}/inquiries/1`);
});

export { server };
