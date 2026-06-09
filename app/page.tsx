import Link from "next/link";
import { getCurrentSession } from "@/lib/session";
import { REQUESTED_SCOPES, getDiscovery, type UserInfo } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const session = await getCurrentSession();
  const discovery = await getDiscovery().catch(() => null);

  const error = one(sp.error);
  const errorDescription = one(sp.error_description);
  const refreshed = one(sp.refreshed) === "1";
  const pay = one(sp.pay);
  const payAmount = one(sp.pay_amount);
  const payDetail = one(sp.pay_detail);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-indigo-500">
          Friend Group Auth
        </p>
        <h1 className="text-3xl font-bold tracking-tight">OAuth Platform Showcase</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          A live tour of what the provider exposes: Discord-gated login, PKCE,
          identity &amp; role claims, token rotation, and the credits/payment
          extension.
        </p>
      </header>

      {/* Banners ----------------------------------------------------------- */}
      {error && (
        <Banner tone="error" title={`Error: ${error}`}>
          {errorDescription ?? "Something went wrong."}
        </Banner>
      )}
      {refreshed && (
        <Banner tone="ok" title="Tokens rotated">
          The refresh token was exchanged for a new pair and userinfo was
          re-fetched live.
        </Banner>
      )}
      {pay === "paid" && (
        <Banner tone="ok" title="Payment verified">
          Charged {payAmount} credits — confirmed server-side via{" "}
          <code>/api/pay/verify</code> (<code>paid === true</code>).
        </Banner>
      )}
      {pay && pay !== "paid" && (
        <Banner tone="warn" title={`Payment: ${pay}`}>
          {payDetail ?? "Payment was not completed; nothing was granted."}
        </Banner>
      )}

      {session ? (
        <Dashboard user={session.user} session={session} />
      ) : (
        <LoggedOut />
      )}

      {/* Discovery --------------------------------------------------------- */}
      {discovery && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Auto-configured from discovery (RFC 8414)
          </h2>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-800 dark:bg-neutral-900/50">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <Endpoint label="issuer" value={discovery.issuer} />
              <Endpoint label="authorize" value={discovery.authorization_endpoint} />
              <Endpoint label="token" value={discovery.token_endpoint} />
              <Endpoint label="userinfo" value={discovery.userinfo_endpoint} />
              <Endpoint label="revoke" value={discovery.revocation_endpoint} />
              {discovery.payment_intent_endpoint && (
                <Endpoint label="pay intent" value={discovery.payment_intent_endpoint} />
              )}
            </dl>
            <p className="mt-3 text-neutral-500">
              Scopes supported:{" "}
              {discovery.scopes_supported.map((s) => (
                <code key={s} className="mr-1">
                  {s}
                </code>
              ))}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

function LoggedOut() {
  return (
    <section className="rounded-2xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
      <p className="mb-1 text-lg font-medium">You are signed out</p>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Sign in with your Discord account. Access is gated on guild membership
        and role — you must be <code>allowed</code> to get in.
      </p>
      <Link
        href="/api/auth/login"
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        Login with Friend Group →
      </Link>
      <p className="mt-4 text-xs text-neutral-400">
        Requests scopes: <code>{REQUESTED_SCOPES}</code>
      </p>
    </section>
  );
}

function Dashboard({
  user,
  session,
}: {
  user: UserInfo;
  session: {
    accessExpiresAt: number;
    tokens: { scope: string; token_type: string };
  };
}) {
  const avatarUrl =
    user.avatar && user.discord_id
      ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png?size=128`
      : null;
  const grantedScopes = session.tokens.scope.split(/\s+/).filter(Boolean);
  const hasCredits = typeof user.credits === "number";

  return (
    <>
      <section className="rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-full ring-2 ring-indigo-500/30"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10 text-2xl">
              👤
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">
              {user.global_name || user.username || "Unknown"}
            </p>
            <p className="truncate text-sm text-neutral-500">
              @{user.username} · sub <code>{user.sub}</code>
            </p>
          </div>
          <span
            className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
              user.allowed
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/15 text-red-600 dark:text-red-400"
            }`}
          >
            {user.allowed ? "allowed" : "denied"}
          </span>
        </div>

        {/* Identity claims */}
        <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 text-sm dark:border-neutral-800 dark:bg-neutral-800 sm:grid-cols-2">
          <Claim label="discord_id" value={user.discord_id} />
          <Claim label="in_guild" value={fmt(user.in_guild)} />
          <Claim
            label="credits"
            value={hasCredits ? String(user.credits) : "— (scope not granted)"}
          />
          <Claim label="id" value={user.id} />
        </dl>

        {/* Roles */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Roles ({user.roles?.length ?? 0})
          </p>
          <div className="flex flex-wrap gap-2">
            {user.roles && user.roles.length > 0 ? (
              user.roles.map((r) => (
                <span
                  key={r}
                  className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-xs dark:bg-neutral-800"
                >
                  {r}
                </span>
              ))
            ) : (
              <span className="text-xs text-neutral-400">none</span>
            )}
          </div>
        </div>
      </section>

      {/* Token info */}
      <section className="mt-4 rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Session &amp; tokens (server-side)
        </p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Claim label="granted scope" value={grantedScopes.join(" ")} flat />
          <Claim label="token_type" value={session.tokens.token_type} flat />
          <Claim
            label="access token expires"
            value={new Date(session.accessExpiresAt).toLocaleTimeString()}
            flat
          />
          <Claim label="refresh" value="rotates on use" flat />
        </dl>
      </section>

      {/* Actions */}
      <section className="mt-4 flex flex-wrap gap-3">
        <form action="/api/auth/refresh" method="post">
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            ↻ Rotate token &amp; re-sync
          </button>
        </form>

        {hasCredits && (
          <form
            action="/api/pay/start"
            method="post"
            className="flex items-center gap-2"
          >
            <input
              type="number"
              name="amount"
              defaultValue={5}
              min={1}
              className="w-20 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              💳 Charge credits
            </button>
          </form>
        )}

        <form action="/api/auth/logout" method="post" className="ml-auto">
          <button
            type="submit"
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
          >
            Log out
          </button>
        </form>
      </section>
    </>
  );
}

function fmt(v: boolean | undefined): string {
  return v === undefined ? "—" : String(v);
}

function Claim({
  label,
  value,
  flat,
}: {
  label: string;
  value?: string;
  flat?: boolean;
}) {
  return (
    <div className={flat ? "" : "bg-white px-4 py-3 dark:bg-neutral-950"}>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-mono text-sm break-all">{value ?? "—"}</dd>
    </div>
  );
}

function Endpoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-mono break-all">{value}</dd>
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "ok" | "warn" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    ok: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
    warn: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    error:
      "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  } as const;
  return (
    <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
