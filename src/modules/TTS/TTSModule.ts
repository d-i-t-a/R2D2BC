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
import AnnotationModule from "../AnnotationModule";
import { IS_DEV } from "../..";
import { ISelectionInfo } from "../../model/Locator";
import { ReadiumCSS } from "../../model/user-settings/ReadiumCSS";
import { Switchable } from "../../model/user-settings/UserProperties";
import { TTSSettings, TTSVoice } from "./TTSSettings";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import { addEventListenerOptional, removeEventListenerOptional } from "../../utils/EventHandler";

export interface TTSModuleConfig {
    annotationModule: AnnotationModule;
    tts: TTSSettings
}

export interface TTSSpeechConfig {
    enableSplitter?: boolean;
    color?: string;
    autoScroll?: boolean;
    rate?: number;
    pitch?: number;
    volume?: number;
    voice?: TTSVoice;
}

export default class TTSModule implements ReaderModule {

    annotationModule: AnnotationModule;
    tts: TTSSettings;
    body: any
    splittingResult: any[]
    voices: SpeechSynthesisVoice[] = []

    initialize(body: any) {
        if (this.annotationModule.highlighter !== undefined) {
            this.annotationModule.highlighter.ttsDelegate = this
            this.tts.setControls();
            this.tts.onSettingsChange(this.handleResize.bind(this));
            this.body = body
            let splittingResult = body.querySelectorAll("[data-word]");
            splittingResult.forEach(splittingWord => {
                splittingWord.dataset.ttsColor = this.tts.color
            });
            let whitespace = body.querySelectorAll("[data-whitespace]");
            whitespace.forEach(splittingWord => {
                splittingWord.dataset.ttsColor = this.tts.color
            });

            this.initVoices(true);

            addEventListenerOptional(this.body, 'wheel', this.wheel.bind(this));
            addEventListenerOptional(document, 'keydown', this.wheel.bind(this));
            addEventListenerOptional(this.annotationModule.delegate.iframe.contentDocument, 'keydown', this.wheel.bind(this));
        }
    }

    private initVoices(first:boolean) {
        function setSpeech() {
            return new Promise(
                function (resolve, _reject) {
                    let synth = window.speechSynthesis;
                    let id;

                    id = setInterval(() => {
                        if (synth.getVoices().length !== 0) {
                            resolve(synth.getVoices());
                            clearInterval(id);
                        }
                    }, 10);
                }
            );
        }

        let s = setSpeech();
        s.then(async (voices: SpeechSynthesisVoice[]) => {
            if (IS_DEV) console.log(voices);
            this.voices = []
            voices.forEach(voice => {
                if (voice.localService == true) {
                    this.voices.push(voice);
                }
            });
            if (IS_DEV) console.log(this.voices);
            if (first) {
                // preferred-languages
                var preferredLanguageSelector = HTMLUtilities.findElement(this.annotationModule.delegate.headerMenu, "#preferred-languages") as HTMLSelectElement;
                if (preferredLanguageSelector) {
                    this.voices.forEach(voice => {
                        var v = document.createElement("option") as HTMLOptionElement;
                        v.value = voice.name + ":" + voice.lang;
                        v.innerHTML = voice.name + " (" + voice.lang + ")";
                        preferredLanguageSelector.add(v);
                    });
                }
            }
        });
    }

    cancel() {
        this.userScrolled = false 
        window.speechSynthesis.cancel()
        if (this.splittingResult && this.annotationModule.delegate.tts.enableSplitter) {
            this.splittingResult.forEach(splittingWord => {
                splittingWord.dataset.ttsCurrentWord = "false"
                splittingWord.dataset.ttsCurrentLine = "false"
            });
        }
    }

