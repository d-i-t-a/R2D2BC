/*
 * Project: R2D2BC - Web Reader
 * Developers: Aferdita Muriqi
 * Copyright (c) 2019. DITA. All rights reserved.
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no), CAST (http://www.cast.org)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

import Navigator from "./Navigator";
import PaginatedBookView from "../views/PaginatedBookView";
import ScrollingBookView from "../views/ScrollingBookView";
import Annotator from "../store/Annotator";
import Publication, { Link } from "../model/Publication";
import EventHandler, { addEventListenerOptional, removeEventListenerOptional } from "../utils/EventHandler";
import * as BrowserUtilities from "../utils/BrowserUtilities";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import { defaultUpLinkTemplate, simpleUpLinkTemplate, readerLoading, readerError } from "../utils/HTMLTemplates";
import { Locator, ReadingPosition, Locations } from "../model/Locator";
import { Sidenav, Collapsible, Dropdown, Tabs } from "materialize-css";
import { UserSettingsUIConfig, UserSettings } from "../model/user-settings/UserSettings";
import BookmarkModule from "../modules/BookmarkModule";
import AnnotationModule from "../modules/AnnotationModule";
import TTSModule from "../modules/TTSModule";
import { IS_DEV } from "..";

export interface UpLinkConfig {
    url?: URL;
    label?: string;
    ariaLabel?: string;
}

export interface IFrameNavigatorConfig {
    mainElement: HTMLElement;
    headerMenu: HTMLElement;
    footerMenu: HTMLElement;
    publication: Publication;
    settings: UserSettings;
    annotator?: Annotator;
    eventHandler?: EventHandler;
    upLink?: UpLinkConfig;
    ui?: ReaderUI;
    initialLastReadingPosition?: ReadingPosition;
    rights?: ReaderRights;
    material: boolean;
    api: any;
    injectables: Array<Injectable>;
    selectionMenuItems?: Array<SelectionMenuItem>;
    initialAnnotationColor?:string;
}

export interface Injectable {
    type: string;
    url?: string;
    r2after: boolean;
    r2before: boolean;
    r2default: boolean;
    fontFamily?: string;
    systemFont?: boolean;
    appearance?: string;
    async?: boolean;
}
export interface SelectionMenuItem {
    id: string;
    callback: any;
}

export interface ReaderRights {
    enableBookmarks?: boolean;
    enableAnnotations?: boolean;
}
export interface ReaderUI {
    settings: UserSettingsUIConfig;
}
export interface ReaderConfig {
    url: URL;
    userSettings: any;
    initialAnnotations: any;
    lastReadingPosition: any;
    upLinkUrl: any;
    rights: ReaderRights;
    ui: ReaderUI;
    material: boolean;
    api: any;
    injectables: Array<Injectable>;
    selectionMenuItems: Array<SelectionMenuItem>;
    initialAnnotationColor: string;
    useLocalStorage: boolean;
}

/** Class that shows webpub resources in an iframe, with navigation controls outside the iframe. */
export default class IFrameNavigator implements Navigator {
    iframe: HTMLIFrameElement;
    currentTocUrl: string;
    headerMenu: HTMLElement;
    mainElement: HTMLElement;
    publication: Publication;

    bookmarkModule?: BookmarkModule;
    annotationModule?: AnnotationModule;
    ttsModule?: TTSModule;

    sideNavExanded: boolean = false
    material: boolean = false

    mTabs: Array<any>;
    mDropdowns: Array<any>;
    mCollapsibles: Array<any>;
    mSidenav: any;

    currentChapterLink: Link = {};
    currentTOCRawLink: string;
    private nextChapterLink: Link;
    private previousChapterLink: Link;
    private settings: UserSettings;
    private annotator: Annotator | null;

    private paginator: PaginatedBookView | null;
    private scroller: ScrollingBookView | null;
    private eventHandler: EventHandler;
    private upLinkConfig: UpLinkConfig | null;
    private upLink: HTMLAnchorElement | null = null;

    private nextChapterBottomAnchorElement: HTMLAnchorElement;
    private previousChapterTopAnchorElement: HTMLAnchorElement;

    private nextChapterAnchorElement: HTMLAnchorElement;
    private previousChapterAnchorElement: HTMLAnchorElement;

    private nextPageAnchorElement: HTMLAnchorElement;
    private previousPageAnchorElement: HTMLAnchorElement;
    private espandMenuIcon: HTMLElement;

    private bookmarksControl: HTMLButtonElement;
    private bookmarksView: HTMLDivElement;
    private links: HTMLUListElement;
    private linksTopLeft: HTMLUListElement;
    private linksBottom: HTMLUListElement;
    private linksMiddle: HTMLUListElement;
    private tocView: HTMLDivElement;
    private loadingMessage: HTMLDivElement;
    private errorMessage: HTMLDivElement;
    private tryAgainButton: HTMLButtonElement;
    private goBackButton: HTMLButtonElement;
    private infoTop: HTMLDivElement;
    private infoBottom: HTMLDivElement;
    private bookTitle: HTMLSpanElement;
    private chapterTitle: HTMLSpanElement;
    private chapterPosition: HTMLSpanElement;
    private newPosition: Locator | null;
    private newElementId: string | null;
    private isBeingStyled: boolean;
    private isLoading: boolean;
    private initialLastReadingPosition: ReadingPosition;
    api: any;
    injectables: Array<Injectable>
    selectionMenuItems: Array<SelectionMenuItem>
    initialAnnotationColor: string

    public static async create(config: IFrameNavigatorConfig): Promise<any> {
        const navigator = new this(
            config.settings,
            config.annotator || null,
            config.eventHandler || null,
            config.upLink || null,
            config.initialLastReadingPosition || null,
            config.publication,
            config.material,
            config.api,
            config.injectables,
            config.selectionMenuItems || null,
            config.initialAnnotationColor || null
        );

        await navigator.start(config.mainElement, config.headerMenu, config.footerMenu);
        return new Promise(resolve => resolve(navigator));
    }

    protected constructor(
        settings: UserSettings,
        annotator: Annotator | null = null,
        eventHandler: EventHandler | null = null,
        upLinkConfig: UpLinkConfig | null = null,
        initialLastReadingPosition: ReadingPosition | null = null,
        publication: Publication,
        material: boolean,
        api: any,
        injectables: Array<Injectable>,
        selectionMenuItems: Array<SelectionMenuItem> | null = null,
        initialAnnotationColor: string | null = null
    ) {
        this.settings = settings;
        this.annotator = annotator;
        this.paginator = settings.paginator;
        this.scroller = settings.scroller;
        this.eventHandler = eventHandler || new EventHandler();
        this.upLinkConfig = upLinkConfig;
        this.initialLastReadingPosition = initialLastReadingPosition;
        this.publication = publication
        this.material = material
        this.api = api
        this.injectables = injectables
        this.selectionMenuItems = selectionMenuItems
        this.initialAnnotationColor = initialAnnotationColor
    }

