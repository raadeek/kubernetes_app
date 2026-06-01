const http = require("http");
const { URL } = require("url");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 8080);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 10000
});

let schemaPromise;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode);
  res.end();
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(Object.assign(error, { statusCode: 400 }));
      }
    });

    req.on("error", reject);
  });
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }

  return schemaPromise;
}

function normalizeTask(row) {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdAt: row.created_at
  };
}

async function handleHealth(res) {
  try {
    await ensureSchema();
    await pool.query("SELECT 1");
    sendJson(res, 200, { status: "ok", database: "connected" });
  } catch (error) {
    sendJson(res, 503, { status: "unavailable", database: "disconnected" });
  }
}

async function listTasks(res) {
  await ensureSchema();
  const result = await pool.query(
    "SELECT id, title, completed, created_at FROM tasks ORDER BY id"
  );
  sendJson(res, 200, result.rows.map(normalizeTask));
}

async function createTask(req, res) {
  await ensureSchema();
  const payload = await readJson(req);
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const completed = typeof payload.completed === "boolean" ? payload.completed : false;

  if (!title) {
    sendJson(res, 400, { error: "Field 'title' is required" });
    return;
  }

  const result = await pool.query(
    "INSERT INTO tasks (title, completed) VALUES ($1, $2) RETURNING id, title, completed, created_at",
    [title, completed]
  );

  sendJson(res, 201, normalizeTask(result.rows[0]));
}

async function updateTask(req, res, id) {
  await ensureSchema();
  const payload = await readJson(req);
  const updates = [];
  const values = [];

  if (typeof payload.title === "string") {
    const title = payload.title.trim();
    if (!title) {
      sendJson(res, 400, { error: "Field 'title' cannot be empty" });
      return;
    }
    values.push(title);
    updates.push(`title = $${values.length}`);
  }

  if (typeof payload.completed === "boolean") {
    values.push(payload.completed);
    updates.push(`completed = $${values.length}`);
  }

  if (updates.length === 0) {
    sendJson(res, 400, { error: "Provide 'title' or 'completed' to update" });
    return;
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE tasks SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING id, title, completed, created_at`,
    values
  );

  if (result.rowCount === 0) {
    sendJson(res, 404, { error: "Task not found" });
    return;
  }

  sendJson(res, 200, normalizeTask(result.rows[0]));
}

async function deleteTask(res, id) {
  await ensureSchema();
  const result = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);

  if (result.rowCount === 0) {
    sendJson(res, 404, { error: "Task not found" });
    return;
  }

  sendEmpty(res, 204);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const taskMatch = url.pathname.match(/^\/tasks\/(\d+)$/);

  if (req.method === "GET" && url.pathname === "/health") {
    await handleHealth(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/tasks") {
    await listTasks(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/tasks") {
    await createTask(req, res);
    return;
  }

  if (taskMatch && req.method === "PATCH") {
    await updateTask(req, res, Number(taskMatch[1]));
    return;
  }

  if (taskMatch && req.method === "DELETE") {
    await deleteTask(res, Number(taskMatch[1]));
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      error: statusCode === 500 ? "Internal server error" : error.message
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Task Manager backend listening on port ${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
