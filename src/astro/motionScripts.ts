/**
 * Inline motion scripts for the TDS Astro sites: the error bounce, pausing
 * off-screen animations and the hover tips. Re-exported from `./astro`.
 */
import { BOUNCE_KEYFRAMES, BOUNCE_OPTIONS } from "../motion/bounce.js";

/**
 * The error bounce, installed on every page: when something goes wrong, the
 * thing that went wrong shakes once from side to side (see `bounce` in
 * `./motion`).
 *
 * Inline in `<head>` with `set:html`, next to {@link themeBootstrapScript}, so
 * it is listening before the first island hydrates. It reacts to what the page
 * already does when it fails — nothing has to opt in:
 *
 * - a field the browser refuses on submit (`invalid` event), and a field whose
 *   `aria-invalid` turns `"true"`;
 * - an error appearing or changing: `[role="alert"]`, `.form-alert`,
 *   `.tds-toast--error`, `.tds-alert--danger`, `[data-error]` — the shared
 *   feedback primitives and every hand-rolled alert;
 * - and the button that caused it: the last button pressed (or the form's
 *   submitter), if the error follows within four seconds.
 *
 * Markup that is PARSED is not an error appearing: mutations are ignored until
 * `DOMContentLoaded`, and again across an Astro client-side swap, so a page
 * that arrives with a message in it does not shake on load. Nodes inside
 * `[inert]` or the theme preview clone never shake. A no-op under
 * `prefers-reduced-motion: reduce`. `[data-bounce="off"]` opts an alert out.
 *
 * An error that does not change the markup (the same message twice) is
 * invisible to this watcher — call `bounce(el)` from `./motion` there.
 */
export const errorBounceScript: string = `(function () {
  if (window.__tdsBounce) return;
  var KF = ${JSON.stringify(BOUNCE_KEYFRAMES)};
  var OPT = ${JSON.stringify(BOUNCE_OPTIONS)};
  var ERR = '[role="alert"], .form-alert, .tds-toast--error, .tds-alert--danger, [data-error]';
  function still() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function bounce(el) {
    if (!el || !el.animate || still()) return;
    if (el.closest && el.closest("[inert], .tds-theme-preview")) return;
    var running = el.getAnimations ? el.getAnimations() : [];
    for (var i = 0; i < running.length; i++) if (running[i].id === "tds-bounce") running[i].cancel();
    try { el.animate(KF, OPT).id = "tds-bounce"; } catch (e) { /* no Web Animations */ }
  }
  window.__tdsBounce = bounce;

  var last = null, lastAt = 0;
  function remember(el) { if (el) { last = el; lastAt = Date.now(); } }
  function blame() {
    if (last && last.isConnected && Date.now() - lastAt < 4000) bounce(last);
    last = null;
  }
  document.addEventListener("submit", function (e) { remember(e.submitter); }, true);
  document.addEventListener("click", function (e) {
    var t = e.target;
    remember(t && t.closest ? t.closest('button, [role="button"], input[type="submit"], input[type="button"]') : null);
  }, true);
  document.addEventListener("invalid", function (e) { bounce(e.target); blame(); }, true);

  var live = document.readyState !== "loading";
  if (!live) document.addEventListener("DOMContentLoaded", function () { live = true; });
  document.addEventListener("astro:before-swap", function () { live = false; });
  document.addEventListener("astro:after-swap", function () {
    requestAnimationFrame(function () { live = true; });
  });

  function errorIn(node) {
    if (node.nodeType !== 1) return null;
    if (node.matches(ERR)) return node;
    return node.firstElementChild ? node.querySelector(ERR) : null;
  }
  new MutationObserver(function (records) {
    if (!live) return;
    var hits = [];
    function add(el) {
      if (!el || el.getAttribute("data-bounce") === "off" || hits.indexOf(el) >= 0) return;
      if (!(el.textContent || "").trim() && !el.matches("[aria-invalid]")) return;
      hits.push(el);
    }
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "attributes") {
        if (r.target.getAttribute("aria-invalid") === "true" && r.oldValue !== "true") add(r.target);
        continue;
      }
      var found = false;
      for (var j = 0; j < r.addedNodes.length; j++) {
        var n = r.addedNodes[j];
        var err = errorIn(n);
        if (err) { add(err); found = true; }
        if (n.nodeType === 1 && n.matches('[aria-invalid="true"]')) { add(n); found = true; }
      }
      if (!found) {
        var host = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        var owner = host && host.closest ? host.closest(ERR) : null;
        if (owner && (r.type === "characterData" || r.addedNodes.length)) add(owner);
      }
    }
    if (!hits.length) return;
    for (var k = 0; k < hits.length; k++) {
      var nested = false;
      for (var m = 0; m < hits.length; m++) if (m !== k && hits[m].contains(hits[k])) nested = true;
      if (!nested) bounce(hits[k]);
    }
    blame();
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-invalid"],
    attributeOldValue: true,
  });
})();`;