    async stop() {
        if (IS_DEV) { console.log("Iframe navigator stop") }

        removeEventListenerOptional(this.previousChapterAnchorElement, 'click', this.handlePreviousChapterClick.bind(this));
        removeEventListenerOptional(this.nextChapterAnchorElement, 'click', this.handleNextChapterClick.bind(this));

        removeEventListenerOptional(this.previousChapterTopAnchorElement, 'click', this.handlePreviousPageClick.bind(this));
        removeEventListenerOptional(this.nextChapterBottomAnchorElement, 'click', this.handleNextPageClick.bind(this));

        removeEventListenerOptional(this.previousPageAnchorElement, 'click', this.handlePreviousPageClick.bind(this));
        removeEventListenerOptional(this.nextPageAnchorElement, 'click', this.handleNextPageClick.bind(this));

        removeEventListenerOptional(this.tryAgainButton, 'click', this.tryAgain.bind(this));
        removeEventListenerOptional(this.goBackButton, 'click', this.goBack.bind(this));

        removeEventListenerOptional(this.bookmarksControl, "keydown", this.hideBookmarksOnEscape.bind(this));
        removeEventListenerOptional(this.espandMenuIcon, 'click', this.handleEditClick.bind(this));

        removeEventListenerOptional(window, "resize", this.onResize);

        if (this.material) {

            if (this.mDropdowns) {
                this.mDropdowns.forEach(element => {
                    (element as any).destroy()
                });
            }
            if (this.mCollapsibles) {
                this.mCollapsibles.forEach(element => {
                    (element as any).destroy()
                });
            }
            if (this.mSidenav) {
                (this.mSidenav as any).destroy()
            }
            if (this.mTabs) {
                this.mTabs.forEach(element => {
                    (element as any).destroy()
                });
            }

        }

    }

    protected async start(mainElement: HTMLElement, headerMenu: HTMLElement, footerMenu: HTMLElement): Promise<void> {

        this.headerMenu = headerMenu;
        this.mainElement = mainElement;
        try {

            // Main Element
            this.iframe = HTMLUtilities.findRequiredElement(mainElement, "main#iframe-wrapper iframe") as HTMLIFrameElement;

            this.loadingMessage = HTMLUtilities.findRequiredElement(mainElement, "#reader-loading") as HTMLDivElement;
            this.loadingMessage.innerHTML = readerLoading;
            this.loadingMessage.style.display = "none";

            this.errorMessage = HTMLUtilities.findRequiredElement(mainElement, "#reader-error") as HTMLDivElement;
            this.errorMessage.innerHTML = readerError;
            this.errorMessage.style.display = "none";

            this.tryAgainButton = HTMLUtilities.findElement(mainElement, "button[class=try-again]") as HTMLButtonElement;
            this.goBackButton = HTMLUtilities.findElement(mainElement, "button[class=go-back]") as HTMLButtonElement;
            this.infoTop = HTMLUtilities.findElement(mainElement, "div[class='info top']") as HTMLDivElement;
            this.infoBottom = HTMLUtilities.findElement(mainElement, "div[class='info bottom']") as HTMLDivElement;

            if (this.headerMenu) this.bookTitle = HTMLUtilities.findElement(headerMenu, "#book-title") as HTMLSpanElement;

            if (this.infoBottom) this.chapterTitle = HTMLUtilities.findRequiredElement(this.infoBottom, "span[class=chapter-title]") as HTMLSpanElement;
            if (this.infoBottom) this.chapterPosition = HTMLUtilities.findRequiredElement(this.infoBottom, "span[class=chapter-position]") as HTMLSpanElement;

            if (this.headerMenu) this.espandMenuIcon = HTMLUtilities.findElement(this.headerMenu, "#expand-menu") as HTMLElement;

            // Header Menu

            if (this.headerMenu) this.links = HTMLUtilities.findElement(headerMenu, "ul.links.top") as HTMLUListElement;
            if (this.headerMenu) this.linksTopLeft = HTMLUtilities.findElement(headerMenu, "#nav-mobile-left") as HTMLUListElement;

            if (this.headerMenu) this.tocView = HTMLUtilities.findElement(headerMenu, "#container-view-toc") as HTMLDivElement;

            // Footer Menu
            if (footerMenu) this.linksBottom = HTMLUtilities.findElement(footerMenu, "ul.links.bottom") as HTMLUListElement;
            if (footerMenu) this.linksMiddle = HTMLUtilities.findElement(footerMenu, "ul.links.middle") as HTMLUListElement;

            if (this.headerMenu) this.nextChapterAnchorElement = HTMLUtilities.findElement(headerMenu, "a[rel=next]") as HTMLAnchorElement;
            if (this.headerMenu) this.nextChapterBottomAnchorElement = HTMLUtilities.findElement(mainElement, "#next-chapter") as HTMLAnchorElement;
            if (footerMenu) this.nextPageAnchorElement = HTMLUtilities.findElement(footerMenu, "a[rel=next]") as HTMLAnchorElement;

            if (this.headerMenu) this.previousChapterAnchorElement = HTMLUtilities.findElement(headerMenu, "a[rel=prev]") as HTMLAnchorElement;
            if (this.headerMenu) this.previousChapterTopAnchorElement = HTMLUtilities.findElement(mainElement, "#previous-chapter") as HTMLAnchorElement;
            if (footerMenu) this.previousPageAnchorElement = HTMLUtilities.findElement(footerMenu, "a[rel=prev]") as HTMLAnchorElement;

            if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "none"
            if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "none"

            this.newPosition = null;
            this.newElementId = null;
            this.isBeingStyled = true;
            this.isLoading = true;

            this.setupEvents();

            this.settings.setIframe(this.iframe);
            this.settings.onSettingsChange(this.handleResize.bind(this));
            this.settings.onViewChange(this.updateBookView.bind(this));

            if (this.initialLastReadingPosition) {
                this.annotator.initLastReadingPosition(this.initialLastReadingPosition);
            }

            var self = this;
            if (this.material) {

                let elements = document.querySelectorAll('.sidenav');
                if (elements) {
                    self.mSidenav = Sidenav.init(elements, {
                        'edge': 'left',
                    });
                }
                let collapsible = document.querySelectorAll('.collapsible');
                if (collapsible) {
                    self.mCollapsibles = Collapsible.init(collapsible, { accordion: true });
                }
                let dropdowns = document.querySelectorAll('.dropdown-trigger');
                if (dropdowns) {
                    self.mDropdowns = Dropdown.init(dropdowns, {
                        alignment: 'right',
                        constrainWidth: false,
                        coverTrigger: false,
                        closeOnClick: false

                    });
                }
                let tabs = document.querySelectorAll('.tabs');
                if (tabs) {
                    self.mTabs = Tabs.init(tabs);
                }
            }
            setTimeout(() => {
                if (self.annotationModule !== undefined) {
                    self.annotationModule.drawHighlights()
                    // self.annotationModule.drawIndicators()
                }
            }, 300);


            return await this.loadManifest();
        } catch (err) {
            // There's a mismatch between the template and the selectors above,
            // or we weren't able to insert the template in the element.
            console.error(err)
            this.abortOnError();
            return new Promise<void>((_, reject) => reject(err)).catch(() => { });
        }
    }

