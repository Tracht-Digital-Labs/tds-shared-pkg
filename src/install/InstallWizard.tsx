/**
 * The host-side setup wizard — as a page of the site, not a PHP script.
 *
 * ### Why this is JavaScript
 *
 * `tds-gateway-api/DEPLOY-PLESK.md` configures every frontend subdomain with
 * **PHP disabled** ("rein statische Auslieferung"); only `api.` is a PHP
 * bundle. The previous PHP wizard was therefore served as plain source or a
 * 403 on all four sites and could never have run. This one is a normal page.
 *
 * ### What it can and cannot do
 *
 * A browser cannot write to the docroot, so this does not install anything. It
 * **verifies** the connection, **generates** `tds-runtime.json`, and then
 * **confirms** that the file the operator placed is really live. That last step
 * is what makes the manual placement safe: a missing config is otherwise
 * completely silent — every content fetch on these sites is fail-soft, so the
 * page just renders its baked fallbacks and looks perfectly healthy.
 *
 * What it gains over the PHP version is the thing it was always supposed to
 * measure: the checks now run **on the same path the site itself uses** — same
 * origin, same CORS, same browser. PHP called from the server, which proved
 * something else.
 *
 * ### There is deliberately no login
 *
 * The PHP wizard demanded an admin login because it could WRITE: whoever sets
 * `tds-runtime.json` repoints a public site's whole API surface. This page
 * writes nothing, so a client-side gate would protect nothing — while an
 * unauthenticated password form on a public marketing domain, relaying
 * credentials to the real auth API with no server-side rate limiter, is a
 * phishing and credential-stuffing surface we would be installing on purpose.
 * Everything this page displays is already in the site's own bundle.
 */

import type { SiteProfile } from "./profiles.js";
import { LegacyInstallWizard } from "./LegacyInstallWizard.js";
import { PairingInstallWizard } from "./PairingInstallWizard.js";

export interface InstallWizardProps {
  profile: SiteProfile;
}

/** Sites that support one-click pairing get the pairing flow; the rest keep the manual one. */
export default function InstallWizard(props: InstallWizardProps) {
  return props.profile.pairing ? <PairingInstallWizard {...props} /> : <LegacyInstallWizard {...props} />;
}
