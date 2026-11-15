import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_API_BASE, apiBase, type RuntimeConfig } from "../api/index.js";
import { useCopyFlag } from "../clipboard/index.js";
import { downloadText } from "../download/index.js";
import {
  buildRuntimeConfig,
  diffPublished,
  probeHealth,
  probeRoute,
  readPublishedConfig,
  serializeRuntimeConfig,
  type Endpoints,
  type ProbeResult,
} from "./checks.js";
import type { InstallWizardProps } from "./InstallWizard.js";
import { ProbeRow } from "./ProbeRow.js";
import { SiteKeyStep } from "./SiteKeyStep.js";



export const DEFAULT_LOGIN_URL = "https://auth.tracht-digital.de";

export function LegacyInstallWizard({ profile }: InstallWizardProps) {
  const [endpoints, setEndpoints] = useState<Endpoints>({
    apiBase: DEFAULT_API_BASE,
    authBase: `${DEFAULT_API_BASE}/auth`,
    loginUrl: DEFAULT_LOGIN_URL,
  });
  const [loaded, setLoaded] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [published, setPublished] = useState<RuntimeConfig | null>(null);
  const [verified, setVerified] = useState<"idle" | "match" | "mismatch" | "missing">("idle");
  const { copied, copy: copyFlag } = useCopyFlag(2000);
  // Held here, not inside the step, so the tools site's registry sync can reuse
  // the same key the operator just typed. It is never persisted anywhere.
  const [siteKey, setSiteKey] = useState("");

  // Prefill from whatever this site is ACTUALLY using, not from the defaults —
  // on a host that already ran the wizard, the form should show the live values
  // so an operator changing one thing does not silently reset the others.
  //
  // Through `readPublishedConfig()`, not `runtimeConfig()`: the same stale-404
  // problem applies here. Somebody who just placed the file and reloaded would
  // otherwise be shown the baked defaults, overwrite their own configuration
  // with them, and never know why.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const live = await readPublishedConfig();
      if (cancelled) return;
      setEndpoints((current) => ({
        apiBase: live?.apiBase ?? apiBase() ?? current.apiBase,
        authBase: live?.authBase ?? `${live?.apiBase ?? apiBase() ?? current.apiBase}/auth`,
        loginUrl: live?.loginUrl ?? current.loginUrl,
      }));
      setPublished(live);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const config = useMemo(() => buildRuntimeConfig(profile, endpoints), [profile, endpoints]);
  const json = useMemo(() => serializeRuntimeConfig(config), [config]);

  const probeBase = profile.probeBase === "auth" ? endpoints.authBase : endpoints.apiBase;

  const runChecks = useCallback(async () => {
    setChecking(true);
    setProbes(null);
    try {
      const health = await probeHealth(endpoints.apiBase);
      const routes: ProbeResult[] = [];
      for (const route of profile.publicRoutes) {
        routes.push(await probeRoute(probeBase, route));
      }
      setProbes([health, ...routes]);
    } finally {
      setChecking(false);
    }
  }, [endpoints.apiBase, probeBase, profile.publicRoutes]);

  const verify = useCallback(async () => {
    const actual = await readPublishedConfig();
    setPublished(actual);
    if (actual === null) {
      setVerified("missing");
      return;
    }
    setVerified(diffPublished(profile, config, actual).length === 0 ? "match" : "mismatch");
  }, [profile, config]);

  const download = useCallback(() => downloadText(json, "tds-runtime.json", "application/json"), [json]);

  const copy = useCallback(() => void copyFlag(json), [copyFlag, json]);

  const set = (key: keyof Endpoints) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setEndpoints((current) => ({ ...current, [key]: value }));
    setVerified("idle");
  };

  const otherOrigins = profile.origins.filter(
    (origin) => typeof window !== "undefined" && origin !== window.location.origin,
  );

  return (
    <div className="tds-page tds-stack">
      <div className="tds-stack tds-stack--tight">
        <h1 className="tds-page__title">Einrichtung: {profile.name}</h1>
        <p className="tds-page__lede">
          Verbindet diese ausgelieferte Site mit der API. Die Prüfungen laufen in
          diesem Browser und damit auf genau dem Weg, den die Site selbst nimmt.
        </p>
      </div>

      <section className="tds-card tds-stack p-5">
        <h2>1. Endpunkte</h2>
        <div className="tds-field-row">
          <label htmlFor="apiBase">API-Basis-URL (das Gateway)</label>
          <input id="apiBase" className="field field-boxed" value={endpoints.apiBase} onChange={set("apiBase")} />
        </div>

        <div className="tds-field-row">
          <label htmlFor="authBase">Auth-API-URL</label>
          <input id="authBase" className="field field-boxed" value={endpoints.authBase} onChange={set("authBase")} />
        </div>

        {profile.runtimeKeys.includes("loginUrl") && (
          <div className="tds-field-row">
            <label htmlFor="loginUrl">Login-Seite</label>
            <input id="loginUrl" className="field field-boxed" value={endpoints.loginUrl} onChange={set("loginUrl")} />
          </div>
        )}

        {!loaded && <p className="muted-line">Aktuelle Konfiguration wird gelesen …</p>}
      </section>

      <section className="tds-card tds-stack p-5">
        <h2>2. Verbindung prüfen</h2>
        <div className="tds-row">
          <button type="button" className="btn btn-primary" onClick={() => void runChecks()} disabled={checking}>
            {checking ? "Prüft …" : "Prüfen"}
          </button>
        </div>

        {probes !== null && (
          <ul className="tds-list">
            {probes.map((result) => (
              <ProbeRow key={result.url} result={result} />
            ))}
          </ul>
        )}

        {otherOrigins.length > 0 && (
          <p className="tds-alert">
            {/* ONE child: .tds-alert is a flex row with a gap, so every text
                node and <code> would otherwise become its own flex item and
                stack into vertical columns. */}
            <span>
              Diese Seite kann nur das Origin prüfen, auf dem sie geladen ist.
              Für {otherOrigins.join(", ")} bitte dort <code>/install</code>{" "}
              öffnen und erneut prüfen. Eine fehlende CORS-Freigabe ist von
              hier aus nicht sichtbar.
            </span>
          </p>
        )}
      </section>

      <section className="tds-card tds-stack p-5">
        <h2>3. Konfiguration erzeugen</h2>
        <p>
          Diese Datei gehört als <code>tds-runtime.json</code> in den Docroot,
          neben die <code>index.html</code>. Ein erneuter Deploy überschreibt sie
          nicht.
        </p>
        <pre className="field-boxed p-3 overflow-x-auto text-sm">{json}</pre>
        <div className="tds-row">
          <button type="button" className="btn btn-primary" onClick={download}>
            Herunterladen
          </button>
          <button type="button" className="btn btn-ghost" onClick={copy}>
            {copied ? "Kopiert" : "JSON kopieren"}
          </button>
        </div>
      </section>

      <section className="tds-card tds-stack p-5">
        <h2>4. Bestätigen</h2>
        <p>
          Nach dem Ablegen hier prüfen, ob die Datei wirklich ausgeliefert wird.
          Ohne diesen Schritt bleibt eine fehlende Konfiguration unsichtbar: die
          Site fällt still auf ihre gebackenen Werte zurück.
        </p>
        <div className="tds-row">
          <button type="button" className="btn btn-primary" onClick={() => void verify()}>
            Prüfen, ob die Datei liegt
          </button>
        </div>

        {verified === "match" && (
          <p className="tds-alert tds-alert--success">
            <span>
              <code>tds-runtime.json</code> wird ausgeliefert und stimmt mit dem
              Erzeugten überein.
            </span>
          </p>
        )}
        {verified === "missing" && (
          <p className="tds-alert tds-alert--danger">
            <span>
              Keine <code>tds-runtime.json</code> erreichbar. Die Site benutzt
              weiterhin die einkompilierten Werte.
            </span>
          </p>
        )}
        {verified === "mismatch" && (
          <p className="tds-alert tds-alert--warning">
            <span>
              Es liegt eine <code>tds-runtime.json</code>, sie unterscheidet
              sich aber in: {diffPublished(profile, config, published).join(", ")}.
              Vermutlich eine ältere Fassung, bitte ersetzen.
            </span>
          </p>
        )}
      </section>

      <SiteKeyStep
        apiBase={endpoints.apiBase}
        profile={profile}
        siteKey={siteKey}
        onSiteKey={setSiteKey}
      />

    </div>
  );
}
