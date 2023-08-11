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
 * Licensed to: CAST under one or more contributor license agreements.
 */

import { ReaderModule } from "../ReaderModule";
import { AnnotationMarker } from "../../model/Locator";
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
import sanitize from "sanitize-html";
import { IFrameNavigator, ReaderRights } from "../../navigator/IFrameNavigator";
import { TextHighlighter } from "../highlight/TextHighlighter";
import { HighlightType, IHighlight } from "../highlight/common/highlight";
import { uniqueCssSelector } from "../highlight/renderer/common/cssselector2";
import { convertRange } from "../highlight/renderer/iframe/selection";
import { debounce } from "debounce";
import {
  _getCssSelectorOptions,
  ISelectionInfo,
} from "../highlight/common/selection";
import log from "loglevel";

export class TTSModule2 implements ReaderModule {
  private tts: TTSSettings;
  private voices: SpeechSynthesisVoice[] = [];
  private clean: any;
  private rights: Partial<ReaderRights>;
  private readonly highlighter: TextHighlighter;
  navigator: IFrameNavigator;
  private body: any;
  private hasEventListener: boolean = false;
  private readonly headerMenu?: HTMLElement | null;
  private readonly properties: TTSModuleProperties;
  private readonly api?: TTSModuleAPI;
  private wrapper: HTMLDivElement;

