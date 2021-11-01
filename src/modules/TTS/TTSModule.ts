/*
 * Copyright 2018-2020 DITA (AM Consulting LLC)
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
 * Developed on behalf of: CAST (http://www.cast.org) and DITA
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

import ReaderModule from "../ReaderModule";
import { IS_DEV } from "../../utils";
import {
  TTSModuleAPI,
  TTSModuleConfig,
  TTSModuleProperties,
  TTSSettings,
} from "./TTSSettings";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../../utils/EventHandler";
import * as sanitize from "sanitize-html";
import IFrameNavigator, { ReaderRights } from "../../navigator/IFrameNavigator";
import TextHighlighter from "../highlight/TextHighlighter";
import { ISelectionInfo } from "../highlight/common/selection";

export default class TTSModule implements ReaderModule {
  private tts: TTSSettings;
  private splittingResult: any[];
  private voices: SpeechSynthesisVoice[] = [];
  private clean: any;
  private rights: ReaderRights;
  private readonly highlighter: TextHighlighter;
  private delegate: IFrameNavigator;
  private body: any;
  private hasEventListener: boolean = false;
  private readonly headerMenu: HTMLElement;
  // @ts-ignore
  private readonly properties: TTSModuleProperties;
  private readonly api: TTSModuleAPI;

  initialize(body: any) {
    if (this.highlighter !== undefined) {
      this.tts.setControls();
      this.tts.onSettingsChange(this.handleResize.bind(this));
      this.body = body;
      this.clean = sanitize(this.body.innerHTML, {
        allowedTags: [],
        allowedAttributes: {},
      });

      let splittingResult = body.querySelectorAll("[data-word]");
      splittingResult.forEach((splittingWord) => {
        splittingWord.dataset.ttsColor = this.tts.color;
      });
      let whitespace = body.querySelectorAll("[data-whitespace]");
      whitespace.forEach((splittingWord) => {
        splittingWord.dataset.ttsColor = this.tts.color;
      });
      window.speechSynthesis.getVoices();
      this.initVoices(true);

      if (!this.hasEventListener) {
        this.hasEventListener = true;
        addEventListenerOptional(document, "wheel", this.wheel.bind(this));
        addEventListenerOptional(this.body, "wheel", this.wheel.bind(this));
        addEventListenerOptional(document, "keydown", this.wheel.bind(this));
        addEventListenerOptional(
          this.delegate.iframes[0].contentDocument,
          "keydown",
          this.wheel.bind(this)
        );
      }
    }
  }

  private initVoices(first: boolean) {
    function setSpeech() {
      return new Promise(function (resolve, _reject) {
        let synth = window.speechSynthesis;
        let id;

        id = setInterval(() => {
          if (synth.getVoices().length !== 0) {
            resolve(synth.getVoices());
            clearInterval(id);
          }
        }, 10);
      });
    }

    let s = setSpeech();
    s.then(async (voices: SpeechSynthesisVoice[]) => {
      if (IS_DEV) console.log(voices);
      this.voices = [];
      voices.forEach((voice) => {
        if (voice.localService === true) {
          this.voices.push(voice);
        }
      });
      if (IS_DEV) console.log(this.voices);
      if (first) {
        // preferred-languages
        if (this.headerMenu) {
          var preferredLanguageSelector = HTMLUtilities.findElement(
            this.headerMenu,
            "#preferred-languages"
          ) as HTMLSelectElement;
          if (preferredLanguageSelector) {
            this.voices.forEach((voice) => {
              var v = document.createElement("option") as HTMLOptionElement;
              v.value = voice.name + ":" + voice.lang;
              v.innerHTML = voice.name + " (" + voice.lang + ")";
              preferredLanguageSelector.add(v);
            });
          }
        }
      }
    });
  }

  cancel() {
    if (this.api?.stopped) this.api?.stopped();
    this.userScrolled = false;
    window.speechSynthesis.cancel();
    if (this.splittingResult && this.delegate.tts?.enableSplitter) {
      this.splittingResult.forEach((splittingWord) => {
        splittingWord.dataset.ttsCurrentWord = "false";
        splittingWord.dataset.ttsCurrentLine = "false";
      });
    }
  }

  private handleResize(): void {
    let splittingResult = this.body.querySelectorAll("[data-word]");
    splittingResult.forEach((splittingWord) => {
      splittingWord.dataset.ttsColor = this.tts.color;
      splittingWord.dataset.ttsCurrentWord = "false";
      splittingWord.dataset.ttsCurrentLine = "false";
    });
    let whitespace = this.body.querySelectorAll("[data-whitespace]");
    whitespace.forEach((splittingWord) => {
      splittingWord.dataset.ttsColor = this.tts.color;
      splittingWord.dataset.ttsCurrentWord = "false";
      splittingWord.dataset.ttsCurrentLine = "false";
    });
  }
  index = 0;

  async speak(
    selectionInfo: ISelectionInfo | undefined,
    partial: boolean,
    callback: () => void
  ): Promise<any> {
    if (this.api?.started) this.api?.started();

    var self = this;
    this.userScrolled = false;

    this.cancel();

    if (this.delegate.tts?.enableSplitter) {
      if (partial) {
        var allWords = self.body.querySelectorAll("[data-word]");

        var startNode = (selectionInfo as ISelectionInfo).range.startContainer
          .parentElement;
        if (startNode.tagName.toLowerCase() === "a") {
          startNode = startNode.parentElement as HTMLElement;
        }
        if (startNode.dataset === undefined) {
          startNode = startNode.nextElementSibling as HTMLElement;
        }

        var endNode = (selectionInfo as ISelectionInfo).range.endContainer
          .parentElement;
        if (endNode.tagName.toLowerCase() === "a") {
          endNode = endNode.parentElement as HTMLElement;
        }
        if (endNode.dataset === undefined) {
          endNode = endNode.previousElementSibling as HTMLElement;
        }

        var startWordIndex = parseInt(startNode.dataset.wordIndex);
        var endWordIndex = parseInt(endNode.dataset.wordIndex) + 1;

        let array = Array.from(allWords);
        this.splittingResult = array.slice(startWordIndex, endWordIndex);
      } else {
        document.scrollingElement.scrollTop = 0;
        this.splittingResult = self.body.querySelectorAll("[data-word]");
      }
    }
    const utterance = partial
      ? new SpeechSynthesisUtterance(selectionInfo.cleanText)
      : new SpeechSynthesisUtterance(this.clean);
    utterance.rate = this.tts.rate;
    utterance.pitch = this.tts.pitch;
    utterance.volume = this.tts.volume;

    if (IS_DEV) console.log("this.tts.voice.lang", this.tts.voice.lang);

    var initialVoiceHasHyphen = true;
    if (this.tts.voice && this.tts.voice.lang) {
      initialVoiceHasHyphen = this.tts.voice.lang.indexOf("-") !== -1;
      if (initialVoiceHasHyphen === false) {
        this.tts.voice.lang = this.tts.voice.lang.replace("_", "-");
        initialVoiceHasHyphen = true;
      }
    }
    if (IS_DEV) console.log("initialVoiceHasHyphen", initialVoiceHasHyphen);
    if (IS_DEV) console.log("voices", this.voices);
    var initialVoice;
    if (initialVoiceHasHyphen === true) {
      initialVoice =
        this.tts.voice && this.tts.voice.lang && this.tts.voice.name
          ? this.voices.filter((v: any) => {
              var lang = v.lang.replace("_", "-");
              return (
                lang === this.tts.voice.lang && v.name === this.tts.voice.name
              );
            })[0]
          : undefined;
      if (initialVoice === undefined) {
        initialVoice =
          this.tts.voice && this.tts.voice.lang
            ? this.voices.filter(
                (v: any) => v.lang.replace("_", "-") === this.tts.voice.lang
              )[0]
            : undefined;
      }
    } else {
      initialVoice =
        this.tts.voice && this.tts.voice.lang && this.tts.voice.name
          ? this.voices.filter((v: any) => {
              return (
                v.lang === this.tts.voice.lang && v.name === this.tts.voice.name
              );
            })[0]
          : undefined;
      if (initialVoice === undefined) {
        initialVoice =
          this.tts.voice && this.tts.voice.lang
            ? this.voices.filter((v: any) => v.lang === this.tts.voice.lang)[0]
            : undefined;
      }
    }
    if (IS_DEV) console.log("initialVoice", initialVoice);

    var publicationVoiceHasHyphen =
      self.delegate.publication.Metadata.Language[0].indexOf("-") !== -1;
    if (IS_DEV)
      console.log("publicationVoiceHasHyphen", publicationVoiceHasHyphen);
    var publicationVoice;
    if (publicationVoiceHasHyphen === true) {
      publicationVoice =
        this.tts.voice && this.tts.voice.usePublication
          ? this.voices.filter((v: any) => {
              var lang = v.lang.replace("_", "-");
              return (
                lang.startsWith(
                  self.delegate.publication.Metadata.Language[0]
                ) ||
                lang.endsWith(
                  self.delegate.publication.Metadata.Language[0].toUpperCase()
                )
              );
            })[0]
          : undefined;
    } else {
      publicationVoice =
        this.tts.voice && this.tts.voice.usePublication
          ? this.voices.filter((v: any) => {
              return (
                v.lang.startsWith(
                  self.delegate.publication.Metadata.Language[0]
                ) ||
                v.lang.endsWith(
                  self.delegate.publication.Metadata.Language[0].toUpperCase()
                )
              );
            })[0]
          : undefined;
    }
    if (IS_DEV) console.log("publicationVoice", publicationVoice);

    var defaultVoiceHasHyphen = navigator.language.indexOf("-") !== -1;
    if (IS_DEV) console.log("defaultVoiceHasHyphen", defaultVoiceHasHyphen);
    var defaultVoice;
    if (defaultVoiceHasHyphen === true) {
      defaultVoice = this.voices.filter((voice: SpeechSynthesisVoice) => {
        var lang = voice.lang.replace("_", "-");
        return lang === navigator.language && voice.localService === true;
      })[0];
    } else {
      defaultVoice = this.voices.filter((voice: SpeechSynthesisVoice) => {
        var lang = voice.lang;
        return lang === navigator.language && voice.localService === true;
      })[0];
    }
    if (defaultVoice === undefined) {
      defaultVoice = this.voices.filter((voice: SpeechSynthesisVoice) => {
        var lang = voice.lang;
        return lang.includes(navigator.language) && voice.localService === true;
      })[0];
    }
    if (IS_DEV) console.log("defaultVoice", defaultVoice);

    if (initialVoice) {
      if (IS_DEV) console.log("initialVoice");
      utterance.voice = initialVoice;
    } else if (publicationVoice) {
      if (IS_DEV) console.log("publicationVoice");
      utterance.voice = publicationVoice;
    } else if (defaultVoice) {
      if (IS_DEV) console.log("defaultVoice");
      utterance.voice = defaultVoice;
    }
    if (utterance.voice !== undefined && utterance.voice !== null) {
      utterance.lang = utterance.voice.lang;
      if (IS_DEV) console.log("utterance.voice.lang", utterance.voice.lang);
      if (IS_DEV) console.log("utterance.lang", utterance.lang);
    }
    if (IS_DEV) console.log("navigator.language", navigator.language);

    window.speechSynthesis.speak(utterance);

    this.index = 0;

    var lastword = undefined;

    utterance.onboundary = function (e: any) {
      if (e.name === "sentence") {
        if (IS_DEV)
          console.log(
            "sentence boundary",
            e.charIndex,
            e.charLength,
            utterance.text.slice(e.charIndex, e.charIndex + e.charLength)
          );
      }
      if (e.name === "word") {
        function getWordAt(str, pos) {
          // Perform type conversions.
          str = String(str);
          pos = Number(pos) >>> 0;

          // Search for the word's beginning and end.
          var left = str.slice(0, pos + 1).search(/\S+$/),
            right = str.slice(pos).search(/\s/);

          // The last word in the string is a special case.
          if (right < 0) {
            return str.slice(left);
          }

          // Return the word, using the located bounds to extract it from the string.
          return str.slice(left, right + pos);
        }
        const word = getWordAt(utterance.text, e.charIndex);
        if (lastword === word) {
          self.index--;
        }
        lastword = word;

        if (self.delegate.tts?.enableSplitter) {
          processWord(word);
        }
      }
    };

    async function processWord(word) {
      var spokenWordCleaned = word.replace(/[^a-zA-Z0-9 ]/g, "");
      if (IS_DEV) console.log("spokenWordCleaned", spokenWordCleaned);

      let splittingWord = self.splittingResult[self.index] as HTMLElement;
      var splittingWordCleaned = splittingWord?.dataset.word.replace(
        /[^a-zA-Z0-9 ]/g,
        ""
      );
      if (IS_DEV) console.log("splittingWordCleaned", splittingWordCleaned);

      if (splittingWordCleaned.length === 0) {
        self.index++;
        splittingWord = self.splittingResult[self.index] as HTMLElement;
        splittingWordCleaned = splittingWord?.dataset.word.replace(
          /[^a-zA-Z0-9 ]/g,
          ""
        );
        if (IS_DEV) console.log("splittingWordCleaned", splittingWordCleaned);
      }

      if (splittingWord) {
        var isAnchorParent =
          splittingWord.parentElement.tagName.toLowerCase() === "a";
        if (!isAnchorParent) {
          if (spokenWordCleaned.length > 0 && splittingWordCleaned.length > 0) {
            if (
              splittingWordCleaned.startsWith(spokenWordCleaned) ||
              splittingWordCleaned.endsWith(spokenWordCleaned) ||
              spokenWordCleaned.startsWith(splittingWordCleaned) ||
              spokenWordCleaned.endsWith(splittingWordCleaned)
            ) {
              if (self.index > 0) {
                let splittingResult = self.body.querySelectorAll("[data-word]");
                splittingResult.forEach((splittingWord) => {
                  splittingWord.dataset.ttsColor = self.tts.color;
                  splittingWord.dataset.ttsCurrentWord = "false";
                  splittingWord.dataset.ttsCurrentLine = "false";
                });
                let whitespace =
                  self.body.querySelectorAll("[data-whitespace]");
                whitespace.forEach((splittingWord) => {
                  splittingWord.dataset.ttsColor = self.tts.color;
                  splittingWord.dataset.ttsCurrentWord = "false";
                  splittingWord.dataset.ttsCurrentLine = "false";
                });
              }
              splittingWord.dataset.ttsCurrentWord = "true";
              if (
                self.delegate.view.isScrollMode() &&
                self.tts.autoScroll &&
                !self.userScrolled
              ) {
                splittingWord.scrollIntoView({
                  block: "center",
                  behavior: "smooth",
                });
              }
            } else {
              self.index++;
            }
          } else if (spokenWordCleaned.length === 0) {
            self.index--;
          }
        }
        self.index++;
      }
    }

    utterance.onend = function () {
      if (IS_DEV) console.log("utterance ended");
      self.highlighter.doneSpeaking();
      if (self.delegate.tts?.enableSplitter) {
        let splittingResult = self.body.querySelectorAll("[data-word]");
        splittingResult.forEach((splittingWord) => {
          splittingWord.dataset.ttsColor = self.tts.color;
          splittingWord.dataset.ttsCurrentWord = "false";
          splittingWord.dataset.ttsCurrentLine = "false";
        });
        let whitespace = self.body.querySelectorAll("[data-whitespace]");
        whitespace.forEach((splittingWord) => {
          splittingWord.dataset.ttsColor = self.tts.color;
          splittingWord.dataset.ttsCurrentWord = "false";
          splittingWord.dataset.ttsCurrentLine = "false";
        });
      }
      self.api?.finished();
    };
    callback();
  }

  speakPause() {
    if (window.speechSynthesis.speaking) {
      if (this.api?.paused) this.api?.paused();
      this.userScrolled = false;
      window.speechSynthesis.pause();
    }
  }

  speakResume() {
    if (window.speechSynthesis.speaking) {
      if (this.api?.resumed) this.api?.resumed();
      this.userScrolled = false;
      window.speechSynthesis.resume();
    }
  }

  public static async create(config: TTSModuleConfig) {
    const tts = new this(
      config.delegate,
      config.tts,
      config.headerMenu,
      config.rights,
      config.highlighter,
      config as TTSModuleProperties,
      config.api
    );
    await tts.start();
    return tts;
  }

  public constructor(
    delegate: IFrameNavigator,
    tts: TTSSettings,
    headerMenu: HTMLElement,
    rights: ReaderRights,
    highlighter: TextHighlighter,
    properties: TTSModuleProperties | null = null,
    api: TTSModuleAPI | null = null
  ) {
    this.delegate = delegate;
    this.tts = tts;
    this.headerMenu = headerMenu;
    this.rights = rights;
    this.highlighter = highlighter;
    this.properties = properties;
    this.api = api;
  }

  protected async start(): Promise<void> {
    this.delegate.ttsModule = this;

    if (this.headerMenu) {
      var menuTTS = HTMLUtilities.findElement(
        this.headerMenu,
        "#menu-button-tts"
      ) as HTMLLinkElement;
      if (this.rights?.enableMaterial) {
        if (menuTTS) menuTTS.parentElement.style.removeProperty("display");
      } else {
        if (menuTTS) menuTTS.parentElement.style.setProperty("display", "none");
      }
    }
  }

  userScrolled = false;
  private wheel(event: KeyboardEvent | MouseEvent | TrackEvent): void {
    if (event instanceof KeyboardEvent) {
      const key = event.key;
      switch (key) {
        case "ArrowUp":
          this.userScrolled = true;
          break;
        case "ArrowDown":
          this.userScrolled = true;
          break;
      }
    } else {
      this.userScrolled = true;
    }
  }

  async stop() {
    if (IS_DEV) {
      console.log("TTS module stop");
    }
    removeEventListenerOptional(document, "wheel", this.wheel.bind(this));
    removeEventListenerOptional(this.body, "wheel", this.wheel.bind(this));
    removeEventListenerOptional(document, "keydown", this.wheel.bind(this));
    removeEventListenerOptional(
      this.delegate.iframes[0].contentDocument,
      "keydown",
      this.wheel.bind(this)
    );
  }
}
