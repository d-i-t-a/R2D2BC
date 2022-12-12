import EventEmitter from "eventemitter3";
import Navigator from "./Navigator";
import { UserSettings } from "../model/user-settings/UserSettings";
import { Publication } from "../model/Publication";
import { Locator } from "../model/Locator";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { findRequiredElement } from "../utils/HTMLUtilities";

export interface PDFNavigatorConfig {
  mainElement: HTMLElement;
  headerMenu?: HTMLElement | null;
  footerMenu?: HTMLElement | null;
  publication: Publication;
  settings: UserSettings;
}

export class PDFNavigator extends EventEmitter implements Navigator {
  settings: UserSettings;
  publication: Publication;

  headerMenu?: HTMLElement | null;
  footerMenu?: HTMLElement | null;
  mainElement: HTMLElement;

  pdfDoc: any = null;
  pageNum = 1;
  pageRendering = false;
  pageNumPending: any = null;
  scale = 1.0;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  resourceIndex = 0;
  resource: any;

  public static async create(
    config: PDFNavigatorConfig
  ): Promise<PDFNavigator> {
    const navigator = new this(config.settings, config.publication);

    await navigator.start(
      config.mainElement,
      config.headerMenu,
      config.footerMenu
    );
    return new Promise((resolve) => resolve(navigator));
  }
  protected constructor(settings: UserSettings, publication: Publication) {
    super();
    this.settings = settings;
    this.publication = publication;
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

    console.log(this.resource);
    console.log(this.resource.Href1);

    GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.js`;

    this.canvas = document.getElementById("the-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d");

    const self = this;

    getDocument(this.resource.Href1).promise.then(function (pdfDoc_) {
      self.pdfDoc = pdfDoc_;
      self.renderPage(self.pageNum);
    });
  }

  renderPage(num) {
    const self = this;
    const main = findRequiredElement(this.mainElement, "main");
    self.pageRendering = true;

    self.pdfDoc.getPage(num).then(function (page) {
      let viewport = page.getViewport({ scale: self.scale });

      const sc = main.clientHeight / viewport.height;
      viewport = page.getViewport({ scale: sc });

      self.canvas.height = viewport.height;
      self.canvas.width = viewport.width;

      // Render PDF page into canvas context
      const renderContext = {
        canvasContext: self.ctx,
        viewport: viewport,
      };
      const renderTask = page.render(renderContext);

      // Wait for rendering to finish
      renderTask.promise.then(function () {
        self.pageRendering = false;
        if (self.pageNumPending !== null) {
          // New page rendering is pending
          self.renderPage(self.pageNumPending);
          self.pageNumPending = null;
        }
      });
    });
  }

  queueRenderPage(num) {
    const self = this;
    if (self.pageRendering) {
      self.pageNumPending = num;
    } else {
      self.renderPage(num);
    }
  }

  readingOrder(): any {}

  tableOfContents(): any {}

  currentResource(): any {}

  totalResources(): any {}

  currentLocator(): any {}

  positions(): any {}

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
    console.log(self.resourceIndex, this.publication.readingOrder.length - 1);
    if (this.resourceIndex >= this.publication.readingOrder.length - 1) {
      return;
    }
    self.resourceIndex++;
    self.resource = this.publication.readingOrder[self.resourceIndex];
    console.log(this.resource.Href1);
    getDocument(this.resource.Href1).promise.then(function (pdfDoc_) {
      self.pdfDoc = pdfDoc_;
      self.pageNum = 1;
      self.renderPage(self.pageNum);
    });
  }

  previousResource(): void {
    const self = this;
    console.log(self.resourceIndex, this.publication.readingOrder.length - 1);
    if (this.resourceIndex === 0) {
      return;
    }
    self.resourceIndex--;
    self.resource = this.publication.readingOrder[self.resourceIndex];
    console.log(this.resource.Href1);
    getDocument(this.resource.Href1).promise.then(function (pdfDoc_) {
      self.pdfDoc = pdfDoc_;
      self.pageNum = self.pdfDoc.numPages;
      self.renderPage(self.pageNum);
    });
  }

  goTo(locator: Locator): void {
    console.log(locator);
  }

  goToPosition(value: number): void {
    console.log(value);
  }

  async goToPage(page: number) {
    console.log(page);
  }

  stop(): void {}
}
