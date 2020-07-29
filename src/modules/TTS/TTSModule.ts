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

export interface TTSModuleConfig {
    annotationModule: AnnotationModule;
    tts: TTSSettings
}

export interface TTSSpeechConfig { 
    enableSplitter?: boolean;
    splitterWordClass?: string;
    highlight?: string;
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

    synth = window.speechSynthesis

    initialize() {
        if (this.annotationModule.highlighter !== undefined) {
            this.annotationModule.highlighter.ttsDelegate = this
            this.tts.setControls();
        }
    }
    cancel() {
        this.synth.cancel()
    }        

    async speak(selectionInfo: ISelectionInfo | undefined, node:any, partial:boolean, callback: () => void): Promise<any> {                
    
        var self = this
        var splittingResult: string | any[]
        if (this.annotationModule.delegate.tts.enableSplitter) {

            if (partial) {
                var allWords = node.querySelectorAll(this.annotationModule.delegate.tts.splitterWordClass);

                var startNode = (selectionInfo as ISelectionInfo).range.startContainer.parentElement
                if (startNode.tagName.toLowerCase() === "a") {
                    startNode = startNode.parentElement as HTMLElement
                }
                if (startNode.classList.contains('whitespace')) {
                    startNode = startNode.nextElementSibling as HTMLElement
                }
                
                var endNode = (selectionInfo as ISelectionInfo).range.endContainer.parentElement
                if (endNode.tagName.toLowerCase() === "a") {
                    endNode = endNode.parentElement as HTMLElement
                }
                if (endNode.classList.contains('whitespace')) {
                    endNode = endNode.previousElementSibling as HTMLElement
                }

                var startWordIndex = parseInt(startNode.style.getPropertyValue("--word-index"))
                var endWordIndex = parseInt(endNode.style.getPropertyValue("--word-index")) + 1

                let array = Array.from(allWords)
                splittingResult = array.slice(startWordIndex,endWordIndex)
            } else {
                splittingResult = node.querySelectorAll(this.annotationModule.delegate.tts.splitterWordClass);
            }
        }
        var utterance = new SpeechSynthesisUtterance(selectionInfo.cleanText);
        utterance.rate = self.annotationModule.delegate.tts.rate ? self.annotationModule.delegate.tts.rate : 1.0
        utterance.pitch = self.annotationModule.delegate.tts.pitch ? self.annotationModule.delegate.tts.pitch : 1.0
        utterance.volume = self.annotationModule.delegate.tts.volume ? self.annotationModule.delegate.tts.volume : 1.0
        utterance.rate = this.tts.rate
        utterance.pitch = this.tts.pitch
        utterance.volume = this.tts.volume
        

        console.log(this.tts.rate)
        console.log(this.tts.pitch)
        console.log(this.tts.volume)
        console.log(this.tts.color)
        
        var voices = this.synth.getVoices();
        console.log(voices)

        // use publication language
        if ((self.annotationModule.delegate.tts.voice && self.annotationModule.delegate.tts.voice.usePublication) || self.annotationModule.delegate.tts.voice == undefined) {
            utterance.voice = voices.filter((el: any) => el.lang.startsWith(self.annotationModule.delegate.publication.metadata.language[0]) || el.lang.endsWith(self.annotationModule.delegate.publication.metadata.language[0].toUpperCase()))[0]
        }
        // if no voice, then use configured language
        if (self.annotationModule.delegate.tts.voice && (utterance.voice == undefined || utterance.voice == null)) {
            utterance.voice = voices.filter((el: any) => el.lang == self.annotationModule.delegate.tts.voice.lang && el.name == self.annotationModule.delegate.tts.voice.name)[0]
        }
        // if no voice still, use default language 
        if (utterance.voice == undefined || utterance.voice == null) {
            utterance.voice = voices.filter((el: any) => el.default == true)[0]
        }
        utterance.voice =  voices.filter((el: any) => el.lang == this.tts.voice.lang && el.name == this.tts.voice.name)[0] 

        this.synth.cancel()
        this.synth.speak(utterance);
        var contentText = selectionInfo.cleanText.slice(0);    
        var index = 0 
        var prevLineIndex = -1
        var verticalScroll = (await self.annotationModule.delegate.settings.getProperty(ReadiumCSS.SCROLL_KEY) != null) ? (await self.annotationModule.delegate.settings.getProperty(ReadiumCSS.SCROLL_KEY) as Switchable).value : false

        utterance.onboundary = function (e:any) {
            if(e.name === "sentence") {
                console.log("sentence boundary", e.charIndex, e.charLength, contentText.slice(e.charIndex, e.charIndex + e.charLength));                                                
            }
            if(e.name === "word") {
                console.log("word boundary", e.charIndex, e.charLength, contentText.slice(e.charIndex, e.charIndex + e.charLength));
                if (self.annotationModule.delegate.tts.enableSplitter) {

                    var spokenWordCleaned = contentText.slice(e.charIndex, e.charIndex + e.charLength).replace(/[^a-zA-Z0-9 ]/g, "")
                    var splittingWord = splittingResult[index] as HTMLElement
                    if (splittingWord) {
                        var isAnchorParent = splittingWord.parentElement.tagName.toLowerCase() === "a"
                        if (!isAnchorParent) {
                            var splittingWordCleaned = splittingWord.innerText.replace(/[^a-zA-Z0-9 ]/g, "")
                            if (spokenWordCleaned.length > 0 && splittingWordCleaned.length > 0) {
                            
                                if (splittingWordCleaned.startsWith(spokenWordCleaned) || splittingWordCleaned.endsWith(spokenWordCleaned)) {
                                    
                                    if (self.annotationModule.delegate.tts.highlight == "lines") {

                                        var startLineIndex = parseInt(splittingWord.style.getPropertyValue("--line-index"))

                                        if (prevLineIndex >= 0 && prevLineIndex != startLineIndex) {
                                            var prevLine = ".--line-index_" + prevLineIndex
                                            let prevElements = node.querySelectorAll(prevLine);
                                            var whitespaces: HTMLElement[] = []

                                            prevElements.forEach(element => {
                                                element.style.removeProperty("background")
                                                var nextElement = element.nextElementSibling as HTMLElement
                                                if (nextElement != null && nextElement.className.startsWith("whitespace")) {
                                                    whitespaces.push(nextElement)
                                                }
                                            });


                                            if (prevElements.length > 1) {                                                
                                                whitespaces.forEach(element => {
                                                    element.style.removeProperty("background")
                                                });
                                            }
                                        }
                                        
                                        prevLineIndex = startLineIndex
                                        var startLine = ".--line-index_" + startLineIndex
                                        let elements = node.querySelectorAll(startLine);
                                        var whitespaces1: HTMLElement[] = []
                                        elements.forEach(element => {
                                            element.style.background = self.tts.color
                                            var nextElement = element.nextElementSibling as HTMLElement
                                            if (nextElement != null && nextElement.className.startsWith("whitespace")) {
                                                whitespaces1.push(nextElement)
                                            }
                                        });
                                        if (elements.length > 1) {                                            
                                            whitespaces1.forEach(element => {
                                                element.style.background = self.tts.color
                                            });
                                        }


                                    } else if (self.annotationModule.delegate.tts.highlight == "words") {
                                        
                                        if (index > 0) {
                                            var lastSplittingWord = splittingResult[index-1] as HTMLElement
                                            lastSplittingWord.style.removeProperty("background")
                                        }
                                        splittingWord.style.background = self.tts.color    

                                    }

                                    if (!verticalScroll && self.annotationModule.delegate.tts.autoScroll) {
                                        splittingWord.scrollIntoView({
                                            block: "center",
                                            behavior: "smooth",
                                        })
                                    }
                                    index++    

                                }
                            } else if (splittingWordCleaned.length == 0) {
                                if (self.annotationModule.delegate.tts.highlight == "lines") {
                                    var startLineIndex = parseInt(splittingWord.style.getPropertyValue("--line-index"))

                                    if (prevLineIndex >= 0 && prevLineIndex != startLineIndex) {
                                        var prevLine = ".--line-index_" + prevLineIndex
                                        let prevElements = node.querySelectorAll(prevLine);
                                        prevElements.forEach(element => {
                                            element.style.removeProperty("background")
                                        });

                                    }
                                    
                                    prevLineIndex = startLineIndex
                                    var startLine = ".--line-index_" + startLineIndex
                                    let elements = node.querySelectorAll(startLine);
                                    elements.forEach(element => {
                                        element.style.background = self.tts.color
                                    });

                                } else if (self.annotationModule.delegate.tts.highlight == "words") {
                                    if (index > 0) {
                                        var lastSplittingWord = splittingResult[index-1] as HTMLElement
                                        lastSplittingWord.style.removeProperty("background")
                                    }
                                }
                                index++    
                            }
                        } else {
                            index++    
                        }
                    }
                }
            }
        }
            
        utterance.onend = function () {      
            if (IS_DEV) console.log("utterance ended");
            self.annotationModule.highlighter.doneSpeaking(true)
            if (self.annotationModule.delegate.tts.enableSplitter) {
                var splittingWord = splittingResult[splittingResult.length-1] as HTMLElement
                splittingWord.style.removeProperty("background")
            }
        }    
        callback()

    }

    speakPause() {
        this.synth.pause()
    }
    speakResume() {
        this.synth.resume()
    }
    
    public static async create(config: TTSModuleConfig) {
        const annotations = new this(
            config.annotationModule,
            config.tts
        );
        await annotations.start();
        return annotations;
    }

    public constructor(annotationModule: AnnotationModule, tts:TTSSettings) {
        this.annotationModule = annotationModule
        this.tts =  tts
    }

    protected async start(): Promise<void> {
        this.annotationModule.delegate.ttsModule = this
    }

    async stop() {
        if (IS_DEV) { console.log("TTS module stop")}
    }

}