/**
 * `robots.txt`: every agent the profile names has its own group, may crawl
 * the site, may not crawl the paths the profile shuts, and the file advertises
 * the sitemap index.
 */

/**
 * The rules per user agent, as `"<field>:<value>"`. Consecutive
 * `User-agent` lines share one group, as the robots exclusion protocol says.
 */
export function robotsGroups(body) {
  const groups = new Map();
  let current = [];
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key)) {
      if (!lastWasAgent) current = [];
      current.push(value);
      groups.set(value, groups.get(value) ?? []);
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    for (const agent of current) groups.get(agent).push(`${key.toLowerCase()}:${value}`);
  }
  return groups;
}

export function checkRobots(body, profile, fail) {
  const groups = robotsGroups(body);
  for (const agent of profile.agents) {
    const rules = groups.get(agent);
    if (!rules) {
      fail("robots.txt", `no group for ${agent}`);
      continue;
    }
    if (rules.includes("disallow:/")) fail("robots.txt", `${agent} is shut out of the whole site`);
    for (const path of profile.requiredDisallow) {
      if (!rules.includes(`disallow:${path}`)) fail("robots.txt", `${agent} may crawl ${path}`);
    }
  }
  const sitemapLine = new RegExp(`^Sitemap:\\s*${profile.site}${profile.sitemapIndexPath}`, "im");
  if (!sitemapLine.test(body)) fail("robots.txt", "does not advertise the sitemap index");
}
