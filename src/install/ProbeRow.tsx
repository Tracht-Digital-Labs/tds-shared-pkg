import type { ProbeResult } from "./checks.js";

/** One probe, rendered as a row the operator can act on. */
export function ProbeRow({ result }: { result: ProbeResult }) {
  const { reachability, status, url, route } = result;
  // `undefined` (never probed a count) and `null` (probed, not an array) both
  // mean "no number to show" here; only a real number distinguishes OK from
  // empty.
  const count = result.count ?? null;

  const unhealthy = result.unhealthy ?? [];
  const isHealth = result.kind === "health";

  const [tone, label] =
    reachability !== "ok"
      ? (["status-pill--danger", "Fehler"] as const)
      : isHealth
        ? unhealthy.length === 0
          ? (["status-pill--success", "OK"] as const)
          : (["status-pill--warning", "Dienste"] as const)
        : count === null
          ? (["status-pill--danger", "Fehler"] as const)
          : count === 0
            ? (["status-pill--warning", "Leer"] as const)
            : (["status-pill--success", "OK"] as const);

  return (
    <li className="tds-list__row">
      <span className={`status-pill ${tone}`}>{label}</span>
      <div>
        <code>{route.path}</code>
        {reachability === "ok" && isHealth && (
          <p className="muted-line">
            {unhealthy.length === 0
              ? "Gateway antwortet, alle Dienste gesund."
              : `Gateway antwortet, aber diese Dienste nicht: ${unhealthy.join(", ")}. Status 0 ist typischerweise eine fehlerhafte .env, die den Dienst beim Start killt.`}
          </p>
        )}
        {reachability === "ok" && !isHealth && count !== null && (
          <p className="muted-line">
            {count} × <code>{route.countKey}</code>
            {count === 0 && ": erreichbar, aber ohne Inhalte. Die Site zeigt hier ihre statischen Platzhalter."}
          </p>
        )}
        {reachability === "ok" && !isHealth && count === null && (
          <p className="muted-line">
            Antwort enthält kein <code>{route.countKey}</code>, unerwartetes Format.
          </p>
        )}
        {reachability === "http-error" && <p className="muted-line">HTTP {status} auf {url}</p>}
        {reachability === "blocked" && (
          <p className="muted-line">
            Nicht erreichbar: <code>{url}</code>.{" "}
            {/* The browser refuses to say why. Naming all three causes beats
                guessing one — a wrong guess sends someone to fix the wrong
                thing, which is worse than an honest "one of these". */}
            Der Browser nennt den Grund nicht: Es kann CORS, das Netz oder der
            Host sein.
            {result.hint === "host-reachable" &&
              " Ein Verbindungstest ohne CORS kam allerdings durch: der Host antwortet, also spricht viel für eine fehlende CORS-Freigabe dieses Origins."}
            {result.hint === "host-unreachable" &&
              " Auch ein Verbindungstest ohne CORS kam nicht durch: eher Netz, DNS, TLS oder ein toter Host als CORS."}
          </p>
        )}
      </div>
    </li>
  );
}
