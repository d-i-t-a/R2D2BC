/*
 * Copyright 2018-2021 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Developed on behalf of: DITA
 * Licensed to: Allvit under one or more contributor license agreements.
 */

import { Publication } from "../../model/v3";
import { NavigatorFeature } from "../../navigator/VisualNavigator";
import { EpubModuleHost } from "../ModuleHost";
import { ReaderModule, HostType, RightsKey } from "../ReaderModule";
import { TextHighlighter } from "../highlight/TextHighlighter";
import log from "loglevel";
import { ReaderEvent } from "../../utils/Events";

export enum CitationStyle {
  Chicago = 0,
  MLA = 1,
  APA = 2,
}

export enum ContributorType {
  Author = "Author",
  Editor = "Editor",
  Translator = "Translator",
  Compiler = "Compiler",
}

export interface CitationModuleProperties {
  characters?: number;
  appName?: string;
  appLink?: string;
  library?: string;
  styles?: string[];
  title?: string;
  author?: string;
  publisher?: string;
  published?: string;
}
export interface CitationModuleAPI {
  citationCreated: (message: string) => void;
  citationFailed: (message: string) => void;
}

export interface CitationModuleConfig extends CitationModuleProperties {
  publication: Publication;
  highlighter: TextHighlighter;
  api?: CitationModuleAPI;
}

/** Extract the display name from a Contributor (supports both @readium/shared and r2-shared-js). */
function contributorName(contributor: any): string {
  // @readium/shared uses lowercase `name`
  const n = contributor.name ?? contributor.Name;
  if (typeof n === "string") return n;
  if (n && typeof n === "object") {
    const vals = Object.values(n);
    return vals.length > 0 ? String(vals[0]) : "";
  }
  return "";
}

/**
 * Returns a [chicago, mla, apa] tuple or ["","",""] when nothing applies.
 * Every non-empty entry already includes trailing punctuation.
 */
type CitationTuple = [string, string, string];
const EMPTY: CitationTuple = ["", "", ""];

export default class CitationModule implements ReaderModule<EpubModuleHost> {
  readonly name = NavigatorFeature.Citations;
  readonly hostType = HostType.Epub;
  readonly rightsKey = RightsKey.Citations;
  private publication: Publication;
  private host!: EpubModuleHost;
  attach(host: EpubModuleHost): void {
    this.host = host;
  }
  private properties: CitationModuleProperties;
  private readonly highlighter?: TextHighlighter;
  api?: CitationModuleAPI;

  private constructor(
    publication: Publication,
    highlighter: TextHighlighter,
    properties: CitationModuleProperties,
    api?: CitationModuleAPI
  ) {
    this.highlighter = highlighter;
    this.properties = properties;
    this.publication = publication;
    this.api = api;
  }

  public static async create(config: CitationModuleConfig) {
    const module = new this(
      config.publication,
      config.highlighter,
      config as CitationModuleProperties,
      config.api
    );
    await module.start();
    return module;
  }

  async stop() {
    log.log("Citation module stop");
  }

  copyToClipboard(textToClipboard: string) {
    const cp = this.host?.getModule(NavigatorFeature.ContentProtection);
    if (cp) {
      cp.citation = true;
    }

    // Prefer the modern async Clipboard API
    if (navigator.clipboard) {
      // Strip HTML tags for plain-text clipboard write
      const tmp = document.createElement("div");
      tmp.innerHTML = textToClipboard;
      const plainText = tmp.textContent ?? tmp.innerText ?? textToClipboard;
      navigator.clipboard.writeText(plainText).then(
        () => {
          this.api?.citationCreated("The text was copied to the clipboard!");
          this.host.emit(
            ReaderEvent.CitationCreated,
            "The text was copied to the clipboard!"
          );
        },
        () => this.legacyCopyToClipboard(textToClipboard)
      );
    } else {
      this.legacyCopyToClipboard(textToClipboard);
    }
  }

  /** Fallback clipboard copy using deprecated execCommand — used when the
   *  Clipboard API is unavailable (e.g. non-secure context). */
  private legacyCopyToClipboard(textToClipboard: string) {
    const forExecElement = document.createElement("div");
    forExecElement.style.position = "absolute";
    forExecElement.style.left = "-10000px";
    forExecElement.style.top = "-10000px";
    forExecElement.innerHTML = textToClipboard;
    forExecElement.contentEditable = "true";
    document.body.appendChild(forExecElement);
    this.selectContent(forExecElement);
    let success: boolean;
    try {
      success = document.execCommand("copy");
    } catch (_e) {
      success = false;
    }
    document.body.removeChild(forExecElement);
    if (success) {
      this.api?.citationCreated("The text was copied to the clipboard!");
      this.host.emit(
        ReaderEvent.CitationCreated,
        "The text was copied to the clipboard!"
      );
    } else {
      this.api?.citationFailed("Your browser doesn't allow clipboard access!");
      this.host.emit(
        ReaderEvent.CitationFailed,
        "Your browser doesn't allow clipboard access!"
      );
    }
  }

