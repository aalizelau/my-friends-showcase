import test from "node:test";
import assert from "node:assert/strict";
import { setLang } from "../i18n.js";
import { localizeFriend } from "../locale-content.mjs";

const friend = {
  id: "1",
  profile: {
    sources: [
      {
        id: "current",
        label: "中文標題",
        labelEn: "English title",
        text: "中文原文",
        textEn: "English note"
      },
      {
        id: "legacy",
        label: "舊標題 · labelEn: Legacy title",
        text: "舊中文\n\n===en===\n\nLegacy English"
      }
    ]
  }
};

test("source notes show only Chinese in the Chinese locale", () => {
  setLang("zh");
  const sources = localizeFriend(friend).profile.sources;
  assert.deepEqual(sources.map(({ label, text }) => ({ label, text })), [
    { label: "中文標題", text: "中文原文" },
    { label: "舊標題", text: "舊中文" }
  ]);
  assert.doesNotMatch(JSON.stringify(sources.map(({ label, text }) => ({ label, text }))), /===en===|English note|Legacy English/);
});

test("source notes show only English in the English locale", () => {
  setLang("en");
  const sources = localizeFriend(friend).profile.sources;
  assert.deepEqual(sources.map(({ label, text }) => ({ label, text })), [
    { label: "English title", text: "English note" },
    { label: "Legacy title", text: "Legacy English" }
  ]);
  assert.doesNotMatch(JSON.stringify(sources.map(({ label, text }) => ({ label, text }))), /===en===|中文原文|舊中文/);
});
