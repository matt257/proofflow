"use client";

import { useState } from "react";

export function RunSchedulesButton() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");

  async function handleClick() {
    setStatus("running");
    try {
      const res = await fetch("/api/schedules/run");
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("done");
      // Reload to reflect updated schedule state
      window.location.reload();
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "running"}
      className="rounded border border-foreground/20 px-2 py-1 text-xs text-foreground/50 transition-colors hover:border-foreground/40 hover:text-foreground/70 disabled:opacity-50"
    >
      {status === "running" ? "Running…" : "Run schedules now"}
    </button>
  );
}
