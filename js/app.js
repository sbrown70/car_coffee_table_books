import { parse, select, chapters, palette, intro, bookTitle } from "./search.js";
import { buildPages, fitText } from "./pages.js";

const SHELF = [
  ["Italians", "italy"], ["Italian design houses", "italy"], ["90s American muscle", "usa"], ["American sports cars", "usa"],
  ["Porsche", "germany"], ["Ferrari", "italy"], ["German supercars", "germany"], ["British GTs", "uk"], ["Giugiaro", "ink"],
  ["French", "france"], ["Japanese", "japan"], ["Film cars", "ink"], ["Poster cars", "ink"], ["Homologation specials", "ink"], ["Rally cars", "ink"],
  ["Pre-war", "ink"], ["Tail fins", "usa"], ["Kei cars", "japan"], ["East bloc", "ink"], ["Le Mans winners", "ink"], ["Glorious failures", "ink"], ["Woodies", "usa"], ["Swedish", "ink"],
];
const $ = (id) => document.getElementById(id);
const phone = () => matchMedia("(max-width: 900px)").matches;

let catalog;
let pages = [];
let spread = 0;
let turning = false;

function titleCase(s) {
  return s.replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

function pageEl(page) {
  const el = document.createElement("article");
  el.className = `page ${page?.cls ?? "page-endpaper"}`;
  el.innerHTML = page?.html ?? "";
  return el;
}

function loadImages(root) {
  for (const img of root.querySelectorAll("img[data-src]")) {
    img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
    img.removeAttribute("data-src");
  }
}

function preload(from) {
  // Warm the next spread and leaf so turning a page never shows a blank photo.
  const holder = document.createElement("div");
  for (const p of pages.slice(from, from + 4)) holder.append(pageEl(p));
  loadImages(holder);
}

function side(page, where) {
  const el = pageEl(page);
  el.classList.add(`side-${where}`);
  return el;
}

function renderSpread() {
  const book = $("book");
  book.replaceChildren(side(pages[spread * 2], "left"), side(pages[spread * 2 + 1], "right"));
  loadImages(book);
  fitText(book);
  preload((spread + 1) * 2);
  $("prev").disabled = spread === 0;
  $("next").disabled = (spread + 1) * 2 >= pages.length;
  $("position").textContent = `Pages ${spread * 2 + 1}–${spread * 2 + 2} of ${pages.length}`;
}

function renderPhone() {
  const book = $("book");
  // Blank endpapers exist to keep facing pairs aligned, which a scrolling page does not need.
  book.replaceChildren(...pages.filter((p) => p.cls !== "page-endpaper").map((p) => pageEl(p)));
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { loadImages(e.target); seen.unobserve(e.target); }
  }, { rootMargin: "600px" });
  book.querySelectorAll(".page").forEach((el) => seen.observe(el));
  $("position").textContent = `${pages.length} pages`;
}

function turn(dir) {
  if (phone() || turning) return;
  const target = spread + dir;
  if (target < 0 || target * 2 >= pages.length) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    spread = target;
    renderSpread();
    return;
  }
  turning = true;
  const book = $("book");
  const forward = dir > 0;
  const under = forward
    ? [side(pages[spread * 2], "left"), side(pages[target * 2 + 1], "right")]
    : [side(pages[target * 2], "left"), side(pages[spread * 2 + 1], "right")];
  const leaf = document.createElement("div");
  leaf.className = `leaf ${forward ? "leaf-forward" : "leaf-back"}`;
  const front = pageEl(forward ? pages[spread * 2 + 1] : pages[spread * 2]);
  const back = pageEl(forward ? pages[target * 2] : pages[target * 2 + 1]);
  front.classList.add("leaf-front");
  back.classList.add("leaf-back-face");
  leaf.append(front, back);
  book.replaceChildren(...under, leaf);
  loadImages(book);
  fitText(book);
  leaf.addEventListener("animationend", () => {
    spread = target;
    turning = false;
    renderSpread();
  }, { once: true });
}

function layout() {
  if (!pages.length) return;
  if (phone()) renderPhone();
  else renderSpread();
}

