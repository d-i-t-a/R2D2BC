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
 * Developed on behalf of: DITA
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

export const IS_DEV = (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev");

document.addEventListener("click", async (event) => {
    if (IS_DEV) console.log("Footnote Click Handler");
    var htmlElement = event.target as HTMLElement
    if(htmlElement.tagName.toLowerCase() === 'a') {
    var element = document.createElement('div');
    element.innerHTML = htmlElement.outerHTML;

    var link = element.querySelector('a');
    if (link) {
        var attribute = link.getAttribute('epub:type') == 'noteref';
        if (attribute) {

            var href = link.getAttribute("href")
            if (href.indexOf("#") > 0) {
    
                var id = href.substring(href.indexOf('#') + 1)
                var absolute = getAbsoluteHref(href)
                absolute = absolute.substring(0, absolute.indexOf("#"))

                event.preventDefault()
                event.stopPropagation()

                await fetch(absolute)
                    .then(r => r.text())
                    .then(async data => {
                        var parser = new DOMParser();
                        var doc = parser.parseFromString(data, "text/html");
                        var aside = doc.querySelector("aside#" + id)
                        if (aside) {
            
                            var modal = document.createElement('div');
                            modal.className = 'modal';
                            modal.innerHTML = '<div class="modal-content"><span class="close">x</span>' + aside.innerHTML + '</div>'
                            modal.style.display = "block";

                            document.body.appendChild(modal)

                            var modalContent = modal.getElementsByClassName("modal-content")[0] as HTMLDivElement
                            var offset = htmlElement.offsetTop
                            if (htmlElement.offsetTop > 100) {
                                offset = htmlElement.offsetTop - 20
                            }
                            modalContent.style.top = offset + "px";

                            var span = modal.getElementsByClassName("close")[0] as HTMLSpanElement
                            span.onclick = function () {
                                modal.style.display = "none";
                                modal.parentElement.removeChild(modal)
                            }
                            
                            window.onclick = function (event) {
                                if (event.target == modal) {
                                    modal.style.display = "none";
                                    modal.parentElement.removeChild(modal)
                                }
                            }
                        } else {
                            link.click()
                        }
                    })
            }
        }
    }
    }
    function getAbsoluteHref(href: string): string | null {
        var currentUrl = document.location.href;
        return new URL(href, currentUrl).href;
    }

}, true);

