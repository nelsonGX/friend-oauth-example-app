import { getSession } from "@/app/lib/session";
import RefreshButton from "@/app/components/RefreshButton";

type SearchParams = { [key: string]: string | string[] | undefined };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type Flash = { tone: "ok" | "warn" | "bad" | "muted"; text: string };

function resolveFlash(sp: SearchParams): Flash | null {
  const login = one(sp.login);
  const pay = one(sp.pay);
  const reason = one(sp.reason);
  const amount = one(sp.amount);

  if (login) {
    switch (login) {
      case "success":
        return { tone: "ok", text: "Logged in successfully." };
      case "logged_out":
        return { tone: "muted", text: "You have been logged out." };
      case "denied":
        return {
          tone: "bad",
          text: "Access denied — you're not in the Discord server with the required role.",
        };
      case "required":
        return { tone: "warn", text: "Please log in first." };
      case "session_expired":
        return { tone: "warn", text: "Your session expired. Please log in again." };
      case "error":
        return { tone: "bad", text: `Login failed${reason ? `: ${reason}` : "."}` };
    }
  }

  if (pay) {
    switch (pay) {
      case "completed":
        return {
          tone: "ok",
          text: `Payment completed${amount ? ` (+${amount} credits)` : ""}. Verified server-side.`,
        };
      case "cancelled":
        return { tone: "muted", text: "Payment cancelled." };
      case "insufficient_funds":
        return { tone: "bad", text: "Payment failed: insufficient funds." };
      case "access_denied":
        return { tone: "bad", text: "Payment denied." };
      case "error":
        return {
          tone: "bad",
          text: `Could not start or verify the payment${reason ? `: ${reason}` : "."}`,
        };
    }
  }

  return null;
}

const TONE: Record<Flash["tone"], string> = {
  ok: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  muted:
    "border-black/10 bg-black/[.03] text-zinc-600 dark:border-white/10 dark:bg-white/[.04] dark:text-zinc-300",
};

function avatarUrl(discordId: string, avatar: string | null): string | null {
  if (!avatar) return null;
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();
  const flash = resolveFlash(await searchParams);
  const authed = !!session;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-xl">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Friend Group Auth — example app
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          OAuth 2.0 + PKCE login. This page just shows whether auth succeeded.
        </p>

        {flash && (
          <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${TONE[flash.tone]}`}>
            {flash.text}
          </div>
        )}

        {/* Status card */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                authed ? "bg-green-500" : "bg-zinc-400"
              }`}
              aria-hidden
            />
            <span className="text-lg font-medium text-black dark:text-zinc-50">
              {authed ? "Authenticated" : "Not authenticated"}
            </span>
          </div>

          {authed && session ? (
            <>
              <div className="mt-6 flex items-center gap-4">
                {avatarUrl(session.discordId, session.avatar) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl(session.discordId, session.avatar)!}
                    alt=""
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-full"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 text-xl font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {(session.globalName ?? session.username ?? "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-medium text-black dark:text-zinc-50">
                    {session.globalName ?? session.username}
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    @{session.username}
                  </div>
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label="Discord ID" value={session.discordId} mono />
                <Field
                  label="Allowed"
                  value={session.allowed ? "true ✓" : "false"}
                />
                <Field label="In guild" value={String(session.inGuild)} />
                <Field
                  label="Credits"
                  value={
                    session.credits === undefined
                      ? "— (scope not granted)"
                      : String(session.credits)
                  }
                />
                <div className="col-span-2">
                  <dt className="text-zinc-500 dark:text-zinc-400">Roles</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {session.roles.length ? (
                      session.roles.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-zinc-400">none</span>
                    )}
                  </dd>
                </div>
                <Field
                  label="Access token expires"
                  value={new Date(session.expiresAt * 1000).toLocaleTimeString()}
                />
              </dl>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="/buy"
                  className="flex h-11 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Buy 100 credits
                </a>
                <RefreshButton />
                <form action="/logout" method="post">
                  <button
                    type="submit"
                    className="flex h-11 items-center justify-center rounded-full border border-black/[.12] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.18] dark:hover:bg-white/[.06]"
                  >
                    Log out
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="mt-6">
              <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
                Sign in with your Friend Group account to continue.
              </p>
              <a
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-full bg-black px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Login with Friend Group Auth
              </a>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Tokens are stored in httpOnly cookies. CLIENT_SECRET stays server-side.
        </p>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`text-black dark:text-zinc-50 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
