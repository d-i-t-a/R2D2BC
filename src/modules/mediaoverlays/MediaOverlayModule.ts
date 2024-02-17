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
 * Developed on behalf of: Bibliotheca LLC
 * Licensed to: Bibliotheca LLC under one or more contributor license agreements.
 */

import { Publication } from "../../model/Publication";
import { IFrameNavigator } from "../../navigator/IFrameNavigator";
import { ReaderModule } from "../ReaderModule";
import { Link } from "../../model/Link";
import { MediaOverlayNode } from "r2-shared-js/dist/es6-es2015/src/models/media-overlay";
import { TaJsonDeserialize } from "../../utils/JsonUtil";
import {
  MediaOverlaySettings,
  R2_MO_CLASS_ACTIVE,
} from "./MediaOverlaySettings";
import * as HTMLUtilities from "../../utils/HTMLUtilities";
import log from "loglevel";

// Media Overlays
// Synchronized Narration
// Synchronized Media
// Read Along
// Read Aloud

export interface MediaOverlayModuleAPI {
  started: any;
  stopped: any;
  paused: any;
  resumed: any;
  finished: any;
  updateSettings: any;
}
export interface MediaOverlayModuleProperties {
  color?: string;
  autoScroll?: boolean;
  autoTurn?: boolean;
  volume?: number;
  rate?: number;
  wait?: number;
  hideLayer?: boolean;
}
export interface MediaOverlayModuleConfig extends MediaOverlayModuleProperties {
  publication: Publication;
  settings: MediaOverlaySettings;
  api?: MediaOverlayModuleAPI;
}

export class MediaOverlayModule implements ReaderModule {
  private publication: Publication;
  navigator: IFrameNavigator;
  private audioElement: HTMLMediaElement;
  settings: MediaOverlaySettings;
  private properties: MediaOverlayModuleProperties;
  private play: HTMLLinkElement = HTMLUtilities.findElement(
    document,
    "#menu-button-play"
  );
  private pause: HTMLLinkElement = HTMLUtilities.findElement(
    document,
    "#menu-button-pause"
  );

  private currentAudioBegin: number | undefined;
  private currentAudioEnd: number | undefined;
  private currentLinks: Array<Link | undefined>;
  private currentLinkIndex = 0;
  private currentAudioUrl: string | undefined;
  private previousAudioUrl: string | undefined;
  private previousAudioEnd: number | undefined;
  private mediaOverlayRoot: MediaOverlayNode | undefined;
  private mediaOverlayTextAudioPair: MediaOverlayNode | undefined;
  private pid: string | undefined = undefined;
  private __ontimeupdate = false;

  public static create(config: MediaOverlayModuleConfig) {
    const mediaOverlay = new this(
      config.publication,
      config.settings,
      config as MediaOverlayModuleProperties
    );
    mediaOverlay.start();
    return mediaOverlay;
  }

  private constructor(
    publication: Publication,
    settings: MediaOverlaySettings,
    properties: MediaOverlayModuleProperties
  ) {
    this.publication = publication;
    this.settings = settings;
    this.properties = properties;
  }

  stop() {
    log.log("MediaOverlay module stop");
  }

  protected start() {
    log.log("MediaOverlay module start");
  }

  async initialize() {
    return new Promise<void>(async (resolve) => {
      await (document as any).fonts.ready;

      this.settings.setControls();
      this.settings.onSettingsChange(() => {
        this.audioElement.volume = this.settings.volume;
        this.audioElement.playbackRate = this.settings.rate;
      });
      resolve();
    });
  }

  async initializeResource(links: Array<Link | undefined>) {
    this.currentLinks = links;
    this.currentLinkIndex = 0;
    await this.playLink();
  }

