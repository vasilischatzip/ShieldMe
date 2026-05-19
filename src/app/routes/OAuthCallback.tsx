/**
 * OAuth 2.0 PKCE callback handler.
 *
 * Reached after the user authorises Google (Drive / Calendar). Reads `code`
 * and `state` from the URL, looks up the stored `code_verifier` from
 * sessionStorage, exchanges for tokens, persists encrypted tokens, then
 * redirects to the module that initiated the flow.
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { exchangeCodeForTokens, readPendingPkce } from "~/core/identity/pkce";
import { link } from "../base";

type State =
  | { kind: "exchanging" }
  | { kind: "success"; redirect: string }
  | { kind: "error"; message: string };

const state = signal<State>({ kind: "exchanging" });

export default function OAuthCallback() {
  const loc = useLocation();
  useEffect(() => {
    void run(loc.route);
  }, []);
  const s = state.value;
  if (s.kind === "exchanging") return <p>Connecting your account…</p>;
  if (s.kind === "error")
    return (
      <article role="alert" class="route-oauth-error">
        <h2>Couldn't complete sign-in</h2>
        <p>{s.message}</p>
        <a href={link("/")}>Back to Dashboard</a>
      </article>
    );
  return <p>Connected — redirecting…</p>;
}

async function run(navigate: (path: string) => void) {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const stateParam = params.get("state");
    const errParam = params.get("error");
    if (errParam) throw new Error(`Provider returned error: ${errParam}`);
    if (!code || !stateParam) throw new Error("Missing 'code' or 'state' in callback URL");
    const pending = readPendingPkce(stateParam);
    if (!pending) throw new Error("No pending PKCE flow matches this state");
    const tokens = await exchangeCodeForTokens({
      tokenEndpoint: pending.tokenEndpoint,
      clientId: pending.clientId,
      code,
      redirectUri: pending.redirectUri,
      codeVerifier: pending.codeVerifier,
    });
    // For v1.0 we just stash the access token in sessionStorage so the
    // module that initiated the flow can pick it up. Long-lived storage
    // moves into the AccountManager when M2 lands.
    sessionStorage.setItem(
      "shieldme.tokens." + pending.providerId,
      JSON.stringify({ tokens, scope: tokens.scope, expiresAt: Date.now() + tokens.expires_in * 1000 }),
    );
    // `pending.redirectAfter` is stored as a logical (base-relative) path
    // like "/cloud". Convert to a full path so preact-iso's router matches
    // the Route paths in App.tsx (which are also `link()`-wrapped).
    const target = link(
      pending.redirectAfter.startsWith("/") ? pending.redirectAfter : "/" + pending.redirectAfter,
    );
    state.value = { kind: "success", redirect: target };
    navigate(target);
  } catch (err) {
    state.value = {
      kind: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
