import EventEmitter from "eventemitter3";
import Navigator from "./Navigator";
import { UserSettings } from "../model/user-settings/UserSettings";
import { Publication } from "../model/Publication";
import { Locator } from "../model/Locator";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import {
  addEventListenerOptional,
  removeEventListenerOptional,
} from "../utils/EventHandler";
import * as HTMLUtilities from "../utils/HTMLUtilities";
import { NavigatorAPI } from "./IFrameNavigator";
import { GrabToPan } from "../utils/GrabToPan";
import { readerLoading } from "../utils/HTMLTemplates";

export interface PDFNavigatorConfig {
  mainElement: HTMLElement;
  headerMenu?: HTMLElement | null;
  footerMenu?: HTMLElement | null;
  publication: Publication;
  settings: UserSettings;
  api?: Partial<NavigatorAPI>;
}
export enum ScaleType {
  Page = 0,
  Width = 1,
}

export class PDFNavigator extends EventEmitter implements Navigator {
  settings: UserSettings;
  publication: Publication;

  headerMenu?: HTMLElement | null;
  footerMenu?: HTMLElement | null;
  mainElement: HTMLElement;
  pdfContainer: HTMLElement;
  wrapper: HTMLElement;

  api?: Partial<NavigatorAPI>;

  pdfDoc: any = null;
  pageNum = 1;
  scaleType: ScaleType = ScaleType.Page;
  pageRendering = false;
  pageNumPending: any = null;
  scale = 1.0;
  resourceIndex = 0;
  resource: any;
  private handTool: GrabToPan;

  public static async create(
    config: PDFNavigatorConfig
  ): Promise<PDFNavigator> {
    const navigator = new this(config.settings, config.publication, config.api);

    await navigator.start(
      config.mainElement,
      config.headerMenu,
      config.footerMenu
    );
    return new Promise((resolve) => resolve(navigator));
  }
  protected constructor(
    settings: UserSettings,
    publication: Publication,
    api?: Partial<NavigatorAPI>
  ) {
    super();
    this.settings = settings;
    this.publication = publication;
    this.api = api;
  }

