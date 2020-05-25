import * as Mark from "mark.js";
import { IS_DEV } from "../../src";

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
                node.addEventListener("click", async (event) => {
                    var htmlElement = node as HTMLElement
                    if (IS_DEV) console.log("Mark Node Click Handler");

                    event.preventDefault()
                    event.stopPropagation()
                    var modal = document.createElement('div');
                    modal.className = 'modal';
                    modal.innerHTML = '<div class="modal-content"><span class="close">x</span>' + glossaryitem.definition + '</div>'
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

                }, true);
            }
        });
    })

}

export interface GlossaryItem {
    word: string;
    definition: string;
}

var glossary: Array<GlossaryItem> = [{ word: "frankenstein", definition: "who is frankenstein" }, { word: "Mary Shelley", definition: "who is Mary Shelley?" }]

markCuedWords(glossary);

