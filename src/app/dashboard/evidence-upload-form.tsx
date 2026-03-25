"use client";

import { useState } from "react";

export function EvidenceUploadForm({ controlCode }: { controlCode: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlCode,
          title: title.trim() || `Evidence for ${controlCode}`,
          content: content.trim(),
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("done");
      window.location.reload();
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="text-xs text-green-600">Evidence uploaded successfully.</p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-foreground/50 hover:text-foreground/70"
      >
        Upload evidence manually
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 pt-1">
      <input
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded border border-foreground/20 bg-transparent px-2 py-1 text-xs placeholder:text-foreground/30 focus:border-foreground/40 focus:outline-none"
      />
      <textarea
        placeholder="Paste evidence notes, log excerpts, or a description of the evidence..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        required
        className="w-full rounded border border-foreground/20 bg-transparent px-2 py-1 text-xs placeholder:text-foreground/30 focus:border-foreground/40 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={status === "saving" || !content.trim()}
          className="rounded bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : "Submit evidence"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-foreground/40 hover:text-foreground/60"
        >
          Cancel
        </button>
        {status === "error" && (
          <span className="text-xs text-red-500">Upload failed</span>
        )}
      </div>
    </form>
  );
}
