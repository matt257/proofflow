"use client";

import { useState } from "react";

export function AWSConnectForm() {
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/aws/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKeyId, secretAccessKey, region }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      window.location.reload();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          type="text"
          placeholder="Access Key ID"
          value={accessKeyId}
          onChange={(e) => setAccessKeyId(e.target.value)}
          required
          className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-foreground/40 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Secret Access Key"
          value={secretAccessKey}
          onChange={(e) => setSecretAccessKey(e.target.value)}
          required
          className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-foreground/40 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Region (e.g. us-east-1)"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          required
          className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/30 focus:border-foreground/40 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
        >
          {status === "saving" ? "Connecting..." : "Connect AWS"}
        </button>
        {status === "error" && (
          <span className="text-xs text-red-500">Connection failed</span>
        )}
      </div>
    </form>
  );
}
