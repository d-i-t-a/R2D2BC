import { createApp } from "vue";
import ReaderComponent from "./ReaderComponent.vue";
import readiumBefore from "url:../../viewer/readium-css-v2/ReadiumCSS-before.css";
import readiumAfter from "url:../../viewer/readium-css-v2/ReadiumCSS-after.css";
import readiumDefault from "url:../../viewer/readium-css-v2/ReadiumCSS-default.css";
import readiumDitaPatch from "url:../../viewer/readium-css-v2/ReadiumCSS-dita-patch.css";
import cjkBefore from "url:../../viewer/readium-css-v2/cjk-horizontal/ReadiumCSS-before.css";
import cjkAfter from "url:../../viewer/readium-css-v2/cjk-horizontal/ReadiumCSS-after.css";
import cjkDefault from "url:../../viewer/readium-css-v2/cjk-horizontal/ReadiumCSS-default.css";

const CJK_LANG_RE = /^(ja|zh|ko)(\b|-)/i;
const isCJK = (pub) => {
  const langs = pub?.metadata?.languages;
  return Array.isArray(langs) && langs.some((l) => CJK_LANG_RE.test(l ?? ""));
};

const app = createApp(ReaderComponent, {
  injectables: [
    {
      type: "style",
      url: readiumBefore,
      r2before: true,
      when: (ctx) => !isCJK(ctx.publication),
    },
    {
      type: "style",
      url: readiumDefault,
      r2default: true,
      when: (ctx) => !isCJK(ctx.publication),
    },
    {
      type: "style",
      url: readiumAfter,
      r2after: true,
      when: (ctx) => !isCJK(ctx.publication),
    },
    {
      type: "style",
      url: cjkBefore,
      r2before: true,
      when: (ctx) => isCJK(ctx.publication),
    },
    {
      type: "style",
      url: cjkDefault,
      r2default: true,
      when: (ctx) => isCJK(ctx.publication),
    },
    {
      type: "style",
      url: cjkAfter,
      r2after: true,
      when: (ctx) => isCJK(ctx.publication),
    },
    { type: "style", url: readiumDitaPatch },
  ],
});
app.mount("#app");
