export const translations = {
  de: {
    nav: {
      about: "Über mich",
      services: "Leistungen",
      tech: "Tech",
      portfolio: "Portfolio",
      process: "Prozess",
      blog: "Ratgeber",
      contact: "Kontakt",
      cta: "Unverbindlich anfragen",
      pricing: "Preise",
    },
    blog: {
      label: "Ratgeber",
      headline: "Ratgeber für",
      headlineAccent: "Betriebe",
      readMore: "Weiterlesen",
      allPosts: "Alle Artikel",
      /* Notfall-Teaser für den Journal-Abschnitt: greifen nur, wenn weder
         kuratierte Slugs noch echte Artikel aus /content/blog kommen. Die
         Slugs müssen deshalb denen der Seed-Migration in
         tds-ext-blog-cms-pkg entsprechen, sonst zeigt der Fallback auf 404. */
      posts: [
        {
          category: "Digitalisierung",
          title: "Digitalisierung fängt nicht beim Großprojekt an.",
          excerpt: "Sie fängt bei dem einen Ablauf an, der Sie jede Woche Stunden kostet, und den außer Ihnen niemand sieht.",
          date: "2026-08-04",
          slug: "digitalisierung-faengt-klein-an",
          imagePlaceholder:
            "Handgeschriebene Liste auf einem Klemmbrett neben einem Laptop, warmes Morgenlicht, Werkstatt im Hintergrund.",
        },
        {
          category: "Webshop",
          title: "Lohnt sich ein Webshop für mein Ladengeschäft?",
          excerpt: "Nicht für jedes Sortiment. Vier Fragen, die die Antwort meist schon vorwegnehmen.",
          date: "2026-07-21",
          slug: "lohnt-sich-ein-webshop",
          imagePlaceholder:
            "Ladentheke von oben, Produkte, ein Notizblock und ein Smartphone mit offener Produktliste.",
        },
        {
          category: "Werkzeuge",
          title: "Excel-Tabelle oder eigenes Werkzeug?",
          excerpt: "Eine Tabelle ist erstaunlich weit tragfähig. Es gibt aber drei Punkte, an denen sie zuverlässig kippt.",
          date: "2026-07-07",
          slug: "excel-oder-eigenes-werkzeug",
          imagePlaceholder:
            "Bildschirm mit einer weit gescrollten Tabelle, daneben ein Notizzettel mit Formelfragment.",
        },
      ],
    },
    contact: {
      label: "Kontakt",
      headline: "Kontakt",
      headlineAccent: "",
      sub: "Zwei Sätze dazu, wo es hakt, genügen. Antwort in der Regel innerhalb von 24 Stunden.",
      form: {
        name: "Name",
        namePlaceholder: "Hanna Schmidt",
        email: "E-Mail",
        emailPlaceholder: "hanna@manufaktur.de",
        company: "Unternehmen (optional)",
        companyPlaceholder: "Schmidt Manufaktur",
        message: "Nachricht",
        messagePlaceholder: "Wir pflegen unsere Preise noch in drei Listen gleichzeitig. Das kostet jede Woche einen halben Tag.",
        consent: "Ich willige in die Verarbeitung meiner Daten gemäß der",
        consentLink: "Datenschutzerklärung",
        consentSuffix: "ein.",
        submit: "Nachricht senden",
        submitting: "Wird gesendet …",
        successTitle: "Nachricht erhalten!",
        successMessage: "Danke für Ihre Nachricht. Ich melde mich in der Regel innerhalb von 24 Stunden.",
        errorMessage: "Etwas ist schiefgelaufen. Bitte versuchen Sie es noch einmal.",
      },
      info: {
        emailLabel: "E-Mail",
        phoneLabel: "Handy",
        locationLabel: "Standort",
        socialLabel: "Social",
        email: "kontakt@tracht-digital.de",
        phone: "+49 178 822 4022",
        location: "Schwarzenbek · nähe Hamburg",
      },
    },
    footer: {
      slogan: "Digitale Lösungen, die passen.",
      tagline: "Aus Schwarzenbek bei Hamburg.",
      nav: "Navigation",
      contactTitle: "Kontakt",
      copyright: "© 2026 Tracht Digital Solutions. Alle Rechte vorbehalten.",
      impressum: "Impressum",
      datenschutz: "Datenschutz",
      pricing: "Preise",
    },
    errors: {
      name: "Bitte geben Sie Ihren Namen an.",
      email: "Bitte geben Sie eine gültige E-Mail-Adresse an.",
      message: "Mindestens 20 Zeichen, bitte.",
      consent: "Zustimmung erforderlich.",
    },
    cookieNotice: {
      label: "Hinweis zu Cookies und Datenschutz",
      /* Short on purpose. On a 320px phone this notice was the tallest thing on
         the first screen (207px) and sat on top of the page's primary call to
         action; the fact it states fits in one sentence. Same fact, same
         precision: no tracking, only necessary settings, stored locally. */
      siteText:
        "Keine Tracking-Cookies: Nur technisch nötige Einstellungen wie das Farbschema bleiben lokal im Browser.",
      panelText:
        "Dieser Bereich verwendet ausschließlich ein technisch notwendiges Cookie für die sichere Anmeldung (Session-Cookie). Es findet kein Tracking statt.",
      privacy: "Mehr in der Datenschutzerklärung.",
      accept: "Verstanden",
      consentText:
        "Wir zeigen auf diesem Blog Werbung von Google AdSense. Dafür werden nur mit Ihrer Einwilligung Cookies und ähnliche Technologien zu Werbezwecken gesetzt. Ihre Wahl ist freiwillig und jederzeit änderbar.",
      consentAccept: "Akzeptieren",
      consentDecline: "Ablehnen",
    },
    /* The consent manager (src/consent). Separate from `cookieNotice` above,
       which stays for the legacy informational banner: the two never render at
       the same time, but their wording differs in kind. The notice STATES a
       fact; this one ASKS a question, and every string here is read by someone
       deciding. Keep it plain — a consent text nobody understands is not an
       informed consent (Art. 4 Nr. 11 DSGVO). */
    consent: {
      label: "Datenschutz-Einstellungen",
      title: "Ihre Auswahl",
      intro:
        "Wir verwenden nur die Speicherung, die diese Seite zum Funktionieren braucht. Alles darüber hinaus setzen wir erst ein, wenn Sie zustimmen. Sie können Ihre Wahl jederzeit ändern.",
      privacy: "Datenschutzerklärung",
      imprint: "Impressum",
      acceptAll: "Alle akzeptieren",
      necessaryOnly: "Nur notwendige",
      settings: "Einstellungen",
      save: "Auswahl speichern",
      close: "Schließen",
      /* The footer entry point. Must exist on every page that can show the
         banner: a consent that cannot be withdrawn as easily as it was given
         is not a valid consent (Art. 7 Abs. 3 DSGVO). */
      manage: "Cookie-Einstellungen",
      alwaysOn: "Immer aktiv",
      categories: {
        necessary: {
          label: "Notwendig",
          description:
            "Speichert, was die Seite zum Betrieb braucht: Ihr Farbschema, Ihre Sprache, den Inhalt Ihres Warenkorbs und diese Auswahl selbst. Ohne diese Speicherung funktioniert die Seite nicht, deshalb ist sie nicht abwählbar (§ 25 Abs. 2 Nr. 2 TDDDG).",
        },
        functional: {
          label: "Komfort",
          description:
            "Merkt sich Einstellungen, die die Bedienung angenehmer machen, für den Betrieb aber nicht nötig sind, etwa eine zuletzt gewählte Ansicht oder, im Journal, welche Themen Sie gelesen haben, um passende Artikel vorzuschlagen. Gespeichert nur in Ihrem Browser, höchstens 180 Tage.",
        },
        analytics: {
          label: "Statistik",
          description:
            "Eigene Reichweitenmessung: welche Seiten gelesen werden, woher Besucher kommen, welche Schaltflächen sie nutzen und wo sie abbrechen. Dafür speichert Ihr Browser eine zufällige Kennung für 30 Tage. Ihre IP-Adresse wird nicht gespeichert, die Daten liegen auf unserem Server in Deutschland und gehen an niemanden weiter.",
        },
        marketing: {
          label: "Werbung",
          description:
            "Erlaubt Werbeanzeigen und die dafür nötigen Cookies unserer Werbepartner. Ohne Ihre Einwilligung wird kein Werbeskript geladen.",
        },
      },
      /* The click-to-load card in front of a third-party embed. It names the
         recipient BEFORE the request happens, because that is the only moment
         at which a decision is still possible. */
      placeholder: {
        title: "Externer Inhalt",
        body: "Dieser Inhalt wird von {provider} geladen. Dabei werden Ihre IP-Adresse und Angaben zu Ihrem Gerät an {provider} übertragen.",
        load: "Inhalt laden",
        settings: "Dauerhaft entscheiden",
      },
    },
    a11y: {
      skipToContent: "Zum Inhalt springen",
    },
    /* Only the chrome. A toast's TEXT always comes from the caller — a
       catalogue of canned messages here would be a second source of truth for
       copy the call sites already own. */
    toast: {
      dismiss: "Schließen",
    },
  },
  en: {
    nav: {
      about: "About",
      services: "Services",
      tech: "Tech",
      portfolio: "Portfolio",
      process: "Process",
      blog: "Ratgeber",
      contact: "Contact",
      cta: "Get in touch",
      pricing: "Pricing",
    },
    blog: {
      label: "Guides",
      headline: "Guides for",
      headlineAccent: "businesses",
      readMore: "Read more",
      allPosts: "All articles",
      /* Same slugs as the German fallback and as the seed migration in
         tds-ext-blog-cms-pkg — the slug is shared across languages, only the
         row differs. Changing one without the other points at a 404. */
      posts: [
        {
          category: "Digitalization",
          title: "Digitalization doesn't start with a big project.",
          excerpt: "It starts with the one routine that costs you hours every week, the one nobody but you can see.",
          date: "2026-08-04",
          slug: "digitalisierung-faengt-klein-an",
          imagePlaceholder:
            "A handwritten list on a clipboard beside a laptop, warm morning light, workshop in the background.",
        },
        {
          category: "Online shop",
          title: "Is an online shop worth it for my local business?",
          excerpt: "Not for every range of products. Four questions that usually answer it for you.",
          date: "2026-07-21",
          slug: "lohnt-sich-ein-webshop",
          imagePlaceholder:
            "A shop counter from above, products, a notepad and a phone showing an open product list.",
        },
        {
          category: "Tools",
          title: "Spreadsheet or a tool of your own?",
          excerpt: "A spreadsheet carries you surprisingly far. There are three points, though, where it reliably tips over.",
          date: "2026-07-07",
          slug: "excel-oder-eigenes-werkzeug",
          imagePlaceholder:
            "A screen showing a spreadsheet scrolled far down, next to a sticky note with a fragment of a formula.",
        },
      ],
    },
    contact: {
      label: "Contact",
      headline: "Contact",
      headlineAccent: "",
      sub: "Two sentences on where things are stuck are enough. Replies usually within 24 hours.",
      form: {
        name: "Name",
        namePlaceholder: "Alex Marlow",
        email: "Email",
        emailPlaceholder: "alex@marlow.studio",
        company: "Company (optional)",
        companyPlaceholder: "Marlow Studios",
        message: "Message",
        messagePlaceholder: "We still keep our prices in three separate lists. It costs us half a day every week.",
        consent: "I consent to the processing of my data in accordance with the",
        consentLink: "Privacy Policy",
        consentSuffix: ".",
        submit: "Send message",
        submitting: "Sending …",
        successTitle: "Message received!",
        successMessage: "Thank you for your message. I'll get back to you within 24 hours.",
        errorMessage: "Something went wrong. Please try again.",
      },
      info: {
        emailLabel: "Email",
        phoneLabel: "Mobile",
        locationLabel: "Location",
        socialLabel: "Social",
        email: "contact@tracht-digital.de",
        phone: "+49 178 822 4022",
        location: "Schwarzenbek · near Hamburg",
      },
    },
    footer: {
      slogan: "Digital solutions that fit.",
      tagline: "From Schwarzenbek near Hamburg.",
      nav: "Navigation",
      contactTitle: "Contact",
      copyright: "© 2026 Tracht Digital Solutions. All rights reserved.",
      impressum: "Legal Notice",
      datenschutz: "Privacy Policy",
      pricing: "Pricing",
    },
    errors: {
      name: "Please enter your name.",
      email: "Please enter a valid email address.",
      message: "At least 20 characters, please.",
      consent: "Consent required.",
    },
    cookieNotice: {
      label: "Cookie and privacy notice",
      siteText:
        "No tracking cookies: only necessary preferences such as your colour scheme stay local in your browser.",
      panelText:
        "This area only uses one technically necessary cookie for secure sign-in (session cookie). No tracking takes place.",
      privacy: "More in the privacy policy.",
      accept: "Got it",
      consentText:
        "This blog shows advertising from Google AdSense. Cookies and similar technologies are set for advertising only with your consent. Your choice is free and can be changed at any time.",
      consentAccept: "Accept",
      consentDecline: "Decline",
    },
    /* The consent manager (src/consent). Separate from `cookieNotice` above,
       which stays for the legacy informational banner: the two never render at
       the same time, but their wording differs in kind. The notice STATES a
       fact; this one ASKS a question, and every string here is read by someone
       deciding. Keep it plain — a consent text nobody understands is not an
       informed consent (Art. 4 no. 11 GDPR). */
    consent: {
      label: "Privacy settings",
      title: "Your choice",
      intro:
        "We only use the storage this site needs to work. Anything beyond that we use once you agree. You can change your choice at any time.",
      privacy: "Privacy policy",
      imprint: "Legal notice",
      acceptAll: "Accept all",
      necessaryOnly: "Necessary only",
      settings: "Settings",
      save: "Save choice",
      close: "Close",
      /* The footer entry point. Must exist on every page that can show the
         banner: a consent that cannot be withdrawn as easily as it was given
         is not a valid consent (Art. 7(3) GDPR). */
      manage: "Cookie settings",
      alwaysOn: "Always on",
      categories: {
        necessary: {
          label: "Necessary",
          description:
            "Stores what the site needs to operate: your colour scheme, your language, the contents of your basket and this choice itself. The site does not work without it, which is why it cannot be switched off (sec. 25(2) no. 2 TDDDG).",
        },
        functional: {
          label: "Convenience",
          description:
            "Remembers settings that make the site nicer to use but are not required to operate it: the view you last picked, say, or, in the journal, which topics you read so it can suggest matching articles. Stored only in your browser, for at most 180 days.",
        },
        analytics: {
          label: "Statistics",
          description:
            "Our own audience measurement: which pages get read, where visitors come from, which buttons they use and where they drop off. Your browser stores a random identifier for 30 days. Your IP address is not stored; the data stays on our server in Germany and is shared with no one.",
        },
        marketing: {
          label: "Advertising",
          description:
            "Allows advertisements and the cookies our advertising partners need for them. Without your consent no advertising script is loaded.",
        },
      },
      /* The click-to-load card in front of a third-party embed. It names the
         recipient BEFORE the request happens, because that is the only moment
         at which a decision is still possible. */
      placeholder: {
        title: "External content",
        body: "This content is loaded from {provider}. Doing so transmits your IP address and details about your device to {provider}.",
        load: "Load content",
        settings: "Decide permanently",
      },
    },
    a11y: {
      skipToContent: "Skip to content",
    },
    toast: {
      dismiss: "Dismiss",
    },
  },
} as const;

export type Language = keyof typeof translations;
export type Translations = typeof translations.de;