/**
 * Endless animations rest while they are off screen (0.54).
 *
 * A spinner in a closed section, a pulsing dot in the footer, a drifting
 * decoration under the hero: an animation with `iterations: Infinity` keeps
 * the compositor (and for some properties the main thread) busy every frame
 * whether anyone can see it or not. This watcher finds them and stops them
 * while they are outside the viewport.
 *
 * - **Found, not declared.** `document.getAnimations()` lists every running
 *   animation; the ones with infinite iterations are watched by ONE
 *   IntersectionObserver (128 px margin, so they are running again before they
 *   come into view). CSS animations announce themselves with `animationstart`;
 *   Web Animations (`el.animate`, Motion's hardware-accelerated tweens) are
 *   found by a rescan after load, after DOM changes (debounced) and after an
 *   Astro page swap.
 * - **CSS animations** are paused by the `[data-tds-offscreen]` rule in
 *   `styles/base.css`, so one that STARTS while its element is off screen is
 *   paused from its first frame. **Web Animations** are paused with `pause()`
 *   and resumed with `play()` — only those this script paused, never one a
 *   component paused itself.
 * - Not reached: animation loops written as JavaScript (`requestAnimationFrame`
 *   or Motion's own frame loop for springs and independent transforms). Those
 *   gate themselves with an IntersectionObserver where they live.
 *
 * Inline next to the theme bootstrap in every layout:
 * `<script is:inline set:html={offscreenAnimationScript} />`. Installs once;
 * a no-op without IntersectionObserver or Web Animations.
 */
export const offscreenAnimationScript: string = `(function () {
  if (window.__tdsOffscreen || !window.IntersectionObserver || !document.getAnimations) return;
  window.__tdsOffscreen = true;
  var ATTR = "data-tds-offscreen";
  var watched = new WeakSet();
  var ours = new WeakSet();
  function endless(a) {
    var t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return !!t && t.iterations === Infinity;
  }
  function isCss(a) { return typeof a.animationName === "string"; }
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var el = entries[i].target, off = !entries[i].isIntersecting;
      if (off) el.setAttribute(ATTR, ""); else el.removeAttribute(ATTR);
      var list = el.getAnimations ? el.getAnimations() : [];
      for (var j = 0; j < list.length; j++) {
        var a = list[j];
        if (isCss(a) || !endless(a)) continue;
        if (off && a.playState === "running") { a.pause(); ours.add(a); }
        else if (!off && ours.has(a)) { ours.delete(a); a.play(); }
      }
    }
  }, { rootMargin: "128px" });
  function watch(el) {
    if (!el || el.nodeType !== 1 || watched.has(el)) return;
    watched.add(el);
    io.observe(el);
  }
  function scan() {
    var all = document.getAnimations();
    for (var i = 0; i < all.length; i++) {
      var a = all[i];
      var el = a.effect && a.effect.target;
      if (!el || !endless(a)) continue;
      watch(el);
      if (!isCss(a) && a.playState === "running" && el.hasAttribute(ATTR)) { a.pause(); ours.add(a); }
    }
  }
  document.addEventListener("animationstart", function (e) {
    var el = e.target;
    if (!el || !el.getAnimations) return;
    var list = el.getAnimations();
    for (var i = 0; i < list.length; i++) if (endless(list[i])) { watch(el); return; }
  }, true);
  var timer = 0;
  function later(ms) {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (window.requestIdleCallback) requestIdleCallback(scan, { timeout: 1000 }); else scan();
    }, ms);
  }
  new MutationObserver(function () { later(400); }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "complete") later(0); else window.addEventListener("load", function () { later(0); setTimeout(scan, 3000); });
  document.addEventListener("astro:page-load", function () { later(200); });
})();`;

/**
 * A tip on a control the mouse rests on (0.58).
 *
 * Resting on a button for a moment (700 ms) shows one small navy label above
 * it, the way a desktop app does; moving on to the next control within 400 ms
 * shows its tip at once. Mouse only: touch has no hover, and a tip that
 * appears on a tap covers what the tap was for.
 *
 * What the tip says, first match wins:
 * 1. `data-tip` — the author's words. `data-tip=""` switches it off for one
 *    element, `data-no-tip` on an ancestor for a whole region.
 * 2. `title` — moved into `data-tip` on first hover so the browser's own
 *    tooltip does not appear on top (an icon-only control keeps the text as
 *    its `aria-label`, so its accessible name survives).
 * 3. `aria-label`, when it says more than the visible text (icon buttons).
 * 4. For links: where they lead when that is not obvious — another site, a
 *    new tab, a mail address, a phone number, a download.
 * 5. `<summary>`: open or close.
 * A control whose visible text already says everything gets no tip; reading
 * a label back is noise.
 *
 * The tip is `aria-hidden`: everything it says is already the control's name
 * or visible text, so a screen reader would hear it twice. One element, shown
 * as a manual popover so it sits above an open `<dialog>`. It stands beside the
 * pointer and follows it, flipped before it would leave the window.
 *
 * Inline next to the other bootstrap scripts in every public layout:
 * `<script is:inline set:html={hoverTipScript} />`. Styles: `.tds-hover-tip`
 * in `styles/base.css`.
 */