function showChips(plan) {
  const chips = $("chips");
  chips.replaceChildren();
  const add = (label, remove) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = label;
    b.title = "Remove this from the book";
    b.addEventListener("click", remove);
    chips.append(b);
  };
  const rebuild = (nextPlan) => {
    // The title and link follow what is left, so a reload shows this same book.
    nextPlan.label = [nextPlan.topic && catalog.topics[nextPlan.topic].title, ...nextPlan.groups.map((g) => g.phrase), ...nextPlan.unmatched].filter(Boolean).join(" ");
    history.pushState(null, "", nextPlan.label ? `#${encodeURIComponent(nextPlan.label)}` : location.pathname);
    openPlan(nextPlan);
  };
  if (plan.topic) add(catalog.topics[plan.topic].title, () => rebuild({ ...plan, topic: null }));
  plan.groups.forEach((g, i) => add(g.phrase, () => rebuild({ ...plan, groups: plan.groups.filter((_, j) => j !== i) })));
  for (const w of plan.unmatched) {
    const s = document.createElement("span");
    s.className = "chip chip-ignored";
    s.textContent = plan.groups.length || plan.topic ? `ignored: ${w}` : `text search: ${w}`;
    chips.append(s);
  }
}

function openPlan(plan) {
  // A turn in progress when the book changes never finishes, so it must not hold the lock.
  turning = false;
  const cars = select(plan, catalog);
  if (!cars.length) {
    $("message").textContent = plan.groups.length || plan.topic || plan.unmatched.length
      ? "Nothing in the catalog matches that yet. Try fewer words, or one of the books below."
      : "Type a subject, or take a book from the shelf.";
    closeReader();
    return;
  }
  const chs = chapters(cars, plan, catalog);
  const title = plan.topic ? catalog.topics[plan.topic].title : titleCase(bookTitle(plan));
  pages = buildPages(title, chs, intro(plan, catalog), cars.length);
  spread = 0;
  $("message").textContent = "";
  $("reader").dataset.palette = palette(cars, plan, catalog);
  $("library").hidden = true;
  $("reader").hidden = false;
  showChips(plan);
  layout();
  scrollTo(0, 0);
}

function openBook(phrase) {
  const plan = parse(phrase, catalog);
  plan.label = phrase;
  const hash = `#${encodeURIComponent(phrase)}`;
  if (location.hash !== hash) history.pushState(null, "", hash);
  openPlan(plan);
}

function closeReader() {
  turning = false;
  $("reader").hidden = true;
  $("library").hidden = false;
  pages = [];
  $("book").replaceChildren();
}

function fillShelf() {
  for (const [label, pal] of SHELF) {
    const n = select(parse(label, catalog), catalog).length;
    if (!n) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "spine";
    b.dataset.palette = pal;
    b.style.height = `${250 + Math.min(n, 40) * 3}px`;
    b.innerHTML = `<span class="spine-title">${label}</span><span class="spine-count">${n}</span>`;
    b.addEventListener("click", () => openBook(label));
    $("shelf").append(b);
  }
}

function fromHash() {
  let phrase = "";
  try {
    phrase = decodeURIComponent(location.hash.slice(1));
  } catch {
    // A mangled link should land on the shelf, not break the page.
  }
  if (phrase) openBook(phrase);
  else closeReader();
}

async function main() {
  catalog = await (await fetch("data/catalog.json", { cache: "no-cache" })).json();
  fillShelf();
  $("search").addEventListener("submit", (e) => {
    e.preventDefault();
    const phrase = $("q").value.trim();
    if (phrase) openBook(phrase);
  });
  $("close").addEventListener("click", () => history.pushState(null, "", location.pathname) || closeReader());
  $("next").addEventListener("click", () => turn(1));
  $("prev").addEventListener("click", () => turn(-1));
  addEventListener("keydown", (e) => {
    if ($("reader").hidden) return;
    if (e.key === "ArrowRight") turn(1);
    if (e.key === "ArrowLeft") turn(-1);
    if (e.key === "Escape") $("close").click();
  });
  addEventListener("popstate", fromHash);
  matchMedia("(max-width: 900px)").addEventListener("change", layout);
  addEventListener("resize", () => !turning && !phone() && pages.length && fitText($("book")));
  document.fonts?.ready.then(() => pages.length && !phone() && fitText($("book")));
  fromHash();
}

main();
