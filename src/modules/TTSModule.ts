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

    speak(selectionInfo: ISelectionInfo | undefined , color:any): any {                
    
        var self = this;
        var utterance = new SpeechSynthesisUtterance(selectionInfo.cleanText);
        this.synth.cancel()
        this.synth.speak(utterance);

        let speechEndCallback = function () { return null };
  
        // Handle single paragraph excerpt case
        const selectionWithinOneParagraph = selectionInfo.rangeInfo.endContainerElementCssSelector === selectionInfo.rangeInfo.startContainerElementCssSelector;

        if(selectionWithinOneParagraph) {

            const wrapperElement = document.createElement("span");  
            const selectedRange = selectionInfo.range;
            const rawText = selectionInfo.rawText;

            const originalRangeContent = selectedRange.cloneContents();
            
            wrapperElement.className = "current-tts-target";      
            
            selectedRange.surroundContents(wrapperElement);     
          
            const splittingResult = Splitting.html({
                content: rawText,
                by: "words"
            });        
            
            wrapperElement.innerHTML = splittingResult;
            
            speechEndCallback = function () {
                if (IS_DEV) {console.log("restoring original text")};
                wrapperElement.innerHTML = originalRangeContent.textContent;
                if (IS_DEV){console.log("removing wrapper")};
                const wrapperParent = wrapperElement.parentNode;
                while(wrapperElement.firstChild) wrapperParent.insertBefore(wrapperElement.firstChild, wrapperElement);
                wrapperParent.removeChild(wrapperElement);
            }

            let progressIndex = 0;
            
            const splitWords = wrapperElement.querySelector(".words.splitting");
            
            const currentWords = splitWords.querySelectorAll('.word');

            utterance.onboundary = function (e:any) {
                if(e.name === "sentence") {
                    if (IS_DEV){console.log("sentence boundary", e.charIndex, e.charLength, rawText.slice(e.charIndex, e.charIndex + e.charLength))};                                                
                }
                if(e.name === "word") {
                    if (IS_DEV){console.log("word boundary", e.charIndex, e.charLength, rawText.slice(e.charIndex, e.charIndex + e.charLength))};   
                    const previousWord = (progressIndex > 0) ? <HTMLElement>currentWords[progressIndex-1] : null;
                    const currentWord = <HTMLElement>currentWords[progressIndex];                                        
                    currentWord.style.background = color;
                    if(previousWord) { previousWord.style.background = "none" }
                    if (IS_DEV){console.log("currentWord: " + currentWord, "previousWord: " + previousWord)};                    
                    
                    progressIndex = progressIndex+1;                    
                }
            }
                        

        }
        
        utterance.onend = function () {      
            console.log("utterance ended");
            self.annotationModule.highlighter.doneSpeaking(false)
            speechEndCallback();
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