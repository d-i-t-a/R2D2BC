import { ReaderModule } from "../ReaderModule";
import { Publication } from "../../model/Publication";
import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import log from "loglevel";
import { Locator } from "../../model/Locator";

export enum Action {
  BookmarkCreated = "BookmarkCreated",
  HighlightCreated = "HighlightCreated",
}

export interface ConsumptionModuleAPI {
  progressTracked: any;
  actionTracked: any;
}
export interface ConsumptionModuleProperties {
  enableTrackingActions?: boolean;
  actions?: Action[];
  enableTrackingProgress?: boolean;
}
export interface ConsumptionModuleConfig extends ConsumptionModuleProperties {
  publication: Publication;
  delegate: IFrameNavigator;
  properties?: ConsumptionModuleProperties;
  api?: ConsumptionModuleAPI;
}

export class ConsumptionModule implements ReaderModule {
  private delegate: IFrameNavigator;
  private publication: Publication;
  private properties: ConsumptionModuleProperties;
  api?: ConsumptionModuleAPI;
  startLocator?: Locator;
  lastLocator?: Locator;

  private constructor(
    delegate: IFrameNavigator,
    publication: Publication,
    properties: ConsumptionModuleProperties,
    api?: ConsumptionModuleAPI
  ) {
    this.delegate = delegate;
    this.publication = publication;
    this.properties = properties;
    this.api = api;
  }

  public static async create(config: ConsumptionModuleConfig) {
    const consumption = new this(
      config.delegate,
      config.publication,
      config as ConsumptionModuleProperties,
      config.api
    );
    await consumption.start();
    return consumption;
  }
  protected async start(): Promise<void> {
    this.delegate.consumptionModule = this;
  }
  async stop() {
    log.log("Consumption module stop");
  }

  async trackAction(locator: Locator, action: Action) {
    this.api?.actionTracked(locator, action);
  }
  async startProgress(locator: Locator) {
    this.startLocator = locator;
  }
  async continueProgress(locator: Locator) {
    this.lastLocator = locator;
    if (this.startLocator === undefined) {
      this.startLocator = locator;
    }
  }
  async endProgress() {
    if (this.startLocator && this.lastLocator) {
      let progress =
        this.lastLocator.locations.totalProgression! -
        this.startLocator.locations.totalProgression!;
      this.api?.progressTracked(
        this.startLocator,
        this.lastLocator,
        Math.round(progress * 100)
      );
    }
  }
}
