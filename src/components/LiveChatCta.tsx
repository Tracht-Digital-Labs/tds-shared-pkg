import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Language } from "../i18n/translations";
import { STR, type LiveChatConfig as Config, type TabKey } from "./liveChatCopy";
import { ChatPane, ContactPane, DocsPane, FaqPane } from "./LiveChatPanes";
import { apiFetch } from "../api";

/**
 * Floating bottom-right support widget (the "Live-Chat-CTA"). A launcher bubble
 * with a hide control opens a panel with up to four tabs — live chat, FAQ,
 * documentation and a contact form — each toggleable per frontend.
 *
 * Backed by the `live-chat-cta` extension in tds-core-frontend-api. The widget
 * makes ONE call on mount (`GET /live-chat-cta/config?frontend=…`) which returns
 * whether it is enabled for this frontend, the branding, which tabs are on, and
 * the FAQ/docs content. If disabled (or the call fails) nothing renders — so the
 * bubble is switched on/off per frontend from the admin Einstellungen with no
 * rebuild. Chat is HTTP-polling (no WebSockets on the static host).
 *
 * Styling ships as the `.live-chat-cta*` block in `styles/base.css` (base, not
 * app.css, so the public landingpage/blog get it too).
 */

export interface LiveChatCtaProps {
  /** The frontend key this instance runs on (landingpage/blog/customer/admin/tools). */
  frontend: string;
  /**
   * API origin override. Omit it and the widget resolves the panel API base
   * itself (`<meta name="tds-api-base">`, then `PUBLIC_API_BASE`, then the
   * production gateway) — see `../api`. The public sites pass
   * "https://api.tracht-digital.de" explicitly and keep working unchanged.
   */
  apiBase?: string;
  /** UI language. Defaults to German. */
  lang?: Language;
}

const HIDDEN_KEY = "tds-live-chat-hidden";

export default function LiveChatCta({ frontend, apiBase, lang = "de" }: LiveChatCtaProps) {
  const t = STR[lang === "en" ? "en" : "de"];
  const [config, setConfig] = useState<Config | null>(null);
  const [hidden, setHidden] = useState(true); // hidden until we know it's enabled
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("chat");
  const launcherRef = useRef<HTMLDivElement | null>(null);

  // Omitting `apiBase` used to mean same-origin, which was silently wrong on
  // the one surface that omits it: the panel is a static site on its own host,
  // so every widget call went to `management.tracht-digital.de` and came back
  // as the SPA fallback HTML with a 200. Unset now means "resolve it" — through
  // `apiFetch`, so a host reconfigured with `/install` is followed
  // too. An explicit `apiBase` still wins and skips that resolution entirely,
  // which is what keeps a caller that really does mean one fixed origin honest.
  const api = useCallback(
    (path: string, init?: RequestInit) =>
      apiBase
        ? fetch(`${apiBase}${path}`, { credentials: "include", ...init })
        : apiFetch(path, init),
    [apiBase],
  );

  useEffect(() => {
    let alive = true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(`${HIDDEN_KEY}:${frontend}`) === "1";
    } catch {
      /* storage disabled */
    }
    api(`/live-chat-cta/config?frontend=${encodeURIComponent(frontend)}&lang=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Config | null) => {
        if (!alive || !d || !d.enabled) return;
        setConfig(d);
        setHidden(dismissed);
        // Land on the first enabled tab.
        const first = (["chat", "faq", "docs", "contact"] as TabKey[]).find((k) => d.tabs[k]);
        if (first) setTab(first);
      })
      .catch(() => {
        /* backend not reachable — widget stays hidden */
      });
    return () => {
      alive = false;
    };
  }, [api, frontend, lang]);

  /**
   * Publish the vertical space this widget occupies in the BOTTOM-RIGHT corner,
   * so a host page's own fixed chrome can stack above it instead of underneath
   * it. Same mechanism as the cookie notice's `--tds-bottom-lane` (see
   * CookieNotice.tsx) — measured rather than guessed, because the launcher's
   * height follows its admin-configured label and the font that renders it.
   *
   * WHY THIS EXISTS: the widget is `position: fixed; right: 1.25rem; bottom:
   * 1.25rem; z-index: 95`, and the landingpage's own "book a call" control sits
   * in exactly that corner at `z-index: 35`. With the widget switched on for a
   * frontend, it covered that control completely — two persistent CTAs in one
   * corner, one of them invisible. It is not visible today only because the
   * widget renders nothing until an admin enables it per frontend.
   *
   * ONLY WHILE CLOSED. An open panel is up to 34rem tall and already owns the
   * corner; lifting a host's CTA above it would park that CTA in the middle of
   * the screen. Open, the panel simply covers it — that is a panel the user
   * deliberately opened, not a competing call to action.
   *
   * Cleared on unmount, on hide and on open, so the lane exists only while
   * something is actually in it. A stale lane would push a host's chrome up
   * the page forever, which is the failure mode that makes this worth a test.
   */
  useEffect(() => {
    const el = launcherRef.current;
    const root = typeof document === "undefined" ? null : document.documentElement;
    if (!root) return;
    if (!el || open || hidden || !config) {
      root.style.removeProperty("--tds-right-lane");
      return;
    }
    const publish = () => {
      root.style.setProperty(
        "--tds-right-lane",
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--tds-right-lane");
    };
  }, [config, hidden, open]);

  const hide = () => {
    setHidden(true);
    setOpen(false);
    try {
      localStorage.setItem(`${HIDDEN_KEY}:${frontend}`, "1");
    } catch {
      /* session-only */
    }
  };

  if (!config || hidden) return null;

  const enabledTabs = (["chat", "faq", "docs", "contact"] as TabKey[]).filter((k) => config.tabs[k]);
  if (enabledTabs.length === 0) return null;

  const accent = config.cta.accent || "#050f68";

  if (!open) {
    return (
      <div
        ref={launcherRef}
        className="live-chat-cta live-chat-cta--closed"
        style={{ "--lc-accent": accent } as CSSProperties}
      >
        <button type="button" className="live-chat-cta__launcher" onClick={() => setOpen(true)}>
          <span className="live-chat-cta__launcher-icon" aria-hidden="true">💬</span>
          <span className="live-chat-cta__launcher-label">{config.cta.label}</span>
        </button>
        <button type="button" className="live-chat-cta__hide" onClick={hide} aria-label={t.hide} title={t.hide}>
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="live-chat-cta live-chat-cta--open" style={{ "--lc-accent": accent } as CSSProperties} role="dialog" aria-label={config.cta.label}>
      <header className="live-chat-cta__head">
        <span className="live-chat-cta__title">{config.cta.label}</span>
        <button type="button" className="live-chat-cta__close" onClick={() => setOpen(false)} aria-label={t.close} title={t.close}>
          −
        </button>
      </header>

      {enabledTabs.length > 1 ? (
        <nav className="live-chat-cta__tabs" role="tablist">
          {enabledTabs.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-active" : ""} onClick={() => setTab(k)}>
              {t[k]}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="live-chat-cta__body">
        {tab === "chat" && config.tabs.chat ? <ChatPane api={api} frontend={frontend} greeting={config.cta.greeting} t={t} /> : null}
        {tab === "faq" && config.tabs.faq ? <FaqPane faqs={config.faqs} /> : null}
        {tab === "docs" && config.tabs.docs ? <DocsPane docs={config.docs} /> : null}
        {tab === "contact" && config.tabs.contact ? <ContactPane api={api} frontend={frontend} t={t} /> : null}
      </div>
    </div>
  );
}
