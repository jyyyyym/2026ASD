import { NextResponse } from "next/server";
import { assertAccess, updateDb, readDb } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({ projects: db.projects });
}

export async function POST(request: Request) {
  try {
    assertAccess(request);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { slug?: string };
  const slug = (body.slug ?? "").trim();
  if (!slug || slug.length > 24) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const project = await updateDb((db) => {
    const existing = db.projects.find((item) => item.slug === slug);
    if (existing) return existing;
    const created = {
      id: slug,
      slug,
      createdAt: new Date().toISOString(),
    };
    db.projects.push(created);
    return created;
  });

  return NextResponse.json({ project });
}

export async function DELETE(request: Request) {
  try {
    assertAccess(request);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  try {
    await updateDb((db) => {
      if (db.projects.length <= 1) {
        throw new Error("LAST_PROJECT");
      }
      if (!db.projects.some((item) => item.id === id)) {
        throw new Error("NOT_FOUND");
      }
      db.projects = db.projects.filter((item) => item.id !== id);
      db.submissions = db.submissions.filter((item) => item.projectId !== id);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_PROJECT") {
      return NextResponse.json({ error: "last project" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