  selectContent(element: HTMLElement) {
    const rangeToSelect = document.createRange();
    rangeToSelect.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(rangeToSelect);
  }

  // ── Citation formatters ──────────────────────────────────────────────
  // Each returns [chicago, mla, apa]. Non-empty entries include trailing
  // punctuation so the assembly can simply concatenate.

  private authorsFormatted(): CitationTuple {
    let chicago = "";
    let mla = "";
    let apa = "";

    if (this.properties.author) {
      chicago = this.properties.author;
      mla = this.properties.author;
      apa = this.properties.author;
    } else if ((this.publication.metadata?.authors?.items?.length ?? 0) > 0) {
      const authors = this.publication.metadata!.authors!.items;
      const names = authors
        .map((a: any) => contributorName(a))
        .filter((n) => n.length > 0);

      if (names.length === 1) {
        chicago = names[0];
        mla = names[0];
        apa = names[0];
      } else if (names.length === 2) {
        chicago = names[0] + " and " + names[1];
        mla = names[0] + ", and " + names[1];
        apa = names[0] + " & " + names[1];
      } else if (names.length > 2) {
        // Chicago: list all up to 6, then first 3 + et al.
        if (names.length <= 6) {
          chicago =
            names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
        } else {
          chicago = names.slice(0, 3).join(", ") + ", et al.";
        }
        // MLA 9th: first author + et al.
        mla = names[0] + ", et al.";
        // APA 7th: list all up to 20, use & before last
        if (names.length <= 20) {
          apa =
            names.slice(0, -1).join(", ") + ", & " + names[names.length - 1];
        } else {
          apa =
            names.slice(0, 19).join(", ") + ", ... " + names[names.length - 1];
        }
      }
    }

    if (chicago) {
      return [chicago + ". ", mla + ". ", apa + ". "];
    }
    return EMPTY;
  }

  private yearPublishedFormatted(): CitationTuple {
    let chicago = "";
    let mla = "";
    let apa = "";

    // Publisher name for Chicago/MLA (APA puts publisher in publisherFormatted)
    if (this.properties.publisher) {
      mla += this.properties.publisher;
      chicago += this.properties.publisher;
    } else if (
      (this.publication.metadata?.publishers?.items?.length ?? 0) > 0 &&
      contributorName(this.publication.metadata?.publishers?.items![0])
    ) {
      const name = contributorName(
        this.publication.metadata?.publishers?.items![0]
      );
      mla += name;
      chicago += name;
    }

    // Year
    let year = "";
    if (this.properties.published) {
      year = this.properties.published;
    } else if (this.publication.metadata?.published) {
      const y = this.publication.metadata?.published.getFullYear();
      if (y > 0) year = String(y);
    }

    if (year) {
      apa += "(" + year + ")";
      mla += (mla ? ", " : "") + year;
      chicago += (chicago ? ", " : "") + year;
    }

    if (apa || mla || chicago) {
      return [
        chicago ? chicago + ". " : "",
        mla ? mla + ". " : "",
        apa ? apa + ". " : "",
      ];
    }
    return EMPTY;
  }

  private bookTitleFormatted(): CitationTuple {
    const title =
      this.properties.title || this.publication.metadata?.title || "";
    if (title) {
      const formatted = "<em>" + title + "</em>. ";
      return [formatted, formatted, formatted];
    }
    return EMPTY;
  }

  private editionFormatted(): CitationTuple {
    // Edition/volume not exposed in r2-shared-js Metadata.
    // Could be passed via CitationModuleProperties in the future.
    return EMPTY;
  }

  private publisherFormatted(): CitationTuple {
    // Only APA uses this in the assembly — Chicago/MLA get publisher
    // via yearPublishedFormatted which combines "Publisher, Year".
    let name = "";

    if (this.properties.publisher) {
      name = this.properties.publisher;
    } else if (
      (this.publication.metadata?.publishers?.items?.length ?? 0) > 0 &&
      contributorName(this.publication.metadata?.publishers?.items![0])
    ) {
      name = contributorName(this.publication.metadata?.publishers?.items![0]);
    }

    if (name) {
      return ["", "", name + ". "];
    }
    return EMPTY;
  }

