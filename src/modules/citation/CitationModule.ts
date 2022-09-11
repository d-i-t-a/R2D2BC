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

import { Publication } from "../../model/Publication";
import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import { ReaderModule } from "../ReaderModule";
import { TextHighlighter } from "../highlight/TextHighlighter";
import log from "loglevel";

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
}
export interface CitationModuleAPI {
  citationCreated: any;
  citationFailed: any;
}

export interface CitationModuleConfig extends CitationModuleProperties {
  publication: Publication;
  delegate: IFrameNavigator;
  highlighter: TextHighlighter;
  api?: CitationModuleAPI;
}

export default class CitationModule implements ReaderModule {
  private publication: Publication;
  private delegate: IFrameNavigator;
  private properties: CitationModuleProperties;
  private readonly highlighter?: TextHighlighter;
  api?: CitationModuleAPI;

  private constructor(
    delegate: IFrameNavigator,
    publication: Publication,
    highlighter: TextHighlighter,
    properties: CitationModuleProperties,
    api?: CitationModuleAPI
  ) {
    this.highlighter = highlighter;
    this.delegate = delegate;
    this.properties = properties;
    this.publication = publication;
    this.api = api;
  }

  public static async create(config: CitationModuleConfig) {
    const module = new this(
      config.delegate,
      config.publication,
      config.highlighter,
      config as CitationModuleProperties,
      config.api
    );
    await module.start();
    return module;
  }

  async stop() {
    log.log("Timeline module stop");
  }

  copyToClipboard(textToClipboard) {
    let success = true;
    // @ts-ignore
    if (window.clipboardData) {
      // Internet Explorer
      // @ts-ignore
      window.clipboardData.setData("text/plain", textToClipboard);
    } else {
      // create a temporary element for the execCommand method
      const forExecElement = this.createElementForExecCommand(textToClipboard);

      /* Select the contents of the element
          (the execCommand for 'copy' method works on the selection) */
      this.selectContent(forExecElement);

      // UniversalXPConnect privilege is required for clipboard access in Firefox
      try {
        // @ts-ignore
        if (window.netscape && netscape.security) {
          // @ts-ignore
          netscape.security.PrivilegeManager.enablePrivilege(
            "UniversalXPConnect"
          );
        }

        // Copy the selected content to the clipboard
        // Works in Firefox and in Safari before version 5
        success = document.execCommand("copy", false);
      } catch (e) {
        success = false;
      }

      // remove the temporary element
      document.body.removeChild(forExecElement);
    }

    if (success) {
      this.api?.citationCreated("The text was copied to the clipboard!");
    } else {
      this.api?.citationFailed("Your browser doesn't allow clipboard access!");
    }
  }

  createElementForExecCommand(textToClipboard) {
    const forExecElement = document.createElement("div");
    // place outside the visible area
    forExecElement.style.position = "absolute";
    forExecElement.style.left = "-10000px";
    forExecElement.style.top = "-10000px";
    // write the necessary text into the element and append to the document
    forExecElement.innerHTML = textToClipboard;
    document.body.appendChild(forExecElement);
    // the contentEditable mode is necessary for the  execCommand method in Firefox
    // @ts-ignore
    forExecElement.contentEditable = true;
    return forExecElement;
  }

  selectContent(element) {
    // first create a range
    const rangeToSelect = document.createRange();
    rangeToSelect.selectNodeContents(element);
    // select the contents
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(rangeToSelect);
  }