  private async playLink() {
    let link = this.currentLinks[this.currentLinkIndex];
    if (link?.Properties?.MediaOverlay) {
      this.ensureOnTimeUpdate(false, false);
      const moUrl = link.Properties?.MediaOverlay;

      const moUrlObjFull = new URL(moUrl, this.publication.manifestUrl);
      const moUrlFull = moUrlObjFull.toString();

      let response: Response;
      try {
        response = await fetch(moUrlFull, this.navigator.requestConfig);
      } catch (e) {
        console.error(e, moUrlFull);
        return;
      }
      if (!response.ok) {
        log.log("BAD RESPONSE?!");
      }

      let moJson: any | undefined;
      try {
        moJson = await response.json();
      } catch (e) {
        console.error(e);
      }
      if (!moJson) {
        log.log("## moJson" + moJson);
        return;
      }

      link.MediaOverlays = TaJsonDeserialize<MediaOverlayNode>(
        moJson,
        MediaOverlayNode
      );
      link.MediaOverlays.initialized = true;

      const href = link.HrefDecoded || link.Href;
      const hrefUrlObj = new URL("https://dita.digital/" + href);

      await this.playMediaOverlays(
        hrefUrlObj.pathname.substr(1),
        link.MediaOverlays,
        undefined
      );
    } else {
      if (this.audioElement) {
        await this.audioElement.pause();
      }
      if (this.currentLinks.length > 1 && this.currentLinkIndex === 0) {
        this.currentLinkIndex++;
        await this.playLink();
      } else {
        if (this.settings.autoTurn && this.settings.playing) {
          if (this.audioElement) {
            await this.audioElement.pause();
          }
          this.navigator.nextResource();
        } else {
          await this.stopReadAloud();
        }
      }
    }
  }

  async startReadAloud() {
    if (this.navigator.rights.enableMediaOverlays) {
      this.settings.playing = true;
      if (
        this.audioElement &&
        this.currentLinks[this.currentLinkIndex]?.Properties.MediaOverlay
      ) {
        const timeToSeekTo = this.currentAudioBegin
          ? this.currentAudioBegin
          : 0;
        this.audioElement.currentTime = timeToSeekTo;
        await this.audioElement.play();
        this.ensureOnTimeUpdate(false, true);
        this.audioElement.volume = this.settings.volume;
        this.audioElement.playbackRate = this.settings.rate;
      } else {
        if (this.currentLinks.length > 1 && this.currentLinkIndex === 0) {
          this.currentLinkIndex++;
          await this.playLink();
        } else {
          if (this.settings.autoTurn && this.settings.playing) {
            this.navigator.nextResource();
          } else {
            await this.stopReadAloud();
          }
        }
      }
      if (this.play) this.play.style.display = "none";
      if (this.pause) this.pause.style.removeProperty("display");
    }
  }
  async stopReadAloud() {
    if (this.navigator.rights.enableMediaOverlays) {
      this.settings.playing = false;

      if (this.audioElement) this.audioElement.pause();

      if (this.play) this.play.style.removeProperty("display");
      if (this.pause) this.pause.style.display = "none";
    }
  }
  pauseReadAloud() {
    if (this.navigator.rights.enableMediaOverlays) {
      this.settings.playing = false;
      this.audioElement.pause();
      if (this.play) this.play.style.removeProperty("display");
      if (this.pause) this.pause.style.display = "none";
    }
  }
  async resumeReadAloud() {
    if (this.navigator.rights.enableMediaOverlays) {
      this.settings.playing = true;
      await this.audioElement.play();
      if (this.play) this.play.style.display = "none";
      if (this.pause) this.pause.style.removeProperty("display");
    }
  }

  findDepthFirstTextAudioPair(
    textHref: string,
    mo: MediaOverlayNode,
    textFragmentIDChain: Array<string | null> | undefined
  ): MediaOverlayNode | undefined | null {
    log.log("findDepthFirstTextAudioPair()");

    let isTextUrlMatch: boolean | undefined;
    let isFragmentIDMatch: boolean | undefined;
    if (mo.Text) {
      const hrefUrlObj = new URL("https://dita.digital/" + mo.Text);
      if (hrefUrlObj.pathname.substr(1) === textHref) {
        isTextUrlMatch = true;

        if (hrefUrlObj.hash && textFragmentIDChain) {
          isFragmentIDMatch = false;
          const id = hrefUrlObj.hash.substr(1);
          for (const frag of textFragmentIDChain) {
            if (frag === id) {
              isFragmentIDMatch = true;
              break;
            }
          }
        }
      } else {
        isTextUrlMatch = false;
      }
    }

    log.log("isFragmentIDMatch: " + isFragmentIDMatch);
    log.log("isTextUrlMatch: " + isTextUrlMatch);
    if (!mo.Children || !mo.Children.length) {
      log.log("findDepthFirstTextAudioPair() - leaf text/audio pair");
      if (!isTextUrlMatch) {
        log.log("findDepthFirstTextAudioPair() - leaf - !isTextUrlMatch");
        return undefined;
      }
      if (isFragmentIDMatch || (isTextUrlMatch && !textFragmentIDChain)) {
        log.log(
          "findDepthFirstTextAudioPair() - leaf - isFragmentIDMatch || (isTextUrlMatch && !textFragmentIDChain"
        );
        return mo;
      }
      return undefined;
    }
    const textFragmentIDChainOriginal = textFragmentIDChain;
    let frags = textFragmentIDChain;
    for (const child of mo.Children) {
      log.log("findDepthFirstTextAudioPair() - child");
      log.log(JSON.stringify(child));
      const match = this.findDepthFirstTextAudioPair(textHref, child, frags);
      if (match === null) {
        log.log("findDepthFirstTextAudioPair() - child - match null (skip)");
        frags = undefined;
      }
      if (match) {
        log.log("findDepthFirstTextAudioPair() - child - match");
        log.log(JSON.stringify(match));
        return match;
      }
    }
    if (isFragmentIDMatch) {
      log.log("findDepthFirstTextAudioPair() - post isFragmentIDMatch");
      const match = this.findDepthFirstTextAudioPair(textHref, mo, undefined);
      if (match) {
        log.log(
          "findDepthFirstTextAudioPair() - post isFragmentIDMatch - match"
        );
        log.log(JSON.stringify(match));
        return match;
      } else {
        return match;
      }
    }
    if (textFragmentIDChainOriginal && !frags) {
      return null;
    }
    return undefined;
  }

