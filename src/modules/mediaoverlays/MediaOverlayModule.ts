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

import { IS_DEV } from "../../utils";
import { Publication } from "../../model/Publication";
import IFrameNavigator from "../../navigator/IFrameNavigator";
import ReaderModule from "../ReaderModule";
import { Link } from "../../model/Link";
import { MediaOverlayNode } from "r2-shared-js/dist/es6-es2015/src/models/media-overlay";
import { TaJsonDeserialize } from "../../utils/JsonUtil";
import {
  R2_MO_CLASS_ACTIVE,
  MediaOverlaySettings,
} from "./MediaOverlaySettings";
import * as HTMLUtilities from "../../utils/HTMLUtilities";

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
  wait?: number;
}
export interface MediaOverlayModuleConfig extends MediaOverlayModuleProperties {
  publication: Publication;
  delegate: IFrameNavigator;
  api: MediaOverlayModuleAPI;
  settings: MediaOverlaySettings;
}

export default class MediaOverlayModule implements ReaderModule {
  private publication: Publication;
  private delegate: IFrameNavigator;
  private audioElement: HTMLMediaElement;
  private settings: MediaOverlaySettings;
  private play: HTMLLinkElement = HTMLUtilities.findElement(
    document,
    "#menu-button-play"
  ) as HTMLLinkElement;
  private pause: HTMLLinkElement = HTMLUtilities.findElement(
    document,
    "#menu-button-pause"
  ) as HTMLLinkElement;

  private currentAudioBegin: number | undefined;
  private currentAudioEnd: number | undefined;
  private currentLinks: Array<Link>;
  private currentLinkIndex = 0;
  private mediaOverlaysPlaybackRate = 1;
  private currentAudioUrl: string | undefined;
  private previousAudioUrl: string | undefined;
  private previousAudioEnd: number | undefined;
  private mediaOverlayRoot: MediaOverlayNode | undefined;
  private mediaOverlayTextAudioPair: MediaOverlayNode | undefined;
  private pid: string = undefined;

  public static async create(config: MediaOverlayModuleConfig) {
    const mediaOverlay = new this(
      config.delegate,
      config.publication,
      config.settings
    );
    await mediaOverlay.start();
    return mediaOverlay;
  }

  private constructor(
    delegate: IFrameNavigator,
    publication: Publication,
    settings: MediaOverlaySettings
  ) {
    this.delegate = delegate;
    this.publication = publication;
    this.settings = settings;
  }

  async stop() {
    if (IS_DEV) console.log("MediaOverlay module stop");
  }

  protected async start(): Promise<void> {
    this.delegate.mediaOverlayModule = this;
    if (IS_DEV) console.log("MediaOverlay module start");
  }

  async initialize() {
    return new Promise<void>(async (resolve) => {
      await (document as any).fonts.ready;

      this.settings.setControls();
      this.settings.onSettingsChange(() => {
        this.audioElement.volume = this.settings.volume;
      });

      resolve();
    });
  }

  async initializeResource(links: Array<Link>) {
    this.currentLinks = links;
    this.currentLinkIndex = 0;
    await this.playLink();
  }

