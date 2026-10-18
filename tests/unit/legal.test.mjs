import test from "node:test";
import assert from "node:assert/strict";
import { legalDoc } from "../../src/features/legal/content.ts";
import { exportFileName } from "../../src/features/privacy/exportFile.ts";
import en from "../../src/i18n/locales/en.json" with { type: "json" };
import ta from "../../src/i18n/locales/ta.json" with { type: "json" };

test("privacy and terms exist in English and Tamil with matching structure", () => {
  for (const kind of ["privacy", "terms"]) {
    const a = legalDoc(kind, "en"), b = legalDoc(kind, "ta");
    assert.equal(a.sections.length, b.sections.length, kind);
    a.sections.forEach((s, i) => assert.equal(s.p.length, b.sections[i].p.length, `${kind} §${i}`));
    assert.match(a.updated, /draft/); assert.match(b.updated, /வரைவு/);
    assert.ok(!JSON.stringify(b).match(/[a-z]{12,}/), "no long untranslated English in Tamil");
  }
});
test("the policy states the agreed retention decisions", () => {
  const p = JSON.stringify(legalDoc("privacy", "en"));
  assert.match(p, /deleted after 30 days/); assert.match(p, /Mumbai/); assert.match(p, /Data Protection Board/);
});
test("export file name is dated", () => {
  assert.equal(exportFileName(new Date(2026, 9, 5)), "meiyiyal-my-data-2026-10-05.json");
});
test("privacy/legal i18n keys match between languages", () => {
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => typeof v === "object" ? keys(v, p + k + ".") : [p + k]);
  for (const ns of ["legal", "privacy"]) assert.deepEqual(keys(en[ns]).sort(), keys(ta[ns]).sort(), ns);
});