  protected async start(
    mainElement: HTMLElement,
    headerMenu?: HTMLElement | null,
    footerMenu?: HTMLElement | null
  ): Promise<void> {
    this.headerMenu = headerMenu;
    this.footerMenu = footerMenu;
    this.mainElement = mainElement;

    this.resourceIndex = 0;
    this.resource = this.publication.readingOrder[this.resourceIndex];

    GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.js`;
    this.wrapper = HTMLUtilities.findRequiredElement(
      this.mainElement,
      "main#iframe-wrapper"
    );
    this.pdfContainer = HTMLUtilities.findRequiredElement(
      this.mainElement,
      "#pdf-container"
    );

    this.handTool = new GrabToPan({
      element: this.pdfContainer,
    });

    const self = this;
    // add loading
    let loadingMessage = document.createElement("div");
    loadingMessage.id = "loadingpdf";
    loadingMessage.innerHTML = readerLoading;
    loadingMessage.style.width = getComputedStyle(this.wrapper).width;
    loadingMessage.style.height = getComputedStyle(this.wrapper).height;
    loadingMessage.style.display = "flex";
    loadingMessage.style.zIndex = "100";
    loadingMessage.style.position = "absolute";
    loadingMessage.style.alignItems = "center";
    loadingMessage.style.justifyContent = "center";
    loadingMessage.style.background = "white";
    loadingMessage.className = "loading is-loading";

    this.pdfContainer.appendChild(loadingMessage);

    getDocument(
      this.publication.getAbsoluteHref(this.resource.Href)
    ).promise.then(function (pdfDoc_) {
      self.pdfDoc = pdfDoc_;
      self.loadPDFJS(self.pageNum);
    });
    this.setupEvents();
  }

  timeout: any;

  onResize = () => {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(this.handleResize.bind(this), 200);
  };
  async handleResize(): Promise<void> {
    this.loadPDFJS(this.pageNum);
  }
  private setupEvents(): void {
    addEventListenerOptional(window, "resize", this.onResize);
  }

  loadPDFJS(num) {
    const self = this;
    let currentPage = 1;
    this.wrapper.style.height = "calc(100vh - 10px)";
    this.pdfContainer.style.height = "calc(100vh - 10px)";
    this.pdfContainer.style.flexDirection = "column";

    let collection = document.getElementsByTagName("canvas");
    Array.from(collection).forEach(function (element) {
      element?.parentNode?.removeChild(element);
    });

    function renderPage(page) {
      const canvas = document.createElement("canvas");
      canvas.id = String(currentPage);
      canvas.style.border = "1px solid gray";
      canvas.style.margin = "1px";

      let viewport = page.getViewport({ scale: self.scale });

      if (self.scale === 1.0) {
        const fitPage = self.wrapper.clientHeight / viewport.height;
        const fitWidth = self.wrapper.clientWidth / viewport.width;
        if (self.scaleType === ScaleType.Page) {
          viewport = page.getViewport({
            scale: fitPage < fitWidth ? fitPage : fitWidth,
          });
        } else {
          viewport = page.getViewport({ scale: fitWidth });
        }
      }

      // append the created canvas to the container
      self.pdfContainer.appendChild(canvas);
      // Get context of the canvas
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      let pdfload = document.getElementById("loadingpdf");

      pdfload!.style.display = "flex";
      pdfload!.style.width = getComputedStyle(self.wrapper).width;
      pdfload!.style.height = getComputedStyle(self.wrapper).height;

      const renderTask = page.render(renderContext);

      renderTask.promise.then(function () {
        if (currentPage < self.pdfDoc.numPages) {
          currentPage++;
          self.pdfDoc.getPage(currentPage).then(renderPage);
        } else {
          // Callback function here, which will trigger when all pages are loaded
          document.getElementById(String(num))?.scrollIntoView();
          pdfload!.style.display = "none";
          if (self.api?.resourceReady) self.api?.resourceReady();
          self.emit("resource.ready");
        }
      });
    }
    this.pdfDoc.getPage(currentPage).then(renderPage);
  }

  queueRenderPage(num) {
    const self = this;
    if (self.pageRendering) {
      self.pageNumPending = num;
    } else {
      this.pageNum = num;
      document.getElementById(String(num))?.scrollIntoView();
    }
  }

  readingOrder(): any {
    return this.publication.readingOrder;
  }

  tableOfContents(): any {
    return this.publication.tableOfContents;
  }
  landmarks(): any {}
  pageList(): any {}

  //TODO:
  currentResource(): any {}

  totalResources(): any {
    return this.publication.readingOrder.length;
  }

  //TODO:
  currentLocator(): any {}

  positions(): any {
    return this.publication.positions ? this.publication.positions : [];
  }

  nextPage(): void {
    const self = this;
    if (self.pageNum >= self.pdfDoc.numPages) {
      this.nextResource();
      return;
    }
    this.pageNum++;
    this.queueRenderPage(self.pageNum);
  }

  previousPage(): void {
    const self = this;
    if (self.pageNum <= 1) {
      this.previousResource();
      return;
    }
    self.pageNum--;
    self.queueRenderPage(self.pageNum);
  }

  nextResource(): void {
    const self = this;
    if (this.resourceIndex >= this.publication.readingOrder.length - 1) {
      return;
    }
    self.resourceIndex++;
    self.resource = this.publication.readingOrder[self.resourceIndex];
    getDocument(
      this.publication.getAbsoluteHref(this.resource.Href)
    ).promise.then(function (pdfDoc_) {
      self.pdfDoc = pdfDoc_;
      self.pageNum = 1;
      self.loadPDFJS(self.pageNum);
    });
  }

  previousResource(): void {
    const self = this;
    if (this.resourceIndex === 0) {
      return;
    }
    self.resourceIndex--;
    self.resource = this.publication.readingOrder[self.resourceIndex];
    getDocument(
      this.publication.getAbsoluteHref(this.resource.Href)
    ).promise.then(function (pdfDoc_) {
      self.pdfDoc = pdfDoc_;
      self.pageNum = self.pdfDoc.numPages;
      self.loadPDFJS(self.pageNum);
    });
  }

  goTo(locator: Locator): void {
    const url = new URL(locator.href);
    if (url.searchParams.has("start")) {
      const page = url.searchParams.get("start");
      if (page) {
        this.queueRenderPage(parseInt(page));
      }
    } else {
      this.queueRenderPage(1);
    }
  }

  goToPosition(value: number): void {
    this.queueRenderPage(value);
  }

  async goToPage(page: number) {
    this.queueRenderPage(page);
  }
  fitToWidth(): void {
    this.scale = 1.0;
    this.scaleType = ScaleType.Width;
    this.loadPDFJS(this.pageNum);
  }
  fitToPage(): void {
    this.scale = 1.0;
    this.scaleType = ScaleType.Page;
    this.loadPDFJS(this.pageNum);
  }
  zoomIn(): void {
    this.scale = this.scale + 0.2;
    this.loadPDFJS(this.pageNum);
  }
  zoomOut(): void {
    this.scale = this.scale - 0.2;
    this.loadPDFJS(this.pageNum);
  }
  activateHand(): void {
    this.handTool.activate();
  }
  deactivateHand(): void {
    this.handTool.deactivate();
  }
  async scroll(scroll: boolean, direction?: string): Promise<void> {
    if (scroll) {
      if (direction === "horizontal") {
        this.pdfContainer.style.flexDirection = "row";
      } else {
        this.pdfContainer.style.flexDirection = "column";
      }
      this.pdfContainer.style.overflow = "auto";
    } else {
      this.pdfContainer.style.flexDirection = "column";
      this.pdfContainer.style.overflow = "hidden";
    }
  }
  stop(): void {
    removeEventListenerOptional(window, "resize", this.onResize);
  }
}
