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
 */

import * as Mark from "mark.js";

export const IS_DEV =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";

async function markCuedWords(glossary: Array<GlossaryItem>) {
  if (IS_DEV) console.log("glossary mark words " + glossary);

  glossary.forEach(async function (glossaryitem: GlossaryItem) {
    if (IS_DEV) console.log(glossaryitem);
    var instance = new Mark(document.body);
    await instance.mark(glossaryitem.word, {
      accuracy: { value: "exactly", limiters: [".", ",", ";", ":", ")"] },
      separateWordSearch: false,
      acrossElements: true,
      exclude: ["h1", "h2", "h3", "h4", "h5", "h6", "figure"],
      element: "a",
      className: "gloss",
      each: function (node) {
        node.addEventListener(
          "click",
          async (event) => {
            var htmlElement = node as HTMLElement;
            if (IS_DEV) console.log("Mark Node Click Handler");

            event.preventDefault();
            event.stopPropagation();
            var modal = document.createElement("div");
            modal.className = "modal";
            modal.innerHTML =
              '<div class="modal-content"><span class="close">x</span>' +
              glossaryitem.definition +
              "</div>";
            modal.style.display = "block";

            document.body.appendChild(modal);

            var modalContent = modal.getElementsByClassName(
              "modal-content"
            )[0] as HTMLDivElement;
            var offset = htmlElement.offsetTop;
            if (htmlElement.offsetTop > 100) {
              offset = htmlElement.offsetTop - 20;
            }
            modalContent.style.top = offset + "px";

            var span = modal.getElementsByClassName(
              "close"
            )[0] as HTMLSpanElement;
            span.onclick = function () {
              modal.style.display = "none";
              modal.parentElement.removeChild(modal);
            };

            window.onclick = function (event) {
              if (event.target == modal) {
                modal.style.display = "none";
                modal.parentElement.removeChild(modal);
              }
            };
          },
          true
        );
      },
    });
  });
}

export interface GlossaryItem {
  word: string;
  definition: string;
}

var glossary: Array<GlossaryItem> = [
  { word: "frankenstein", definition: "who is frankenstein" },
  { word: "Mary Shelley", definition: "who is Mary Shelley?" },
];

markCuedWords(glossary);
