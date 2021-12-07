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
import * as sanitize from "sanitize-html";
import IFrameNavigator, { ReaderRights } from "../../navigator/IFrameNavigator";
import TextHighlighter from "../highlight/TextHighlighter";
import { HighlightType, IHighlight } from "../highlight/common/highlight";
import { uniqueCssSelector } from "../highlight/renderer/common/cssselector2";
import { convertRange } from "../highlight/renderer/iframe/selection";
import { debounce } from "debounce";
import { split } from "sentence-splitter";
import {
  _getCssSelectorOptions,
  ISelectionInfo,
} from "../highlight/common/selection";
import { getClientRectsNoOverlap } from "../highlight/common/rect-utils";

export default class TTSModule2 implements ReaderModule {
  private tts: TTSSettings;
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
      this.tts.onRestart(this.restart.bind(this));
      this.body = body;
      this.clean = sanitize(this.body.innerHTML, {
        allowedTags: [],
        allowedAttributes: {},
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
      addEventListenerOptional(this.body, "click", this.click.bind(this));
    }
  }

  private click(_event: KeyboardEvent | MouseEvent | TrackEvent): void {
    if (window.speechSynthesis.speaking && this.speaking) {
      const selection = this.highlighter
        .dom(this.delegate.iframes[0].contentDocument.body)
        .getSelection();
      let range = selection.getRangeAt(0);
      let node = selection.anchorNode;

      // Find starting point
      while (range.toString().indexOf(" ") != 0) {
        try {
          range.setStart(node, range.startOffset - 1);
        } catch (e) {
          break;
        }
      }
      range.setStart(node, range.startOffset + 1);

      // Find ending point
      do {
        range.setEnd(node, range.endOffset + 1);
      } while (
        range.toString().indexOf(" ") == -1 &&
        range.toString().trim() != ""
      );

      // Alert result
      // var str = range.toString().trim();
      // alert(str);

      let iframe = document.querySelector(
        "main#iframe-wrapper iframe"
      ) as HTMLIFrameElement;
      let rootEl = iframe.contentWindow.document.body;
      const idx = this.findTtsQueueItemIndex(
        this.ttsQueue,
        selection.anchorNode as Element,
        selection.focusNode,
        selection.focusOffset,
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
    this.speaking = false;
    setTimeout(() => {
      window.speechSynthesis.cancel();
    }, 0);

    if (this._ttsQueueItemHighlightsWord) {
      this.delegate.highlighter.destroyHighlights(HighlightType.ReadAloud);
      this._ttsQueueItemHighlightsWord = undefined;
    }
  }

  index = 0;

  async speak(
    selectionInfo: ISelectionInfo | undefined,
    partial: boolean,
    callback: () => void
  ): Promise<any> {
    if (this.api?.started) this.api?.started();

    const self = this;
    this.userScrolled = false;
    this.cancel();

    let utterance;
    if (partial) {
      let iframe = document.querySelector(
        "main#iframe-wrapper iframe"
      ) as HTMLIFrameElement;
      let rootEl = iframe.contentWindow.document.body;

      const selection = this.highlighter
        .dom(this.delegate.iframes[0].contentDocument.body)
        .getSelection();

      const ttsQueue = this.generateTtsQueue(rootEl, true);
      if (!ttsQueue.length) {
        return;
      }

      const idx = this.findTtsQueueItemIndex(
        ttsQueue,
        selection.anchorNode as Element,
        selection.focusNode,
        selection.focusOffset,
        rootEl
      );

      const ttsQueueItem = getTtsQueueItemRef(ttsQueue, idx);
      const sentence = getTtsQueueItemRefText(ttsQueueItem);
      const startIndex = sentence.indexOf(selectionInfo.cleanText);

      utterance = new SpeechSynthesisUtterance(selectionInfo.cleanText);
      utterance.onboundary = (ev: SpeechSynthesisEvent) => {
        this.updateTTSInfo(
          ttsQueueItem,
          ev.charIndex + startIndex,
          ev.charLength,
          utterance.text
        );
      };
    } else {
      utterance = new SpeechSynthesisUtterance(this.clean);
    }

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

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 0);

    this.index = 0;

    utterance.onend = function () {
      if (IS_DEV) console.log("utterance ended");
      self.highlighter.doneSpeaking();
      self.api?.finished();
    };
    callback();
  }

  speakPlay() {
    // function ttsPlay() {
    this.cancel();

    let self = this;
    let iframe = document.querySelector(
      "main#iframe-wrapper iframe"
    ) as HTMLIFrameElement;
    let rootEl = iframe.contentWindow.document.body;

    const ttsQueue = this.generateTtsQueue(rootEl, true);
    if (!ttsQueue.length) {
      return;
    }
    let ttsQueueIndex = 0;

    function findVisibleText() {
      let node = self.highlighter.visibleTextRects[0];
      const range = self.highlighter
        .dom(self.delegate.iframes[0].contentDocument.body)
        .getWindow()
        .document.createRange();

      const selection = self.highlighter
        .dom(self.delegate.iframes[0].contentDocument.body)
        .getSelection();
      selection.removeAllRanges();
      range.selectNodeContents(node.node);
      selection.addRange(range);

      const clientRects = getClientRectsNoOverlap(range, false);

      function isOutsideViewport(rect): boolean {
        const windowLeft = window.scrollX;
        const windowRight = windowLeft + window.innerWidth;
        const right = rect.left + rect.width;
        const bottom = rect.top + rect.height;
        const windowTop = window.scrollY;
        const windowBottom = windowTop + window.innerHeight;

        const isAbove = bottom < windowTop;
        const isBelow = rect.top > windowBottom;

        const isLeft = right < windowLeft;
        const isRight = rect.left > windowRight;

        return isAbove || isBelow || isLeft || isRight;
      }

      let index = 0;
      for (const rect of clientRects) {
        if (!isOutsideViewport(rect)) {
          const endNode = selection.focusNode;
          const endOffset = selection.focusOffset;

          selection.collapse(selection.anchorNode, selection.anchorOffset);

          for (let i = 0; i < index; i++) {
            selection.modify("move", "forward", "line");
          }
          selection.extend(endNode, endOffset);

          selection.collapse(selection.anchorNode, selection.anchorOffset);

          const idx = self.findTtsQueueItemIndex(
            ttsQueue,
            selection.anchorNode,
            selection.focusNode,
            selection.focusOffset,
            rootEl
          );

          if (idx >= 0) {
            ttsQueueIndex = idx;
          }
          selection.removeAllRanges();
          break;
        }
        index++;
      }
    }

    findVisibleText();

    if (ttsQueueIndex < 0) {
      ttsQueueIndex = 0;
    }
    setTimeout(() => {
      this.startTTSSession(ttsQueue, ttsQueueIndex);
    }, 100);
  }

  speakPause() {
    if (window.speechSynthesis.speaking) {
      if (this.api?.paused) this.api?.paused();
      this.userScrolled = false;
      window.speechSynthesis.pause();
      this.speaking = false;

      if (this._ttsQueueItemHighlightsWord) {
        this.delegate.highlighter.destroyHighlights(HighlightType.ReadAloud);
        this._ttsQueueItemHighlightsWord = undefined;
      }
    }
  }

  speakResume() {
    if (window.speechSynthesis.speaking) {
      if (this.api?.resumed) this.api?.resumed();
      this.userScrolled = false;
      window.speechSynthesis.resume();
      this.speaking = true;
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
    setTimeout(() => {
      this.properties.hideLayer
        ? this.delegate.hideLayer("readaloud")
        : this.delegate.showLayer("readaloud");
    }, 10);
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
    removeEventListenerOptional(this.body, "click", this.click.bind(this));
  }

  generateTtsQueue(
    rootElement: Element,
    splitSentences: boolean
  ): ITtsQueueItem[] {
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
          combinedTextSentences: undefined,
          combinedTextSentencesRangeBegin: undefined,
          combinedTextSentencesRangeEnd: undefined,
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
                    combinedTextSentences: undefined,
                    combinedTextSentencesRangeBegin: undefined,
                    combinedTextSentencesRangeEnd: undefined,
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
        ttsQueueItem.combinedTextSentences = undefined;
        return;
      }

      ttsQueueItem.combinedText = combineTextNodes(
        ttsQueueItem.textNodes,
        true
      ).replace(/[\r\n]/g, " ");
      let skipSplitSentences = false;
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
            skipSplitSentences = true;
            break;
          }
        }
        parent = parent.parentElement;
      }
      if (splitSentences && !skipSplitSentences) {
        try {
          const txt = ttsQueueItem.combinedText;
          ttsQueueItem.combinedTextSentences = undefined;
          const sentences = split(txt);
          ttsQueueItem.combinedTextSentences = [];
          ttsQueueItem.combinedTextSentencesRangeBegin = [];
          ttsQueueItem.combinedTextSentencesRangeEnd = [];
          for (const sentence of sentences) {
            if (sentence.type === "Sentence") {
              ttsQueueItem.combinedTextSentences.push(sentence.raw);
              ttsQueueItem.combinedTextSentencesRangeBegin.push(
                sentence.range[0]
              );
              ttsQueueItem.combinedTextSentencesRangeEnd.push(
                sentence.range[1]
              );
            }
          }
          if (
            ttsQueueItem.combinedTextSentences.length === 0 ||
            ttsQueueItem.combinedTextSentences.length === 1
          ) {
            ttsQueueItem.combinedTextSentences = undefined;
          } else {
          }
        } catch (err) {
          console.log(err);
          ttsQueueItem.combinedTextSentences = undefined;
        }
      } else {
        ttsQueueItem.combinedTextSentences = undefined;
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
          if (
            ttsQueueItem.combinedTextSentences &&
            ttsQueueItem.combinedTextSentencesRangeBegin &&
            ttsQueueItem.combinedTextSentencesRangeEnd
          ) {
            let offset = 0;
            for (const txtNode of ttsQueueItem.textNodes) {
              if (!txtNode.nodeValue && txtNode.nodeValue !== "") {
                continue;
              }
              if (txtNode === startTextNode) {
                offset += startTextNodeOffset;
                break;
              }
              offset += txtNode.nodeValue.length;
            }
            let j = i - 1;
            for (const end of ttsQueueItem.combinedTextSentencesRangeEnd) {
              j++;
              if (end < offset) {
                continue;
              }
              return j;
            }
            return i;
          } else {
            return i;
          }
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
      if (ttsQueueItem.combinedTextSentences) {
        i += ttsQueueItem.combinedTextSentences.length;
      } else {
        i++;
      }
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

    var self = this;
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

    utterance.onboundary = (ev: SpeechSynthesisEvent) => {
      this.updateTTSInfo(
        ttsQueueItem,
        ev.charIndex,
        ev.charLength,
        utterance.text
      );
    };

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
      if (!self.speaking) {
        window.speechSynthesis.pause();
      }
    }, 0);

    var self = this;
    utterance.onend = function () {
      if (self.speaking) {
        self.ttsPlayQueueIndexDebounced(ttsQueueIndex + 1, ttsQueue);
      }
    };
  }

  ttsQueueIndex = -1;
  ttsQueue = null;
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
    utteranceText: string | undefined
  ): string | undefined {
    if (!ttsQueueItem) {
      return undefined;
    }

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

      this.wrapHighlightWord(
        ttsQueueItem,
        utteranceText,
        charIndex,
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
    if (this._ttsQueueItemHighlightsWord) {
      this.delegate.highlighter.destroyHighlights(HighlightType.ReadAloud);
      this._ttsQueueItemHighlightsWord = undefined;
    }

    const ttsQueueItem = ttsQueueItemRef.item;
    let txtToCheck = ttsQueueItemRef.item.combinedText;
    let charIndexAdjusted = charIndex;
    if (
      ttsQueueItem.combinedTextSentences &&
      ttsQueueItem.combinedTextSentencesRangeBegin &&
      ttsQueueItem.combinedTextSentencesRangeEnd &&
      ttsQueueItemRef.iSentence >= 0
    ) {
      const sentOffset =
        ttsQueueItem.combinedTextSentencesRangeBegin[ttsQueueItemRef.iSentence];
      charIndexAdjusted += sentOffset;
      txtToCheck =
        ttsQueueItem.combinedTextSentences[ttsQueueItemRef.iSentence];
    }

    if (IS_DEV) {
      if (utteranceText !== txtToCheck) {
        console.log(
          "TTS utteranceText DIFF?? ",
          `[[${utteranceText}]]`,
          `[[${txtToCheck}]]`
        );
      }
      const ttsWord = utteranceText.substr(charIndex, charLength);
      if (ttsWord !== word) {
        console.log(
          "TTS word DIFF?? ",
          `[[${ttsWord}]]`,
          `[[${word}]]`,
          `${charIndex}--${charLength}`,
          `${start}--${end - start}`
        );
      }
    }

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
        break;
      }
    }

    if (rangeStartNode && rangeEndNode) {
      const range = new Range();
      range.setStart(rangeStartNode, rangeStartOffset);
      range.setEnd(rangeEndNode, rangeEndOffset);

      var self = this;
      function getCssSelector(element: Element): string {
        try {
          return uniqueCssSelector(
            element,
            self.delegate.iframes[0].contentDocument,
            _getCssSelectorOptions
          );
        } catch (err) {
          console.log("uniqueCssSelector:");
          console.log(err);
          return "";
        }
      }
      const rangeInfo = convertRange(range, getCssSelector);
      if (!rangeInfo) {
        return;
      }

      let result = this.delegate.highlighter.createHighlight(
        this.delegate.iframes[0].contentWindow as any,
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
        null,
        {
          defaultClass: this.tts.color,
        },
        HighlightType.ReadAloud,
        "R2_READALOUD_"
      );
      this._ttsQueueItemHighlightsWord = result[0];

      if (
        this.delegate.view.isScrollMode() &&
        this.tts.autoScroll &&
        !this.userScrolled
      ) {
        (result[1].firstChild as HTMLElement).scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
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
  combinedTextSentences: string[] | undefined;
  combinedTextSentencesRangeBegin: number[] | undefined;
  combinedTextSentencesRangeEnd: number[] | undefined;
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
    if (it.combinedTextSentences) {
      let j = -1;
      for (const _sent of it.combinedTextSentences) {
        j++;
        i++;
        if (index === i) {
          return { item: it, iArray: k, iGlobal: i, iSentence: j };
        }
      }
    } else {
      i++;
      if (index === i) {
        return { item: it, iArray: k, iGlobal: i, iSentence: -1 };
      }
    }
  }
  return undefined;
}
export function getTtsQueueLength(items: ITtsQueueItem[]) {
  let l = 0;
  for (const it of items) {
    if (it.combinedTextSentences) {
      l += it.combinedTextSentences.length;
    } else {
      l++;
    }
  }
  return l;
}
export function getTtsQueueItemRefText(obj: ITtsQueueItemReference): string {
  if (obj.iSentence === -1) {
    return obj.item.combinedText;
  }
  if (obj.item.combinedTextSentences) {
    return obj.item.combinedTextSentences[obj.iSentence];
  }
  return "";
}
