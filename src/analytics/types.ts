export type AnalyticsSite = "landing" | "blog" | "tools" | "auth" | "shop";

export interface AnalyticsOptions {
  site: AnalyticsSite;
  lang: string;
  /** Override for tests and local stacks; defaults to `{apiBase}/analytics`. */
  endpoint?: string;
}

/** One measured event, as sent on the wire. Short keys: it travels on every page hide. */
export interface AnalyticsEvent {
  /** Type. */
  t:
    | "pageview"
    | "click"
    | "outbound"
    | "scroll"
    | "section"
    | "form_start"
    | "form_field"
    | "form_submit"
    | "exit";
  /** Path the event happened on. */
  p: string;
  /** Key: CTA name, outbound host, section id or form name. */
  k?: string;
  /** Field name (forms only). */
  f?: string;
  /** Number: scroll percentage or engaged milliseconds. */
  n?: number;
}

export interface AnalyticsBatch {
  v: 1;
  site: AnalyticsSite;
  lang: string;
  vid: string;
  sid: string;
  /** The visitor id existed before this session began. */
  ret: boolean;
  /** Present on the first batch of a session only. */
  ref?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  events: AnalyticsEvent[];
}
