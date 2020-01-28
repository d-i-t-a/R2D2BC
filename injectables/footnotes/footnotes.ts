/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

document.addEventListener("click", async (event) => {
    console.log("Footnote Click Handler");
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

