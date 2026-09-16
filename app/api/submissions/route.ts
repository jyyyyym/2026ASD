import { NextResponse } from "next/server";
import { assertAccess, collectFiles, readDb, updateDb } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const db = await readDb();
  const submissions = projectId
    ? db.submissions.filter((item) => item.projectId === projectId)
    : db.submissions;
  return NextResponse.json({
    submissions: submissions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}

export async function POST(request: Request) {
  try {
    assertAccess(request);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "").trim();
  const author = String(form.get("author") ?? "").trim();
  const aiName = String(form.get("aiName") ?? "").trim();
  const promptProcess = String(form.get("promptProcess") ?? "").trim();
  const content = String(form.get("content") ?? "").trim();

  if (!projectId || !author || !aiName || !promptProcess || !content) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const [intermediateImages, finalImages, videos] = await Promise.all([
    collectFiles(form, "intermediateImages"),
    collectFiles(form, "finalImages"),
    collectFiles(form, "videos"),
  ]);

  const submission = await updateDb((db) => {
    const project = db.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const created = {
      id: crypto.randomUUID(),
      projectId,
      author,
      aiName,
      promptProcess,
      content,
      intermediateImages,
      finalImages,
      videos,
      createdAt: new Date().toISOString(),
    };
    db.submissions.unshift(created);
    return created;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
      return null;
    }
    throw error;
  });

  if (!submission) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ submission });
}

export async function DELETE(request: Request) {
  try {
    assertAccess(request);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  await updateDb((db) => {
    db.submissions = db.submissions.filter((item) => item.id !== id);
  });

  return NextResponse.json({ ok: true });
}
