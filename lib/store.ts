import { promises as fs } from "fs";
import path from "path";
import type { Database, MediaFile } from "./types";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "db.json");
const uploadDir = path.join(process.cwd(), "public", "uploads");

const seed: Database = {
  projects: [
    {
      id: "0916",
      slug: "0916",
      createdAt: "2026-09-16T00:00:00.000Z",
    },
  ],
  submissions: [],
};

const githubRepo = process.env.GITHUB_REPO?.trim();
const githubToken = process.env.GITHUB_TOKEN?.trim();
const githubBranch = process.env.GITHUB_BRANCH?.trim() || "main";

function githubEnabled() {
  return Boolean(githubRepo && githubToken);
}

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureDirs() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "asd-2026",
  };
}

async function githubGet(filePath: string) {
  const response = await fetch(
    `https://api.github.com/repos/${githubRepo}/contents/${filePath}?ref=${githubBranch}`,
    { headers: githubHeaders(), cache: "no-store" }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub GET ${filePath} ${response.status}`);
  }
  return (await response.json()) as { sha: string; content: string; encoding: string };
}

async function githubPut(filePath: string, bytes: Buffer, message: string) {
  const current = await githubGet(filePath);
  const response = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${filePath}`, {
    method: "PUT",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: bytes.toString("base64"),
      branch: githubBranch,
      sha: current?.sha,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub PUT ${filePath} ${response.status} ${text}`);
  }
}

async function readGithubDb(): Promise<Database> {
  const file = await githubGet("data/db.json");
  if (!file?.content) return structuredClone(seed);
  const raw = Buffer.from(file.content, "base64").toString("utf8");
  const parsed = JSON.parse(raw) as Database;
  if (!parsed.projects?.length) parsed.projects = seed.projects;
  if (!Array.isArray(parsed.submissions)) parsed.submissions = [];
  return parsed;
}

async function readDiskDb(): Promise<Database> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    if (!raw.trim()) return structuredClone(seed);
    const parsed = JSON.parse(raw) as Database;
    if (!parsed.projects?.length) parsed.projects = seed.projects;
    if (!Array.isArray(parsed.submissions)) parsed.submissions = [];
    return parsed;
  } catch {
    return structuredClone(seed);
  }
}

export async function readDb(): Promise<Database> {
  if (githubEnabled()) {
    try {
      return await readGithubDb();
    } catch {
      return readDiskDb();
    }
  }
  return readDiskDb();
}

export async function writeDb(db: Database) {
  const body = JSON.stringify(db, null, 2);
  try {
    await ensureDirs();
    await fs.writeFile(dbPath, body);
  } catch {
    // serverless filesystems may be read-only
  }
  if (githubEnabled()) {
    await githubPut("data/db.json", Buffer.from(body), "chore: save class records");
  }
}

export async function updateDb<T>(fn: (db: Database) => Promise<T> | T): Promise<T> {
  return withLock(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
}

export function assertAccess(request: Request) {
  const key = request.headers.get("x-access-key")?.trim();
  if (key !== "ASD") {
    throw new Error("UNAUTHORIZED");
  }
}

export async function saveUpload(file: File): Promise<MediaFile> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = crypto.randomUUID();
  const ext = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || "";
  const filename = `${id}${ext}`;

  try {
    await ensureDirs();
    await fs.writeFile(path.join(uploadDir, filename), bytes);
  } catch {
    // ignore local write failures in production
  }

  if (githubEnabled()) {
    await githubPut(`public/uploads/${filename}`, bytes, `chore: upload ${filename}`);
    return {
      id,
      url: `https://raw.githubusercontent.com/${githubRepo}/${githubBranch}/public/uploads/${filename}`,
      name: file.name,
      mime: file.type || "application/octet-stream",
    };
  }

  return {
    id,
    url: `/uploads/${filename}`,
    name: file.name,
    mime: file.type || "application/octet-stream",
  };
}

export async function collectFiles(form: FormData, field: string) {
  const entries = form.getAll(field).filter((item): item is File => item instanceof File && item.size > 0);
  const saved: MediaFile[] = [];
  for (const file of entries) {
    saved.push(await saveUpload(file));
  }
  return saved;
}
