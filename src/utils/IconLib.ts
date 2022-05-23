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
 * Developed on behalf of: Bokbasen AS (https://www.bokbasen.no)
 * Licensed to: Bokbasen AS and CAST under one or more contributor license agreements.
 */

export const WIDTH_ATTR: number = 24;
export const HEIGHT_ATTR: number = 24;
export const VIEWBOX_ATTR: string = `0 0 24 24`;

const iconTemplate = (
  id: string,
  title: string,
  path: string,
  classAttr: string = `icon`
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH_ATTR}" height="${HEIGHT_ATTR}" viewBox="${VIEWBOX_ATTR}" preserveAspectRatio="xMidYMid meet" role="img" class="${classAttr}" aria-labelledBy="${id}">
  <title id="${id}">${title}</title>
  ${path}
</svg>`;
const iconTemplateWithViewBox = (
  id: string,
  title: string,
  path: string,
  viewBox: string,
  classAttr: string = `icon`
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH_ATTR}" height="${WIDTH_ATTR}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" class="${classAttr}" aria-labelledBy="${id}">
  <title id="${id}">${title}</title>
  ${path}
</svg>`;
export const iconTemplateColored = (
  id: string,
  title: string,
  path: string,
  classAttr: string = `icon`,
  size: number,
  fill: string
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${VIEWBOX_ATTR}" style="fill:${fill}" preserveAspectRatio="xMidYMid meet" role="img" class="${classAttr}" aria-labelledBy="${id}">
  <title id="${id}">${title}</title>
  ${path}
</svg>`;

export const icons = {
  error: iconTemplate(
    `error-icon`,
    `Warning`,
    `<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>`
  ),
  home: `<path d="M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>`,
  expand: iconTemplate(
    `expand-icon`,
    `Enter fullscreen`,
    `<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>`,
    `icon active-icon`
  ),
  loading: iconTemplateWithViewBox(
    `loading-icon`,
    `Loading`,
    `<path fill="#BBBBBB" d="M145,241.6c-53.3,0-96.6-43.2-96.6-96.6c0-53.3,43.2-96.6,96.6-96.6c53.3,0,96.6,43.2,96.6,96.6 c0,26.7-10.8,50.9-28.3,68.3l7.6,7.6c19.4-19.4,31.5-46.3,31.5-75.9c0-59.3-48-107.3-107.3-107.3S37.7,85.7,37.7,145 c0,59.3,48,107.3,107.3,107.3V241.6z"/>`,
    "0 0 290 290"
  ),
  next: iconTemplate(
    `next-icon`,
    `Next Chapter`,
    `<path d="M6.49 20.13l1.77 1.77 9.9-9.9-9.9-9.9-1.77 1.77L14.62 12l-8.13 8.13z"/>`
  ),
  previous: iconTemplate(
    `previous-icon`,
    `Previous Chapter`,
    `<path d="M17.51 3.87L15.73 2.1 5.84 12l9.9 9.9 1.77-1.77L9.38 12l8.13-8.13z"/>`
  ),
  settings: iconTemplate(
    `settings-icon`,
    `Settings`,
    `<path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.09-.16-.26-.25-.44-.25-.06 0-.12.01-.17.03l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.06-.02-.12-.03-.18-.03-.17 0-.34.09-.43.25l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.09.16.26.25.44.25.06 0 .12-.01.17-.03l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.06.02.12.03.18.03.17 0 .34-.09.43-.25l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zm-1.98-1.71c.04.31.05.52.05.73 0 .21-.02.43-.05.73l-.14 1.13.89.7 1.08.84-.7 1.21-1.27-.51-1.04-.42-.9.68c-.43.32-.84.56-1.25.73l-1.06.43-.16 1.13-.2 1.35h-1.4l-.19-1.35-.16-1.13-1.06-.43c-.43-.18-.83-.41-1.23-.71l-.91-.7-1.06.43-1.27.51-.7-1.21 1.08-.84.89-.7-.14-1.13c-.03-.31-.05-.54-.05-.74s.02-.43.05-.73l.14-1.13-.89-.7-1.08-.84.7-1.21 1.27.51 1.04.42.9-.68c.43-.32.84-.56 1.25-.73l1.06-.43.16-1.13.2-1.35h1.39l.19 1.35.16 1.13 1.06.43c.43.18.83.41 1.23.71l.91.7 1.06-.43 1.27-.51.7 1.21-1.07.85-.89.7.14 1.13zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>`,
    `icon open`
  ),
  toc: iconTemplate(
    `toc-icon`,
    `Table of Contents`,
    `<path d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2zm16 0h2v-2h-2v2zm0-10v2h2V7h-2zm0 6h2v-2h-2v2z"/>`,
    `icon open`
  ),
  bookmarks: iconTemplate(
    `toc-icon`,
    `Bookmarks`,
    `<path d="M4,6H2v16h16v-2H4V6z"/><path d="M22,2H6v16h16V2z M20,12l-2.5-1.5L15,12V4h5V12z"/>`,
    `icon open`
  ),
  bookmark: iconTemplate(
    `toc-icon`,
    `Bookmark`,
    `<path d="M19,3H5v18l7-3l7,3V3z"/>`,
    `icon open`
  ),
  delete: iconTemplate(
    `delete-icon`,
    `Delete`,
    `<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>`,
    `icon open`
  ),
  close: iconTemplate(
    `close-icon`,
    `Close`,
    `<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>`,
    `icon open`
  ),
  text: iconTemplate(
    `text-icon`,
    `Text`,
    `<path d="M5 4v3h5.5v12h3V7H19V4z"/>`,
    `icon open`
  ),
  speak: iconTemplate(
    `speak-icon`,
    `Speak`,
    `<circle cx="9" cy="9" r="4"/><path d="M9 15c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm7.76-9.64l-1.68 1.69c.84 1.18.84 2.71 0 3.89l1.68 1.69c2.02-2.02 2.02-5.07 0-7.27zM20.07 2l-1.63 1.63c2.77 3.02 2.77 7.56 0 10.74L20.07 16c3.9-3.89 3.91-9.95 0-14z"/><path d="M0 0h24v24H0z" fill="none"/>`,
    `icon open`
  ),
  note: iconTemplate(
    `note-icon`,
    `Note`,
    `<polygon points="17.71 24.66 22.3 20.07 17.71 20.07 17.71 24.66" fill="none"/><path d="M22.42.07H5.58A3.28,3.28,0,0,0,2.29,3.35V24.79a3.28,3.28,0,0,0,3.29,3.28H16.71a1,1,0,0,0,.71-.29l8-8a1,1,0,0,0,.29-.71V3.35A3.28,3.28,0,0,0,22.42.07Zm-8.17,15h-7v-2h7Zm-7-6v-2h13v2ZM16.5,25.86v-6a1,1,0,0,1,1-1h6Z" />`,
    `icon open`
  ),
  highlight: iconTemplate(
    `highlight-icon`,
    `Highlight`,
    `<path d="M27.71,7.78,21.12,1.19a1,1,0,0,0-1.38,0L4.32,15A1,1,0,0,0,4,15.7a1,1,0,0,0,.3.73c1.22,1.22,1.2,2.37,0,3.62a1,1,0,0,0,0,1.41l3.2,3.2a1,1,0,0,0,1.41,0c1.28-1.28,2.36-1.29,3.62,0a1,1,0,0,0,1.45,0L27.74,9.16A1,1,0,0,0,27.71,7.78Z" /><path d="M3.09,22.59l-2.8,2.8a1,1,0,0,0-.21,1.09A1,1,0,0,0,1,27.1H4.6a1,1,0,0,0,.71-.29l1-1Z" />`,
    `icon open`
  ),
};