    timeout: any;

    onResize = () => {
        clearTimeout(this.timeout);
        this.timeout = setTimeout(this.handleResize.bind(this), 200);
    }

    private setupEvents(): void {
        addEventListenerOptional(this.iframe, 'load', this.handleIFrameLoad.bind(this));

        addEventListenerOptional(this.previousChapterAnchorElement, 'click', this.handlePreviousChapterClick.bind(this));
        addEventListenerOptional(this.nextChapterAnchorElement, 'click', this.handleNextChapterClick.bind(this));

        addEventListenerOptional(this.previousChapterTopAnchorElement, 'click', this.handlePreviousPageClick.bind(this));
        addEventListenerOptional(this.nextChapterBottomAnchorElement, 'click', this.handleNextPageClick.bind(this));

        addEventListenerOptional(this.previousPageAnchorElement, 'click', this.handlePreviousPageClick.bind(this));
        addEventListenerOptional(this.nextPageAnchorElement, 'click', this.handleNextPageClick.bind(this));

        addEventListenerOptional(this.tryAgainButton, 'click', this.tryAgain.bind(this));
        addEventListenerOptional(this.goBackButton, 'click', this.goBack.bind(this));

        addEventListenerOptional(this.bookmarksControl, "keydown", this.hideBookmarksOnEscape.bind(this));

        addEventListenerOptional(this.espandMenuIcon, 'click', this.handleEditClick.bind(this));

        addEventListenerOptional(window, 'resize', this.onResize);

    }

