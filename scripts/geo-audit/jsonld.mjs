/**
 * Structured data: it parses, carries the types the page kind requires and
 * none the site refuses, its `@id`s are consistent and resolve, and a date it
 * claims is a date the page shows.
 */

/**
 * The node that REPRESENTS the page. On an article that is the posting itself,
 * not the bare `mainEntityOfPage` stub beside it — the stub carries no date, so
 * looking only for `WebPage` would report every article as undated.
 */
const PAGE_TYPES = [
  "WebPage",
  "ProfilePage",
  "CollectionPage",
  "AboutPage",
  "ItemPage",
  "ContactPage",
  "FAQPage",
  "BlogPosting",
  "Article",
  "NewsArticle",
  "TechArticle",
];

const typesOf = (node) => [].concat(node["@type"]);

/** Every JSON-LD block on the page, walked into typed nodes and bare `@id` references. */
function readGraph(html, path, profile, fail) {
  const graph = { types: new Set(), nodes: [], declaredIds: new Map(), references: [] };

  const walk = (node, owner) => {
    if (Array.isArray(node)) return node.forEach((item) => walk(item, owner));
    if (!node || typeof node !== "object") return;
    if (node["@graph"]) walk(node["@graph"], owner);
    const type = node["@type"];
    const id = node["@id"];
    if (type) {
      graph.nodes.push(node);
      for (const t of typesOf(node)) graph.types.add(t);
      if (id) {
        const previous = graph.declaredIds.get(id);
        const own = typesOf(node).join(",");
        if (previous && previous !== own) fail(path, `@id ${id} is declared as both ${previous} and ${own}`);
        graph.declaredIds.set(id, own);
      }
    } else if (id) {
      // No `@type`: a reference to an entity described elsewhere.
      graph.references.push({ id, from: owner });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("@")) continue;
      if (profile.forbiddenProps.includes(key)) fail(path, `JSON-LD carries ${key}, which this site refuses`);
      walk(value, [].concat(type ?? owner ?? "graph").join(","));
    }
  };

  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(match[1]), null);
    } catch (error) {
      fail(path, `JSON-LD does not parse: ${error.message}`);
    }
  }
  return graph;
}

export function checkStructuredData({ html, path, kind, profile, fail, warn }) {
  const { types, nodes, declaredIds, references } = readGraph(html, path, profile, fail);

  // A requirement is one type, or an array meaning "any of these" — a tool
  // page may declare `WebApplication` or `SoftwareApplication` depending on
  // what its pack's manifest asked for, and either is correct.
  for (const requirement of kind.requiredTypes) {
    const options = [].concat(requirement);
    if (!options.some((type) => types.has(type))) fail(path, `JSON-LD lacks ${options.join(" or ")}`);
  }
  for (const type of profile.forbiddenTypes) {
    if (types.has(type)) fail(path, `JSON-LD carries ${type}, which this site refuses`);
  }
  for (const { id, from } of references) {
    if (declaredIds.has(id) || profile.entityAnchors.includes(id)) continue;
    warn(path, `${from ?? "a node"} references @id ${id}, which nothing on the page declares`);
  }

  // A date in the markup has to be a date on the page. Structured data that
  // says more than the page is exactly what engines are told to distrust.
  const pageNodes = nodes.filter((n) => typesOf(n).some((t) => PAGE_TYPES.includes(t)));
  const pageNode = pageNodes.find((n) => n.dateModified) ?? pageNodes[0];
  if (pageNode?.dateModified) {
    if (!html.includes(`datetime="${pageNode.dateModified}"`)) {
      fail(path, `dateModified ${pageNode.dateModified} is not shown as a <time> on the page`);
    }
  } else if (kind.requireDate) {
    fail(path, `${kind.kind} page without dateModified`);
  }
}
