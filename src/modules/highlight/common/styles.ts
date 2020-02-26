/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

 export const ROOT_CLASS_REDUCE_MOTION = "r2-reduce-motion";
export const ROOT_CLASS_NO_FOOTNOTES = "r2-no-popup-foonotes";
export const POPUP_DIALOG_CLASS = "r2-popup-dialog";
export const FOOTNOTES_CONTAINER_CLASS = "r2-footnote-container";
export const FOOTNOTES_CLOSE_BUTTON_CLASS = "r2-footnote-close";
export const FOOTNOTE_FORCE_SHOW = "r2-footnote-force-show";

// 'a' element: noteref biblioref glossref annoref
//
// @namespace epub "http://www.idpf.org/2007/ops";
// [epub|type~="footnote"]
// VS.
// *[epub\\:type~="footnote"]
//
// :root:not(.${ROOT_CLASS_NO_FOOTNOTES}) aside[epub|type~="biblioentry"],
// :root:not(.${ROOT_CLASS_NO_FOOTNOTES}) aside[epub|type~="annotation"]
export const footnotesCssStyles = `
@namespace epub "http://www.idpf.org/2007/ops";

:root:not(.${ROOT_CLASS_NO_FOOTNOTES}) aside[epub|type~="footnote"]:not(.${FOOTNOTE_FORCE_SHOW}),
:root:not(.${ROOT_CLASS_NO_FOOTNOTES}) aside[epub|type~="note"]:not(.${FOOTNOTE_FORCE_SHOW}),
:root:not(.${ROOT_CLASS_NO_FOOTNOTES}) aside[epub|type~="endnote"]:not(.${FOOTNOTE_FORCE_SHOW}),
:root:not(.${ROOT_CLASS_NO_FOOTNOTES}) aside[epub|type~="rearnote"]:not(.${FOOTNOTE_FORCE_SHOW}) {
    display: none;
}

/*
:root.${POPUP_DIALOG_CLASS} {
    overflow: hidden !important;
}
*/

:root[style] dialog#${POPUP_DIALOG_CLASS}::backdrop,
:root dialog#${POPUP_DIALOG_CLASS}::backdrop {
    background: rgba(0, 0, 0, 0.3) !important;
}
:root[style*="readium-night-on"] dialog#${POPUP_DIALOG_CLASS}::backdrop {
    background: rgba(0, 0, 0, 0.65) !important;
}

:root[style] dialog#${POPUP_DIALOG_CLASS},
:root dialog#${POPUP_DIALOG_CLASS} {
    z-index: 3;

    position: fixed;

    width: 90%;
    max-width: 40em;

    bottom: 1em;
    height: 7em;

    margin: 0 auto;
    padding: 0;

    border-radius: 0.3em;
    border-width: 1px;

    background: white !important;
    border-color: black !important;

    box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);

    display: grid;
    grid-column-gap: 0px;
    grid-row-gap: 0px;

    grid-template-columns: 1.5em auto 1.5em;
    grid-template-rows: auto 1.5em;
}
:root[style*="readium-night-on"] dialog#${POPUP_DIALOG_CLASS} {
    background: #333333 !important;
    border-color: white !important;
}
:root[style*="readium-sepia-on"] dialog#${POPUP_DIALOG_CLASS} {
    background: var(--RS__backgroundColor) !important;
}
:root[style*="--USER__backgroundColor"] dialog#${POPUP_DIALOG_CLASS} {
    background: var(--USER__backgroundColor) !important;
}
:root[style] .${FOOTNOTES_CONTAINER_CLASS},
:root .${FOOTNOTES_CONTAINER_CLASS} {
    overflow: auto;

    grid-column-start: 1;
    grid-column-end: 4;
    grid-row-start: 1;
    grid-row-end: 3;

    padding: 0.3em;
    margin: 0.2em;
}

:root[style] .${FOOTNOTES_CONTAINER_CLASS} > div > *,
:root .${FOOTNOTES_CONTAINER_CLASS} > div > * {
    margin: 0 !important;
    padding: 0 !important;
}

/*
:root[style] .${FOOTNOTES_CLOSE_BUTTON_CLASS},
:root .${FOOTNOTES_CLOSE_BUTTON_CLASS} {
    border: 1px solid black;
    background: white !important;
    color: black !important;

    border-radius: 0.8em;
    position: absolute;
    top: -0.9em;
    left: -0.9em;
    width: 1.8em;
    height: 1.8em;
    font-size: 1em !important;
    font-family: Arial !important;
    cursor: pointer;
}
:root[style*="readium-night-on"] .${FOOTNOTES_CLOSE_BUTTON_CLASS} {
    border: 1px solid white !important;
    background: black !important;
    color: white !important;
}
*/
`;