  myReq;
  trackCurrentTime() {
    cancelAnimationFrame(this.myReq);

    if (this.mediaOverlayTextAudioPair) {
      try {
        if (
          this.currentAudioEnd &&
          this.audioElement.currentTime >= this.currentAudioEnd - 0.05
        ) {
          log.log("ontimeupdate - mediaOverlaysNext()");
          this.mediaOverlaysNext();
        }
        const match_i = this.mediaOverlayTextAudioPair.Text.lastIndexOf("#");
        const match_id = this.mediaOverlayTextAudioPair.Text.substr(
          match_i + 1
        );

        this.mediaOverlayHighlight(match_id);

        this.myReq = requestAnimationFrame(this.trackCurrentTime.bind(this));
      } catch (e) {}
    }
  }

  mediaOverlaysNext(escape?: boolean) {
    log.log("mediaOverlaysNext()");

    if (this.mediaOverlayRoot && this.mediaOverlayTextAudioPair) {
      const nextTextAudioPair = this.findNextTextAudioPair(
        this.mediaOverlayRoot,
        this.mediaOverlayTextAudioPair,
        { prev: undefined },
        escape ? true : false
      );
      if (!nextTextAudioPair) {
        log.log("mediaOverlaysNext() - navLeftOrRight()");
        this.mediaOverlaysStop();

        if (this.currentLinks.length > 1 && this.currentLinkIndex === 0) {
          this.currentLinkIndex++;
          this.playLink();
        } else {
          this.audioElement.pause();
          if (this.settings.autoTurn && this.settings.playing) {
            this.audioElement.pause();
            this.navigator.nextResource();
          } else {
            this.stopReadAloud();
          }
        }
      } else {
        let switchDoc = false;
        if (this.mediaOverlayTextAudioPair.Text && nextTextAudioPair.Text) {
          const hrefUrlObj1 = new URL(
            "https://dita.digital/" + this.mediaOverlayTextAudioPair.Text
          );
          const hrefUrlObj2 = new URL(
            "https://dita.digital/" + nextTextAudioPair.Text
          );
          if (hrefUrlObj1.pathname !== hrefUrlObj2.pathname) {
            log.log(
              "mediaOverlaysNext() SWITCH! " +
                hrefUrlObj1.pathname +
                " != " +
                hrefUrlObj2.pathname
            );
            switchDoc = true;
          }
        }
        if (switchDoc) {
          this.mediaOverlaysStop();
        } else {
          log.log("mediaOverlaysNext() - playMediaOverlaysAudio()");
          setTimeout(async () => {
            await this.playMediaOverlaysAudio(
              nextTextAudioPair,
              undefined,
              undefined
            );
          }, 0);
        }
      }
    } else {
      log.log("mediaOverlaysNext() - navLeftOrRight() 2");
      this.mediaOverlaysStop();

      if (this.currentLinks.length > 1 && this.currentLinkIndex === 0) {
        this.currentLinkIndex++;
        this.playLink();
      } else {
        this.audioElement.pause();
        if (this.settings.autoTurn && this.settings.playing) {
          this.audioElement.pause();
          this.navigator.nextResource();
        } else {
          this.stopReadAloud();
        }
      }
    }
  }
  mediaOverlaysStop() {
    log.log("mediaOverlaysStop()");

    this.mediaOverlaysPause();

    this.mediaOverlayRoot = undefined;
    this.mediaOverlayTextAudioPair = undefined;
  }
  mediaOverlaysPause() {
    log.log("mediaOverlaysPause()");

    this.mediaOverlayHighlight(undefined);

    if (this.audioElement) {
      this.audioElement.pause();
    }
  }
  findNextTextAudioPair(
    mo: MediaOverlayNode,
    moToMatch: MediaOverlayNode,
    previousMo: { prev: MediaOverlayNode | undefined },
    escape: boolean
  ): MediaOverlayNode | undefined | null {
    if (!mo.Children || !mo.Children.length) {
      if (previousMo?.prev === moToMatch) {
        log.log("findNextTextAudioPair() - prevMo === moToMatch");
        return mo;
      }
      log.log("findNextTextAudioPair() - set previous");
      log.log(JSON.stringify(mo));
      previousMo.prev = mo;
      return undefined;
    }
    for (const child of mo.Children) {
      log.log("findNextTextAudioPair() - child");
      log.log(JSON.stringify(child));
      const match = this.findNextTextAudioPair(
        child,
        moToMatch,
        previousMo,
        escape
      );
      if (match) {
        log.log("findNextTextAudioPair() - match");
        log.log(JSON.stringify(match));
        return match;
      }
    }
    return undefined;
  }
  async playMediaOverlaysAudio(
    moTextAudioPair: MediaOverlayNode,
    begin: number | undefined,
    end: number | undefined
  ) {
    log.log("playMediaOverlaysAudio()");

    this.mediaOverlayTextAudioPair = moTextAudioPair;

    if (!moTextAudioPair.Audio) {
      return; // TODO TTS
    }

    const urlObjFull = new URL(
      moTextAudioPair.Audio,
      this.publication.manifestUrl
    );
    const urlFull = urlObjFull.toString();

    const urlObjNoQuery = new URL(urlFull);
    urlObjNoQuery.hash = "";
    urlObjNoQuery.search = "";
    const urlNoQuery = urlObjNoQuery.toString();

    const hasBegin = typeof begin !== "undefined";
    const hasEnd = typeof end !== "undefined";

    this.previousAudioEnd = this.currentAudioEnd;
    this.currentAudioBegin = undefined;
    this.currentAudioEnd = undefined;

    if (!hasBegin && !hasEnd) {
      if (urlObjFull.hash) {
        const matches = urlObjFull.hash.match(/t=([0-9.]+)(,([0-9.]+))?/);
        if (matches && matches.length >= 1) {
          const b = matches[1];
          try {
            this.currentAudioBegin = parseFloat(b);
          } catch (err) {
            log.error(err);
          }
          if (matches.length >= 3) {
            const e = matches[3];
            try {
              this.currentAudioEnd = parseFloat(e);
            } catch (err) {
              log.error(err);
            }
          }
        }
      }
    } else {
      this.currentAudioBegin = begin;
      this.currentAudioEnd = end;
    }
    log.log(
      `${urlFull} => [${this.currentAudioBegin}-${this.currentAudioEnd}]`
    );

    const playClip = async (initial: boolean) => {
      if (!this.audioElement) {
        return;
      }
      const timeToSeekTo = this.currentAudioBegin ? this.currentAudioBegin : 0;

      if (initial || this.audioElement.paused) {
        if (
          (initial && !timeToSeekTo) ||
          this.audioElement.currentTime === timeToSeekTo
        ) {
          log.log(
            "playMediaOverlaysAudio() - playClip() - _currentAudioElement.play()"
          );
          this.ensureOnTimeUpdate(false, false);
          this.audioElement.playbackRate = this.settings.rate;
          this.audioElement.volume = this.settings.volume;
          if (this.settings.playing) {
            let self = this;
            function checkReady() {
              if (!self.settings.resourceReady) {
                setTimeout(checkReady, 200);
              } else {
                /* do something*/
                setTimeout(async () => {
                  await self.audioElement.play();
                  self.ensureOnTimeUpdate(false, true);
                }, self.settings.wait * 1000);
              }
            }
            checkReady();
          }
        } else {
          log.log("playMediaOverlaysAudio() - playClip() - ontimeupdateSeeked");
          const ontimeupdateSeeked = async (_ev: Event) => {
            this.audioElement.removeEventListener(
              "timeupdate",
              ontimeupdateSeeked
            );

            log.log(
              "playMediaOverlaysAudio() - playClip() - ontimeupdateSeeked - .play()"
            );
            this.ensureOnTimeUpdate(false, false);
            if (this.audioElement) {
              this.audioElement.playbackRate = this.settings.rate;
              this.audioElement.volume = this.settings.volume;
              if (this.settings.playing) {
                let self = this;
                function checkReady() {
                  if (!self.settings.resourceReady) {
                    setTimeout(checkReady, 200);
                  } else {
                    /* do something*/
                    setTimeout(async () => {
                      await self.audioElement.play();
                      self.ensureOnTimeUpdate(false, true);
                    }, self.settings.wait * 1000);
                  }
                }
                checkReady();
              }
            }
          };
          this.audioElement.addEventListener("timeupdate", ontimeupdateSeeked);
          this.audioElement.currentTime = timeToSeekTo;
        }
      } else {
        const contiguous =
          this.previousAudioUrl === this.currentAudioUrl &&
          typeof this.previousAudioEnd !== "undefined" &&
          this.previousAudioEnd > timeToSeekTo - 0.02 &&
          this.previousAudioEnd <= timeToSeekTo &&
          this.audioElement.currentTime >= timeToSeekTo - 0.1;
        this.ensureOnTimeUpdate(false, false);
        if (contiguous) {
          log.log("playMediaOverlaysAudio() - playClip() - ensureOnTimeUpdate");
        } else {
          log.log(
            "playMediaOverlaysAudio() - playClip() - currentTime = timeToSeekTo"
          );
          this.audioElement.currentTime = timeToSeekTo;
        }
      }
    };

    this.previousAudioUrl = this.currentAudioUrl;
    if (!this.currentAudioUrl || urlNoQuery !== this.currentAudioUrl) {
      this.currentAudioUrl = urlNoQuery;
      log.log(
        "playMediaOverlaysAudio() - RESET: " +
          this.previousAudioUrl +
          " => " +
          this.currentAudioUrl
      );

      this.audioElement = document.getElementById(
        "AUDIO_MO_ID"
      ) as HTMLAudioElement;

      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.setAttribute("src", "");
        if (this.audioElement.parentNode) {
          this.audioElement.parentNode.removeChild(this.audioElement);
        }
      }
      this.audioElement = document.createElement("audio");
      this.audioElement.setAttribute("style", "display: none");
      this.audioElement.setAttribute("id", "AUDIO_MO_ID");
      this.audioElement.setAttribute("role", "media-overlays");
      this.audioElement.volume = this.settings.volume;
      this.audioElement.playbackRate = this.settings.rate;

      document.body.appendChild(this.audioElement);

      this.audioElement.addEventListener("error", (ev) => {
        log.log(
          "-1) error: " +
            (this.currentAudioUrl !== (ev.currentTarget as HTMLAudioElement).src
              ? this.currentAudioUrl + " -- "
              : "") +
            (ev.currentTarget as HTMLAudioElement).src.substr(
              (ev.currentTarget as HTMLAudioElement).src.lastIndexOf("/")
            )
        );

        if (this.audioElement && this.audioElement.error) {
          // 1 === MEDIA_ERR_ABORTED
          // 2 === MEDIA_ERR_NETWORK
          // 3 === MEDIA_ERR_DECODE
          // 4 === MEDIA_ERR_SRC_NOT_SUPPORTED
          log.log(this.audioElement.error.code);
          log.log(this.audioElement.error.message);
        }
      });

      const oncanplaythrough = async (ev: Event) => {
        const currentAudioElement = ev.currentTarget as HTMLAudioElement;
        currentAudioElement.removeEventListener(
          "canplaythrough",
          oncanplaythrough
        );
        log.log("oncanplaythrough");
        await playClip(true);
      };
      this.audioElement.addEventListener("canplaythrough", oncanplaythrough);

      const onended = async (_ev: Event) => {
        log.log("onended");
        if (this.currentLinks.length > 1 && this.currentLinkIndex === 0) {
          this.currentLinkIndex++;
          await this.playLink();
        } else {
          if (this.settings.autoTurn && this.settings.playing) {
            this.audioElement.pause();
            this.navigator.nextResource();
          } else {
            this.stopReadAloud();
          }
        }
      };
      this.audioElement.addEventListener("ended", onended);

      this.audioElement.playbackRate = this.settings.rate;
      this.audioElement.setAttribute("src", this.currentAudioUrl);
    } else {
      log.log("playMediaOverlaysAudio() - playClip()");
      await playClip(false);
    }
  }
  async playMediaOverlays(
    textHref: string,
    rootMo: MediaOverlayNode,
    textFragmentIDChain: Array<string | null> | undefined
  ) {
    log.log("playMediaOverlays()");

    let textFragmentIDChain_ = textFragmentIDChain
      ? textFragmentIDChain.filter((id) => id)
      : undefined;
    if (textFragmentIDChain_ && textFragmentIDChain_.length === 0) {
      textFragmentIDChain_ = undefined;
    }

    let moTextAudioPair = this.findDepthFirstTextAudioPair(
      textHref,
      rootMo,
      textFragmentIDChain_
    );
    if (!moTextAudioPair && textFragmentIDChain_) {
      log.log(
        "playMediaOverlays() - findDepthFirstTextAudioPair() SECOND CHANCE "
      );
      log.log(JSON.stringify(textFragmentIDChain_, null, 4));
      log.log(JSON.stringify(rootMo, null, 4));
      moTextAudioPair = this.findDepthFirstTextAudioPair(
        textHref,
        rootMo,
        undefined
      );
    }
    if (moTextAudioPair) {
      if (moTextAudioPair.Audio) {
        log.log("playMediaOverlays() - playMediaOverlaysAudio()");
        this.mediaOverlayRoot = rootMo;
        await this.playMediaOverlaysAudio(
          moTextAudioPair,
          undefined,
          undefined
        );
      }
    } else {
      log.log("playMediaOverlays() - !moTextAudioPair " + textHref);
    }
  }
  ontimeupdate = async (_v: Event) => {
    log.log("ontimeupdate");
    this.trackCurrentTime();
  };
  ensureOnTimeUpdate = (remove: boolean, replace: boolean) => {
    if (remove) {
      if (this.__ontimeupdate) {
        this.__ontimeupdate = false;
        if (this.audioElement) {
          this.audioElement.removeEventListener(
            "timeupdate",
            this.ontimeupdate
          );
        }
        cancelAnimationFrame(this.myReq);
      }
    } else {
      if (!this.__ontimeupdate || replace) {
        this.__ontimeupdate = true;
        if (replace) {
          if (this.audioElement) {
            this.audioElement.removeEventListener(
              "timeupdate",
              this.ontimeupdate
            );
          }
          this.audioElement.addEventListener("timeupdate", this.ontimeupdate);
        }
      }
    }
  };

  mediaOverlayHighlight(id: string | undefined) {
    log.log("moHighlight:  ## " + id);
    let classActive = this.publication.Metadata?.MediaOverlay?.ActiveClass;
    if (!classActive) {
      classActive = this.settings.color;
    }
    const styleAttr =
      this.navigator.iframes[0].contentDocument?.documentElement.getAttribute(
        "style"
      );
    const isNight = styleAttr
      ? styleAttr.indexOf("readium-night-on") > 0
      : false;
    const isSepia = styleAttr
      ? styleAttr.indexOf("readium-sepia-on") > 0
      : false;

    if (
      (this.publication.Metadata.Rendition?.Layout ?? "unknown") !== "fixed"
    ) {
      classActive =
        isNight || isSepia
          ? R2_MO_CLASS_ACTIVE
          : classActive
            ? classActive
            : R2_MO_CLASS_ACTIVE;
    }

    if (this.pid) {
      let prevElement;

      if (this.currentLinkIndex === 0) {
        prevElement = this.navigator.iframes[0].contentDocument?.getElementById(
          this.pid
        );
      } else {
        prevElement = this.navigator.iframes[1].contentDocument?.getElementById(
          this.pid
        );
      }

      if (prevElement) {
        prevElement.classList.remove(classActive);
      }
    }

    let current;
    if (id) {
      if (this.currentLinkIndex === 0) {
        current = this.navigator.iframes[0].contentDocument?.getElementById(id);
      } else {
        current = this.navigator.iframes[1].contentDocument?.getElementById(id);
      }
      if (current) {
        current.classList.add(classActive);
      }
      this.pid = id;
    }
    if (
      current &&
      (this.publication.Metadata.Rendition?.Layout ?? "unknown") !== "fixed"
    ) {
      current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }
}
