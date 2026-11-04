// Lays a selected set of cars out as book pages. Every book is a flat list of pages; pages come in facing pairs.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

const WIDTHS = [960, 1280, 1920];

function imgAttrs(p, sizes) {
  const usable = WIDTHS.filter((w) => w < p.w);
  const list = usable.length ? usable : [Math.min(960, p.w)];
  const src = p.thumb.replace("{w}", list[0]);
  const set = list.map((w) => `${p.thumb.replace("{w}", w)} ${w}w`).join(", ");
  return `width="${p.w}" height="${p.h}" data-src="${esc(src)}" data-srcset="${esc(set)}" sizes="${sizes}"`;
}

function credit(p) {
  return `<a href="${esc(p.page)}" target="_blank" rel="noopener">Photo: ${esc(p.artist)}</a>, ${p.license_url ? `<a href="${esc(p.license_url)}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license)}`;
}

const yearText = (c) => (c.years[0] === c.years[1] ? `${c.years[0]}` : `${c.years[0]}–${c.years[1]}`);

const COUNTRY = { usa: "United States", uk: "United Kingdom", czechia: "Czechia", "south-korea": "South Korea" };

function marqueLine(c) {
  return c.tags.filter((t) => t.startsWith("origin:")).map((t) => t.split(":")[1]).map((o) => COUNTRY[o] ?? o[0].toUpperCase() + o.slice(1)).join(" / ");
}

function houseCredits(c) {
  const out = [];
  for (const t of c.tags) {
    const [facet, v] = t.split(":");
    if (facet !== "designer" && facet !== "builder") continue;
    const note = (facet === "designer" ? c.designer_note : c.builder_note)[v];
    const name = v.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    out.push(`${facet === "designer" ? "Design" : "Built by"}: ${esc(name)}${note ? ` (${esc(note)})` : ""}`);
  }
  return out;
}

const SPEC_LABELS = { production: "Production", engine: "Engine", layout: "Layout", body_style: "Body" };

function specs(c, limit = 4) {
  const rows = Object.entries(SPEC_LABELS).filter(([k]) => c.specs[k]).slice(0, limit)
    .map(([k, label]) => `<div><dt>${label}</dt><dd>${esc(c.specs[k].length > 110 ? `${c.specs[k].slice(0, 107)}...` : c.specs[k])}</dd></div>`);
  return rows.length ? `<dl class="specs">${rows.join("")}</dl>` : "";
}

function signals(c) {
  const a = c.attention;
  const today = a && a.views_12mo != null
    ? `${a.views_12mo.toLocaleString("en-US")} English Wikipedia views in 12 months, ${a.language_editions} language editions`
    : "No figure: this car shares its article with a wider model";
  return `<dl class="signals"><div><dt>Attention today</dt><dd>${today}</dd></div><div><dt>Collectors today</dt><dd>${c.nuggets.some((n) => n.kind === "collector") ? "See the note on this page" : "No sourced figure yet"}</dd></div></dl>`;
}

function nuggets(c, limit = 2) {
  return c.nuggets.slice(0, limit).map((n) => `<aside class="nugget"><span class="nugget-kind">${esc(n.kind)}</span><p>${esc(n.text)}</p>${n.cited ? "" : '<p class="uncited">Uncited in the source article</p>'}</aside>`).join("");
}

function sourceLine(c) {
  if (c.auto) return `<p class="source"><a href="${esc(c.source)}" target="_blank" rel="noopener">Quoted from Wikipedia</a>. Dates, tags and photo not yet checked by hand.</p>`;
  return `<p class="source"><a href="${esc(c.source)}" target="_blank" rel="noopener">Text adapted from Wikipedia</a>. Single source, not yet corroborated.</p>`;
}

function textBlock(c, n) {
  return `${headline(c)}
    <p class="blurb">${esc(c.blurb)}</p>
    ${nuggets(c, n)}
    ${specs(c)}
    ${signals(c)}
    ${sourceLine(c)}`;
}

// A car with no reviewed photo gets a type plate, never a guess.
function plate(c) {
  return `<div class="plate"><span>${esc(c.name)}</span><small>No checked free-licensed photo yet</small></div>`;
}

function photoPage(c, cls = "") {
  const p = c.photos[0];
  if (!p) return { cls: `page-photo ${cls}`, html: plate(c) };
  return { cls: `page-photo ${cls}`, html: `<img alt="${esc(c.name)}" ${imgAttrs(p, "(max-width: 900px) 100vw, 50vw")}><p class="credit">${credit(p)}</p>` };
}

