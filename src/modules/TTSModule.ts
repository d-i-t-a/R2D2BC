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

    speak(selectionInfo: ISelectionInfo | undefined ): any {        
        if (IS_DEV) console.log(selectionInfo.cleanText)
        var self = this
        var utterance = new SpeechSynthesisUtterance(selectionInfo.cleanText);
        this.synth.cancel()
        this.synth.speak(utterance);
        utterance.onend = function () {      
            if (IS_DEV) console.log("utterance ended");
            self.annotationModule.highlighter.doneSpeaking()
        }    
    }
    speakAll(selectionInfo: string | undefined , callback: () => void): any {        
        if (IS_DEV) console.log(selectionInfo)
        var self = this
        var utterance = new SpeechSynthesisUtterance(selectionInfo);
        this.synth.cancel()
        this.synth.speak(utterance);
        utterance.onend = function () {      
            if (IS_DEV) console.log("utterance ended");
            self.annotationModule.highlighter.doneSpeaking()
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