  private async playLink() {
    let link = this.currentLinks[this.currentLinkIndex];
    if (link?.Properties?.MediaOverlay) {
      console.log(link.Properties?.MediaOverlay);
      const moUrl = link.Properties?.MediaOverlay;

      const moUrlObjFull = new URL(moUrl, this.publication.manifestUrl);
      const moUrlFull = moUrlObjFull.toString();

      let response: Response;
      try {
        response = await fetch(moUrlFull);
      } catch (e) {
        console.error(e, moUrlFull);
        return;
      }
      if (!response.ok) {
        if (IS_DEV) console.log("BAD RESPONSE?!");
      }

      let moJson: any | undefined;
      try {
        moJson = await response.json();
      } catch (e) {
        console.error(e);
      }
      if (!moJson) {
        if (IS_DEV) console.log("## moJson" + moJson);
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
      if (this.currentLinks.length > 1 && this.currentLinkIndex == 0) {
        this.currentLinkIndex++;
        await this.playLink();
      } else {
        if (this.settings.autoTurn && this.settings.playing) {
          this.delegate.nextResource();
        }
      }
    }
  }

  async startReadAloud() {
    if (this.delegate.rights?.enableMediaOverlays) {
      this.settings.playing = true;
      const timeToSeekTo = this.currentAudioBegin ? this.currentAudioBegin : 0;
      this.audioElement.currentTime = timeToSeekTo;
      await this.audioElement.play();
      this.audioElement.volume = this.settings.volume;
      if (this.play) this.play.style.display = "none";
      if (this.pause) this.pause.style.display = "block";
    }
  }
  stopReadAloud() {
    if (this.delegate.rights?.enableMediaOverlays) {
      this.settings.playing = false;
      this.audioElement.pause();
      if (this.play) this.play.style.display = "block";
      if (this.pause) this.pause.style.display = "none";
    }
  }
  pauseReadAloud() {
    if (this.delegate.rights?.enableMediaOverlays) {
      this.settings.playing = false;
      this.audioElement.pause();
      this.play.style.display = "block";
      this.pause.style.display = "none";
    }
  }
  async resumeReadAloud() {
    if (this.delegate.rights?.enableMediaOverlays) {
      this.settings.playing = true;
      await this.audioElement.play();
      if (this.play) this.play.style.display = "none";
      if (this.pause) this.pause.style.display = "block";
    }
  }

  findDepthFirstTextAudioPair(
    textHref: string,
    mo: MediaOverlayNode,
    textFragmentIDChain: Array<string | null> | undefined
  ): MediaOverlayNode | undefined | null {
    if (IS_DEV) console.log("findDepthFirstTextAudioPair()");

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

    if (IS_DEV) {
      console.log("isFragmentIDMatch: " + isFragmentIDMatch);
      console.log("isTextUrlMatch: " + isTextUrlMatch);
    }
    if (!mo.Children || !mo.Children.length) {
      if (IS_DEV)
        console.log("findDepthFirstTextAudioPair() - leaf text/audio pair");
      if (!isTextUrlMatch) {
        if (IS_DEV)
          console.log("findDepthFirstTextAudioPair() - leaf - !isTextUrlMatch");
        return undefined;
      }
      if (isFragmentIDMatch || (isTextUrlMatch && !textFragmentIDChain)) {
        if (IS_DEV)
          console.log(
            "findDepthFirstTextAudioPair() - leaf - isFragmentIDMatch || (isTextUrlMatch && !textFragmentIDChain"
          );
        return mo;
      }
      return undefined;
    }
    const textFragmentIDChainOriginal = textFragmentIDChain;
    let frags = textFragmentIDChain;
    for (const child of mo.Children) {
      if (IS_DEV) {
        console.log("findDepthFirstTextAudioPair() - child");
        console.log(JSON.stringify(child));
      }
      const match = this.findDepthFirstTextAudioPair(textHref, child, frags);
      if (match === null) {
        if (IS_DEV) {
          console.log(
            "findDepthFirstTextAudioPair() - child - match null (skip)"
          );
        }
        frags = undefined;
      }
      if (match) {
        if (IS_DEV) {
          console.log("findDepthFirstTextAudioPair() - child - match");
          console.log(JSON.stringify(match));
        }
        return match;
      }
    }
    if (isFragmentIDMatch) {
      if (IS_DEV)
        console.log("findDepthFirstTextAudioPair() - post isFragmentIDMatch");
      const match = this.findDepthFirstTextAudioPair(textHref, mo, undefined);
      if (match) {
        if (IS_DEV) {
          console.log(
            "findDepthFirstTextAudioPair() - post isFragmentIDMatch - match"
          );
          console.log(JSON.stringify(match));
        }
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
  ontimeupdate = async (ev: Event) => {
    if (IS_DEV) console.log("ontimeupdate");
    const currentAudioElement = ev.currentTarget as HTMLAudioElement;
    if (
      this.currentAudioEnd &&
      currentAudioElement.currentTime >= this.currentAudioEnd - 0.05
    ) {
      if (IS_DEV) console.log("ontimeupdate - mediaOverlaysNext()");
      this.mediaOverlaysNext();
    }
  };
  ensureOnTimeUpdate = (remove: boolean) => {
    if (this.audioElement) {
      if (remove) {
        if ((this.audioElement as any).__ontimeupdate) {
          (this.audioElement as any).__ontimeupdate = false;
          this.audioElement.removeEventListener(
            "timeupdate",
            this.ontimeupdate
          );
        }
      } else {
        if (!(this.audioElement as any).__ontimeupdate) {
          (this.audioElement as any).__ontimeupdate = true;
          this.audioElement.addEventListener("timeupdate", this.ontimeupdate);
        }
      }
    }
  };
  mediaOverlaysNext(escape?: boolean) {
    if (IS_DEV) console.log("mediaOverlaysNext()");
    this.ensureOnTimeUpdate(true);

    if (this.mediaOverlayRoot && this.mediaOverlayTextAudioPair) {
      const nextTextAudioPair = this.findNextTextAudioPair(
        this.mediaOverlayRoot,
        this.mediaOverlayTextAudioPair,
        { prev: undefined },
        escape ? true : false
      );
      if (!nextTextAudioPair) {
        if (IS_DEV) console.log("mediaOverlaysNext() - navLeftOrRight()");
        this.mediaOverlaysStop();

        if (this.currentLinks.length > 1 && this.currentLinkIndex == 0) {
          this.currentLinkIndex++;
          this.playLink();
        } else {
          this.audioElement.pause();
          if (this.settings.autoTurn && this.settings.playing) {
            this.delegate.nextResource();
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
            if (IS_DEV) {
              console.log(
                "mediaOverlaysNext() SWITCH! " +
                  hrefUrlObj1.pathname +
                  " != " +
                  hrefUrlObj2.pathname
              );
            }
            switchDoc = true;
          }
        }
        if (switchDoc) {
          this.mediaOverlaysStop();
        } else {
          if (IS_DEV)
            console.log("mediaOverlaysNext() - playMediaOverlaysAudio()");
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
      if (IS_DEV) console.log("mediaOverlaysNext() - navLeftOrRight() 2");
      this.mediaOverlaysStop();

      if (this.currentLinks.length > 1 && this.currentLinkIndex == 0) {
        this.currentLinkIndex++;
        this.playLink();
      } else {
        this.audioElement.pause();
        if (this.settings.autoTurn && this.settings.playing) {
          this.delegate.nextResource();
        }
      }
    }
  }
  mediaOverlaysStop() {
    if (IS_DEV) console.log("mediaOverlaysStop()");

    this.mediaOverlaysPause();

    this.mediaOverlayRoot = undefined;
    this.mediaOverlayTextAudioPair = undefined;
  }
  mediaOverlaysPause() {
    if (IS_DEV) console.log("mediaOverlaysPause()");

    this.mediaOverlayHighlight(undefined, undefined);

    this.ensureOnTimeUpdate(true);
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
      const i = mo.Text.lastIndexOf("#");
      const id = mo.Text.substr(i + 1);
      console.log("## " + this.currentLinkIndex);

      this.mediaOverlayHighlight(undefined, id);

      if (previousMo?.prev === moToMatch) {
        if (IS_DEV)
          console.log("findNextTextAudioPair() - prevMo === moToMatch");
        return mo;
      }
      if (IS_DEV) {
        console.log("findNextTextAudioPair() - set previous");
        console.log(JSON.stringify(mo));
      }
      previousMo.prev = mo;
      return undefined;
    }
    for (const child of mo.Children) {
      if (IS_DEV) {
        console.log("findNextTextAudioPair() - child");
        console.log(JSON.stringify(child));
      }
      const match = this.findNextTextAudioPair(
        child,
        moToMatch,
        previousMo,
        escape
      );
      if (match) {
        if (IS_DEV) {
          console.log("findNextTextAudioPair() - match");
          console.log(JSON.stringify(match));
        }
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
    if (IS_DEV) console.log("playMediaOverlaysAudio()");

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
        const matches = urlObjFull.hash.match(/t=([0-9\.]+)(,([0-9\.]+))?/);
        if (matches && matches.length >= 1) {
          const b = matches[1];
          try {
            this.currentAudioBegin = parseFloat(b);
          } catch (err) {
            console.log(err);
          }
          if (matches.length >= 3) {
            const e = matches[3];
            try {
              this.currentAudioEnd = parseFloat(e);
            } catch (err) {
              console.log(err);
            }
          }
        }
      }
    } else {
      this.currentAudioBegin = begin;
      this.currentAudioEnd = end;
    }
    if (IS_DEV) {
      console.log(
        `${urlFull} => [${this.currentAudioBegin}-${this.currentAudioEnd}]`
      );
    }

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
          if (IS_DEV) {
            console.log(
              "playMediaOverlaysAudio() - playClip() - _currentAudioElement.play()"
            );
          }
          this.ensureOnTimeUpdate(false);
          this.audioElement.playbackRate = this.mediaOverlaysPlaybackRate;
          this.audioElement.volume = this.settings.volume;
          if (this.settings.playing) {
            if (!initial) {
              setTimeout(async () => {
                await this.audioElement.play();
              }, this.settings.wait * 1200);
            } else {
              await this.audioElement.play();
            }
          }
        } else {
          if (IS_DEV) {
            console.log(
              "playMediaOverlaysAudio() - playClip() - ontimeupdateSeeked"
            );
          }
          const ontimeupdateSeeked = async (ev: Event) => {
            const currentAudioElement = ev.currentTarget as HTMLAudioElement;
            currentAudioElement.removeEventListener(
              "timeupdate",
              ontimeupdateSeeked
            );

            if (IS_DEV) {
              console.log(
                "playMediaOverlaysAudio() - playClip() - ontimeupdateSeeked - .play()"
              );
            }
            this.ensureOnTimeUpdate(false);
            if (this.audioElement) {
              this.audioElement.playbackRate = this.mediaOverlaysPlaybackRate;
              this.audioElement.volume = this.settings.volume;
              if (this.settings.playing) {
                if (!initial) {
                  setTimeout(async () => {
                    await this.audioElement.play();
                  }, this.settings.wait * 1200);
                } else {
                  await this.audioElement.play();
                }
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
        this.ensureOnTimeUpdate(false);
        if (contiguous) {
          if (IS_DEV) {
            console.log(
              "playMediaOverlaysAudio() - playClip() - ensureOnTimeUpdate"
            );
          }
        } else {
          if (IS_DEV) {
            console.log(
              "playMediaOverlaysAudio() - playClip() - currentTime = timeToSeekTo"
            );
          }
          this.audioElement.currentTime = timeToSeekTo;
        }
      }
    };

    this.previousAudioUrl = this.currentAudioUrl;
    if (!this.currentAudioUrl || urlNoQuery !== this.currentAudioUrl) {
      this.currentAudioUrl = urlNoQuery;
      if (IS_DEV) {
        console.log(
          "playMediaOverlaysAudio() - RESET: " +
            this.previousAudioUrl +
            " => " +
            this.currentAudioUrl
        );
      }

      this.audioElement = document.getElementById(
        "AUDIO_MO_ID"
      ) as HTMLAudioElement;
      this.ensureOnTimeUpdate(true);
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

      document.body.appendChild(this.audioElement);

      this.audioElement.addEventListener("error", (ev) => {
        console.log(
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
          console.log(this.audioElement.error.code);
          console.log(this.audioElement.error.message);
        }
      });

      const oncanplaythrough = async (ev: Event) => {
        const currentAudioElement = ev.currentTarget as HTMLAudioElement;
        currentAudioElement.removeEventListener(
          "canplaythrough",
          oncanplaythrough
        );
        if (IS_DEV) console.log("oncanplaythrough");
        await playClip(true);
      };
      this.audioElement.addEventListener("canplaythrough", oncanplaythrough);

      const onended = async (_ev: Event) => {
        if (IS_DEV) console.log("onended");
        if (this.currentLinks.length > 1 && this.currentLinkIndex == 0) {
          this.currentLinkIndex++;
          await this.playLink();
        } else {
          if (this.settings.autoTurn && this.settings.playing) {
            this.delegate.nextResource();
          }
        }
      };
      this.audioElement.addEventListener("ended", onended);

      this.audioElement.playbackRate = this.mediaOverlaysPlaybackRate;
      this.audioElement.setAttribute("src", this.currentAudioUrl);
    } else {
      if (IS_DEV) console.log("playMediaOverlaysAudio() - playClip()");
      await playClip(false);
    }
  }
  async playMediaOverlays(
    textHref: string,
    rootMo: MediaOverlayNode,
    textFragmentIDChain: Array<string | null> | undefined
  ) {
    if (IS_DEV) console.log("playMediaOverlays()");

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
      if (IS_DEV) {
        console.log(
          "playMediaOverlays() - findDepthFirstTextAudioPair() SECOND CHANCE "
        );
        console.log(JSON.stringify(textFragmentIDChain_, null, 4));
        console.log(JSON.stringify(rootMo, null, 4));
      }
      moTextAudioPair = this.findDepthFirstTextAudioPair(
        textHref,
        rootMo,
        undefined
      );
    }
    if (moTextAudioPair) {
      if (moTextAudioPair.Audio) {
        if (IS_DEV)
          console.log("playMediaOverlays() - playMediaOverlaysAudio()");
        this.mediaOverlayRoot = rootMo;
        await this.playMediaOverlaysAudio(
          moTextAudioPair,
          undefined,
          undefined
        );
      }
    } else {
      if (IS_DEV)
        console.log("playMediaOverlays() - !moTextAudioPair " + textHref);
    }
  }
  mediaOverlayHighlight(href: string | undefined, id: string | undefined) {
    if (IS_DEV) console.log("moHighlight: " + href + " ## " + id);
    let classActive = this.publication.Metadata?.MediaOverlay?.ActiveClass;
    if (!classActive) {
      classActive = this.settings.color;
    }
    const styleAttr =
      this.delegate.iframes[0].contentDocument.documentElement.getAttribute(
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
        prevElement = this.delegate.iframes[0].contentDocument.getElementById(
          this.pid
        );
      } else {
        prevElement = this.delegate.iframes[1].contentDocument.getElementById(
          this.pid
        );
      }

      if (prevElement) {
        prevElement.classList.remove(classActive);
      }
    }

    let current;
    if (this.currentLinkIndex === 0) {
      current = this.delegate.iframes[0].contentDocument.getElementById(id);
    } else {
      current = this.delegate.iframes[1].contentDocument.getElementById(id);
    }
    if (current) {
      current.classList.add(classActive);
    }

    this.pid = id;
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
