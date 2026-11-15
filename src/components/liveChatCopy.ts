/** Types and UI copy shared by the live-chat widget and its panes. */

export type TabKey = "chat" | "faq" | "docs" | "contact";

export interface LiveChatConfig {
  enabled: boolean;
  cta: { label: string; greeting: string; accent: string };
  tabs: Record<TabKey, boolean>;
  faqs: { id: number; category: string | null; question: string; answer: string }[];
  docs: { id: number; slug: string; title: string; body_markdown: string }[];
}

export type LiveChatApi = (path: string, init?: RequestInit) => Promise<Response>;

export const STR = {
  de: {
    close: "Schließen",
    hide: "Ausblenden",
    chat: "Chat",
    faq: "FAQ",
    docs: "Hilfe",
    contact: "Kontakt",
    startPrompt: "Schreib uns, wir antworten so schnell wie möglich.",
    namePh: "Name (optional)",
    emailPh: "E-Mail (optional)",
    msgPh: "Nachricht …",
    send: "Senden",
    start: "Chat starten",
    subjectPh: "Betreff (optional)",
    contactMsgPh: "Deine Nachricht …",
    contactSend: "Absenden",
    contactOk: "Danke! Wir melden uns.",
    contactErr: "Bitte Name, gültige E-Mail und eine Nachricht (min. 20 Zeichen) angeben.",
    rate: "Zu viele Anfragen. Bitte später erneut versuchen.",
    empty: "Noch keine Nachrichten.",
  },
  en: {
    close: "Close",
    hide: "Hide",
    chat: "Chat",
    faq: "FAQ",
    docs: "Help",
    contact: "Contact",
    startPrompt: "Message us, we reply as soon as we can.",
    namePh: "Name (optional)",
    emailPh: "Email (optional)",
    msgPh: "Message …",
    send: "Send",
    start: "Start chat",
    subjectPh: "Subject (optional)",
    contactMsgPh: "Your message …",
    contactSend: "Submit",
    contactOk: "Thanks! We'll be in touch.",
    contactErr: "Please provide a name, a valid email and a message (min. 20 chars).",
    rate: "Too many requests. Please try again later.",
    empty: "No messages yet.",
  },
} as const;

export type Strings = Record<keyof (typeof STR)["de"], string>;
