import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kmLabel, norm, suggest } from "../../src/features/nearby/match.ts";

// taxonomy as the app loads it: names from the seed + synonyms from the agent's DB snapshot
const lex = JSON.parse(readFileSync(new URL("../../services/agent/tests/fixtures/lexicon.json", import.meta.url), "utf-8"));
const kindOf = (slug) => ["group", "category", "subcategory", "specialty"][slug.split("--").length - 1] ?? "specialty";
const nodes = lex.nodes.map((n) => ({ slug: n.slug, parent: n.parent_slug, kind: kindOf(n.slug), name: n.name_i18n, synonyms: n.synonyms ?? [] }));
const top = (q) => suggest(q, nodes)[0]?.slug;

test("typing shows the right professional instantly (EN, Tamil, Tanglish)", () => {
  assert.equal(top("my dog is sick"), "professionals--doctor--veterinary--pet-small-animal");
  assert.equal(top("wall crack"), "professionals--engineer--civil--structural");
  assert.equal(top("divorce"), "professionals--lawyer--family-divorce");
  assert.equal(top("என் நாய்க்கு உடம்பு சரியில்லை"), "professionals--doctor--veterinary--pet-small-animal");
  assert.equal(top("சுவர் விரிசல்"), "professionals--engineer--civil--structural");
  assert.equal(top("naai"), "professionals--doctor--veterinary--pet-small-animal");
  assert.equal(top("cardio"), "professionals--doctor--allopathy--cardiology");
});

test("prefix typing narrows as you type", () => {
  const s = suggest("law", nodes).map((x) => x.slug);
  assert.ok(s.includes("professionals--lawyer"), s.join());
  assert.ok(suggest("l", nodes).length === 0, "one letter is too little");
});

test("never suggests the root group and returns at most the limit", () => {
  const s = suggest("doctor", nodes, 4);
  assert.ok(s.length <= 4 && !s.some((x) => x.slug === "professionals"));
});

test("synonym hits say which word matched", () => {
  const s = suggest("patta", nodes)[0];
  assert.equal(s.slug, "professionals--lawyer--property-land");
  assert.equal(s.via, "patta");
});

test("distance is private: under 1 km or whole km", () => {
  assert.equal(kmLabel(0, "en"), "< 1 km");
  assert.equal(kmLabel(0.4, "en"), "< 1 km");
  assert.equal(kmLabel(16, "en"), "16 km");
  assert.equal(kmLabel(15.8, "en"), "16 km");
  assert.equal(kmLabel(0, "ta"), "1 கி.மீ.க்குள்");
  assert.equal(kmLabel(null, "en"), "");
});

test("normalises punctuation and case", () => {
  assert.equal(norm("  Family & Divorce!! "), "family divorce");
});
