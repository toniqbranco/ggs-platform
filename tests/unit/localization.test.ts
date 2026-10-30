import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultLocale,
  isLocale,
  sectionHref,
} from "../../src/lib/i18n/config";
import { getDictionary } from "../../src/lib/i18n/dictionaries";
import { getPilotCopy } from "../../src/lib/i18n/pilot";
import { getAuthCopy } from "../../src/lib/i18n/auth";
import { pilotPageHref } from "../../src/lib/i18n/config";

test("Spanish is default and unsupported/prototype locale names are rejected", () => {
  assert.equal(defaultLocale, "es");
  assert.ok(isLocale("es") && isLocale("en"));
  for (const value of ["fr", "ES", "constructor", "__proto__", ""])
    assert.equal(isLocale(value), false);
});

test("navigation constructs public localized shell paths", () => {
  assert.deepEqual(
    [
      sectionHref("es", "public"),
      sectionHref("es", "streamer"),
      sectionHref("en", "public"),
      sectionHref("en", "streamer"),
    ],
    ["/es", "/es/streamer", "/en", "/en/streamer"],
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

test("pilot translations are complete and information links preserve locale", () => {
  assert.deepEqual(
    textEntries(getAuthCopy("es")),
    textEntries(getAuthCopy("en")),
  );
  assert.deepEqual(
    textEntries(getPilotCopy("es", true)),
    textEntries(getPilotCopy("en", true)),
  );
  assert.deepEqual(
    textEntries(getPilotCopy("es")),
    textEntries(getPilotCopy("en")),
  );
  assert.deepEqual(
    [
      pilotPageHref("es", "information"),
      pilotPageHref("es", "denied"),
      pilotPageHref("en", "information"),
      pilotPageHref("en", "denied"),
    ],
    ["/es/pilot", "/es/access-denied", "/en/pilot", "/en/access-denied"],
  );
});