export const TTS_ID_PREVIOUS = "r2-tts-previous";
export const TTS_ID_NEXT = "r2-tts-next";
export const TTS_ID_SLIDER = "r2-tts-slider";
export const TTS_ID_ACTIVE_WORD = "r2-tts-active-word";
export const TTS_ID_ACTIVE_UTTERANCE = "r2-tts-active-utterance";
export const TTS_CLASS_UTTERANCE = "r2-tts-utterance";
export const TTS_ID_CONTAINER = "r2-tts-txt";
export const TTS_ID_INFO = "r2-tts-info";
export const TTS_NAV_BUTTON_CLASS = "r2-tts-button";
export const TTS_ID_SPEAKING_DOC_ELEMENT = "r2-tts-speaking-el";
export const TTS_CLASS_INJECTED_SPAN = "r2-tts-speaking-txt";
export const TTS_CLASS_INJECTED_SUBSPAN = "r2-tts-speaking-word";
export const TTS_ID_INJECTED_PARENT = "r2-tts-speaking-txt-parent";
export const TTS_POPUP_DIALOG_CLASS = "r2-tts-popup-dialog";

export const ttsCssStyles = `

:root[style] dialog#${POPUP_DIALOG_CLASS}.${TTS_POPUP_DIALOG_CLASS},
:root dialog#${POPUP_DIALOG_CLASS}.${TTS_POPUP_DIALOG_CLASS} {
    width: auto;
    max-width: 100%;

    height: auto;
    max-height: 100%;

    top: 0px;
    bottom: 0px;
    left: 0px;
    right: 0px;

    margin: 0;
    padding: 0;

    box-shadow: none;

    border-radius: 0;
    border-style: solid;
    border-width: 2px;
    border-color: black !important;
}

:root[style] div#${TTS_ID_CONTAINER},
:root div#${TTS_ID_CONTAINER} {
    overflow: auto;
    overflow-x: hidden;

    grid-column-start: 1;
    grid-column-end: 4;
    grid-row-start: 1;
    grid-row-end: 2;

    padding: 1em;
    margin: 0;
    margin-left: 0.2em;
    margin-top: 0.2em;
    margin-right: 0.2em;

    hyphens: none !important;
    word-break: keep-all !important;
    word-wrap: break-word !important;

    font-size: 120% !important;

    line-height: initial !important;

    color: #999999 !important;
}
:root[style*="--USER__lineHeight"] div#${TTS_ID_CONTAINER} {
    line-height: calc(var(--USER__lineHeight) * 1.2) !important;
}
:root[style*="readium-night-on"] div#${TTS_ID_CONTAINER} {
    color: #bbbbbb !important;
}
:root[style*="readium-sepia-on"] div#${TTS_ID_CONTAINER}{
    background: var(--RS__backgroundColor) !important;
    color: var(--RS__textColor) !important;
}
:root[style*="--USER__backgroundColor"] div#${TTS_ID_CONTAINER} {
    background: var(--USER__backgroundColor) !important;
}
:root[style*="--USER__textColor"] div#${TTS_ID_CONTAINER} {
    color: var(--USER__textColor) !important;
}
:root[style] #${TTS_ID_INFO},
:root #${TTS_ID_INFO} {
    display: none;

    padding: 0;
    margin: 0;

    grid-column-start: 2;
    grid-column-end: 3;
    grid-row-start: 2;
    grid-row-end: 3;

    font-family: Arial !important;
    font-size: 90% !important;
}

:root[style] #${TTS_ID_SLIDER},
:root #${TTS_ID_SLIDER} {
    padding: 0;
    margin: 0;
    margin-left: 6px;
    margin-right: 6px;
    margin-top: 6px;
    margin-bottom: 6px;

    grid-column-start: 2;
    grid-column-end: 3;
    grid-row-start: 2;
    grid-row-end: 3;

    cursor: pointer;
    -webkit-appearance: none;

    background: transparent !important;
}
:root #${TTS_ID_SLIDER}::-webkit-slider-runnable-track {
    cursor: pointer;

    width: 100%;
    height: 0.5em;

    background: #999999;

    padding: 0;
    margin: 0;
}
:root[style*="readium-night-on"] #${TTS_ID_SLIDER}::-webkit-slider-runnable-track {
    background: #545454;
}
:root #${TTS_ID_SLIDER}::-webkit-slider-thumb {
    -webkit-appearance: none;

    cursor: pointer;

    width: 0.8em;
    height: 1.5em;

    padding: 0;
    margin: 0;
    margin-top: -0.5em;

    border: none;
    border-radius: 0.2em;

    background: #333333;
}
:root[style*="readium-night-on"] #${TTS_ID_SLIDER}::-webkit-slider-thumb {
    background: white;
}
:root[style] button.${TTS_NAV_BUTTON_CLASS} > span,
:root button.${TTS_NAV_BUTTON_CLASS} > span {
    vertical-align: baseline;
}
:root[style] button.${TTS_NAV_BUTTON_CLASS},
:root button.${TTS_NAV_BUTTON_CLASS} {
    border: none;

    font-size: 100% !important;
    font-family: Arial !important;
    cursor: pointer;

    padding: 0;
    margin-top: 0.2em;
    margin-bottom: 0.2em;

    background: transparent !important;
    color: black !important;
}
:root[style*="readium-night-on"] button.${TTS_NAV_BUTTON_CLASS} {
    color: white !important;
}
/*
:root[style*="readium-sepia-on"] button.${TTS_NAV_BUTTON_CLASS} {
    background: var(--RS__backgroundColor) !important;
}
:root[style*="--USER__backgroundColor"] button.${TTS_NAV_BUTTON_CLASS} {
    background: var(--USER__backgroundColor) !important;
}
*/
:root[style] #${TTS_ID_PREVIOUS},
:root #${TTS_ID_PREVIOUS} {
    margin-left: 0.2em;

    grid-column-start: 1;
    grid-column-end: 2;
    grid-row-start: 2;
    grid-row-end: 3;
}
:root[style] #${TTS_ID_NEXT},
:root #${TTS_ID_NEXT} {
    margin-right: 0.2em;

    grid-column-start: 3;
    grid-column-end: 4;
    grid-row-start: 2;
    grid-row-end: 3;
}

:root[style] .${TTS_ID_SPEAKING_DOC_ELEMENT},
:root .${TTS_ID_SPEAKING_DOC_ELEMENT} {
    /*
    outline-color: silver;
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 1px;
    */
}
:root[style] .${TTS_CLASS_INJECTED_SPAN},
:root .${TTS_CLASS_INJECTED_SPAN} {
    color: black !important;
    background: #FFFFCC !important;

    /* text-decoration: underline; */

    padding: 0;
    margin: 0;
}
/*
:root[style*="readium-night-on"] .${TTS_CLASS_INJECTED_SPAN} {
    color: white !important;
    background: #333300 !important;
}
:root[style] .${TTS_CLASS_INJECTED_SUBSPAN},
:root .${TTS_CLASS_INJECTED_SUBSPAN} {
    text-decoration: underline;
    padding: 0;
    margin: 0;
}
*/
:root[style] .${TTS_ID_INJECTED_PARENT},
:root .${TTS_ID_INJECTED_PARENT} {
    /*
    outline-color: black;
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 1px;
    */
}
:root[style*="readium-night-on"] .${TTS_ID_INJECTED_PARENT} {
    /*
    outline-color: white !important;
    */
}

.${TTS_CLASS_UTTERANCE} {
    margin-bottom: 1em;
    padding: 0;
    display: block;
}

:root[style] div#${TTS_ID_ACTIVE_UTTERANCE},
:root div#${TTS_ID_ACTIVE_UTTERANCE} {
    /* background-color: yellow !important; */

    color: black !important;
}
:root[style*="readium-night-on"] div#${TTS_ID_ACTIVE_UTTERANCE} {
    color: white !important;
}
:root[style*="readium-sepia-on"] div#${TTS_ID_ACTIVE_UTTERANCE} {
    color: black !important;
}
:root[style*="--USER__textColor"] div#${TTS_ID_ACTIVE_UTTERANCE} {
    color: var(--USER__textColor) !important;
}

:root[style] span#${TTS_ID_ACTIVE_WORD},
:root span#${TTS_ID_ACTIVE_WORD} {
    color: black !important;

    /*
    text-decoration: underline;
    text-underline-position: under;
    */
    outline-color: black;
    outline-offset: 2px;
    outline-style: solid;
    outline-width: 1px;

    padding: 0;
    margin: 0;
}
:root[style*="readium-night-on"] span#${TTS_ID_ACTIVE_WORD} {
    color: white !important;
    outline-color: white;
}
:root[style*="readium-sepia-on"] span#${TTS_ID_ACTIVE_WORD} {
    color: black !important;
    outline-color: black;
}
:root[style*="--USER__textColor"] span#${TTS_ID_ACTIVE_WORD} {
    color: var(--USER__textColor) !important;
    outline-color: var(--USER__textColor);
}
`;