    private handleResize(): void {
        let splittingResult = this.body.querySelectorAll("[data-word]");
        splittingResult.forEach(splittingWord => {
            splittingWord.dataset.ttsColor = this.tts.color
            splittingWord.dataset.ttsCurrentWord = "false"
            splittingWord.dataset.ttsCurrentLine = "false"

        });
        let whitespace = this.body.querySelectorAll("[data-whitespace]");
        whitespace.forEach(splittingWord => {
            splittingWord.dataset.ttsColor = this.tts.color
            splittingWord.dataset.ttsCurrentWord = "false"
            splittingWord.dataset.ttsCurrentLine = "false"
        });
    }

    async speak(selectionInfo: ISelectionInfo | undefined, node: any, partial: boolean, callback: () => void): Promise<any> {

        this.userScrolled = false 
        var self = this

        this.cancel()

        if (this.annotationModule.delegate.tts.enableSplitter) {
            if (partial) {
                var allWords = node.querySelectorAll("[data-word]");

                var startNode = (selectionInfo as ISelectionInfo).range.startContainer.parentElement
                if (startNode.tagName.toLowerCase() === "a") {
                    startNode = startNode.parentElement as HTMLElement
                }
                if (startNode.dataset == undefined) {
                    startNode = startNode.nextElementSibling as HTMLElement
                }

                var endNode = (selectionInfo as ISelectionInfo).range.endContainer.parentElement
                if (endNode.tagName.toLowerCase() === "a") {
                    endNode = endNode.parentElement as HTMLElement
                }
                if (endNode.dataset == undefined) {
                    endNode = endNode.previousElementSibling as HTMLElement
                }

                var startWordIndex = parseInt(startNode.dataset.wordIndex)
                var endWordIndex = parseInt(endNode.dataset.wordIndex) + 1

                let array = Array.from(allWords)
                this.splittingResult = array.slice(startWordIndex, endWordIndex)
            } else {
                this.splittingResult = node.querySelectorAll("[data-word]");
            }
        }
        const utterance = new SpeechSynthesisUtterance(selectionInfo.cleanText);
        utterance.rate = this.tts.rate
        utterance.pitch = this.tts.pitch
        utterance.volume = this.tts.volume
        
        if (IS_DEV) console.log("this.tts.voice.lang", this.tts.voice.lang)

        var initialVoiceHasHyphen = true
        if (this.tts.voice && this.tts.voice.lang) {
            initialVoiceHasHyphen = (this.tts.voice.lang.indexOf("-") !== -1)
            if (initialVoiceHasHyphen == false) {
                this.tts.voice.lang = this.tts.voice.lang.replace("_", "-")
                initialVoiceHasHyphen = true
            }
        }
        if (IS_DEV) console.log("initialVoiceHasHyphen", initialVoiceHasHyphen)
        if (IS_DEV) console.log("voices", this.voices)
        var initialVoice = undefined
        if (initialVoiceHasHyphen == true) {
            initialVoice = (this.tts.voice && this.tts.voice.lang && this.tts.voice.name) ? this.voices.filter((v: any) => v.lang.replace("_", "-") == this.tts.voice.lang && v.name.localeCompare(this.tts.voice.name))[0] : undefined
            if (initialVoice == undefined) {
                initialVoice = (this.tts.voice && this.tts.voice.lang) ? this.voices.filter((v: any) => v.lang.replace("_", "-") == this.tts.voice.lang)[0] : undefined    
            }
        } else {
            initialVoice = (this.tts.voice && this.tts.voice.lang && this.tts.voice.name) ? this.voices.filter((v: any) => v.lang == this.tts.voice.lang && v.name.localeCompare(this.tts.voice.name))[0] : undefined
            if (initialVoice == undefined) {
                initialVoice = (this.tts.voice && this.tts.voice.lang) ? this.voices.filter((v: any) => v.lang == this.tts.voice.lang)[0] : undefined    
            }
        }
        if (IS_DEV) console.log("initialVoice", initialVoice)

        var publicationVoiceHasHyphen = (self.annotationModule.delegate.publication.metadata.language[0].indexOf("-") !== -1)
        if (IS_DEV) console.log("publicationVoiceHasHyphen", publicationVoiceHasHyphen)
        var publicationVoice = undefined
        if (publicationVoiceHasHyphen == true) {
            publicationVoice = (this.tts.voice && this.tts.voice.usePublication) ? this.voices.filter((v: any) => v.lang.replace("_", "-").startsWith(self.annotationModule.delegate.publication.metadata.language[0]) || v.lang.replace("_", "-").endsWith(self.annotationModule.delegate.publication.metadata.language[0].toUpperCase()) )[0] : undefined
        } else {
            publicationVoice = (this.tts.voice && this.tts.voice.usePublication) ? this.voices.filter((v: any) => v.lang.startsWith(self.annotationModule.delegate.publication.metadata.language[0]) || v.lang.endsWith(self.annotationModule.delegate.publication.metadata.language[0].toUpperCase()) )[0] : undefined
        }
        if (IS_DEV) console.log("publicationVoice", publicationVoice)

        var defaultVoiceHasHyphen = (navigator.language.indexOf("-") !== -1)
        if (IS_DEV) console.log("defaultVoiceHasHyphen", defaultVoiceHasHyphen)
        var defaultVoice = undefined
        if (defaultVoiceHasHyphen == true) {
            defaultVoice = this.voices.filter((v: any) => v.lang.replace("_", "-") == navigator.language && v.localService == true)[0]
        } else {
            defaultVoice = this.voices.filter((v: any) => v.lang == navigator.language && v.localService == true)[0]
        }
        if (IS_DEV) console.log("defaultVoice", defaultVoice)

        if (initialVoice) {
            if (IS_DEV) console.log("initialVoice")
            utterance.voice = initialVoice
        } else if (publicationVoice) {
            if (IS_DEV) console.log("publicationVoice")
            utterance.voice = publicationVoice
        } else if (defaultVoice) {
            if (IS_DEV) console.log("defaultVoice")
            utterance.voice = defaultVoice
        }
        utterance.lang = utterance.voice.lang
        if (IS_DEV)  console.log("utterance.voice.lang", utterance.voice.lang)
        if (IS_DEV)  console.log("utterance.lang", utterance.lang)
        if (IS_DEV)  console.log("navigator.language", navigator.language)

        window.speechSynthesis.speak(utterance);

        var index = 0
        var lastword = undefined
        var verticalScroll = (await self.annotationModule.delegate.settings.getProperty(ReadiumCSS.SCROLL_KEY) != null) ? (await self.annotationModule.delegate.settings.getProperty(ReadiumCSS.SCROLL_KEY) as Switchable).value : false

        utterance.onboundary = function (e: any) {
            if (e.name === "sentence") {
                if (IS_DEV) console.log("sentence boundary", e.charIndex, e.charLength, utterance.text.slice(e.charIndex, e.charIndex + e.charLength));
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
                const word = getWordAt(utterance.text, e.charIndex)
                if (lastword == word) {
                    index--
                }
                lastword = word

                if (self.annotationModule.delegate.tts.enableSplitter) {


                    processWord(word, verticalScroll)

                }
            }
        }

        function processWord(word, verticalScroll) {

            var spokenWordCleaned = word.replace(/[^a-zA-Z0-9 ]/g, "")
            if (IS_DEV) console.log("spokenWordCleaned", spokenWordCleaned);

            var splittingWord = self.splittingResult[index] as HTMLElement
            var splittingWordCleaned = splittingWord.innerText.replace(/[^a-zA-Z0-9 ]/g, "")
            if (IS_DEV) console.log("splittingWordCleaned", splittingWordCleaned);

            if (splittingWordCleaned.length == 0) {
                index++
                splittingWord = self.splittingResult[index] as HTMLElement
                splittingWordCleaned = splittingWord.innerText.replace(/[^a-zA-Z0-9 ]/g, "")
                if (IS_DEV) console.log("splittingWordCleaned", splittingWordCleaned);
            }

            if (splittingWord) {

                var isAnchorParent = splittingWord.parentElement.tagName.toLowerCase() === "a"
                if (!isAnchorParent) {

                    if (spokenWordCleaned.length > 0 && splittingWordCleaned.length > 0) {

                        if (splittingWordCleaned.startsWith(spokenWordCleaned) || splittingWordCleaned.endsWith(spokenWordCleaned)
                            || spokenWordCleaned.startsWith(splittingWordCleaned) || spokenWordCleaned.endsWith(splittingWordCleaned)) {

                            if (index > 0) {
                                let splittingResult = self.body.querySelectorAll("[data-word]");
                                splittingResult.forEach(splittingWord => {
                                    splittingWord.dataset.ttsColor = self.tts.color
                                    splittingWord.dataset.ttsCurrentWord = "false"
                                    splittingWord.dataset.ttsCurrentLine = "false"

                                });
                                let whitespace = self.body.querySelectorAll("[data-whitespace]");
                                whitespace.forEach(splittingWord => {
                                    splittingWord.dataset.ttsColor = self.tts.color
                                    splittingWord.dataset.ttsCurrentWord = "false"
                                    splittingWord.dataset.ttsCurrentLine = "false"
                                });

                            }
                            splittingWord.dataset.ttsCurrentWord = "true"

                            if (!verticalScroll && self.tts.autoScroll && !self.userScrolled) {
                                splittingWord.scrollIntoView({
                                    block: "center",
                                    behavior: "smooth",
                                })
                            }
                        } else {
                            index++
                        }
                    }
                }
                index++
            }

        }

        utterance.onend = function () {
            if (IS_DEV) console.log("utterance ended");
            self.annotationModule.highlighter.doneSpeaking()
            if (self.annotationModule.delegate.tts.enableSplitter) {

                let splittingResult = self.body.querySelectorAll("[data-word]");
                splittingResult.forEach(splittingWord => {
                    splittingWord.dataset.ttsColor = self.tts.color
                    splittingWord.dataset.ttsCurrentWord = "false"
                    splittingWord.dataset.ttsCurrentLine = "false"

                });
                let whitespace = self.body.querySelectorAll("[data-whitespace]");
                whitespace.forEach(splittingWord => {
                    splittingWord.dataset.ttsColor = self.tts.color
                    splittingWord.dataset.ttsCurrentWord = "false"
                    splittingWord.dataset.ttsCurrentLine = "false"
                });

            }
        }
        callback()

    }