  initialize(body: any) {
    if (this.highlighter !== undefined) {
      this.tts.setControls();
      this.tts.onRestart(this.restart.bind(this));
      this.body = body;
      this.clean = sanitize(this.body.innerHTML, {
        allowedTags: [],
        allowedAttributes: {},
      });
      this.wrapper = HTMLUtilities.findRequiredElement(
        document,
        "#iframe-wrapper"
      );

      window.speechSynthesis.getVoices();
      this.initVoices(true);

      if (!this.hasEventListener) {
        this.hasEventListener = true;
        addEventListenerOptional(document, "wheel", this.wheel.bind(this));
        addEventListenerOptional(this.body, "wheel", this.wheel.bind(this));
        addEventListenerOptional(document, "keydown", this.wheel.bind(this));
        addEventListenerOptional(
          this.navigator.iframes[0].contentDocument,
          "keydown",
          this.wheel.bind(this)
        );
      }
      addEventListenerOptional(
        this.body,
        "mousedown",
        this.clickStart.bind(this)
      );
      addEventListenerOptional(this.body, "mouseup", this.click.bind(this));
    }
  }
  startX = 0;
  startY = 0;
  private clickStart(event: KeyboardEvent | MouseEvent | TouchEvent): void {
    if ("clientX" in event) {
      this.startX = event.clientX;
    }
    if ("clientY" in event) {
      this.startY = event.clientY;
    }
  }
  private click(event: KeyboardEvent | MouseEvent | TouchEvent): void {
    let startX = 0;
    let startY = 0;
    if ("clientX" in event) {
      startX = event.clientX;
    }
    if ("clientY" in event) {
      startY = event.clientY;
    }

    if (
      window.speechSynthesis.speaking &&
      this.speaking &&
      startX === this.startX &&
      startY === this.startY
    ) {
      let doc = this.navigator.iframes[0].contentDocument;
      if (doc) {
        let selection = this.highlighter.dom(doc.body).getSelection();
        // if (selection.isCollapsed) {
        //   let doc = this.navigator.iframes[0].contentDocument;
        //   const selectionInfo = this.navigator.annotationModule?.annotator?.getTemporarySelectionInfo(
        //     doc
        //   );
        //   selection.addRange(selectionInfo.range);
        // }

        let range = selection.getRangeAt(0);
        let node = selection.anchorNode;
        // Find starting point
        while (range.toString().indexOf(" ") !== 0) {
          try {
            range.setStart(node, range.startOffset - 1);
          } catch (e) {
            break;
          }
        }
        range.setStart(node, range.startOffset + 1);

        // Find ending point
        do {
          range.setEnd(
            node,
            node.length < range.endOffset ? range.endOffset + 1 : node.length
          );
        } while (
          range.toString().indexOf(" ") === -1 &&
          range.toString().trim() !== ""
        );

        let iframe = document.querySelector(
          "main#iframe-wrapper iframe"
        ) as HTMLIFrameElement;
        let rootEl = iframe.contentWindow?.document.body;
        if (this.ttsQueue && rootEl) {
          const idx = this.findTtsQueueItemIndex(
            this.ttsQueue,
            selection.anchorNode as Element,
            selection.anchorNode,
            selection.anchorOffset,
            rootEl
          );
          selection.removeAllRanges();

          if (idx >= 0) {
            window.speechSynthesis.cancel();
            this.restartIndex = idx;
            this.ttsPlayQueueIndexDebounced(this.restartIndex, this.ttsQueue);
          }
        }
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
      log.log(voices);
      this.voices = [];
      voices.forEach((voice) => {
        if (voice.localService === true) {
          this.voices.push(voice);
        }
      });
      log.log(this.voices);
      if (first) {
        // preferred-languages
        if (this.headerMenu) {
          var preferredLanguageSelector = HTMLUtilities.findElement(
            this.headerMenu,
            "#preferred-languages"
          );
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

  cancel(api: boolean = true) {
    if (api) {
      if (this.api?.stopped) this.api?.stopped();
      this.navigator.emit("readaloud.stopped", "stopped");
    }
    this.userScrolled = false;
    this.speaking = false;
    setTimeout(() => {
      window.speechSynthesis.cancel();
    }, 0);

    if (this._ttsQueueItemHighlightsWord) {
      this.navigator.highlighter?.destroyHighlights(HighlightType.ReadAloud);
      this._ttsQueueItemHighlightsWord = undefined;
    }
  }

  index = 0;

  async speak(
    selectionInfo: ISelectionInfo | undefined,
    partial: boolean,
    callback: () => void
  ): Promise<any> {
    if (!partial) {
      if (this.navigator.rights.enableContentProtection) {
        this.navigator.contentProtectionModule?.deactivate();
      }
    }

    if (this.api?.started) this.api?.started();
    this.navigator.emit("readaloud.started", "started");

    const self = this;
    this.userScrolled = false;
    this.cancel(false);

    let utterance;
    if (partial) {
      let iframe = document.querySelector(
        "main#iframe-wrapper iframe"
      ) as HTMLIFrameElement;
      let rootEl = iframe.contentWindow?.document.body;

      let doc = this.navigator.iframes[0].contentDocument;
      if (doc) {
        let selection = this.highlighter.dom(doc.body).getSelection();
        if (selection.isCollapsed) {
          let doc = self.navigator.iframes[0].contentDocument;
          const selectionInfo = self.navigator.annotationModule?.annotator?.getTemporarySelectionInfo(
            doc
          );
          selection.addRange(selectionInfo.range);
        }

        if (rootEl) {
          var ttsQueue = this.generateTtsQueue(rootEl);
          if (!ttsQueue.length) {
            return;
          }

          var idx = this.findTtsQueueItemIndex(
            ttsQueue,
            selection.anchorNode as Element,
            selection.anchorNode,
            selection.anchorOffset,
            rootEl
          );

          var idxEnd = this.findTtsQueueItemIndex(
            ttsQueue,
            selection.focusNode as Element,
            selection.focusNode,
            selection.focusOffset,
            rootEl
          );

          const ttsQueueItem = getTtsQueueItemRef(ttsQueue, idx);
          const ttsQueueItemEnd = getTtsQueueItemRef(ttsQueue, idxEnd);

          var restOfTheText;
          if (ttsQueueItem && selectionInfo && selectionInfo.cleanText) {
            const sentence = getTtsQueueItemRefText(ttsQueueItem);
            let startIndex = selectionInfo.rangeInfo.startOffset;
            let textToBeSpoken = selectionInfo.cleanText;

            if (ttsQueueItemEnd && idx + 1 === idxEnd) {
              const sentenceEnd = getTtsQueueItemRefText(ttsQueueItemEnd);
              startIndex = (sentence + " " + sentenceEnd).indexOf(
                selectionInfo.cleanText
              );
              textToBeSpoken = sentence.slice(startIndex, sentence.length);

              restOfTheText = selectionInfo.cleanText
                .replace(textToBeSpoken, "")
                .trim();
            } else if (idxEnd > idx) {
              let mergedSentences = "";
              for (let i = idx + 1; i < idxEnd; i++) {
                const ttsQueueItemInBetween = getTtsQueueItemRef(ttsQueue, i);
                if (ttsQueueItemInBetween) {
                  const sentenceInBetween = getTtsQueueItemRefText(
                    ttsQueueItemInBetween
                  );
                  mergedSentences += sentenceInBetween;
                  restOfTheText = selectionInfo.cleanText.replace(
                    sentenceInBetween,
                    ""
                  );
                }
              }

              if (ttsQueueItemEnd) {
                const sentenceEnd = getTtsQueueItemRefText(ttsQueueItemEnd);
                mergedSentences += " " + sentenceEnd;
              }
              startIndex = (sentence + " " + mergedSentences).indexOf(
                selectionInfo.cleanText
              );

              textToBeSpoken = sentence.slice(startIndex, sentence.length);

              restOfTheText = restOfTheText.replace(textToBeSpoken, "").trim();
            }

            utterance = new SpeechSynthesisUtterance(textToBeSpoken);

            utterance.rate = this.tts.rate;
            utterance.pitch = this.tts.pitch;
            utterance.volume = this.tts.volume;
            this.setVoice(this, utterance);

            log.log(selectionInfo);
            log.log(
              textToBeSpoken,
              selectionInfo.range?.commonAncestorContainer.textContent
            );
            log.log(ttsQueueItem);
            log.log(ttsQueueItem.item.textNodes);
            log.log(startIndex);
            log.log(ttsQueueItem.item.combinedText);
            let node = ttsQueueItem.item.textNodes.filter((node) => {
              return node === selectionInfo.range?.commonAncestorContainer;
            })[0];
            log.log(node);

            utterance.onboundary = (ev: SpeechSynthesisEvent) => {
              this.updateTTSInfo(
                ttsQueueItem,
                ev.charIndex,
                ev.charLength,
                startIndex,
                utterance.text
              );
            };
          }
        }
      }
    } else {
      utterance = new SpeechSynthesisUtterance(this.clean);
    }

    utterance.rate = this.tts.rate;
    utterance.pitch = this.tts.pitch;
    utterance.volume = this.tts.volume;
    this.setVoice(self, utterance);

    this.index = 0;

    function onend() {
      utterance.onend = function () {
        if (idxEnd > idx) {
          idx = idx + 1;
          if (idx !== idxEnd) {
            const ttsQueueItem = getTtsQueueItemRef(ttsQueue, idx);
            if (ttsQueueItem) {
              const sentence = getTtsQueueItemRefText(ttsQueueItem);
              utterance = new SpeechSynthesisUtterance(sentence);
              utterance.rate = self.tts.rate;
              utterance.pitch = self.tts.pitch;
              utterance.volume = self.tts.volume;
              self.setVoice(self, utterance);
              utterance.onboundary = (ev: SpeechSynthesisEvent) => {
                self.updateTTSInfo(
                  ttsQueueItem,
                  ev.charIndex,
                  ev.charLength,
                  0,
                  utterance.text
                );
              };
              setTimeout(() => {
                window.speechSynthesis.speak(utterance);
              }, 0);
              onend();
            }
          } else {
            const ttsQueueItem = getTtsQueueItemRef(ttsQueue, idx);
            if (ttsQueueItem) {
              utterance = new SpeechSynthesisUtterance(restOfTheText);
              utterance.rate = self.tts.rate;
              utterance.pitch = self.tts.pitch;
              utterance.volume = self.tts.volume;
              self.setVoice(self, utterance);
              utterance.onboundary = (ev: SpeechSynthesisEvent) => {
                self.updateTTSInfo(
                  ttsQueueItem,
                  ev.charIndex,
                  ev.charLength,
                  0,
                  utterance.text
                );
              };
              setTimeout(() => {
                window.speechSynthesis.speak(utterance);
              }, 0);
              onend();
            }
            if (idx > idxEnd) {
              log.log("utterance ended");
              self.highlighter.doneSpeaking();
              self.api?.finished();
              self.navigator.emit("readaloud.finished", "finished");
            }
          }
        } else {
          log.log("utterance ended");
          self.highlighter.doneSpeaking();
          self.api?.finished();
          self.navigator.emit("readaloud.finished", "finished");
        }
      };
    }
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
      if (!partial) {
        if (this.navigator.rights.enableContentProtection) {
          this.navigator.contentProtectionModule?.recalculate(200);
        }
      }
    }, 0);

    onend();
    callback();
  }

  private setVoice(self: this, utterance) {
    log.log("this.tts.voice.lang", this.tts.voice.lang);

    let initialVoiceHasHyphen = true;
    if (this.tts.voice && this.tts.voice.lang) {
      initialVoiceHasHyphen = this.tts.voice.lang.indexOf("-") !== -1;
      if (!initialVoiceHasHyphen) {
        this.tts.voice.lang = this.tts.voice.lang.replace("_", "-");
        initialVoiceHasHyphen = true;
      }
    }
    log.log("initialVoiceHasHyphen", initialVoiceHasHyphen);
    log.log("voices", this.voices);
    let initialVoice;
    if (initialVoiceHasHyphen) {
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
    log.log("initialVoice", initialVoice);

    const publicationVoiceHasHyphen =
      self.navigator.publication.Metadata.Language[0].indexOf("-") !== -1;
    log.log("publicationVoiceHasHyphen", publicationVoiceHasHyphen);
    let publicationVoice;
    if (publicationVoiceHasHyphen) {
      publicationVoice =
        this.tts.voice && this.tts.voice.usePublication
          ? this.voices.filter((v: any) => {
              var lang = v.lang.replace("_", "-");
              return (
                lang.startsWith(
                  self.navigator.publication.Metadata.Language[0]
                ) ||
                lang.endsWith(
                  self.navigator.publication.Metadata.Language[0].toUpperCase()
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
                  self.navigator.publication.Metadata.Language[0]
                ) ||
                v.lang.endsWith(
                  self.navigator.publication.Metadata.Language[0].toUpperCase()
                )
              );
            })[0]
          : undefined;
    }
    log.log("publicationVoice", publicationVoice);

    const defaultVoiceHasHyphen = navigator.language.indexOf("-") !== -1;
    log.log("defaultVoiceHasHyphen", defaultVoiceHasHyphen);
    let defaultVoice;
    if (defaultVoiceHasHyphen) {
      defaultVoice = this.voices.filter((voice: SpeechSynthesisVoice) => {
        const lang = voice.lang.replace("_", "-");
        return lang === navigator.language && voice.localService;
      })[0];
    } else {
      defaultVoice = this.voices.filter((voice: SpeechSynthesisVoice) => {
        const lang = voice.lang;
        return lang === navigator.language && voice.localService;
      })[0];
    }
    if (defaultVoice === undefined) {
      defaultVoice = this.voices.filter((voice: SpeechSynthesisVoice) => {
        const lang = voice.lang;
        return lang.includes(navigator.language) && voice.localService;
      })[0];
    }
    log.log("defaultVoice", defaultVoice);

    if (initialVoice) {
      log.log("initialVoice");
      utterance.voice = initialVoice;
    } else if (publicationVoice) {
      log.log("publicationVoice");
      utterance.voice = publicationVoice;
    } else if (defaultVoice) {
      log.log("defaultVoice");
      utterance.voice = defaultVoice;
    }
    if (utterance.voice !== undefined && utterance.voice !== null) {
      utterance.lang = utterance.voice.lang;
      log.log("utterance.voice.lang", utterance.voice.lang);
      log.log("utterance.lang", utterance.lang);
    }
    log.log("navigator.language", navigator.language);
  }

  speakPlay() {
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.deactivate();
    }

    this.scrollPartial = true;
    this.cancel(false);
    if (this.api?.started) this.api?.started();
    this.navigator.emit("readaloud.started", "started");

    let self = this;
    let iframe = document.querySelector(
      "main#iframe-wrapper iframe"
    ) as HTMLIFrameElement;
    let rootEl = iframe.contentWindow?.document.body;

    if (rootEl) {
      const ttsQueue = this.generateTtsQueue(rootEl);
      if (!ttsQueue.length) {
        return;
      }
      let ttsQueueIndex = 0;

      function findVisibleText() {
        let node = self.highlighter.visibleTextRects[0];
        let doc = self.navigator.iframes[0].contentDocument;
        if (doc) {
          const range = self.highlighter
            .dom(doc.body)
            .getWindow()
            .document.createRange();

          const selection = self.highlighter
            .dom(self.navigator.iframes[0].contentDocument?.body)
            .getSelection();
          selection.removeAllRanges();
          range.selectNodeContents(node.node);
          selection.addRange(range);

          let index = 0;
          const endNode = selection.focusNode;
          const endOffset = selection.focusOffset;

          selection.collapse(selection.anchorNode, selection.anchorOffset);

          for (let i = 0; i < index; i++) {
            selection.modify("move", "forward", "line");
          }
          selection.extend(endNode, endOffset);

          selection.collapse(selection.anchorNode, selection.anchorOffset);
          if (rootEl) {
            const idx = self.findTtsQueueItemIndex(
              ttsQueue,
              selection.anchorNode,
              selection.anchorNode,
              selection.anchorOffset,
              rootEl
            );
            if (idx >= 0) {
              ttsQueueIndex = idx;
            }
          }

          selection.removeAllRanges();
        }
      }

      findVisibleText();

      if (ttsQueueIndex < 0) {
        ttsQueueIndex = 0;
      }
      setTimeout(() => {
        this.startTTSSession(ttsQueue, ttsQueueIndex);
      }, 200);
    }
    if (this.navigator.rights.enableContentProtection) {
      this.navigator.contentProtectionModule?.recalculate(200);
    }
  }

  speakPause() {
    if (window.speechSynthesis.speaking) {
      if (this.api?.paused) this.api?.paused();
      this.navigator.emit("readaloud.paused", "paused");
      this.userScrolled = false;
      window.speechSynthesis.pause();
      this.speaking = false;

      if (this._ttsQueueItemHighlightsWord) {
        this.navigator.highlighter?.destroyHighlights(HighlightType.ReadAloud);
        this._ttsQueueItemHighlightsWord = undefined;
      }
    }
  }

  speakResume() {
    if (window.speechSynthesis.speaking) {
      if (this.api?.resumed) this.api?.resumed();
      this.navigator.emit("readaloud.resumed", "resumed");
      this.userScrolled = false;
      window.speechSynthesis.resume();
      this.speaking = true;
    }
  }

  public static async create(config: TTSModuleConfig) {
    const tts = new this(
      config.tts,
      config.rights,
      config.highlighter,
      config as TTSModuleProperties,
      config.api,
      config.headerMenu
    );
    await tts.start();
    return tts;
  }

  public constructor(
    tts: TTSSettings,
    rights: Partial<ReaderRights>,
    highlighter: TextHighlighter,
    properties: TTSModuleProperties,
    api?: TTSModuleAPI,
    headerMenu?: HTMLElement | null
  ) {
    this.tts = tts;
    this.headerMenu = headerMenu;
    this.rights = rights;
    this.highlighter = highlighter;
    this.properties = properties;
    this.api = api;
  }

  protected async start(): Promise<void> {
    if (this.headerMenu) {
      var menuTTS = HTMLUtilities.findElement(
        this.headerMenu,
        "#menu-button-tts"
      );
      if (menuTTS) menuTTS.parentElement?.style.removeProperty("display");
    }
    setTimeout(() => {
      this.properties?.hideLayer
        ? this.navigator.hideLayer("readaloud")
        : this.navigator.showLayer("readaloud");
    }, 10);
  }

  userScrolled = false;
  scrollPartial = false;

  private wheel(event: KeyboardEvent | MouseEvent | TouchEvent): void {
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

  stop() {
    log.log("TTS module stop");
    removeEventListenerOptional(document, "wheel", this.wheel.bind(this));
    removeEventListenerOptional(this.body, "wheel", this.wheel.bind(this));
    removeEventListenerOptional(document, "keydown", this.wheel.bind(this));
    removeEventListenerOptional(
      this.navigator.iframes[0].contentDocument,
      "keydown",
      this.wheel.bind(this)
    );
    removeEventListenerOptional(this.body, "click", this.click.bind(this));
  }

  generateTtsQueue(rootElement: Element): ITtsQueueItem[] {
    const ttsQueue: ITtsQueueItem[] = [];
    const elementStack: Element[] = [];

    function processTextNode(textNode: Node) {
      if (textNode.nodeType !== Node.TEXT_NODE) {
        return;
      }

      if (!textNode.nodeValue || !textNode.nodeValue.trim().length) {
        return;
      }
      const parentElement = elementStack[elementStack.length - 1];
      if (!parentElement) {
        return;
      }

      const lang = textNode.parentElement
        ? getLanguage(textNode.parentElement)
        : undefined;
      const dir = textNode.parentElement
        ? getDirection(textNode.parentElement)
        : undefined;

      let current = ttsQueue[ttsQueue.length - 1];
      if (
        !current ||
        current.parentElement !== parentElement ||
        current.lang !== lang ||
        current.dir !== dir
      ) {
        current = {
          combinedText: "",
          dir,
          lang,
          parentElement,
          textNodes: [],
        };
        ttsQueue.push(current);
      }
      current.textNodes.push(textNode);
    }

    let first = true;
    function processElement(element: Element) {
      if (element.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      // tslint:disable-next-line:max-line-length
      const isIncluded =
        first ||
        element.matches(
          "h1, h2, h3, h4, h5, h6, p, th, td, caption, li, blockquote, q, dt, dd, figcaption, div, pre"
        );
      first = false;
      if (isIncluded) {
        elementStack.push(element);
      }

      for (const childNode of element.childNodes) {
        switch (childNode.nodeType) {
          case Node.ELEMENT_NODE:
            const childElement = childNode as Element;
            // tslint:disable-next-line:max-line-length
            const isExcluded = childElement.matches(
              "img, sup, sub, audio, video, source, button, canvas, del, dialog, embed, form, head, iframe, meter, noscript, object, s, script, select, style, textarea"
            );
            // code, nav, dl, figure, table, ul, ol
            if (!isExcluded) {
              processElement(childElement);
            } else if (
              childElement.tagName &&
              childElement.tagName.toLowerCase() === "img" &&
              (childElement as HTMLImageElement).src
            ) {
              const altAttr = childElement.getAttribute("alt");
              if (altAttr) {
                const txt = altAttr.trim();
                if (txt) {
                  const lang = getLanguage(childElement);
                  const dir = undefined;
                  ttsQueue.push({
                    combinedText: txt,
                    dir,
                    lang,
                    parentElement: childElement,
                    textNodes: [],
                  });
                }
              }
            }
            break;
          case Node.TEXT_NODE:
            if (elementStack.length !== 0) {
              processTextNode(childNode);
            }
            break;
          default:
            break;
        }
      }

      if (isIncluded) {
        elementStack.pop();
      }
    }

    processElement(rootElement);

    function finalizeTextNodes(ttsQueueItem: ITtsQueueItem) {
      if (!ttsQueueItem.textNodes || !ttsQueueItem.textNodes.length) {
        if (!ttsQueueItem.combinedText || !ttsQueueItem.combinedText.length) {
          ttsQueueItem.combinedText = "";
        }
        return;
      }

      ttsQueueItem.combinedText = combineTextNodes(
        ttsQueueItem.textNodes,
        true
      ).replace(/[\r\n]/g, " ");
      let parent: Element | null = ttsQueueItem.parentElement;
      while (parent) {
        if (parent.tagName) {
          const tag = parent.tagName.toLowerCase();
          if (
            tag === "pre" ||
            tag === "code" ||
            tag === "video" ||
            tag === "audio"
          ) {
            break;
          }
        }
        parent = parent.parentElement;
      }
    }

    for (const ttsQueueItem of ttsQueue) {
      finalizeTextNodes(ttsQueueItem);
    }

    return ttsQueue;
  }

  findTtsQueueItemIndex(
    ttsQueue: ITtsQueueItem[],
    element: Element,
    startTextNode: Node | undefined,
    startTextNodeOffset: number,
    rootElem: Element
  ): number {
    let i = 0;
    for (const ttsQueueItem of ttsQueue) {
      if (startTextNode && ttsQueueItem.textNodes) {
        if (ttsQueueItem.textNodes.includes(startTextNode)) {
          return i;
        }
      } else if (
        element === ttsQueueItem.parentElement ||
        (ttsQueueItem.parentElement !==
          (element.ownerDocument as Document).body &&
          ttsQueueItem.parentElement !== rootElem &&
          ttsQueueItem.parentElement.contains(element)) ||
        element.contains(ttsQueueItem.parentElement)
      ) {
        return i;
      }
      i++;
    }
    return -1;
  }

  speaking = false;

  restartIndex = -1;

  private restart(): void {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      this.restartIndex = this.ttsQueueIndex;
      this.ttsPlayQueueIndexDebounced(this.restartIndex, this.ttsQueue);
    }
  }

  startTTSSession(ttsQueue: ITtsQueueItem[], ttsQueueIndexStart: number) {
    const ttsQueueItemStart = getTtsQueueItemRef(ttsQueue, ttsQueueIndexStart);
    if (!ttsQueueItemStart) {
      this.cancel();
      return;
    }
    this.speaking = true;
    this.ttsPlayQueueIndexDebounced(ttsQueueIndexStart, ttsQueue);
  }

  ttsPlayQueueIndex(ttsQueueIndex: number, ttsQueue) {
    if (ttsQueueIndex < 0) {
      this.cancel();
      return;
    }

    const ttsQueueItem = getTtsQueueItemRef(ttsQueue, ttsQueueIndex);
    if (!ttsQueueItem) {
      this.cancel();
      return;
    }

    const txtStr = getTtsQueueItemRefText(ttsQueueItem);
    if (!txtStr) {
      this.cancel();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(txtStr);
    utterance.rate = this.tts.rate;
    utterance.pitch = this.tts.pitch;
    utterance.volume = this.tts.volume;
    const self = this;
    this.setVoice(self, utterance);

    utterance.onboundary = (ev: SpeechSynthesisEvent) => {
      log.log(ev.name);
      this.updateTTSInfo(
        ttsQueueItem,
        ev.charIndex,
        ev.charLength,
        0,
        utterance.text
      );
    };

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
      if (!self.speaking) {
        window.speechSynthesis.pause();
      }
    }, 0);

    utterance.onend = function () {
      if (self.speaking) {
        self.ttsPlayQueueIndexDebounced(ttsQueueIndex + 1, ttsQueue);
      }
    };
  }

  ttsQueueIndex = -1;
  ttsQueue?: ITtsQueueItem[] = undefined;
  ttsPlayQueueIndexDebounced = debounce((ttsQueueIndex: number, ttsQueue) => {
    if (this.restartIndex >= 0) {
      this.ttsQueueIndex = this.restartIndex;
      this.restartIndex = -1;
    } else {
      this.ttsQueueIndex = ttsQueueIndex;
    }

    this.ttsQueue = ttsQueue;

    this.ttsPlayQueueIndex(this.ttsQueueIndex, ttsQueue);
  }, 150);

  updateTTSInfo(
    ttsQueueItem,
    charIndex: number,
    charLength: number,
    startIndex: number,
    utteranceText: string | undefined
  ): string | undefined {
    if (!ttsQueueItem) {
      return undefined;
    }
    log.log(ttsQueueItem, charIndex, charLength, utteranceText);

    const ttsQueueItemText = utteranceText
      ? utteranceText
      : getTtsQueueItemRefText(ttsQueueItem);

    if (charIndex >= 0 && utteranceText) {
      const start = utteranceText.slice(0, charIndex + 1).search(/\S+$/);
      const right = utteranceText.slice(charIndex).search(/\s/);
      const word =
        right < 0
          ? utteranceText.slice(start)
          : utteranceText.slice(start, right + charIndex);
      const end = start + word.length;

      if (charLength === undefined) {
        // Safari doesn't provide charLength, so fall back to a regex to find the current word and its length (probably misses some edge cases, but good enough for this demo)
        const match = utteranceText.substring(charIndex).match(/^[a-z\d']*/i);
        if (match) {
          charLength = match[0].length;
        }
      }

      if (charLength === undefined) {
        charLength = word.length;
      }

      this.wrapHighlightWord(
        ttsQueueItem,
        utteranceText,
        charIndex + startIndex,
        charLength,
        word,
        start,
        end
      );
    }

    return ttsQueueItemText;
  }
  _ttsQueueItemHighlightsWord: IHighlight | undefined;

  wrapHighlightWord(
    ttsQueueItemRef: ITtsQueueItemReference,
    utteranceText: string,
    charIndex: number,
    charLength: number,
    word: string,
    start: number,
    end: number
  ) {
    log.log(ttsQueueItemRef);
    log.log(utteranceText);
    log.log(charIndex, charLength, word, start, end);

    if (this._ttsQueueItemHighlightsWord) {
      this.navigator.highlighter?.destroyHighlights(HighlightType.ReadAloud);
      this._ttsQueueItemHighlightsWord = undefined;
    }

    const ttsQueueItem = ttsQueueItemRef.item;
    let charIndexAdjusted = charIndex;

    let acc = 0;
    let rangeStartNode: Node | undefined;
    let rangeStartOffset = -1;
    let rangeEndNode: Node | undefined;
    let rangeEndOffset = -1;
    const charIndexEnd = charIndexAdjusted + charLength;
    for (const txtNode of ttsQueueItem.textNodes) {
      if (!txtNode.nodeValue && txtNode.nodeValue !== "") {
        continue;
      }
      const l = txtNode.nodeValue.length;
      acc += l;
      if (!rangeStartNode) {
        if (charIndexAdjusted < acc) {
          rangeStartNode = txtNode;
          rangeStartOffset = l - (acc - charIndexAdjusted);
        }
      }
      if (rangeStartNode && charIndexEnd <= acc) {
        rangeEndNode = txtNode;
        rangeEndOffset = l - (acc - charIndexEnd);
      }
      if (rangeEndNode) {
        break;
      }
    }

    if (rangeStartNode && rangeEndNode) {
      const range = new Range();
      range.setStart(rangeStartNode, rangeStartOffset);
      range.setEnd(rangeEndNode, rangeEndOffset);

      const self = this;

      function getCssSelector(element: Element): string {
        try {
          let doc = self.navigator.iframes[0].contentDocument;
          if (doc) {
            return uniqueCssSelector(element, doc, _getCssSelectorOptions);
          } else {
            return "";
          }
        } catch (err) {
          log.log("uniqueCssSelector:");
          log.error(err);
          return "";
        }
      }
      const rangeInfo = convertRange(range, getCssSelector);
      if (!rangeInfo) {
        return;
      }

      let result = this.navigator.highlighter?.createHighlight(
        this.navigator.iframes[0].contentWindow as any,
        {
          rangeInfo: rangeInfo,
          cleanText: "",
          rawText: "",
          range: undefined,
        },
        this.tts.color,
        false,
        AnnotationMarker.Custom,
        {
          id: "tts",
          title: "",
          position: "right",
        },
        undefined,
        {
          defaultClass: this.tts.color,
        },
        HighlightType.ReadAloud,
        "R2_READALOUD_"
      );
      if (result) {
        this._ttsQueueItemHighlightsWord = result[0];
        const viewportOffset = (result[1]
          ?.firstChild as HTMLElement)?.getBoundingClientRect();
        const top = viewportOffset.top - this.wrapper.scrollTop;
        const shouldScroll = top > window.innerHeight / 2 - 65;

        if (
          this.navigator.view?.isScrollMode() &&
          this.tts.autoScroll &&
          !this.userScrolled &&
          this.scrollPartial &&
          shouldScroll
        ) {
          (result[1]?.firstChild as HTMLElement)?.scrollIntoView({
            block: "center",
            behavior: "smooth",
          });
        } else if (this.navigator.view?.isPaginated()) {
          self.navigator.view?.snap(result[1]?.firstChild as HTMLElement);
        }
      }
    }
  }
}

export interface ITtsQueueItem {
  dir: string | undefined;
  lang: string | undefined;
  parentElement: Element;
  textNodes: Node[];
  combinedText: string;
}
export interface ITtsQueueItemReference {
  item: ITtsQueueItem;
  iArray: number;
  iSentence: number;
  iGlobal: number;
}

export function getLanguage(el: Element): string | undefined {
  let currentElement = el;

  while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
    let lang = currentElement.getAttribute("xml:lang");
    if (!lang) {
      lang = currentElement.getAttributeNS(
        "http://www.w3.org/XML/1998/namespace",
        "lang"
      );
    }
    if (!lang) {
      lang = currentElement.getAttribute("lang");
    }
    if (lang) {
      return lang;
    }

    currentElement = currentElement.parentNode as Element;
  }

  return undefined;
}

export function getDirection(el: Element): string | undefined {
  let currentElement = el;

  while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
    const dir = currentElement.getAttribute("dir");
    if (dir) {
      return dir;
    }

    currentElement = currentElement.parentNode as Element;
  }

  return undefined;
}
export function combineTextNodes(
  textNodes: Node[],
  skipNormalize?: boolean
): string {
  if (textNodes && textNodes.length) {
    let str = "";
    for (const textNode of textNodes) {
      if (textNode.nodeValue) {
        str += skipNormalize
          ? textNode.nodeValue
          : normalizeText(textNode.nodeValue);
      }
    }
    return str;
  }
  return "";
}
export function normalizeHtmlText(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function normalizeText(str: string): string {
  // tslint:disable-next-line:max-line-length
  return normalizeHtmlText(str).replace(/\n/g, " ").replace(/\s\s+/g, " ");
}
export function getTtsQueueItemRef(
  items: ITtsQueueItem[],
  index: number
): ITtsQueueItemReference | undefined {
  let i = -1;
  let k = -1;
  for (const it of items) {
    k++;
    i++;
    if (index === i) {
      return { item: it, iArray: k, iGlobal: i, iSentence: -1 };
    }
  }
  return undefined;
}

export function getTtsQueueItemRefText(obj: ITtsQueueItemReference): string {
  return obj.item.combinedText;
}