export const ROOT_CLASS_INVISIBLE_MASK = "r2-visibility-mask";
export const visibilityMaskCssStyles = `
:root[style] *.${ROOT_CLASS_INVISIBLE_MASK},
:root *.${ROOT_CLASS_INVISIBLE_MASK} {
    visibility: hidden !important;
}
`;

export const ROOT_CLASS_KEYBOARD_INTERACT = "r2-keyboard-interact";
export const CSS_CLASS_NO_FOCUS_OUTLINE = "r2-no-focus-outline";
export const focusCssStyles = `
@keyframes readium2ElectronAnimation_FOCUS {
    0% {
    }
    100% {
        outline: inherit;
    }
}
:root[style] *:focus,
:root *:focus {
    outline: none;
}
:root[style].${ROOT_CLASS_KEYBOARD_INTERACT} *.${CSS_CLASS_NO_FOCUS_OUTLINE}:focus,
:root.${ROOT_CLASS_KEYBOARD_INTERACT} *.${CSS_CLASS_NO_FOCUS_OUTLINE}:focus {
    outline: none !important;
}
:root[style].${ROOT_CLASS_KEYBOARD_INTERACT} *:focus,
:root.${ROOT_CLASS_KEYBOARD_INTERACT} *:focus {
    outline-color: blue !important;
    outline-style: solid !important;
    outline-width: 2px !important;
    outline-offset: 2px !important;
}
/*
:root[style]:not(.${ROOT_CLASS_KEYBOARD_INTERACT}) *:focus,
:root:not(.${ROOT_CLASS_KEYBOARD_INTERACT}) *:focus {
    animation-name: readium2ElectronAnimation_FOCUS;
    animation-duration: 3s;
    animation-delay: 1s;
    animation-fill-mode: forwards;
    animation-timing-function: linear;
}
*/
`;