  protected async start(): Promise<void> {
    this.delegate.citationModule = this;
    const self = this;

    const citationIconMenu = {
      id: "citationIcon",
      callback: function (selection: string) {
        let authorsFormatted = function () {
          let chicagoString = "";
          let mlaString = "";
          let apaString = "";

          if (self.publication.Metadata.Author?.length > 0) {
            // var numAuthors = self.publication.Metadata.Author.length;
            let authorIndex = 0;

            if (authorIndex === 0) {
              if (self.publication.Metadata.Author[0].Name) {
                if (self.publication.Metadata.Author[0].Name.length > 0) {
                  apaString =
                    apaString + self.publication.Metadata.Author[0].Name;
                  mlaString =
                    mlaString + self.publication.Metadata.Author[0].Name;
                  chicagoString =
                    chicagoString + self.publication.Metadata.Author[0].Name;
                }
              }
            }
          }
          // TODO finalize this.
          if (
            apaString.length > 0 &&
            mlaString.length > 0 &&
            chicagoString.length > 0
          ) {
            return [chicagoString + ". ", mlaString + ". ", apaString + ". "];
          }
          return ["", "", ""];
        };
        let yearPublishedFormatted = function () {
          let chicagoString = "";
          let mlaString = "";
          let apaString = "";

          if (
            self.publication.Metadata.Publisher &&
            self.publication.Metadata.Publisher[0].Name
          ) {
            mlaString =
              mlaString + self.publication.Metadata.Publisher[0].Name + ", ";
            chicagoString =
              chicagoString +
              self.publication.Metadata.Publisher[0].Name +
              ", ";
          }

          if (self.publication.Metadata.PublicationDate) {
            if (self.publication.Metadata.PublicationDate.getFullYear() > 0) {
              apaString =
                apaString +
                "(" +
                self.publication.Metadata.PublicationDate.getFullYear() +
                ")";
              mlaString =
                mlaString +
                self.publication.Metadata.PublicationDate.getFullYear();
              chicagoString =
                chicagoString +
                self.publication.Metadata.PublicationDate.getFullYear();
            }
          }

          if (
            apaString.length > 0 &&
            mlaString.length > 0 &&
            chicagoString.length > 0
          ) {
            return [chicagoString + ". ", mlaString + ". ", apaString + ". "];
          }
          return ["", "", ""];
        };
        let bookTitleFormatted = function () {
          if (self.publication.Metadata.Title) {
            return [
              self.publication.Metadata.Title + ". ",
              self.publication.Metadata.Title + ". ",
              self.publication.Metadata.Title + ". ",
            ];
          } else {
            return ["", "", ""];
          }
        };
        let editionFormatted = function () {
          // var apaString:String = String()
          // var chicagoString:String = String()
          // var mlaString:String = String()
          // if let edition = self.edition {
          //
          //   if let ed = Int(edition) {
          //     apaString.append("(")
          //     apaString.append("\(ed.ordinal) ed.")
          //     mlaString.append("\(ed.ordinal) ed.")
          //     chicagoString.append("\(ed.ordinal) ed.")
          //   }
          //   if (self.edition != nil && self.volume != nil) {
          //     apaString.append(" ")
          //   }
          //   if let volume = self.volume {
          //     // comma needs to be moved from here
          //     apaString.append("Vol. \(volume)")
          //     mlaString.append("Vol. \(volume). ")
          //     chicagoString.append("Vol. \(volume). ")
          //   }
          //   if (self.volume != nil && self.series != nil) {
          //     apaString.append(", ")
          //   }
          //   apaString.append(seriesFormatted.apa)
          //   apaString.append(")")
          //   chicagoString.append(seriesFormatted.chicago)
          //
          // }
          // if !apaString.isEmpty && !mlaString.isEmpty && !chicagoString.isEmpty {
          //   return ("\(apaString) ", "\(chicagoString) ", "\(mlaString) ")
          // }
          return ["", "", ""];
        };
        let publisherFormatted = function () {
          let chicagoString = "";
          let mlaString = "";
          let apaString = "";

          if (
            self.publication.Metadata.Publisher &&
            self.publication.Metadata.Publisher[0].Name
          ) {
            mlaString =
              mlaString + self.publication.Metadata.Publisher[0].Name + ", ";
            chicagoString =
              chicagoString +
              self.publication.Metadata.Publisher[0].Name +
              ", ";
            apaString =
              apaString + self.publication.Metadata.Publisher[0].Name + ", ";
          }

          if (
            apaString.length > 0 &&
            mlaString.length > 0 &&
            chicagoString.length > 0
          ) {
            return [chicagoString + ". ", mlaString + ". ", apaString + ". "];
          }
          return ["", "", ""];
        };
        let contributorsFormatted = function () {
          return ["", "", ""];
        };
        let eBookVersionFormatted = function () {
          // if let eBookVersion = self.eBookVersion {
          //   return ("[\(eBookVersion)]. ","\(eBookVersion)","\(eBookVersion)")
          // }
          // return ("","","")
          return ["", "", ""];
        };
        let locationFormatted = function () {
          // if let city = self.publisher?.city,
          //   let state = self.publisher?.state  {
          //   return ("\(city), State: \(state). ", "\(city), State: \(state), ", "\(city): \(state), ")
          // }
          return ["", "", ""];
        };
        let libraryFormatted = function () {
          if (self.properties.library) {
            return [
              "Retrieved from " + self.properties.library + ". ",
              "Retrieved from " + self.properties.library + ". ",
              "Retrieved from " + self.properties.library + ". ",
            ];
          }
          return ["", "", ""];
        };
        let appNameFormatted = function () {
          if (self.properties.appName) {
            return [
              self.properties.appName + ". ",
              self.properties.appName + ". ",
              self.properties.appName + ". ",
            ];
          }
          return ["", "", ""];
        };
        let appLinkFormatted = function () {
          if (self.properties.appLink) {
            return [
              self.properties.appLink + ". ",
              self.properties.appLink + ". ",
              self.properties.appLink + ". ",
            ];
          }
          return ["", "", ""];
        };
        let seriesFormatted = function () {
          // if let series = self.series {
          //   return ("\(series)","\(series). ","\(series). ")
          // }
          return ["", "", ""];
        };

        let selectedText = function (string, length) {
          return string.length > length
            ? string.substring(0, length) + "..."
            : string;
        };

        const chicago =
          authorsFormatted()[CitationStyle.Chicago] +
          bookTitleFormatted()[CitationStyle.Chicago] +
          contributorsFormatted()[CitationStyle.Chicago] +
          editionFormatted()[CitationStyle.Chicago] +
          locationFormatted()[CitationStyle.Chicago] +
          yearPublishedFormatted()[CitationStyle.Chicago] +
          eBookVersionFormatted()[CitationStyle.Chicago] +
          libraryFormatted()[CitationStyle.Chicago] +
          appNameFormatted()[CitationStyle.Chicago] +
          appLinkFormatted()[CitationStyle.Chicago];

        const apa =
          authorsFormatted()[CitationStyle.APA] +
          yearPublishedFormatted()[CitationStyle.APA] +
          bookTitleFormatted()[CitationStyle.APA] +
          editionFormatted()[CitationStyle.APA] +
          publisherFormatted()[CitationStyle.APA] +
          contributorsFormatted()[CitationStyle.APA] +
          eBookVersionFormatted()[CitationStyle.APA] +
          locationFormatted()[CitationStyle.APA] +
          libraryFormatted()[CitationStyle.APA] +
          appNameFormatted()[CitationStyle.APA] +
          appLinkFormatted()[CitationStyle.APA];

        const mla =
          authorsFormatted()[CitationStyle.MLA] +
          bookTitleFormatted()[CitationStyle.MLA] +
          contributorsFormatted()[CitationStyle.MLA] +
          editionFormatted()[CitationStyle.MLA] +
          locationFormatted()[CitationStyle.MLA] +
          yearPublishedFormatted()[CitationStyle.MLA] +
          seriesFormatted()[CitationStyle.MLA] +
          libraryFormatted()[CitationStyle.MLA] +
          appNameFormatted()[CitationStyle.MLA] +
          appLinkFormatted()[CitationStyle.MLA];

        const citationChicago =
          "“" +
          selectedText(selection, self.properties.characters) +
          "“" +
          "<br><br>" +
          "<em>" +
          chicago +
          "</em>";

        const citationApa =
          "“" +
          selectedText(selection, self.properties.characters) +
          "“" +
          "<br><br>" +
          "<em>" +
          apa +
          "</em>";

        const citationMla =
          "“" +
          selectedText(selection, self.properties.characters) +
          "“" +
          "<br><br>" +
          "<em>" +
          mla +
          "</em>";

        let citation = "";

        if (
          self.properties.styles?.includes(CitationStyle[CitationStyle.Chicago])
        ) {
          citation = citation + "Chicago: <br>" + citationChicago + "<br><br>";
        }
        if (
          self.properties.styles?.includes(CitationStyle[CitationStyle.APA])
        ) {
          citation = citation + "APA: <br>" + citationApa + "<br><br>";
        }
        if (
          self.properties.styles?.includes(CitationStyle[CitationStyle.MLA])
        ) {
          citation = citation + "MLA: <br>" + citationMla + "<br><br>";
        }

        self.copyToClipboard(citation);
      },
    };

    this.highlighter?.addSelectionMenuItem(citationIconMenu);
  }
}