  private contributorsFormatted(): CitationTuple {
    const parts: string[] = [];

    const editors = this.publication.metadata?.editors?.items;
    if ((editors?.length ?? 0) > 0) {
      const names = editors!
        .map((e: any) => contributorName(e))
        .filter((n) => n.length > 0);
      if (names.length > 0) {
        parts.push(
          "Edited by " +
            (names.length <= 2
              ? names.join(" and ")
              : names.slice(0, -1).join(", ") +
                ", and " +
                names[names.length - 1])
        );
      }
    }

    const translators = this.publication.metadata?.translators?.items;
    if ((translators?.length ?? 0) > 0) {
      const names = translators!
        .map((t: any) => contributorName(t))
        .filter((n) => n.length > 0);
      if (names.length > 0) {
        parts.push(
          "Translated by " +
            (names.length <= 2
              ? names.join(" and ")
              : names.slice(0, -1).join(", ") +
                ", and " +
                names[names.length - 1])
        );
      }
    }

    if (parts.length > 0) {
      const formatted = parts.join(". ") + ". ";
      return [formatted, formatted, formatted];
    }
    return EMPTY;
  }

  private eBookVersionFormatted(): CitationTuple {
    if (this.publication.metadata?.modified) {
      const modified = this.publication.metadata?.modified;
      const version =
        modified.getFullYear() +
        "-" +
        String(modified.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(modified.getDate()).padStart(2, "0");
      return ["[" + version + "]. ", version + ". ", version + ". "];
    }
    return EMPTY;
  }

  private locationFormatted(): CitationTuple {
    // r2-shared-js Contributor doesn't expose city/state fields.
    return EMPTY;
  }

  private libraryFormatted(): CitationTuple {
    if (this.properties.library) {
      const formatted = "Retrieved from " + this.properties.library + ". ";
      return [formatted, formatted, formatted];
    }
    return EMPTY;
  }

  private appNameFormatted(): CitationTuple {
    if (this.properties.appName) {
      const formatted = this.properties.appName + ". ";
      return [formatted, formatted, formatted];
    }
    return EMPTY;
  }

  private appLinkFormatted(): CitationTuple {
    if (this.properties.appLink) {
      const formatted = this.properties.appLink + ". ";
      return [formatted, formatted, formatted];
    }
    return EMPTY;
  }

  private seriesFormatted(): CitationTuple {
    const series = this.publication.metadata?.belongsToSeries?.items;
    if (series && series.length > 0) {
      const name = contributorName(series[0]);
      if (name) {
        return [name + ". ", name + ". ", name + ". "];
      }
    }
    return EMPTY;
  }

  private selectedText(text: string, length: number): string {
    return text.length > length ? text.substring(0, length) + "..." : text;
  }

  // ── Assembly ─────────────────────────────────────────────────────────

  private buildCitation(selection: string): string {
    const authors = this.authorsFormatted();
    const year = this.yearPublishedFormatted();
    const title = this.bookTitleFormatted();
    const edition = this.editionFormatted();
    const publisher = this.publisherFormatted();
    const contributors = this.contributorsFormatted();
    const version = this.eBookVersionFormatted();
    const location = this.locationFormatted();
    const library = this.libraryFormatted();
    const appName = this.appNameFormatted();
    const appLink = this.appLinkFormatted();
    const series = this.seriesFormatted();

    const C = CitationStyle.Chicago;
    const M = CitationStyle.MLA;
    const A = CitationStyle.APA;

    const chicago =
      authors[C] +
      title[C] +
      contributors[C] +
      edition[C] +
      location[C] +
      year[C] +
      version[C] +
      library[C] +
      appName[C] +
      appLink[C];

    const apa =
      authors[A] +
      year[A] +
      title[A] +
      edition[A] +
      publisher[A] +
      contributors[A] +
      version[A] +
      location[A] +
      library[A] +
      appName[A] +
      appLink[A];

    const mla =
      authors[M] +
      title[M] +
      contributors[M] +
      edition[M] +
      location[M] +
      year[M] +
      series[M] +
      library[M] +
      appName[M] +
      appLink[M];

    const maxLen = this.properties.characters ?? 200;
    const quote = "\u201C" + this.selectedText(selection, maxLen) + "\u201D";

    let citation = "";

    if (
      this.properties.styles?.includes(CitationStyle[CitationStyle.Chicago])
    ) {
      if (this.properties.styles.length > 1) {
        citation += "Chicago: <br>";
      }
      citation += quote + "<br><br>" + chicago + "<br><br>";
    }
    if (this.properties.styles?.includes(CitationStyle[CitationStyle.APA])) {
      if (this.properties.styles.length > 1) {
        citation += "APA: <br>";
      }
      citation += quote + "<br><br>" + apa + "<br><br>";
    }
    if (this.properties.styles?.includes(CitationStyle[CitationStyle.MLA])) {
      if (this.properties.styles.length > 1) {
        citation += "MLA: <br>";
      }
      citation += quote + "<br><br>" + mla + "<br><br>";
    }

    return citation;
  }

  protected async start(): Promise<void> {
    const self = this;

    const citationIconMenu = {
      id: "citationIcon",
      callback: function (selection: string) {
        const citation = self.buildCitation(selection);
        self.copyToClipboard(citation);
      },
    };

    this.highlighter?.addSelectionMenuItem(citationIconMenu);
  }
}
