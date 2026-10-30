import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultLocale,
  isLocale,
  sectionHref,
} from "../../src/lib/i18n/config";
import { getDictionary } from "../../src/lib/i18n/dictionaries";

test("Spanish is default and unsupported/prototype locale names are rejected", () => {
  assert.equal(defaultLocale, "es");
  assert.ok(isLocale("es") && isLocale("en"));
  for (const value of ["fr", "ES", "constructor", "__proto__", ""])
    assert.equal(isLocale(value), false);
});

test("navigation constructs all six localized shell paths", () => {
  assert.deepEqual(
    [
      sectionHref("es", "public"),
      sectionHref("es", "hq"),
      sectionHref("es", "streamer"),
      sectionHref("en", "public"),
      sectionHref("en", "hq"),
      sectionHref("en", "streamer"),
    ],
    ["/es", "/es/hq", "/es/streamer", "/en", "/en/hq", "/en/streamer"],
  );
});

function textEntries(value: unknown, path = ""): string[] {
  if (typeof value === "string") {
    assert.ok(value.trim().length > 0, `Empty translation at ${path}`);
    return [path];
  }
  assert.ok(
    value && typeof value === "object",
    `Unexpected translation value at ${path}`,
  );
  return Object.entries(value).flatMap(([key, child]) =>
    textEntries(child, `${path}.${key}`),
  );
}

test("both dictionaries have matching, nonempty content including accessible labels", () => {
  assert.deepEqual(
    textEntries(getDictionary("es")),
    textEntries(getDictionary("en")),
  );
  assert.equal(getDictionary("es").skipLink, "Saltar al contenido");
  assert.equal(getDictionary("en").skipLink, "Skip to content");
});