    speakPause() {
        this.userScrolled = false 
        window.speechSynthesis.pause()
    }
    
    speakResume() {
        this.userScrolled = false 
        window.speechSynthesis.resume()
    }

    public static async create(config: TTSModuleConfig) {
        const tts = new this(
            config.annotationModule,
            config.tts
        );
        await tts.start();
        return tts;
    }

    public constructor(annotationModule: AnnotationModule, tts: TTSSettings) {
        this.annotationModule = annotationModule
        this.tts = tts
    }

    protected async start(): Promise<void> {
        this.annotationModule.delegate.ttsModule = this
    }

    userScrolled = false
    private wheel(event: KeyboardEvent | MouseEvent): void {
        if (IS_DEV) console.log(event)
        if (event instanceof KeyboardEvent) {
            const key = event.key;
            switch (key) { 
                case "ArrowUp":
                  this.userScrolled = true
                  break;
                case "ArrowDown":
                  this.userScrolled = true
                  break;
              } 
        } else {
            this.userScrolled = true
        }
    }

    async stop() {
        if (IS_DEV) { console.log("TTS module stop") }
        removeEventListenerOptional(this.body, 'wheel', this.wheel.bind(this));
        removeEventListenerOptional(document, 'keydown', this.wheel.bind(this));
        removeEventListenerOptional(this.annotationModule.delegate.iframe.contentDocument, 'keydown', this.wheel.bind(this));
    }

}