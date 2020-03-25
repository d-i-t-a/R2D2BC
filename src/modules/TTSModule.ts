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


export interface TTSModuleConfig {
    annotationModule: AnnotationModule;
}

export default class TTSModule implements ReaderModule {
    
    annotationModule: AnnotationModule;

    initialize() {
        this.annotationModule.highlighter.ttsDelegate = this
    }

    speak(selectionInfo: ISelectionInfo | undefined ): any {        
        console.log(selectionInfo.cleanText)
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