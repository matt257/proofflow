"use client";

import { useState } from "react";

export function ShareLinkButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setState("loading");
    try {
      const res = await fetch("/api/share/create", { method: "POST" });
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = await res.json();
      setUrl(data.url);
      setState("done");
    } catch {
      setState("error");
    }
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state === "done" && url) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-xs font-mono text-foreground/60 focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className="shrink-0 rounded-lg border border-foreground/20 px-3 py-2 text-xs font-medium transition-colors hover:bg-foreground/5"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-foreground/30">Link expires in 7 days. Open in incognito to test.</p>
      </div>
    );
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={state === "loading"}
      className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
    >
      {state === "loading" ? "Generating..." : state === "error" ? "Try again" : "Generate auditor link"}
    </button>
  );
}
