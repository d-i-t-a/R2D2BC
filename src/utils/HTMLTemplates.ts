
import * as IconLib from "./IconLib";


export const simpleUpLinkTemplate = (href: string, _label: string, ariaLabel: string) => `
<a rel="up" href='${href}' aria-label="${ariaLabel}" style="padding: 0px"><i class="material-icons show-on-large">arrow_back_ios</i></a>
`;

export const defaultUpLinkTemplate = (href: string, label: string, ariaLabel: string) => `
<a rel="up" href='${href}' aria-label="${ariaLabel}">
<svg xmlns="http://www.w3.org/2000/svg" width="${IconLib.WIDTH_ATTR}" height="${IconLib.HEIGHT_ATTR}" viewBox="${IconLib.VIEWBOX_ATTR}" aria-labelledby="up-label" preserveAspectRatio="xMidYMid meet" role="img" class="icon">
    <title id="up-label">${label}</title>
    ${IconLib.icons.home}
</svg>
<span class="setting-text up">${label}</span>
</a>
`;

export const readerLoading = `${IconLib.icons.loading}`;
export const readerError = `
    <span>
    ${IconLib.icons.error}
    </span>
    <span>There was an error loading this page.</span>
    <button class="go-back">Go back</button>
    <button class="try-again">Try again</button>
`;
