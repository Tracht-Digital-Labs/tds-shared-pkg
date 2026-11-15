import { useCallback, useEffect, useState } from "react";
import type { InstallWizardProps } from "./InstallWizard.js";

type PairingState =
  | { kind: "checking"; text: string }
  | { kind: "idle"; text: string }
  | { kind: "success"; text: string }
  | { kind: "warning"; text: string }
  | { kind: "error"; text: string };

/**
 * The fallback half of one-click pairing.
 *
 * The admin normally calls the site's server endpoint directly. If the host
 * cannot be reached from the API, it supplies `/install#pairing_token=…`.
 * Fragments never reach a server or a referrer; this island consumes it once,
 * removes it from the address bar, and forwards it to the same-origin server.
 */
export function PairingInstallWizard({ profile }: InstallWizardProps) {
  const [state, setState] = useState<PairingState>({
    kind: "checking",
    text: "Verbindungsstatus wird gelesen …",
  });
  const [status, setStatus] = useState<{
    connected?: boolean;
    origin?: string | null;
    api_base?: string | null;
    resource?: { type?: string; id?: string | number } | null;
    connected_at?: string | null;
    legacy_environment?: boolean;
  } | null>(null);

  const readStatus = useCallback(async () => {
    const response = await fetch("/tds/connect/status", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`status_${response.status}`);
    const body = (await response.json()) as NonNullable<typeof status>;
    setStatus(body);
    setState(
      body.connected
        ? { kind: "success", text: "Diese Site ist mit der API verbunden." }
        : body.legacy_environment
          ? {
              kind: "warning",
              text: "Die Site verwendet noch die Übergangs-Konfiguration des Hosts. Bitte im CMS neu verbinden.",
            }
          : {
              kind: "idle",
              text: "Noch nicht verbunden. Starte die Verbindung in den Einstellungen des zugehörigen CMS.",
            },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const pairingToken = fragment.get("pairing_token") ?? fragment.get("pairing") ?? "";
      const apiBase = fragment.get("api_base") ?? fragment.get("api") ?? "";
      const fragmentProfile = fragment.get("profile");

      if (pairingToken !== "" || apiBase !== "") {
        // Remove the credential before doing network work. Reload, screenshots
        // and copied URLs can no longer carry it after this point.
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }

      if (pairingToken === "" && apiBase === "") {
        try {
          await readStatus();
        } catch {
          if (!cancelled) setState({ kind: "error", text: "Der Verbindungsstatus konnte nicht gelesen werden." });
        }
        return;
      }

      if (pairingToken === "" || apiBase === "" || (fragmentProfile && fragmentProfile !== profile.id)) {
        if (!cancelled) setState({ kind: "error", text: "Der Einrichtungslink ist unvollständig oder gehört zu einer anderen Site." });
        return;
      }

      if (!cancelled) setState({ kind: "checking", text: "Die sichere Verbindung wird eingerichtet …" });
      try {
        const response = await fetch("/tds/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ pairing_token: pairingToken, api_base: apiBase }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string; warning?: string };
        if (!response.ok) {
          const expired = response.status === 401 || response.status === 410;
          if (!cancelled) {
            setState({
              kind: "error",
              text: expired
                ? "Der Einrichtungslink ist abgelaufen oder wurde bereits verwendet. Bitte im CMS einen neuen erzeugen."
                : `Die Verbindung konnte nicht hergestellt werden (HTTP ${response.status}${body.error ? `, ${body.error}` : ""}).`,
            });
          }
          return;
        }
        await readStatus();
        if (!cancelled && body.warning === "post_connect_failed") {
          setState({
            kind: "warning",
            text: "Die API-Verbindung steht. Eine nachgelagerte Synchronisierung wird beim nächsten Aufruf erneut versucht.",
          });
        }
      } catch {
        if (!cancelled) setState({ kind: "error", text: "Die API war während der Einrichtung nicht erreichbar. Bitte einen neuen Link erzeugen." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.id, readStatus]);

  const tone =
    state.kind === "success"
      ? "tds-alert--success"
      : state.kind === "warning"
        ? "tds-alert--warning"
        : state.kind === "error"
          ? "tds-alert--danger"
          : "";

  return (
    <div className="tds-page tds-stack">
      <div className="tds-stack tds-stack--tight">
        <h1 className="tds-page__title">API-Verbindung: {profile.name}</h1>
        <p className="tds-page__lede">
          Die Verbindung wird im CMS unter den Einstellungen dieser Site gestartet.
          Zugangsdaten bleiben ausschließlich auf dem Server und werden nicht in
          GitHub oder eine öffentlich erreichbare Konfigurationsdatei geschrieben.
        </p>
      </div>

      <section className="tds-card tds-stack p-5">
        <h2>Status</h2>
        <p className={`tds-alert ${tone}`} role={state.kind === "error" ? "alert" : "status"}>
          <span>{state.text}</span>
        </p>
        {status?.connected && (
          <dl className="tds-list">
            <div className="tds-list__row"><dt>Site</dt><dd><code>{status.origin}</code></dd></div>
            <div className="tds-list__row"><dt>API</dt><dd><code>{status.api_base}</code></dd></div>
            <div className="tds-list__row"><dt>Inhalt</dt><dd>{status.resource?.type} · {status.resource?.id}</dd></div>
            <div className="tds-list__row"><dt>Verbunden</dt><dd>{status.connected_at ? new Date(status.connected_at).toLocaleString("de-DE") : "—"}</dd></div>
          </dl>
        )}
        <div className="tds-row">
          <button type="button" className="btn btn-ghost" onClick={() => void readStatus()}>
            Status aktualisieren
          </button>
        </div>
      </section>
    </div>
  );
}