function textPage(c, cls = "") {
  const extra = c.photos[1];
  return { cls: `page-text ${cls}`, html: `<div class="fit">${textBlock(c, extra ? 1 : 2)}${extra ? `<figure class="inset"><img alt="${esc(c.name)}" ${imgAttrs(extra, "(max-width: 900px) 90vw, 25vw")}><figcaption class="credit">${credit(extra)}</figcaption></figure>` : ""}</div>` };
}

function headline(c) {
  const houses = houseCredits(c);
  return `<p class="car-kicker">${marqueLine(c)}</p><h2 class="car-name">${esc(c.name)}</h2><p class="car-years">${yearText(c)}</p>${houses.length ? `<p class="car-houses">${houses.join(" &middot; ")}</p>` : ""}`;
}

// A landscape photo runs across the gutter so the whole car stays in frame. `flip` puts it below the text for rhythm.
function wideSpread(c, flip, feature) {
  const p = c.photos[0];
  const half = (side) => {
    const body = side === "left"
      ? `${headline(c)}${feature ? "" : `<p class="blurb">${esc(c.blurb)}</p>`}`
      : feature
        ? `<p class="blurb">${esc(c.blurb)}</p>${sourceLine(c)}<p class="credit credit-inline">${credit(p)}</p>`
        : `${nuggets(c, 2)}${specs(c, 2)}${signals(c)}${sourceLine(c)}<p class="credit credit-inline">${credit(p)}</p>`;
    return {
      cls: `page-wide page-wide-${side}${flip ? " page-wide-flip" : ""}`,
      html: `<div class="wide-window"><img alt="${side === "left" ? esc(c.name) : ""}" ${imgAttrs(p, "100vw")}></div><div class="wide-text"><div class="fit">${body}</div></div>`,
    };
  };
  return [half("left"), half("right")];
}

// A landscape photo on one portrait page sits whole on the paper, rather than losing most of the car to a crop.
function mattedPage(c, p) {
  return { cls: "page-matted", html: `<figure><img alt="${esc(c.name)}" ${imgAttrs(p, "(max-width: 900px) 100vw, 50vw")}><figcaption class="credit">${credit(p)}</figcaption></figure>` };
}

// The second spread an icon gets: its stories and figures, facing a second photograph.
function featureSpread(c, i) {
  const extra = c.photos[1];
  const text = { cls: "page-text", html: `<div class="fit"><p class="car-kicker">${esc(c.name)}</p>${nuggets(c, 3)}${specs(c)}${signals(c)}${sourceLine(c)}</div>` };
  const photo = mattedPage(c, extra);
  return i % 2 ? [photo, text] : [text, photo];
}

function carSpread(c, i) {
  const p = c.photos[0];
  if (p && p.w / p.h >= 1.2) {
    if (c.sig === 1 && c.photos[1]) return [...wideSpread(c, false, true), ...featureSpread(c, i)];
    return wideSpread(c, i % 2 === 1, false);
  }
  return i % 2 ? [textPage(c), photoPage(c)] : [photoPage(c), textPage(c)];
}

function compactPage(c) {
  const p = c.photos[0];
  return {
    cls: "page-compact",
    html: `${p ? `<figure class="compact-photo"><img alt="${esc(c.name)}" ${imgAttrs(p, "(max-width: 900px) 100vw, 50vw")}><figcaption class="credit">${credit(p)}</figcaption></figure>` : plate(c)}
      <div class="compact-text"><div class="fit">${textBlock(c, 2)}</div></div>`,
  };
}

function chapterSpread(ch, index) {
  const list = ch.cars.map((c) => `<li><span>${esc(c.name)}</span><span>${yearText(c)}</span></li>`).join("");
  // Only a second photo no spread will show, since an icon's gets its own spread. Otherwise the page stays cloth.
  const shown = ch.cars.find((c) => c.photos[1] && c.sig !== 1);
  return [
    { cls: "page-chapter", chapter: index, html: `<p class="chapter-no">Chapter ${index + 1}</p><h2 class="chapter-title">${esc(ch.title)}</h2>${ch.blurb ? `<p class="chapter-blurb">${esc(ch.blurb)}</p><p class="source"><a href="${esc(ch.source)}" target="_blank" rel="noopener">From Wikipedia</a></p>` : ""}<ol class="chapter-list${ch.cars.length > 7 ? " chapter-list-long" : ""}">${list}</ol>` },
    shown ? mattedPage(shown, shown.photos[1]) : { cls: "page-endpaper", html: "" },
  ];
}

