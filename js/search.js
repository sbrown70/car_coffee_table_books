// Turns a typed phrase into a book plan. Pure functions, so tests can run in Node.

const STOP = new Set(["car", "cars", "the", "of", "from", "and", "in", "a", "an", "through", "ages", "era", "classic", "classics", "all", "great", "best", "famous", "models", "book"]);

export function normalize(phrase) {
  return phrase.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9' -]/g, " ").replace(/\s+/g, " ").trim();
}

// Greedy longest match over word windows. Returns matched alias groups and leftover words.
export function parse(phrase, catalog) {
  const words = normalize(phrase).split(" ").filter(Boolean);
  const topics = topicIndex(catalog.topics);
  const groups = [];
  const unmatched = [];
  let topic = null;
  for (let i = 0; i < words.length;) {
    let hit = false;
    for (let len = Math.min(4, words.length - i); len > 0 && !hit; len--) {
      const key = words.slice(i, i + len).join(" ");
      if (topics[key]) {
        topic = topics[key];
        i += len;
        hit = true;
      } else if (catalog.aliases[key]) {
        groups.push({ phrase: key, tags: catalog.aliases[key] });
        i += len;
        hit = true;
      }
    }
    if (!hit) {
      if (!STOP.has(words[i])) unmatched.push(words[i]);
      i++;
    }
  }
  return { groups, unmatched, topic };
}

// A word the search ignored is reported on a chip and stays out of the title.
export function bookTitle(plan) {
  if (!plan.groups.length && !plan.topic) return plan.label;
  const ignored = new Set(plan.unmatched);
  return plan.label.split(" ").filter((w) => !ignored.has(normalize(w))).join(" ");
}

function topicIndex(topics) {
  const out = {};
  for (const [key, t] of Object.entries(topics)) {
    if (t && t.match) for (const m of t.match) out[m] = key;
  }
  return out;
}

// Tags in one facet are OR, different facets are AND. A topic adds its own tag set as one OR group.
export function select(plan, catalog) {
  const facetSets = {};
  for (const g of plan.groups) {
    const facet = g.tags[0].split(":")[0] === "builder" ? "designer" : g.tags[0].split(":")[0];
    (facetSets[facet] ??= new Set());
    for (const t of g.tags) facetSets[facet].add(t);
  }
  const sets = Object.values(facetSets);
  if (plan.topic) sets.push(new Set(catalog.topics[plan.topic].tags));
  let cars = catalog.cars;
  if (sets.length) {
    cars = cars.filter((c) => sets.every((s) => c.tags.some((t) => s.has(t))));
  } else if (plan.unmatched.length) {
    const hay = (c) => normalize(`${c.name} ${c.blurb} ${c.tags.join(" ")}`);
    cars = cars.filter((c) => plan.unmatched.every((w) => hay(c).includes(w)));
  } else {
    cars = [];
  }
  return [...cars].sort((a, b) => a.years[0] - b.years[0] || a.sig - b.sig || a.name.localeCompare(b.name));
}

// Chapters: by design house for that topic, by marque for a single country and class is left to decade.
export function chapters(cars, plan, catalog) {
  if (plan.topic && catalog.topics[plan.topic].chapter_by === "house") {
    const houses = catalog.topics.houses;
    const out = Object.entries(houses).map(([key, h]) => ({ key, title: h.name, blurb: h.blurb, source: h.source, cars: [] }));
    for (const c of cars) {
      const chapter = out.find((ch) => c.tags.includes(`designer:${ch.key}`) || c.tags.includes(`builder:${ch.key}`));
      if (chapter) chapter.cars.push(c);
    }
    return out.filter((ch) => ch.cars.length);
  }
  const byDecade = new Map();
  for (const c of cars) {
    const d = Math.floor(c.years[0] / 10) * 10;
    if (!byDecade.has(d)) byDecade.set(d, []);
    byDecade.get(d).push(c);
  }
  return [...byDecade.entries()].sort((a, b) => a[0] - b[0]).map(([d, list]) => ({ key: `${d}s`, title: `The ${d}s`, cars: list }));
}

const ORIGIN_PALETTE = { italy: "italy", germany: "germany", uk: "uk", france: "france", usa: "usa", japan: "japan" };

// Binding color follows national racing colors when a book belongs to one country.
export function palette(cars, plan, catalog) {
  if (plan.topic && catalog.topics[plan.topic].palette) return catalog.topics[plan.topic].palette;
  const origins = new Set(cars.flatMap((c) => c.tags.filter((t) => t.startsWith("origin:")).slice(0, 1)).map((t) => t.split(":")[1]));
  return origins.size === 1 ? ORIGIN_PALETTE[[...origins][0]] ?? "ink" : "ink";
}

// The opening text for a book whose query matches exactly one known subject.
export function intro(plan, catalog) {
  if (plan.topic) return catalog.topics[plan.topic];
  const tags = plan.groups.flatMap((g) => g.tags);
  for (const t of tags) {
    if (plan.groups.length === 1 && catalog.topics.intros[t]) return catalog.topics.intros[t];
    const house = t.startsWith("designer:") && catalog.topics.houses[t.split(":")[1]];
    if (plan.groups.length === 1 && house) return house;
  }
  return null;
}
