/** The four tabs of the live-chat widget: chat, FAQ, docs and the contact form. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveChatApi, LiveChatConfig, Strings } from "./liveChatCopy";

const POLL_MS = 4000;

interface ChatMessage {
  id: number;
  author: "visitor" | "agent";
  body: string;
  created_at: string;
}


// === Chat ===================================================================

function sessionKey(frontend: string) {
  return `tds-live-chat-session:${frontend}`;
}

export function ChatPane({ api, frontend, greeting, t }: { api: LiveChatApi; frontend: string; greeting: string; t: Strings }) {
  const [session, setSession] = useState<{ id: number; token: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(sessionKey(frontend));
      if (raw) setSession(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [frontend]);

  const poll = useCallback(async () => {
    if (!session) return;
    const res = await api(`/live-chat-cta/chat/${session.id}/messages?since=${cursor.current}`, {
      headers: { "X-Chat-Token": session.token },
    });
    if (res.ok) {
      const d = await res.json();
      const incoming: ChatMessage[] = d.messages ?? [];
      if (incoming.length > 0) {
        cursor.current = incoming[incoming.length - 1]!.id;
        setMessages((m) => [...m, ...incoming]);
      }
    }
  }, [api, session]);

  useEffect(() => {
    if (!session) return;
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [session, poll]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const start = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const res = await api("/live-chat-cta/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, frontend, message: body }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      const s = { id: d.id as number, token: d.token as string };
      try {
        localStorage.setItem(sessionKey(frontend), JSON.stringify(s));
      } catch {
        /* ignore */
      }
      setSession(s);
      setDraft("");
    }
  };

  const send = async () => {
    if (!session) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const res = await api(`/live-chat-cta/chat/${session.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Chat-Token": session.token },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (res.ok) {
      setDraft("");
      await poll();
    }
  };

  if (!session) {
    return (
      <div className="live-chat-cta__chat">
        <p className="live-chat-cta__greeting">{greeting}</p>
        <p className="live-chat-cta__hint">{t.startPrompt}</p>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPh} />
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.msgPh} rows={3} />
        <button type="button" onClick={start} disabled={busy || !draft.trim()}>{t.start}</button>
      </div>
    );
  }

  return (
    <div className="live-chat-cta__chat">
      <div className="live-chat-cta__messages">
        {messages.length === 0 ? <p className="live-chat-cta__hint">{greeting}</p> : null}
        {messages.map((m) => (
          <div key={m.id} className={`live-chat-cta__msg live-chat-cta__msg--${m.author}`}>
            {m.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="live-chat-cta__compose">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.msgPh}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" onClick={send} disabled={busy || !draft.trim()}>{t.send}</button>
      </div>
    </div>
  );
}

// === FAQ ====================================================================

export function FaqPane({ faqs }: { faqs: LiveChatConfig["faqs"] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (faqs.length === 0) return <p className="live-chat-cta__hint">—</p>;
  return (
    <ul className="live-chat-cta__faq">
      {faqs.map((f) => (
        <li key={f.id}>
          <button type="button" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
            {f.question}
          </button>
          {open === f.id ? <Prose text={f.answer} className="live-chat-cta__faq-answer" /> : null}
        </li>
      ))}
    </ul>
  );
}

// === Docs ===================================================================

export function DocsPane({ docs }: { docs: LiveChatConfig["docs"] }) {
  const [active, setActive] = useState<number | null>(null);
  if (docs.length === 0) return <p className="live-chat-cta__hint">—</p>;
  const current = docs.find((d) => d.id === active) ?? null;
  if (current) {
    return (
      <div className="live-chat-cta__doc">
        <button type="button" className="live-chat-cta__back" onClick={() => setActive(null)}>← </button>
        <h4>{current.title}</h4>
        <Prose text={current.body_markdown} className="live-chat-cta__doc-body" />
      </div>
    );
  }
  return (
    <ul className="live-chat-cta__docs">
      {docs.map((d) => (
        <li key={d.id}>
          <button type="button" onClick={() => setActive(d.id)}>{d.title}</button>
        </li>
      ))}
    </ul>
  );
}

// === Contact ================================================================

export function ContactPane({ api, frontend, t }: { api: LiveChatApi; frontend: string; t: Strings }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    const res = await api("/live-chat-cta/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, subject, message, frontend, website }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
    } else if (res.status === 429) {
      setStatus(t.rate);
    } else {
      setStatus(t.contactErr);
    }
  };

  if (done) return <p className="live-chat-cta__ok">{t.contactOk}</p>;

  return (
    <div className="live-chat-cta__contact">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPh} />
      <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.subjectPh} />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.contactMsgPh} rows={4} />
      {/* Honeypot — hidden from users, filled only by bots. */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      {status ? <p className="live-chat-cta__err">{status}</p> : null}
      <button type="button" onClick={submit} disabled={busy}>{t.contactSend}</button>
    </div>
  );
}

// === helpers ================================================================

/** Render plain text / light markdown safely as paragraphs (React escapes it —
 *  no dangerouslySetInnerHTML, no dependency). Blank lines split paragraphs. */
function Prose({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j) => (
            <span key={j}>
              {line}
              {j < p.split("\n").length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

