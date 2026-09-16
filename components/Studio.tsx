"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { MediaView } from "@/components/MediaView";
import {
  loadLocal,
  mergeProjects,
  mergeSubmissions,
  persistFiles,
  saveLocal,
} from "@/lib/client-store";
import type { Project, Submission } from "@/lib/types";

type Overlay = "gate" | "compose" | "detail" | null;

const ACCESS_KEY = "ASD";
const SESSION_FLAG = "asd-unlocked";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined" && sessionStorage.getItem(SESSION_FLAG) === "1") {
    headers.set("x-access-key", ACCESS_KEY);
  }
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  return response.json() as Promise<T>;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function Studio() {
  const [projects, setProjects] = useState<Project[]>([
    { id: "0916", slug: "0916", createdAt: "2026-09-16T00:00:00.000Z" },
  ]);
  const [activeId, setActiveId] = useState("0916");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [gateValue, setGateValue] = useState("");
  const [gateError, setGateError] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [author, setAuthor] = useState("");
  const [aiName, setAiName] = useState("");
  const [promptProcess, setPromptProcess] = useState("");
  const [content, setContent] = useState("");
  const [intermediateFiles, setIntermediateFiles] = useState<File[]>([]);
  const [finalFiles, setFinalFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);

  const [hydrated, setHydrated] = useState(false);

  const persist = useCallback(async (nextProjects: Project[], nextSubmissions: Submission[]) => {
    await saveLocal({ projects: nextProjects, submissions: nextSubmissions });
  }, []);

  const refreshRemote = useCallback(async (localProjects: Project[], localSubmissions: Submission[]) => {
    const [projectData, submissionData] = await Promise.all([
      api<{ projects: Project[] }>("/api/projects"),
      api<{ submissions: Submission[] }>("/api/submissions"),
    ]);
    const projects = mergeProjects(localProjects, projectData.projects);
    const submissions = mergeSubmissions(localSubmissions, submissionData.submissions);
    return { projects, submissions };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setUnlocked(sessionStorage.getItem(SESSION_FLAG) === "1");
      const local = await loadLocal();
      if (cancelled) return;
      setProjects(local.projects);
      setActiveId((current) =>
        local.projects.some((project) => project.id === current) ? current : local.projects[0]?.id ?? "0916"
      );
      setSubmissions(local.submissions);
      setHydrated(true);
      try {
        const merged = await refreshRemote(local.projects, local.submissions);
        if (cancelled) return;
        setProjects(merged.projects);
        setSubmissions(merged.submissions);
        await persist(merged.projects, merged.submissions);
      } catch {
        await persist(local.projects, local.submissions);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [persist, refreshRemote]);

  useEffect(() => {
    if (!hydrated) return;
    void persist(projects, submissions);
  }, [hydrated, persist, projects, submissions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlay(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = overlay ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [overlay]);

  const intermediateUrls = useObjectUrls(intermediateFiles);
  const finalUrls = useObjectUrls(finalFiles);
  const videoUrls = useObjectUrls(videoFiles);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (gateValue.trim() !== ACCESS_KEY) {
      setGateError(true);
      return;
    }
    try {
      await api("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: gateValue.trim() }),
      });
    } catch {
      // keep working even if the server is offline
    }
    sessionStorage.setItem(SESSION_FLAG, "1");
    setUnlocked(true);
    setGateValue("");
    setGateError(false);
    setOverlay("compose");
  }

  function openCta() {
    setOverlay(unlocked ? "compose" : "gate");
  }

  function goBack() {
    setOverlay(null);
    setSelected(null);
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    const slug = newSlug.trim();
    if (!slug) return;
    const created: Project = {
      id: slug,
      slug,
      createdAt: new Date().toISOString(),
    };
    const next = mergeProjects(projects, [created]);
    setProjects(next);
    setActiveId(created.id);
    setNewSlug("");
    setAddingProject(false);
    try {
      const data = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      setProjects((current) => mergeProjects(current, [data.project]));
    } catch {
      // stored locally
    }
  }

  async function removeProject(id: string) {
    if (projects.length <= 1) return;
    const remaining = projects.filter((project) => project.id !== id);
    const remainingWorks = submissions.filter((item) => item.projectId !== id);
    setProjects(remaining);
    setSubmissions(remainingWorks);
    setActiveId((current) => (current === id ? remaining[0]?.id ?? "0916" : current));
    try {
      await api(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // stored locally
    }
  }

  async function submitWork(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData();
    form.set("projectId", activeId);
    form.set("author", author);
    form.set("aiName", aiName);
    form.set("promptProcess", promptProcess);
    form.set("content", content);
    intermediateFiles.forEach((file) => form.append("intermediateImages", file));
    finalFiles.forEach((file) => form.append("finalImages", file));
    videoFiles.forEach((file) => form.append("videos", file));

    try {
      try {
        const data = await api<{ submission: Submission }>("/api/submissions", { method: "POST", body: form });
        setSubmissions((current) => mergeSubmissions(current, [data.submission]));
      } catch {
        const created: Submission = {
          id: crypto.randomUUID(),
          projectId: activeId,
          author,
          aiName,
          promptProcess,
          content,
          intermediateImages: await persistFiles(intermediateFiles),
          finalImages: await persistFiles(finalFiles),
          videos: await persistFiles(videoFiles),
          createdAt: new Date().toISOString(),
        };
        setSubmissions((current) => mergeSubmissions(current, [created]));
      }
      setAuthor("");
      setAiName("");
      setPromptProcess("");
      setContent("");
      setIntermediateFiles([]);
      setFinalFiles([]);
      setVideoFiles([]);
      setOverlay(null);
    } catch {
      setFormError("저장하지 못했습니다. 필수 항목과 파일 용량을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function removeWork(id: string) {
    const remaining = submissions.filter((item) => item.id !== id);
    setSubmissions(remaining);
    setOverlay(null);
    setSelected(null);
    try {
      await api(`/api/submissions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // stored locally
    }
  }

  const activeSlug = useMemo(
    () => projects.find((project) => project.id === activeId)?.slug ?? "0916",
    [projects, activeId]
  );

  const board = useMemo(() => {
    const cells: Array<Submission | null> = submissions.filter((item) => item.projectId === activeId);
    while (cells.length < 9) cells.push(null);
    return cells;
  }, [activeId, submissions]);

  return (
    <main className="app">
      <header className="masthead">
        <div>
          <span className="year">2026</span>
          <h1 className="headline">
            <span>AI시대의</span>
            <span>서비스 디자인</span>
          </h1>
        </div>
        <button className="cta" type="button" onClick={openCta}>
          기록
        </button>
      </header>

      <ul className="tabs">
        {projects.map((project) => (
          <li className="tab-item" key={project.id}>
            <button
              className={project.id === activeId ? "tab is-active" : "tab"}
              type="button"
              onClick={() => setActiveId(project.id)}
            >
              {project.slug}
            </button>
            {unlocked && projects.length > 1 ? (
              <button
                className="tab-remove"
                type="button"
                aria-label={`${project.slug} 삭제`}
                onClick={() => void removeProject(project.id)}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
        {unlocked ? (
          <li className="add-project">
            {addingProject ? (
              <form onSubmit={createProject}>
                <input
                  autoFocus
                  value={newSlug}
                  onChange={(event) => setNewSlug(event.target.value)}
                  onBlur={() => {
                    if (!newSlug.trim()) setAddingProject(false);
                  }}
                  placeholder="이름"
                  aria-label="새 프로젝트"
                />
              </form>
            ) : (
              <button className="plus" type="button" onClick={() => setAddingProject(true)} aria-label="프로젝트 추가">
                +
              </button>
            )}
          </li>
        ) : null}
      </ul>

      <section className="feed" aria-label="기록 목록">
        {board.map((item, index) => {
          if (!item) {
            return <div className="work is-empty" key={`empty-${index}`} aria-hidden="true" />;
          }
          const cover = item.finalImages[0] ?? item.intermediateImages[0];
          return (
            <button
              className="work"
              key={item.id}
              type="button"
              onClick={() => {
                setSelected(item);
                setOverlay("detail");
              }}
            >
              <div className="work-frame">
                {cover ? <MediaView file={cover} /> : <span className="work-fallback">{item.author}</span>}
              </div>
              <div className="work-meta">
                <span className="author">{item.author}</span>
                <span className="ai">{item.aiName}</span>
              </div>
            </button>
          );
        })}
      </section>

      {overlay === "gate" ? (
        <div className="overlay">
          <button className="back" type="button" onClick={goBack}>
            뒤로
          </button>
          <form className="gate" onSubmit={unlock}>
            <input
              autoFocus
              value={gateValue}
              onChange={(event) => {
                setGateValue(event.target.value);
                setGateError(false);
              }}
              placeholder="ENTER"
              aria-label="입장 코드"
              autoComplete="off"
            />
            <button className="sr-only" type="submit">
              입장
            </button>
          </form>
          <p className="gate-hint">{gateError ? "다시" : ""}</p>
        </div>
      ) : null}

      {overlay === "compose" ? (
        <div className="overlay">
          <button className="back" type="button" onClick={goBack}>
            뒤로
          </button>
          <form className="composer" onSubmit={submitWork}>
            <h2 className="form-title">{activeSlug}</h2>
            <Field label="이름">
              <input type="text" required value={author} onChange={(event) => setAuthor(event.target.value)} />
            </Field>
            <Field label="사용한 AI">
              <input type="text" required value={aiName} onChange={(event) => setAiName(event.target.value)} />
            </Field>
            <Field label="프롬프트 과정">
              <textarea required value={promptProcess} onChange={(event) => setPromptProcess(event.target.value)} />
            </Field>
            <Field label="내용">
              <textarea required value={content} onChange={(event) => setContent(event.target.value)} />
            </Field>
            <FileField
              label="중간 이미지"
              accept="image/*"
              files={intermediateFiles}
              urls={intermediateUrls}
              onChange={setIntermediateFiles}
            />
            <FileField
              label="최종 이미지"
              accept="image/*"
              files={finalFiles}
              urls={finalUrls}
              onChange={setFinalFiles}
            />
            <FileField
              label="영상"
              accept="video/*"
              files={videoFiles}
              urls={videoUrls}
              kind="video"
              onChange={setVideoFiles}
            />
            {formError ? <p className="error">{formError}</p> : null}
            <button className="save" type="submit" disabled={saving}>
              {saving ? "저장 중" : "저장"}
            </button>
          </form>
        </div>
      ) : null}

      {overlay === "detail" && selected ? (
        <div className="overlay">
          <button className="back" type="button" onClick={goBack}>
            뒤로
          </button>
          <article className="detail">
            <div className="detail-kicker">
              <span>
                {selected.author} · {selected.aiName}
              </span>
              <span>{formatTime(selected.createdAt)}</span>
            </div>
            <h2 className="detail-title">{selected.author}</h2>
            <p className="prose">{selected.content}</p>
            <p className="block-label">프롬프트 과정</p>
            <p className="prose">{selected.promptProcess}</p>
            {selected.intermediateImages.length > 0 ? (
              <>
                <p className="block-label">중간 이미지</p>
                <div className="media-row">
                  {selected.intermediateImages.map((file) => (
                    <MediaView key={file.id} file={file} />
                  ))}
                </div>
              </>
            ) : null}
            {selected.finalImages.length > 0 ? (
              <>
                <p className="block-label">최종 이미지</p>
                <div className="media-stack">
                  {selected.finalImages.map((file) => (
                    <MediaView key={file.id} file={file} />
                  ))}
                </div>
              </>
            ) : null}
            {selected.videos.length > 0 ? (
              <>
                <p className="block-label">영상</p>
                <div className="media-stack">
                  {selected.videos.map((file) => (
                    <MediaView key={file.id} file={file} kind="video" />
                  ))}
                </div>
              </>
            ) : null}
            <div className="detail-actions">
              <button className="back-inline" type="button" onClick={goBack}>
                뒤로
              </button>
              {unlocked ? (
                <button className="remove" type="button" onClick={() => void removeWork(selected.id)}>
                  지우기
                </button>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FileField({
  label,
  accept,
  files,
  urls,
  kind = "image",
  onChange,
}: {
  label: string;
  accept: string;
  files: File[];
  urls: string[];
  kind?: "image" | "video";
  onChange: (files: File[]) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <label className="drop">
        {files.length > 0 ? `${files.length}개 선택됨` : "파일 선택"}
        <input
          type="file"
          accept={accept}
          multiple
          onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        />
      </label>
      {urls.length > 0 ? (
        <div className="previews">
          {urls.map((url, index) =>
            kind === "video" ? (
              <video key={url} src={url} muted />
            ) : (
              <img key={url} src={url} alt={files[index]?.name ?? ""} />
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

function useObjectUrls(files: File[]) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  return urls;
}
