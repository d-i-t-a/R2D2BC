/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2020. DITA. All rights reserved.
 * Developed on behalf of: CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import ReaderModule from "./ReaderModule";
import AnnotationModule from "./AnnotationModule";
import { IS_DEV } from "..";
import { ISelectionInfo } from "../model/Locator";
import Splitting from "splitting";


export interface TTSModuleConfig {
    annotationModule: AnnotationModule;
}

export default class TTSModule implements ReaderModule {
    
    annotationModule: AnnotationModule;
    synth = window.speechSynthesis

    initialize() {
        this.annotationModule.highlighter.ttsDelegate = this
    }
    cancel() {
        this.synth.cancel()
    }

    speak(selectionInfo: ISelectionInfo | undefined ): any {        
        console.log(selectionInfo.cleanText)
        var self = this
        var utterance = new SpeechSynthesisUtterance(selectionInfo.cleanText);
        this.synth.cancel()
        this.synth.speak(utterance);
        utterance.onend = function () {      
            console.log("utterance ended");
            self.annotationModule.highlighter.doneSpeaking(false)
        }    
    }
    speakAll(selectionInfo:any, node:any, color:any, callback: () => void): any {        
        var self = this

        const splittingResult =  Splitting({
            target: node,
            by: "words"
        });

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
                var splittingWord = splittingResult[0].words[index]
                var splittingWordCleaned = splittingWord.innerText.replace(/[^a-zA-Z0-9 ]/g, "")
            
                if (splittingWordCleaned.startsWith(spokenWordCleaned)) {
                    if (index > 0) {
                        splittingResult[0].words[index-1].style.background = "none"
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
            console.log("utterance ended");
            splittingResult[0].words[splittingResult[0].words.length-1].style.background = "none"
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