export const targetCssStyles = `
@keyframes readium2ElectronAnimation_TARGET {
    0% {
    }
    100% {
        outline: inherit;
    }
}
:root[style] *:target,
:root *:target {
    outline-color: green !important;
    outline-style: solid !important;
    outline-width: 2px !important;
    outline-offset: 2px !important;

    animation-name: readium2ElectronAnimation_TARGET;
    animation-duration: 3s;
    animation-delay: 1s;
    animation-fill-mode: forwards;
    animation-timing-function: linear;
}
:root[style] *.r2-no-target-outline:target,
:root *.r2-no-target-outline:target {
    outline: inherit !important;
}
`;

export const selectionCssStyles = `
:root[style] ::selection,
:root ::selection {
background: rgb(155, 179, 240) !important;
color: black !important;
}

:root[style*="readium-night-on"] ::selection {
background: rgb(100, 122, 177) !important;
color: white !important;
}
`;

export const scrollBarCssStyles = `
::-webkit-scrollbar-button {
height: 0px !important;
width: 0px !important;
}

::-webkit-scrollbar-corner {
background: transparent !important;
}

/*::-webkit-scrollbar-track-piece {
background: red;
} */

::-webkit-scrollbar {
width:  14px;
height: 14px;
}

::-webkit-scrollbar-thumb {
background: #727272;
background-clip: padding-box !important;
border: 3px solid transparent !important;
border-radius: 30px;
}

::-webkit-scrollbar-thumb:hover {
background: #4d4d4d;
}

::-webkit-scrollbar-track {
box-shadow: inset 0 0 3px rgba(40, 40, 40, 0.2);
background: #dddddd;
box-sizing: content-box;
}

::-webkit-scrollbar-track:horizontal {
border-top: 1px solid silver;
}
::-webkit-scrollbar-track:vertical {
border-left: 1px solid silver;
}

:root[style*="readium-night-on"] ::-webkit-scrollbar-thumb {
background: #a4a4a4;
border: 3px solid #545454;
}

:root[style*="readium-night-on"] ::-webkit-scrollbar-thumb:hover {
background: #dedede;
}

:root[style*="readium-night-on"] ::-webkit-scrollbar-track {
background: #545454;
}

:root[style*="readium-night-on"] ::-webkit-scrollbar-track:horizontal {
border-top: 1px solid black;
}
:root[style*="readium-night-on"] ::-webkit-scrollbar-track:vertical {
border-left: 1px solid black;
}`;

