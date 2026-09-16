"use client";

import { useEffect, useState } from "react";
import type { MediaFile } from "@/lib/types";
import { localFileUrl } from "@/lib/client-store";

export function MediaView({
  file,
  kind = "image",
}: {
  file: MediaFile;
  kind?: "image" | "video";
}) {
  const [src, setSrc] = useState(file.url.startsWith("idb:") ? "" : file.url);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;

    async function resolve() {
      if (!file.url.startsWith("idb:")) {
        setSrc(file.url);
        return;
      }
      const local = await localFileUrl(file.id);
      if (!active) {
        if (local) URL.revokeObjectURL(local);
        return;
      }
      if (local) {
        revoked = local;
        setSrc(local);
      }
    }

    void resolve();
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [file.id, file.url]);

  if (!src) return <span className="work-fallback">{file.name}</span>;
  if (kind === "video") return <video src={src} controls playsInline />;
  return <img src={src} alt={file.name} />;
}
