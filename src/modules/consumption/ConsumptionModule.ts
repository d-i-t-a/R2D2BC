import { ReaderModule } from "../ReaderModule";
import { Publication } from "../../model/Publication";
import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import log from "loglevel";
import { Locator } from "../../model/Locator";

/*
Beta Module !!!
 */

export enum Action {
  BookmarkCreated = "BookmarkCreated",
  HighlightCreated = "HighlightCreated",
}

export interface ConsumptionModuleAPI {
  startResearchSession: any;
  updateResearchSession: any;
  endResearchSession: any;
  idleSince: any;
  actionTracked: any;
}
export interface ConsumptionModuleProperties {
  enableTrackingSession?: boolean;
  updateSessionInterval?: number;
  enableTrackingActions?: boolean;
  idleTimeout?: number;
  responseTimeout?: number;
}
export interface ReadingSession {
  time: any;
  firstLocator: Locator;
  lastLocator: Locator;
  progress: any;
}

export interface ConsumptionModuleConfig extends ConsumptionModuleProperties {
  publication: Publication;
  properties?: ConsumptionModuleProperties;
  api?: ConsumptionModuleAPI;
}

export class ConsumptionModule implements ReaderModule {
  navigator: IFrameNavigator;
  private publication: Publication;
  private properties: ConsumptionModuleProperties;
  api?: ConsumptionModuleAPI;

  // research session - one research session per book opening until book closes or times out
  // reading session - multiple reading sessions within a research session

  startResearchTimer?: Date;
  researchSessionId: any;
  readingSessions: ReadingSession[];
  readingSessionsInterval;

  startReadingTimer: Date;
  firstReadingLocator: Locator;
  lastReadingLocator: Locator;

  private constructor(
    publication: Publication,
    properties: ConsumptionModuleProperties,
    api?: ConsumptionModuleAPI
  ) {
    this.publication = publication;
    this.properties = properties;
    this.api = api;
  }

  public static async create(config: ConsumptionModuleConfig) {
    const consumption = new this(
      config.publication,
      config as ConsumptionModuleProperties,
      config.api
    );
    await consumption.start();
    return consumption;
  }
  protected async start(): Promise<void> {
    this.startResearchSession();
  }
  async stop() {
    log.log("Consumption module stop");
    this.endResearchSession();
  }

  initialize(iframe: HTMLIFrameElement) {
    let win = iframe.contentWindow;
    if (win) {
      const self = this;
      win.onload = function () {
        self.resetTimer();
      };
      win.onmousemove = function () {
        self.resetTimer();
      };
      win.onmousedown = function () {
        self.resetTimer();
      };
      win.ontouchstart = function () {
        self.resetTimer();
      };
      win.onclick = function () {
        self.resetTimer();
      };
      win.onkeypress = function () {
        self.resetTimer();
      };
    }
  }
  trackAction(locator: Locator, action: Action) {
    this.api?.actionTracked(locator, action);
  }
  startReadingSession(locator: Locator) {
    if (this.firstReadingLocator && this.lastReadingLocator) {
      let progress =
        this.lastReadingLocator.locations.totalProgression! -
        this.firstReadingLocator.locations.totalProgression!;
      let timeElapsed =
        (new Date().getTime() - this.startReadingTimer.getTime()) / 1000;
      this.readingSessions.push({
        lastLocator: this.lastReadingLocator,
        firstLocator: this.firstReadingLocator,
        time: timeElapsed,
        progress: Math.round(progress * 100),
      });
    }
    this.firstReadingLocator = locator;
    this.startReadingTimer = new Date();
  }
  continueReadingSession(locator: Locator) {
    if (this.properties.enableTrackingSession) {
      if (this.startResearchTimer === undefined) {
        this.startResearchSession();
      }
      if (
        this.lastReadingLocator === undefined ||
        this.lastReadingLocator.locations.totalProgression! <
          locator.locations.totalProgression!
      ) {
        this.lastReadingLocator = locator;
      }
      if (this.firstReadingLocator === undefined) {
        this.firstReadingLocator = locator;
      }
      if (this.startReadingTimer === undefined) {
        this.startReadingTimer = new Date();
      }
    }
  }
  startResearchSession() {
    if (this.properties.enableTrackingSession) {
      this.startResearchTimer = new Date();
      this.readingSessions = [];
      clearInterval(this.readingSessionsInterval);

      let timeElapsed =
        (new Date().getTime() - this.startResearchTimer.getTime()) / 1000;
      this.researchSessionId = this.api?.startResearchSession(
        this.readingSessions,
        Math.round(timeElapsed)
      );

      const self = this;
      this.readingSessionsInterval = setInterval(function () {
        self.updateResearchSession();
      }, this.properties.updateSessionInterval! * 1000);
    }
  }
  updateResearchSession() {
    if (this.properties.enableTrackingSession) {
      let timeElapsed =
        (new Date().getTime() - this.startResearchTimer!.getTime()) / 1000;
      this.api?.updateResearchSession(
        this.researchSessionId,
        this.readingSessions,
        Math.round(timeElapsed)
      );
    }
  }
  endResearchSession() {
    if (this.properties.enableTrackingSession) {
      if (this.firstReadingLocator && this.lastReadingLocator) {
        let progress =
          this.lastReadingLocator.locations.totalProgression! -
          this.firstReadingLocator.locations.totalProgression!;
        let timeElapsed =
          (new Date().getTime() - this.startReadingTimer.getTime()) / 1000;
        this.readingSessions.push({
          lastLocator: this.lastReadingLocator,
          firstLocator: this.firstReadingLocator,
          time: timeElapsed,
          progress: Math.round(progress * 100),
        });
      }

      let timeElapsed =
        (new Date().getTime() - this.startResearchTimer!.getTime()) / 1000;
      this.api?.updateResearchSession(
        this.researchSessionId,
        this.readingSessions,
        Math.round(timeElapsed)
      );
      this.api?.endResearchSession(
        this.researchSessionId,
        this.readingSessions,
        Math.round(timeElapsed)
      );
      this.researchSessionId = undefined;
      this.readingSessions = [];
      this.startResearchTimer = undefined;
      clearInterval(this.readingSessionsInterval);
      clearInterval(this.timer);
    }
  }

  timer;
  currSeconds = 0;

  startIdleTimer() {
    /* Increment the timer seconds */
    this.currSeconds++;

    if (this.currSeconds === this.properties.idleTimeout) {
      this.api?.idleSince(this.currSeconds);
      if (this.startResearchTimer !== undefined) {
        this.updateResearchSession();
      } else {
        this.startResearchSession();
      }
    }
    if (
      this.currSeconds ===
      this.properties.idleTimeout! + this.properties.responseTimeout!
    ) {
      this.endResearchSession();
    }
  }
  resetTimer() {
    /* Clear the previous interval */
    clearInterval(this.timer);

    /* Reset the seconds of the timer */
    this.currSeconds = 0;

    /* Set a new interval */
    const self = this;
    this.timer = setInterval(function () {
      self.startIdleTimer();
    }, 1000);
  }
}
