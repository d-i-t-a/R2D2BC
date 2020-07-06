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
 * Developed on behalf of: CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import ReaderModule from "./ReaderModule";
import AnnotationModule from "./AnnotationModule";
import { IS_DEV } from "..";
import { ISelectionInfo } from "../model/Locator";

export interface TTSModuleConfig {
    annotationModule: AnnotationModule;
}

export default class TTSModule implements ReaderModule {
    
    annotationModule: AnnotationModule;
    synth = window.speechSynthesis

    initialize() {
        if (this.annotationModule.highlighter !== undefined) {
            this.annotationModule.highlighter.ttsDelegate = this
        }
    }
    cancel() {
        this.synth.cancel()
    }        

    speak(selectionInfo: ISelectionInfo | undefined, node:any, color:any): any {                
    
        var self = this
        var allWords = node.querySelectorAll('.word');

        // --word-index
        var startNode = (selectionInfo as ISelectionInfo).range.startContainer.parentElement
        if (startNode.tagName.toLowerCase() === "a") {
            startNode = startNode.parentElement as HTMLSpanElement
        }
        if (startNode.classList.contains('whitespace')) {
            startNode = startNode.nextElementSibling as HTMLSpanElement
        }
        
        var endNode = (selectionInfo as ISelectionInfo).range.endContainer.parentElement
        if (endNode.tagName.toLowerCase() === "a") {
            endNode = endNode.parentElement as HTMLSpanElement
        }
        if (endNode.classList.contains('whitespace')) {
            endNode = endNode.previousElementSibling as HTMLSpanElement
        }

        var startWordIndex = parseInt(startNode.style.getPropertyValue("--word-index"))

        // TODO if endWord is a whitespace ????
        var endWordIndex = parseInt(endNode.style.getPropertyValue("--word-index")) + 1

        let array = Array.from(allWords)
        let splittingResult = array.slice(startWordIndex,endWordIndex)

        var utterance = new SpeechSynthesisUtterance(selectionInfo.cleanText);
        this.synth.cancel()
        this.synth.speak(utterance);
        var contentText = selectionInfo.cleanText.slice(0);    
        var index = 0 

        utterance.onboundary = function (e:any) {
            if(e.name === "sentence") {
                console.log("sentence boundary", e.charIndex, e.charLength, contentText.slice(e.charIndex, e.charIndex + e.charLength));                                                
            }
            if(e.name === "word") {
                console.log("word boundary", e.charIndex, e.charLength, contentText.slice(e.charIndex, e.charIndex + e.charLength));

                var spokenWordCleaned = contentText.slice(e.charIndex, e.charIndex + e.charLength).replace(/[^a-zA-Z0-9 ]/g, "")
                console.log (spokenWordCleaned)
                if (spokenWordCleaned.length > 0) {
                    var splittingWord = splittingResult[index] as HTMLSpanElement
                    console.log(splittingWord);
                    var splittingWordCleaned = splittingWord.innerText.replace(/[^a-zA-Z0-9 ]/g, "")
                
                    if (splittingWordCleaned.startsWith(spokenWordCleaned)) {
                        if (index > 0) {
                            var lastSplittingWord = splittingResult[index-1] as HTMLSpanElement
                            lastSplittingWord.style.background = "none"
                        }
                        splittingWord.style.background = color
                        splittingWord.scrollIntoView({
                            block: "center",
                            behavior: "smooth",
                        })
                        index++    
                    }
                }
            }
        }
            
        utterance.onend = function () {      
            if (IS_DEV) console.log("utterance ended");
            self.annotationModule.highlighter.doneSpeaking(true)
            var splittingWord = splittingResult[splittingResult.length-1] as HTMLSpanElement
            splittingWord.style.background = "none"
        }    

    }

    // TODO: refactor in comparison with speak to extract common functionality
    speakAll(selectionInfo:any, node:any, color:any, callback: () => void): any {        
        var self = this

        const splittingResult = node.querySelectorAll('.word');

        var utterance = new SpeechSynthesisUtterance(selectionInfo.cleanText);
        this.synth.cancel()
        this.synth.speak(utterance);
        var contentText = selectionInfo.cleanText.slice(0);    
        var index = 0 

        utterance.onboundary = function (e:any) {
            if(e.name === "sentence") {
                console.log("sentence boundary", e.charIndex, e.charLength, contentText.slice(e.charIndex, e.charIndex + e.charLength));                                                
            }
            if(e.name === "word") {
                console.log("word boundary", e.charIndex, e.charLength, contentText.slice(e.charIndex, e.charIndex + e.charLength));

                var spokenWordCleaned = contentText.slice(e.charIndex, e.charIndex + e.charLength).replace(/[^a-zA-Z0-9 ]/g, "")
                var splittingWord = splittingResult[index]
                var splittingWordCleaned = splittingWord.innerText.replace(/[^a-zA-Z0-9 ]/g, "")
            
                if (splittingWordCleaned.startsWith(spokenWordCleaned)) {
                    if (index > 0) {
                        splittingResult[index-1].style.background = "none"
                    }
                    splittingWord.style.background = color
                    splittingWord.scrollIntoView({
                        block: "center",
                        behavior: "smooth",
                      })
                    index++    
                }
            }
        }
            
        utterance.onend = function () {      
            if (IS_DEV) console.log("utterance ended");
            splittingResult[splittingResult.length-1].style.background = "none"
            self.annotationModule.highlighter.doneSpeaking(true)
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
        );
        await annotations.start();
        return annotations;
    }

    public constructor(annotationModule: AnnotationModule) {
        this.annotationModule = annotationModule
    }

    protected async start(): Promise<void> {
        this.annotationModule.delegate.ttsModule = this
    }

    async stop() {
        if (IS_DEV) { console.log("TTS module stop")}
    }

}