    private setupModalFocusTrap(modal: HTMLDivElement, closeButton: HTMLButtonElement, lastFocusableElement: HTMLButtonElement | HTMLAnchorElement): void {
        // Trap keyboard focus in a modal dialog when it's displayed.
        const TAB_KEY = 9;

        // Going backwards from the close button sends you to the last focusable element.
        closeButton.addEventListener("keydown", (event: KeyboardEvent) => {
            if (this.isDisplayed(modal)) {
                const tab = (event.keyCode === TAB_KEY);
                const shift = !!event.shiftKey;
                if (tab && shift) {
                    lastFocusableElement.focus();
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        });

        // Going forward from the last focusable element sends you to the close button.
        lastFocusableElement.addEventListener("keydown", (event: KeyboardEvent) => {
            if (this.isDisplayed(modal)) {
                const tab = (event.keyCode === TAB_KEY);
                const shift = !!event.shiftKey;
                if (tab && !shift) {
                    closeButton.focus();
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        });
    }

    private updateBookView(): void {
        if (this.settings.getSelectedView() === this.paginator) {
            document.body.onscroll = () => { };
            if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "none"
            if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "none"
            if (this.nextPageAnchorElement) this.nextPageAnchorElement.style.display = "unset"
            if (this.previousPageAnchorElement) this.previousPageAnchorElement.style.display = "unset"
            if (this.chapterTitle) this.chapterTitle.style.display = "inline";
            if (this.chapterPosition) this.chapterPosition.style.display = "inline";
            if (this.eventHandler) {
                this.eventHandler.onInternalLink = this.handleInternalLink.bind(this);
                this.eventHandler.onClickThrough = this.handleClickThrough.bind(this);
            }
            if (!this.isDisplayed(this.linksBottom)) {
                this.toggleDisplay(this.linksBottom);
            }

            if (!this.isDisplayed(this.linksMiddle)) {
                this.toggleDisplay(this.linksMiddle);
            }
        } else if (this.settings.getSelectedView() === this.scroller) {
            if (this.nextPageAnchorElement) this.nextPageAnchorElement.style.display = "none"
            if (this.previousPageAnchorElement) this.previousPageAnchorElement.style.display = "none"
            if (this.scroller.atTop() && this.scroller.atBottom()) {
                if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "unset"
                if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "unset"
            } else if (this.scroller.atBottom()) {
                if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "none"
                if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "unset"
            } else if (this.scroller.atTop()) {
                if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "none"
                if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "unset"
            } else {
                if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "none"
                if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "none"
            }
            // document.body.style.overflow = "auto";
            document.body.onscroll = () => {

                if (this.scroller && this.settings.getSelectedView() === this.scroller) {
                    this.scroller.setIframeHeight(this.iframe)
                }

                this.saveCurrentReadingPosition();
                if (this.scroller && this.scroller.atBottom()) {
                    // Bring up the bottom nav when you get to the bottom,
                    // if it wasn't already displayed.
                    if (!this.isDisplayed(this.linksBottom)) {
                        this.toggleDisplay(this.linksBottom);
                    }
                    if (!this.isDisplayed(this.linksMiddle)) {
                        this.toggleDisplay(this.linksMiddle);
                    }
                } else {
                    // Remove the bottom nav when you scroll back up,
                    // if it was displayed because you were at the bottom.
                    if (this.isDisplayed(this.linksBottom) && !this.isDisplayed(this.links)) {
                        this.toggleDisplay(this.linksBottom);
                    }
                }

                if (this.scroller && this.settings.getSelectedView() === this.scroller) {
                    if (this.scroller.atTop() && this.scroller.atBottom()) {
                        if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "unset"
                        if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "unset"
                    } else if (this.scroller.atBottom()) {
                        if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "none"
                        if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "unset"
                    } else if (this.scroller.atTop()) {
                        if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "none"
                        if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "unset"
                    } else {
                        if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "none"
                        if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "none"
                    }
                }

            }

            if (this.chapterTitle) this.chapterTitle.style.display = "none";
            if (this.chapterPosition) this.chapterPosition.style.display = "none";
            if (this.eventHandler) {
                this.eventHandler.onInternalLink = this.handleInternalLink.bind(this);
                this.eventHandler.onClickThrough = this.handleClickThrough.bind(this);
            }
            if (!this.isDisplayed(this.linksBottom)) {
                this.toggleDisplay(this.linksBottom);
            }

            if (!this.isDisplayed(this.linksMiddle)) {
                this.toggleDisplay(this.linksMiddle);
            }
        }
        setTimeout(() => {
            this.updatePositionInfo();
        }, 100);
    }

    onScroll(): void {
        this.saveCurrentReadingPosition();
        if (this.scroller && this.scroller.atBottom()) {
            // Bring up the bottom nav when you get to the bottom,
            // if it wasn't already displayed.
            if (!this.isDisplayed(this.linksBottom)) {
                this.toggleDisplay(this.linksBottom);
            }
            if (!this.isDisplayed(this.linksMiddle)) {
                this.toggleDisplay(this.linksMiddle);
            }
        } else {
            // Remove the bottom nav when you scroll back up,
            // if it was displayed because you were at the bottom.
            if (this.isDisplayed(this.linksBottom) && !this.isDisplayed(this.links)) {
                this.toggleDisplay(this.linksBottom);
            }
        }

        if (this.scroller && this.settings.getSelectedView() === this.scroller) {
            if (this.scroller.atTop() && this.scroller.atBottom()) {
                this.nextChapterBottomAnchorElement.style.display = "unset"
                this.previousChapterTopAnchorElement.style.display = "unset"
            } else if (this.scroller.atBottom()) {
                this.previousChapterTopAnchorElement.style.display = "none"
                this.nextChapterBottomAnchorElement.style.display = "unset"
            } else if (this.scroller.atTop()) {
                this.nextChapterBottomAnchorElement.style.display = "none"
                this.previousChapterTopAnchorElement.style.display = "unset"
            } else {
                this.nextChapterBottomAnchorElement.style.display = "none"
                this.previousChapterTopAnchorElement.style.display = "none"
            }
        }

    }

    private async loadManifest(): Promise<void> {
        try {
            const createSubmenu = (parentElement: Element, links: Array<Link>, control?: HTMLButtonElement, ol: boolean = false) => {
                var menuControl: HTMLButtonElement
                var mainElement: HTMLDivElement
                if (control) {
                    menuControl = control
                    if (parentElement instanceof HTMLDivElement) {
                        mainElement = parentElement
                    }
                }
                var listElement: HTMLUListElement = document.createElement("ul");
                if (ol) {
                    listElement = document.createElement("ol");
                }
                listElement.className = 'sidenav-toc';
                let lastLink: HTMLAnchorElement | null = null;
                for (const link of links) {
                    const listItemElement: HTMLLIElement = document.createElement("li");
                    const linkElement: HTMLAnchorElement = document.createElement("a");
                    const spanElement: HTMLSpanElement = document.createElement("span");
                    linkElement.className = "chapter-link"
                    linkElement.tabIndex = -1;
                    let href = "";
                    if (link.href) {
                        href = this.publication.getAbsoluteHref(link.href);
                        linkElement.href = href;
                        linkElement.innerHTML = link.title || "";
                        listItemElement.appendChild(linkElement);
                    } else {
                        spanElement.innerHTML = link.title || "";
                        spanElement.className = 'chapter-title';
                        listItemElement.appendChild(spanElement);
                    }
                    if (link.children && link.children.length > 0) {
                        createSubmenu(listItemElement, link.children, null, true);
                    }

                    listElement.appendChild(listItemElement);
                    lastLink = linkElement;
                }

                // Trap keyboard focus inside the TOC while it's open.
                if (lastLink && menuControl) {
                    this.setupModalFocusTrap(mainElement, menuControl, lastLink);
                }

                addEventListenerOptional(listElement, 'click', (event: Event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.target && (event.target as HTMLElement).tagName.toLowerCase() === "a") {
                        let linkElement = event.target as HTMLAnchorElement;

                        if (linkElement.className.indexOf("active") !== -1) {
                            // This TOC item is already loaded. Hide the TOC
                            // but don't navigate.
                            this.hideView(mainElement, menuControl);
                        } else {
                            // Set focus back to the contents toggle button so screen readers
                            // don't get stuck on a hidden link.
                            menuControl ? menuControl.focus() : null;

                            let locations: Locations = {
                                progression: 0
                            }
                            if (linkElement.href.indexOf("#") !== -1) {
                                const elementId = linkElement.href.slice(linkElement.href.indexOf("#") + 1);
                                if (elementId !== null) {
                                    locations = {
                                        fragment: elementId
                                    }
                                }
                            }

                            const position: Locator = {
                                href: linkElement.href,
                                locations: locations,
                                type: linkElement.type,
                                title: linkElement.title
                            };

                            this.hideView(mainElement, menuControl);
                            this.navigate(position);
                        }
                    }
                });

                parentElement.appendChild(listElement);
            }

            const toc = this.publication.tableOfContents;
            if (this.tocView) {
                if (toc.length) {
                    createSubmenu(this.tocView, toc);
                } else {
                    this.tocView.parentElement.parentElement.removeChild(this.tocView.parentElement);
                }
            }

            if ((this.links || this.linksTopLeft) && this.upLinkConfig && this.upLinkConfig.url) {
                const upUrl = this.upLinkConfig.url;
                const upLabel = this.upLinkConfig.label || "";
                const upAriaLabel = this.upLinkConfig.ariaLabel || upLabel;
                var upHTML = defaultUpLinkTemplate(upUrl.href, upLabel, upAriaLabel);
                upHTML = simpleUpLinkTemplate(upUrl.href, upLabel, upAriaLabel);
                const upParent: HTMLLIElement = document.createElement("li");
                upParent.classList.add("uplink-wrapper");
                upParent.innerHTML = upHTML;
                if (this.links) {
                    this.links.insertBefore(upParent, this.links.firstChild);
                    this.upLink = HTMLUtilities.findRequiredElement(this.links, "a[rel=up]") as HTMLAnchorElement;
                } else {
                    this.linksTopLeft.insertBefore(upParent, this.linksTopLeft.firstChild);
                    this.upLink = HTMLUtilities.findRequiredElement(this.linksTopLeft, "a[rel=up]") as HTMLAnchorElement;
                }
            }


            let lastReadingPosition: ReadingPosition | null = null;
            if (this.annotator) {
                lastReadingPosition = await this.annotator.getLastReadingPosition() as ReadingPosition | null;
            }

            const startLink = this.publication.getStartLink();
            let startUrl: string | null = null;
            if (startLink && startLink.href) {
                startUrl = this.publication.getAbsoluteHref(startLink.href);
            }

            if (lastReadingPosition) {
                const linkHref = this.publication.getAbsoluteHref(lastReadingPosition.href);
                if (IS_DEV)console.log(lastReadingPosition.href)
                if (IS_DEV)console.log(linkHref)
                lastReadingPosition.href = linkHref
                this.navigate(lastReadingPosition);
            } else if (startUrl) {
                const position: ReadingPosition = {
                    href: startUrl,
                    locations: {
                        progression: 0
                    },
                    created: new Date(),
                    title: startLink.title
                };

                this.navigate(position);
            }

            return new Promise<void>(resolve => resolve());
        } catch (err) {
            console.error(err)
            this.abortOnError();
            return new Promise<void>((_, reject) => reject(err)).catch(() => { });
        }
    }

    private async handleIFrameLoad(): Promise<void> {
        this.errorMessage.style.display = "none";
        this.showLoadingMessageAfterDelay();
        try {
            let bookViewPosition = 0;
            if (this.newPosition) {
                bookViewPosition = this.newPosition.locations.progression;
                this.newPosition = null;
            }
            this.handleResize();
            this.updateBookView();

            this.settings.applyProperties();

            setTimeout(() => {
                this.settings.getSelectedView().goToPosition(bookViewPosition);
                this.updatePositionInfo();
            }, 100);

            setTimeout(() => {
                if (this.newElementId) {
                    this.settings.getSelectedView().goToElement(this.newElementId);
                    this.newElementId = null;
                }
            }, 100);

            let currentLocation = this.currentChapterLink.href

            this.updatePositionInfo();

            const previous = this.publication.getPreviousSpineItem(currentLocation);
            if (previous && previous.href) {
                this.previousChapterLink = previous
            }
            if (this.previousChapterAnchorElement) {
                if (this.previousChapterLink) {
                    this.previousChapterAnchorElement.href = this.publication.getAbsoluteHref(this.previousChapterLink.href)
                    this.previousChapterAnchorElement.className = this.previousChapterAnchorElement.className.replace(" disabled", "");
                } else {
                    this.previousChapterAnchorElement.removeAttribute("href");
                    this.previousChapterAnchorElement.className += " disabled";
                }
            }

            const next = this.publication.getNextSpineItem(currentLocation);
            if (next && next.href) {
                this.nextChapterLink = next

            }
            if (this.nextChapterAnchorElement) {
                if (this.nextChapterLink) {
                    this.nextChapterAnchorElement.href = this.publication.getAbsoluteHref(this.nextChapterLink.href);
                    this.nextChapterAnchorElement.className = this.nextChapterAnchorElement.className.replace(" disabled", "");
                } else {
                    this.nextChapterAnchorElement.removeAttribute("href");
                    this.nextChapterAnchorElement.className += " disabled";
                }
            }

            if (this.currentTocUrl !== null) {
                this.setActiveTOCItem(this.currentTocUrl);
            } else {
                this.setActiveTOCItem(currentLocation);
            }

            if (this.publication.metadata.title) {
                if (this.bookTitle) this.bookTitle.innerHTML = this.publication.metadata.title;
            }

            const spineItem = this.publication.getSpineItem(currentLocation);
            if (spineItem !== null) {
                this.currentChapterLink.title = spineItem.title;
                this.currentChapterLink.type = spineItem.type
            }
            let tocItem = this.publication.getTOCItem(currentLocation);
            if (this.currentTocUrl !== null) {
                tocItem = this.publication.getTOCItem(this.currentTocUrl);
            }
            if (!this.currentChapterLink.title && tocItem !== null && tocItem.title) {
                this.currentChapterLink.title = tocItem.title;
            }
            if (!this.currentChapterLink.type && tocItem !== null && tocItem.type) {
                this.currentChapterLink.title = tocItem.title;
            }

            if (this.currentChapterLink.title) {
                if (this.chapterTitle) this.chapterTitle.innerHTML = "(" + this.currentChapterLink.title + ")";
            } else {
                if (this.chapterTitle) this.chapterTitle.innerHTML = "(Current Chapter)";
            }


            if (this.annotator) {
                await this.saveCurrentReadingPosition();
            }
            this.hideLoadingMessage();
            this.showIframeContents();


            // Inject Readium CSS into Iframe Head
            const head = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "head") as HTMLHeadElement;
            if (head) {

                head.insertBefore(this.createBase(this.currentChapterLink.href), head.firstChild)

                this.injectables.forEach(injectable => {
                    if (injectable.type === "style") {
                        if (injectable.fontFamily) {
                            // UserSettings.fontFamilyValues.push(injectable.fontFamily)
                            // this.settings.setupEvents()
                            this.settings.addFont(injectable.fontFamily)
                            if (!injectable.systemFont) {
                                head.appendChild(this.createCssLink(injectable.url))
                            }
                        } else if (injectable.r2before) {
                            head.insertBefore(this.createCssLink(injectable.url), head.firstChild)
                        } else if (injectable.r2default) {
                            head.insertBefore(this.createCssLink(injectable.url), head.childNodes[1])
                        } else if (injectable.r2after) {
                            if (injectable.appearance) {
                                this.settings.addAppearance(injectable.appearance)
                            }
                            head.appendChild(this.createCssLink(injectable.url))
                        } else {
                            head.appendChild(this.createCssLink(injectable.url))
                        }
                    } else if (injectable.type === "script") {
                        head.appendChild(this.createJavascriptLink(injectable.url, injectable.async))
                    }
                });

            }

            setTimeout(() => {

                if (this.eventHandler) {
                    this.eventHandler.setupEvents(this.iframe.contentDocument);
                }
    
                if (this.scroller && this.settings.getSelectedView() === this.scroller) {
                    this.scroller.setIframeHeight(this.iframe)
                }

                if (this.annotationModule !== undefined) {
                    this.annotationModule.initialize(this.initialAnnotationColor)
                    if (this.selectionMenuItems) {
                        this.annotationModule.selectionMenuItems = this.selectionMenuItems
                    }
                }
                setTimeout(() => {
                    if (this.ttsModule !== undefined) {
                        this.ttsModule.initialize()
                    }
                }, 200);

                const body = HTMLUtilities.findRequiredIframeElement(this.iframe.contentDocument, "body") as HTMLBodyElement;
                var pagebreaks = body.querySelectorAll('[*|type="pagebreak"]');
                for (var i = 0; i < pagebreaks.length; i++) {
                    var img = pagebreaks[i];
                    if (IS_DEV) console.log(img)
                    if (img.innerHTML.length == 0) {
                        img.innerHTML = img.getAttribute("title");
                    }
                    img.className = "epubPageBreak"
                }

            }, 100);

            return new Promise<void>(resolve => resolve());
        } catch (err) {
            console.error(err)
            this.abortOnError();
            return new Promise<void>((_, reject) => reject(err)).catch(() => { });
        }
    }

    private abortOnError() {
        this.errorMessage.style.display = "block";
        if (this.isLoading) {
            this.hideLoadingMessage();
        }
    }

    private tryAgain() {
        this.iframe.src = this.currentChapterLink.href
    }

    private goBack() {
        window.history.back();
    }

    private isDisplayed(element: HTMLDivElement | HTMLUListElement) {
        return element ? element.className.indexOf(" active") !== -1 : false;
    }

    private showElement(element: HTMLDivElement | HTMLUListElement, control?: HTMLAnchorElement | HTMLButtonElement) {
        if (element) {
            element.className = element.className.replace(" inactive", "");
            if (element.className.indexOf(" active") === -1) {
                element.className += " active";
            }
            element.setAttribute("aria-hidden", "false");
            if (control) {
                control.setAttribute("aria-expanded", "true");

                const openIcon = control.querySelector(".icon.open");
                if (openIcon && (openIcon.getAttribute("class") || "").indexOf(" inactive-icon") === -1) {
                    const newIconClass = (openIcon.getAttribute("class") || "") + " inactive-icon";
                    openIcon.setAttribute("class", newIconClass);
                }
                const closeIcon = control.querySelector(".icon.close");
                if (closeIcon) {
                    const newIconClass = (closeIcon.getAttribute("class") || "").replace(" inactive-icon", "");
                    closeIcon.setAttribute("class", newIconClass);
                }
            }
            // Add buttons and links in the element to the tab order.
            const buttons = Array.prototype.slice.call(element.querySelectorAll("button"));
            const links = Array.prototype.slice.call(element.querySelectorAll("a"));
            for (const button of buttons) {
                button.tabIndex = 0;
            }
            for (const link of links) {
                link.tabIndex = 0;
            }
        }
    }

    private hideElement(element: HTMLDivElement | HTMLUListElement, control?: HTMLAnchorElement | HTMLButtonElement) {
        if (element) {

            element.className = element.className.replace(" active", "");
            if (element.className.indexOf(" inactive") === -1) {
                element.className += " inactive";
            }
            element.setAttribute("aria-hidden", "true");
            if (control) {
                control.setAttribute("aria-expanded", "false");

                const openIcon = control.querySelector(".icon.open");
                if (openIcon) {
                    const newIconClass = (openIcon.getAttribute("class") || "").replace(" inactive-icon", "");
                    openIcon.setAttribute("class", newIconClass);
                }
                const closeIcon = control.querySelector(".icon.close");
                if (closeIcon && (closeIcon.getAttribute("class") || "").indexOf(" inactive-icon") === -1) {
                    const newIconClass = (closeIcon.getAttribute("class") || "") + " inactive-icon";
                    closeIcon.setAttribute("class", newIconClass);
                }
            }
            // Remove buttons and links in the element from the tab order.
            const buttons = Array.prototype.slice.call(element.querySelectorAll("button"));
            const links = Array.prototype.slice.call(element.querySelectorAll("a"));
            for (const button of buttons) {
                button.tabIndex = -1;
            }
            for (const link of links) {
                link.tabIndex = -1;
            }
        }
    }


    private hideModal(modal: HTMLDivElement, control?: HTMLAnchorElement | HTMLButtonElement) {
        // Restore the page for screen readers.
        this.iframe.setAttribute("aria-hidden", "false");
        if (this.upLink) {
            this.upLink.setAttribute("aria-hidden", "false");
        }
        if (this.linksBottom) {
            this.linksBottom.setAttribute("aria-hidden", "false");
        }
        if (this.linksMiddle) {
            this.linksMiddle.setAttribute("aria-hidden", "false");
        }
        this.loadingMessage.setAttribute("aria-hidden", "false");
        this.errorMessage.setAttribute("aria-hidden", "false");
        this.infoTop.setAttribute("aria-hidden", "false");
        this.infoBottom.setAttribute("aria-hidden", "false");

        this.hideElement(modal, control);
    }


    private toggleDisplay(element: HTMLDivElement | HTMLUListElement, control?: HTMLAnchorElement | HTMLButtonElement): void {
        if (!this.isDisplayed(element)) {
            this.showElement(element, control);
        } else {
            this.hideElement(element, control);
        }
        if (element === this.linksMiddle) {
            if (this.settings.getSelectedView() === this.scroller) {
                this.showElement(element, control);
            } else {
                this.hideElement(element, control);
            }
        }
    }


    private handleEditClick(event: MouseEvent): void {
        var element = event.target as HTMLElement
        var sidenav = HTMLUtilities.findElement(this.headerMenu, ".sidenav") as HTMLElement;

        if (element.className.indexOf(" active") === -1) {
            element.className += " active";
            sidenav.className += " expanded";
            element.innerText = "unfold_less";
            this.sideNavExanded = true
            this.bookmarkModule.showBookmarks()
        } else {
            element.className = element.className.replace(" active", "");
            sidenav.className = sidenav.className.replace(" expanded", "");
            element.innerText = "unfold_more";
            this.sideNavExanded = false
            this.bookmarkModule.showBookmarks()
        }
        event.preventDefault();
        event.stopPropagation();
    }
    startReadAloud() {
        this.annotationModule.highlighter.speakAll()
    }
    stopReadAloud() {
        this.annotationModule.highlighter.stopReadAloud()
    }
    pauseReadAloud() {
        this.ttsModule.speakPause()
    }
    resumeReadAloud() {
        this.ttsModule.speakResume()
    }
    totalResources(): number {
        return this.publication.readingOrder.length
    }
    mostRecentNavigatedTocItem(): string {
        return this.publication.getRelativeHref(this.currentTOCRawLink) 
    }
    currentResource(): number {
        let currentLocation = this.currentChapterLink.href
        return this.publication.getSpineIndex(currentLocation)
    }
    tableOfContents() : any{
        return this.publication.tableOfContents
    }
    previousPage(): any {
        this.handlePreviousPageClick(null)
    }
    nextPage(): any {
        this.handleNextPageClick(null)
    }
    previousResource(): any {
        this.handlePreviousChapterClick(null)
    }
    nextResource(): any {
        this.handleNextChapterClick(null)
    }
    goTo(locator: Locator): any {
        let locations: Locations = {
            progression: 0
        }
        if (locator.href.indexOf("#") !== -1) {
            const elementId = locator.href.slice(locator.href.indexOf("#") + 1);
            if (elementId !== null) {
                locations = {
                    fragment: elementId
                }
            }
        }
        const position: Locator = {
            href: locator.href,
            locations: locations,
            type: locator.type,
            title: locator.title
        };
        const linkHref = this.publication.getAbsoluteHref(locator.href);
        if (IS_DEV) console.log(locator.href)
        if (IS_DEV) console.log(linkHref)
        position.href = linkHref
        this.navigate(position);
    }

    private handlePreviousPageClick(event: MouseEvent | TouchEvent | KeyboardEvent): void {
        if (this.settings.getSelectedView() === this.paginator) {
            if (this.paginator.onFirstPage()) {
                if (this.previousChapterLink) {
                    const position: Locator = {
                        href: this.publication.getAbsoluteHref(this.previousChapterLink.href),
                        locations: {
                            progression: 1
                        },
                        type: this.previousChapterLink.type,
                        title: this.previousChapterLink.title
                    };

                    this.navigate(position);
                    var pagi = this.paginator
                    setTimeout(() => {
                        pagi.goToPosition(1);
                        this.updatePositionInfo();
                        this.saveCurrentReadingPosition();
                    }, 1);

                }
            } else {
                this.paginator.goToPreviousPage();
                this.updatePositionInfo();
                this.saveCurrentReadingPosition();
            }
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
        } else {
            if (this.scroller.atTop()) {
                if (this.previousChapterLink) {
                    const position: Locator = {
                        href: this.publication.getAbsoluteHref(this.previousChapterLink.href),
                        locations: {
                            progression: 1
                        },
                        type: this.previousChapterLink.type,
                        title: this.previousChapterLink.title
                    };

                    this.navigate(position);
                }
            } else {
                this.scroller.goToPreviousPage();
                this.updatePositionInfo();
                this.saveCurrentReadingPosition();
            }
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
        }
    }

    private handleNextPageClick(event: MouseEvent | TouchEvent | KeyboardEvent) {
        if (this.settings.getSelectedView() === this.paginator) {
            if (this.paginator.onLastPage()) {
                if (this.nextChapterLink) {
                    const position: Locator = {
                        href: this.publication.getAbsoluteHref(this.nextChapterLink.href),
                        locations: {
                            progression: 0
                        },
                        type: this.nextChapterLink.type,
                        title: this.nextChapterLink.title
                    };

                    this.navigate(position);
                    var pagi = this.paginator
                    setTimeout(() => {
                        pagi.goToPosition(0);
                        this.updatePositionInfo();
                        this.saveCurrentReadingPosition();
                    }, 1);
                }
            } else {
                this.paginator.goToNextPage();
                this.updatePositionInfo();
                this.saveCurrentReadingPosition();
            }
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
        } else {
            if (this.scroller.atBottom()) {
                if (this.nextChapterLink) {
                    const position: Locator = {
                        href: this.publication.getAbsoluteHref(this.nextChapterLink.href),
                        locations: {
                            progression: 0
                        },
                        type: this.nextChapterLink.type,
                        title: this.nextChapterLink.title
                    };

                    this.navigate(position);
                }
            } else {
                this.scroller.goToNextPage();
                this.updatePositionInfo();
                this.saveCurrentReadingPosition();
            }
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
        }
    }

    private handleClickThrough(_event: MouseEvent | TouchEvent) {
        if (this.mDropdowns) {
            this.mDropdowns.forEach(element => {
                (element as any).close()
            });
        }
    }

    private handleInternalLink(event: MouseEvent | TouchEvent) {
        const element = event.target;
        let locations: Locations = {
            progression: 0
        }
        const linkElement = (element as HTMLAnchorElement)
        if (linkElement.href.indexOf("#") !== -1) {
            const elementId = linkElement.href.slice(linkElement.href.indexOf("#") + 1);
            if (elementId !== null) {
                locations = {
                    fragment: elementId
                }
            }
        }

        const position: Locator = {
            href: linkElement.href,
            locations: locations,
            type: linkElement.type,
            title: linkElement.title
        };

        event.preventDefault();
        event.stopPropagation();
        this.navigate(position);
    }

    private handleResize(): void {
        const selectedView = this.settings.getSelectedView();
        const oldPosition = selectedView.getCurrentPosition();

        this.settings.applyProperties()

        // If the links are hidden, show them temporarily
        // to determine the top and bottom heights.

        const linksHidden = !this.isDisplayed(this.links);

        if (linksHidden) {
            this.toggleDisplay(this.links);
        }

        if (this.infoTop) this.infoTop.style.height = 0 + "px";
        if (this.infoTop) this.infoTop.style.minHeight = 0 + "px";

        if (linksHidden) {
            this.toggleDisplay(this.links);
        }

        const linksBottomHidden = !this.isDisplayed(this.linksBottom);
        if (linksBottomHidden) {
            this.toggleDisplay(this.linksBottom);
        }
        // TODO paginator page info
        // 0 = hide , 40 = show
        if (this.infoBottom) this.infoBottom.style.height = 40 + "px";

        if (linksBottomHidden) {
            this.toggleDisplay(this.linksBottom);
        }

        // TODO paginator height needs to be calculated with headers and footers in mind
        // material     - 70 - 10 - 40 - 10 (if page info needs showing, +30)
        // api          - 10 - 10 - 10 - 10
        if (this.paginator) {
            this.paginator.height = (BrowserUtilities.getHeight() - 10 - 10 - 10 - 10);
        }

        setTimeout(() => {
            if (this.scroller && this.settings.getSelectedView() === this.scroller) {
                this.scroller.setIframeHeight(this.iframe)
            }
        }, 100);
        setTimeout(() => {
            selectedView.goToPosition(oldPosition);
            this.updatePositionInfo();
            if (this.annotationModule !== undefined) {
                this.annotationModule.handleResize()
            }
        }, 100);
    }

    private updatePositionInfo() {
        if (this.settings.getSelectedView() === this.paginator) {
            const currentPage = Math.round(this.paginator.getCurrentPage());
            const pageCount = Math.round(this.paginator.getPageCount());
            if (this.chapterPosition) this.chapterPosition.innerHTML = "Page " + currentPage + " of " + pageCount;
        } else {
            if (this.chapterPosition) this.chapterPosition.innerHTML = "";
        }
    }

    private handlePreviousChapterClick(event: MouseEvent): void {
        if (this.previousChapterLink) {
            const position: Locator = {
                href: this.publication.getAbsoluteHref(this.previousChapterLink.href),
                locations: {
                    progression: 1
                },
                type: this.previousChapterLink.type,
                title: this.previousChapterLink.title
            };

            this.navigate(position);
        }
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private handleNextChapterClick(event: MouseEvent): void {
        if (this.nextChapterLink) {
            const position: Locator = {
                href: this.publication.getAbsoluteHref(this.nextChapterLink.href),
                locations: {
                    progression: 0
                },
                type: this.nextChapterLink.type,
                title: this.nextChapterLink.title
            };

            this.navigate(position);
        }
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
    }


    private hideBookmarksOnEscape(event: KeyboardEvent) {
        const ESCAPE_KEY = 27;
        if (this.isDisplayed(this.bookmarksView) && event.keyCode === ESCAPE_KEY) {
            this.hideModal(this.bookmarksView, this.bookmarksControl);
        }
    }

    private hideView(_view: HTMLDivElement, _control: HTMLButtonElement): void {
        if (this.settings.getSelectedView() === this.scroller) {
            document.body.style.overflow = "auto";
        }
    }


    private setActiveTOCItem(resource: string): void {
        if (this.tocView) {
            const allItems = Array.prototype.slice.call(this.tocView.querySelectorAll("li > a"));
            for (const item of allItems) {
                item.className = item.className.replace(" active", "");
            }
            const activeItem = this.tocView.querySelector('li > a[href^="' + resource + '"]');
            if (activeItem) {
                activeItem.className += " active";
            }
        }
    }


    navigate(locator: Locator): void {
        this.hideIframeContents();
        this.showLoadingMessageAfterDelay();
        if (locator.locations === undefined) {
            locator.locations = {
                progression: 0
            } 
        }
        this.newPosition = locator;
        this.currentTOCRawLink = locator.href

        if (locator.href.indexOf("#") !== -1) {
            const newResource = locator.href.slice(0, locator.href.indexOf("#"))
            this.currentChapterLink.href = newResource;
            this.currentChapterLink.type = locator.type
            this.currentChapterLink.title = locator.title
        } else {
            this.currentChapterLink.href = locator.href
            this.currentChapterLink.type = locator.type
            this.currentChapterLink.title = locator.title
        }
        this.iframe.src = this.currentChapterLink.href


        if (locator.locations.fragment === undefined) {
            this.currentTocUrl = null;
        } else {
            this.newElementId = locator.locations.fragment
            this.currentTocUrl = this.currentChapterLink.href + "#" + this.newElementId;
        }
        setTimeout(() => {
            if (this.annotationModule !== undefined) {
                this.annotationModule.drawHighlights()
            }

            if (this.settings.getSelectedView() === this.scroller) {
                if (this.scroller.atTop() && this.scroller.atBottom()) {
                    if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "unset"
                    if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "unset"
                } else if (this.scroller.atBottom()) {
                    if (this.nextChapterBottomAnchorElement) this.previousChapterTopAnchorElement.style.display = "none"
                    if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "unset"
                } else if (this.scroller.atTop()) {
                    if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "none"
                    if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "unset"
                } else {
                    if (this.nextChapterBottomAnchorElement) this.nextChapterBottomAnchorElement.style.display = "none"
                    if (this.previousChapterTopAnchorElement) this.previousChapterTopAnchorElement.style.display = "none"
                }
            }
        }, 300);

    }

    private showIframeContents() {
        this.isBeingStyled = false;
        // We set a timeOut so that settings can be applied when opacity is still 0
        setTimeout(() => {
            if (!this.isBeingStyled) {
                this.iframe.style.opacity = "1";
            }
        }, 150);
    }

    private showLoadingMessageAfterDelay() {
        this.isLoading = true;
        setTimeout(() => {
            if (this.isLoading) {
                this.loadingMessage.style.display = "block";
                this.loadingMessage.classList.add("is-loading");
            }
        }, 200);
    }

    private hideIframeContents() {
        this.isBeingStyled = true;
        this.iframe.style.opacity = "0";
    }

    private hideLoadingMessage() {
        this.isLoading = false;
        this.loadingMessage.style.display = "none";
        this.loadingMessage.classList.remove("is-loading");
    }

    private async saveCurrentReadingPosition(): Promise<void> {
        if (this.annotator) {
            var tocItem = this.publication.getTOCItem(this.currentChapterLink.href);
            if (this.currentTocUrl !== null) {
                tocItem = this.publication.getTOCItem(this.currentTocUrl);
            }
            if (tocItem === null) {
                tocItem = this.publication.getTOCItemAbsolute(this.currentChapterLink.href);
            }

            const position: ReadingPosition = {
                href: tocItem.href,
                locations: {
                    progression: this.settings.getSelectedView().getCurrentPosition()
                },
                created: new Date(),
                type: this.currentChapterLink.type,
                title: this.currentChapterLink.title
            }
            if (this.api && this.api.updateCurrentlocation) {
                this.api.updateCurrentlocation(position).then(async _ => {
                    if (IS_DEV) { console.log("api updated current location", position) }
                    return this.annotator.saveLastReadingPosition(position);
                })
            } else {
                return this.annotator.saveLastReadingPosition(position);
            }

        } else {
            return new Promise<void>(resolve => resolve());
        }
    }

    private createBase(href: string): HTMLBaseElement {
        const base = document.createElement('base');
        base.target = '_self';
        base.href = href;
        return base;
    }

    private createCssLink(href: string): HTMLLinkElement {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.type = 'text/css';
        cssLink.href = href;
        return cssLink;
    }
    private createJavascriptLink(href: string, isAsync: boolean): HTMLScriptElement {
        
        const jsLink = document.createElement('script');
        jsLink.type = 'text/javascript';
        jsLink.src = href;

        // Enforce synchronous behaviour of injected scripts
        // unless specifically marked async, as though they 
        // were inserted using <script> tags
        //
        // See comment on differing default behaviour of 
        // dynamically inserted script loading at https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#Attributes
        if(isAsync) {
            jsLink.async = true
        } else {
            jsLink.async = false
        }
        
        return jsLink;
    }

}