export const hoverTipScript: string = `(function () {
  if (window.__tdsHoverTip || !window.matchMedia) return;
  window.__tdsHoverTip = true;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var DELAY = 700, WARM = 400, GAP = 8, OFFSET = 16;
  var SEL = "button, [role=button], [role=tab], summary, input[type=submit], input[type=button], input[type=reset], [data-tip], .btn, a[class*=btn], a[class*=button], a[class*=cta], a[class*=action], a[aria-label]";
  var tip = null, current = null, timer = 0, warmUntil = 0, px = 0, py = 0;
  function de() { return (document.documentElement.lang || "de").toLowerCase().indexOf("en") !== 0; }
  function norm(s) { return (s || "").toLowerCase().split(/[^a-z0-9äöüß]+/).join(" ").trim(); }
  function linkHint(a) {
    var href = a.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#") return "";
    if (href.indexOf("mailto:") === 0) return (de() ? "E-Mail an " : "Email ") + decodeURIComponent(href.slice(7).split("?")[0]);
    if (href.indexOf("tel:") === 0) return (de() ? "Anrufen: " : "Call ") + decodeURIComponent(href.slice(4));
    if (a.hasAttribute("download")) return de() ? "Datei herunterladen" : "Download the file";
    var url;
    try { url = new URL(href, location.href); } catch (e) { return ""; }
    var tab = a.getAttribute("target") === "_blank";
    if (url.host && url.host !== location.host) {
      return (de() ? "Öffnet " : "Opens ") + url.host.replace(/^www[.]/, "") + (tab ? (de() ? " in einem neuen Tab" : " in a new tab") : "");
    }
    return tab ? (de() ? "Öffnet in einem neuen Tab" : "Opens in a new tab") : "";
  }
  function textFor(el) {
    var own = el.getAttribute("data-tip");
    if (own !== null) return own.trim();
    var visible = norm(el.textContent);
    var title = el.getAttribute("title");
    if (title) {
      if (!el.getAttribute("aria-label") && !visible) el.setAttribute("aria-label", title);
      el.setAttribute("data-tip", norm(title) === visible ? "" : title);
      el.removeAttribute("title");
      return norm(title) === visible ? "" : title.trim();
    }
    var label = el.getAttribute("aria-label");
    if (label && norm(label) !== visible) return label.trim();
    if (el.tagName === "A") return linkHint(el);
    if (el.tagName === "SUMMARY" && el.parentElement && el.parentElement.tagName === "DETAILS") {
      if (el.parentElement.open) return de() ? "Zuklappen" : "Collapse";
      return de() ? "Aufklappen" : "Expand";
    }
    return "";
  }
  function ensure() {
    if (tip && tip.isConnected) return tip;
    tip = document.createElement("div");
    tip.className = "tds-hover-tip";
    tip.setAttribute("aria-hidden", "true");
    if (tip.showPopover) tip.setAttribute("popover", "manual");
    document.body.appendChild(tip);
    return tip;
  }
  function place() {
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    var left = px + OFFSET + w + GAP > vw ? px - OFFSET - w : px + OFFSET;
    var top = py + OFFSET + h + GAP > vh ? py - OFFSET - h : py + OFFSET;
    tip.style.left = Math.round(Math.max(GAP, left)) + "px";
    tip.style.top = Math.round(Math.max(GAP, top)) + "px";
    tip.setAttribute("data-side", top < py ? "top" : "bottom");
  }
  function show(el, text) {
    ensure();
    tip.textContent = text;
    if (tip.showPopover) {
      try { if (tip.matches(":popover-open")) tip.hidePopover(); tip.showPopover(); } catch (e) {}
    }
    tip.setAttribute("data-open", "");
    place();
  }
  function hide() {
    clearTimeout(timer);
    if (tip && tip.hasAttribute("data-open")) {
      warmUntil = Date.now() + WARM;
      tip.removeAttribute("data-open");
      if (tip.hidePopover) { try { tip.hidePopover(); } catch (e) {} }
    }
    current = null;
  }
  function dismiss() {
    if (!current && !(tip && tip.hasAttribute("data-open"))) return;
    hide();
    warmUntil = 0;
  }
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    px = e.clientX;
    py = e.clientY;
    if (tip && tip.hasAttribute("data-open")) place();
  }, { capture: true, passive: true });
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType !== "mouse" || !fine.matches) return;
    px = e.clientX;
    py = e.clientY;
    var t = e.target;
    var el = t && t.closest ? t.closest(SEL) : null;
    if (el && el === current) return;
    hide();
    if (!el || el.closest("[data-no-tip]") || el.hasAttribute("disabled")) return;
    var text = textFor(el);
    if (!text) return;
    current = el;
    timer = setTimeout(function () {
      if (current === el && el.isConnected) show(el, text);
    }, Date.now() < warmUntil ? 0 : DELAY);
  }, true);
  document.addEventListener("pointerout", function (e) {
    if (!current) return;
    var to = e.relatedTarget;
    if (!to || !current.contains(to)) hide();
  }, true);
  ["pointerdown", "keydown", "wheel", "scroll"].forEach(function (type) {
    window.addEventListener(type, dismiss, { capture: true, passive: true });
  });
  document.addEventListener("astro:before-swap", dismiss);
})();`;

