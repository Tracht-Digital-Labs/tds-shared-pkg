import { useCallback, useState } from "react";
import { trimUrl } from "./checks.js";
import type { SiteProfile } from "./profiles.js";

/**
 * Register this site with the API using the key issued in the admin panel.
 *
 * This is the only moment the API learns a site exists. `tds-runtime.json` is
 * placed by hand on the host, so nothing else ever reports which `apiBase` a
 * site published, from which origin, or whether it is still alive — and because
 * every build-time content fetch is fail-soft, a site pointed at the wrong host
 * renders its baked fallbacks and looks perfectly healthy.
 *
 * **The key is never written into `tds-runtime.json`.** That file is served
 * publicly from the docroot; anything in it is readable by anyone. It stays a
 * setup-time credential here and a CI secret (`TDS_SITE_KEY`) in the build,
 * which is also why `RUNTIME_KEYS` is deliberately not extended — "shouldn't
 * this live in the config?" is the obvious future improvement and the answer is
 * no.
 *
 * It goes in the request BODY, not a header: no custom header means no new
 * preflight to get wrong. Not the query string either — a credential in an
 * access log, a referrer or browser history outlives the request it was sent
 * for.
 */
export function SiteKeyStep({
  apiBase: base,
  profile,
  siteKey,
  onSiteKey,
}: {
  apiBase: string;
  profile: SiteProfile;
  siteKey: string;
  onSiteKey: (value: string) => void;
}) {
  const [state, setState] = useState<{ tone: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(async () => {
    setBusy(true);
    setState(null);
    try {
      const res = await fetch(`${trimUrl(base)}/sites/handshake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: siteKey, site: profile.id, apiBase: trimUrl(base) }),
      });
      if (res.status === 401) {
        setState({
          tone: "tds-alert--danger",
          text: "Site-Key abgelehnt (401). Gehört er zu dieser Site und wurde er nicht widerrufen?",
        });
        return;
      }
      if (res.status === 404) {
        setState({
          tone: "tds-alert--warning",
          text: "Diese API kennt noch keine Site-Keys (404); sie ist älter als das Feature.",
        });
        return;
      }
      if (!res.ok) {
        setState({ tone: "tds-alert--danger", text: `Fehlgeschlagen (HTTP ${res.status}).` });
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as { label?: string; cors?: string };
      if (payload.cors === "missing") {
        // Reported as a warning, not a success: the handshake worked because
        // the panel let it through, and the site's own calls from this origin
        // will not.
        setState({
          tone: "tds-alert--warning",
          text:
            `Verbunden als „${payload.label ?? profile.id}“, aber dieses Origin ` +
            `(${typeof window === "undefined" ? "" : window.location.origin}) ist nicht ` +
            "freigegeben. Im Admin-Portal unter Einstellungen → Site-Verbindungen nachholen.",
        });
        return;
      }
      setState({
        tone: "tds-alert--success",
        text: `Verbunden als „${payload.label ?? profile.id}“.`,
      });
    } catch {
      // Never name a reason. A cross-origin failure rejects with a bare
      // TypeError; DNS, TLS, a dead host and a CORS rejection are
      // indistinguishable from a browser.
      setState({
        tone: "tds-alert--danger",
        text: "Nicht erreichbar (CORS, Netz oder Host); der Browser nennt den Grund nicht.",
      });
    } finally {
      setBusy(false);
    }
  }, [base, profile.id, siteKey]);

  return (
    <section className="tds-card tds-stack p-5">
      <h2>5. Site-Key hinterlegen</h2>
      <p>
        Der Key wird im Admin-Portal unter <em>Einstellungen → Site-Verbindungen</em>{" "}
        erzeugt und dort nur einmal angezeigt. Er meldet diese Site bei der API an,
        damit im Portal sichtbar ist, dass sie verbunden ist.
      </p>
      <div className="tds-field-row">
        <label htmlFor="siteKey">Site-Key</label>
        <input
          id="siteKey"
          className="field field-boxed"
          value={siteKey}
          onChange={(event) => onSiteKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="tdsk_…"
        />
      </div>
      <div className="tds-row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void send()}
          disabled={busy || siteKey.trim() === ""}
        >
          {busy ? "Meldet an …" : "Verbindung herstellen"}
        </button>
      </div>
      {state !== null && (
        <p className={`tds-alert ${state.tone}`}>
          <span>{state.text}</span>
        </p>
      )}
      <p className="muted-line">
        Der Key gehört <strong>nicht</strong> in die <code>tds-runtime.json</code>:
        die Datei ist öffentlich lesbar. Für die Inhalte zur Bauzeit gehört er als{" "}
        <code>TDS_SITE_KEY</code> in die Secrets des Repositorys.
      </p>
    </section>
  );
}