export function buildPages(title, chapters, introText, count) {
  const heroCar = chapters.flatMap((c) => c.cars).find((c) => c.sig === 1 && c.photos[0]) ?? chapters.flatMap((c) => c.cars).find((c) => c.photos[0]);
  const contents = chapters.map((c, i) => `<li><button type="button" class="contents-link" data-chapter="${i}"><span>${i + 1}</span><span>${esc(c.title)}</span><span>${c.cars.length}</span></button></li>`).join("");
  const pages = [
    { cls: "page-endpaper", html: "" },
    { cls: "page-cover", html: `${heroCar ? `<img alt="" ${imgAttrs(heroCar.photos[0], "(max-width: 900px) 100vw, 50vw")}><p class="credit cover-credit">${credit(heroCar.photos[0])}</p>` : ""}<div class="jacket"><p>Car Explorer Library</p><h1>${esc(title)}</h1><p>${count} ${count === 1 ? "car" : "cars"}</p></div>` },
    { cls: "page-endpaper", html: "" },
    { cls: "page-title", html: `<h2>${esc(title)}</h2>${introText ? `<p class="intro">${esc(introText.blurb)}</p><p class="source"><a href="${esc(introText.source)}" target="_blank" rel="noopener">From Wikipedia</a></p>` : ""}<ol class="contents">${contents}</ol>` },
  ];
  chapters.forEach((ch, chapterIndex) => {
    pages.push(...chapterSpread(ch, chapterIndex));
    let i = 0;
    const small = [];
    const flush = (force) => {
      while (small.length >= 2 || (force && small.length)) {
        if (small.length === 1) pages.push(...carSpread(small.shift(), i++));
        else pages.push(compactPage(small.shift()), compactPage(small.shift()));
      }
    };
    for (const c of ch.cars) {
      if (c.sig === 3) {
        small.push(c);
        flush(false);
      } else {
        pages.push(...carSpread(c, i++));
      }
    }
    flush(true);
  });
  pages.push(
    { cls: "page-colophon", html: `<h2>About this book</h2><p>Assembled from the Car Explorer catalog. Car text is adapted from English Wikipedia under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>, and each car links to its article. Facts are single-source unless marked otherwise.</p><p>Photographs come from Wikimedia Commons under the licenses credited beside them. They appear unaltered apart from cropping to fit the page.</p><p>This is an early edition. About a hundred cars were checked closely. The rest were assembled by script, so a photo may show a different year or version of a car, and some dates and tags may be off. Each of those pages says so.</p>` },
    { cls: "page-endpaper", html: "" },
  );
  return pages;
}

const FIT_STEPS = [1, 0.94, 0.88];
const FIT_STEPS_TRIMMED = [1, 0.94, 0.88, 0.82, 0.76];

// Shrink a page's text until it fits. Readable text beats extras, so the spec table and small second photo go
// before the type gets tiny. If it still overflows, the page scrolls, so nothing is cut off.
export function fitText(root) {
  for (const fit of root.querySelectorAll(".fit")) {
    const box = fit.parentElement;
    const extras = fit.querySelectorAll(".inset, .specs");
    const small = fit.querySelectorAll(".credit, .source, .uncited");
    const fits = (zoom) => {
      fit.style.zoom = zoom;
      // Credits and source links stay legible however far the text around them shrinks.
      for (const el of small) el.style.zoom = 1 / zoom;
      // Geometry, not scrollHeight alone: rounding can hide a line that runs into the bottom margin.
      const limit = box.getBoundingClientRect().bottom - parseFloat(getComputedStyle(box).paddingBottom);
      return box.scrollHeight <= box.clientHeight && fit.getBoundingClientRect().bottom <= limit + 0.5;
    };
    box.classList.remove("fit-scroll");
    for (const el of extras) el.hidden = false;
    if (FIT_STEPS.some(fits)) continue;
    for (const el of extras) el.hidden = true;
    if (!FIT_STEPS_TRIMMED.some(fits)) box.classList.add("fit-scroll");
  }
}
