import { Publication } from "../model/v3/Publication";

export type ScriptMode =
  | "ltr"
  | "rtl"
  | "cjk-horizontal"
  | "cjk-vertical"
  | "mongolian-vertical";

const RTL_LANGUAGES = new Set([
  "ar",
  "fa",
  "he",
  "ur",
  "yi",
  "ji",
  "iw",
  "ckb",
  "ps",
  "sd",
  "ug",
]);

const CJK_LANGUAGES = new Set(["zh", "ja", "ko"]);

const MONGOLIAN_VERTICAL_LANGUAGES = new Set(["mn-mong", "mn-cyrl-mong"]);

function primaryLanguage(languages: string[] | undefined): string | undefined {
  if (!languages || languages.length === 0) return undefined;
  return languages[0]?.toLowerCase();
}

function languageSubtag(language: string | undefined): string | undefined {
  if (!language) return undefined;
  return language.split("-")[0];
}

function isMongolianVertical(language: string | undefined): boolean {
  if (!language) return false;
  if (MONGOLIAN_VERTICAL_LANGUAGES.has(language)) return true;
  return language.startsWith("mn-") && language.includes("mong");
}

function isCjk(language: string | undefined): boolean {
  const subtag = languageSubtag(language);
  return subtag !== undefined && CJK_LANGUAGES.has(subtag);
}

function isRtlLanguage(language: string | undefined): boolean {
  const subtag = languageSubtag(language);
  return subtag !== undefined && RTL_LANGUAGES.has(subtag);
}

export function getScriptMode(publication: Publication): ScriptMode {
  const language = primaryLanguage(publication.publicationLanguages);
  const readingProgression = publication.publicationReadingProgression;

  if (isMongolianVertical(language)) return "mongolian-vertical";

  if (isCjk(language)) {
    if (readingProgression === "ttb" || readingProgression === "rtl") {
      return "cjk-vertical";
    }
    return "cjk-horizontal";
  }

  if (readingProgression === "rtl" || isRtlLanguage(language)) return "rtl";

  return "ltr";
}