export const readPosCssStylesAttr1 = "data-readium2-read-pos1";
export const readPosCssStylesAttr2 = "data-readium2-read-pos2";
export const readPosCssStylesAttr3 = "data-readium2-read-pos3";
export const readPosCssStylesAttr4 = "data-readium2-read-pos4";
export const readPosCssStyles = `
:root[style*="readium-sepia-on"] *[${readPosCssStylesAttr1}],
:root[style*="readium-night-on"] *[${readPosCssStylesAttr1}],
:root[style] *[${readPosCssStylesAttr1}],
:root *[${readPosCssStylesAttr1}] {
    color: black !important;
    background: magenta !important;

    outline-color: magenta !important;
    outline-style: solid !important;
    outline-width: 6px !important;
    outline-offset: 0px !important;
}
:root[style*="readium-sepia-on"] *[${readPosCssStylesAttr2}],
:root[style*="readium-night-on"] *[${readPosCssStylesAttr2}],
:root[style] *[${readPosCssStylesAttr2}],
:root *[${readPosCssStylesAttr2}] {
    color: black !important;
    background: yellow !important;

    outline-color: yellow !important;
    outline-style: solid !important;
    outline-width: 4px !important;
    outline-offset: 0px !important;
}
:root[style*="readium-sepia-on"] *[${readPosCssStylesAttr3}],
:root[style*="readium-night-on"] *[${readPosCssStylesAttr3}],
:root[style] *[${readPosCssStylesAttr3}],
:root *[${readPosCssStylesAttr3}] {
    color: black !important;
    background: green !important;

    outline-color: green !important;
    outline-style: solid !important;
    outline-width: 2px !important;
    outline-offset: 0px !important;
}
:root[style*="readium-sepia-on"] *[${readPosCssStylesAttr4}],
:root[style*="readium-night-on"] *[${readPosCssStylesAttr4}],
:root[style] *[${readPosCssStylesAttr4}],
:root *[${readPosCssStylesAttr4}] {
    color: black !important;
    background: silver !important;

    outline-color: silver !important;
    outline-style: solid !important;
    outline-width: 1px !important;
    outline-offset: 0px !important;
}`;
