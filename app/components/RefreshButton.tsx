"use client";

import { useState } from "react";

/**
 * Calls POST /api/refresh (which rotates tokens server-side) then reloads so
 * the server-rendered page reflects the new expiry / credits.
 */
export default function RefreshButton() {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      // On 401/403 the session was cleared server-side; reload either way.
      window.location.assign(res.ok ? "/" : "/?login=session_expired");
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-11 items-center justify-center rounded-full border border-black/[.12] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.18] dark:hover:bg-white/[.06]"
    >
      {busy ? "Refreshing…" : "Refresh session"}
    </button>
  );
}
