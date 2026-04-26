# Migration — v3 Workstream 3.5.2: Scroll Container Option

Opt-in. No action required for existing integrators.

## What's new

A new field on `IFrameAttributes` lets you pick which element scrolls in scroll mode:

```ts
attributes: {
  scrollContainer: "host" | "iframe",   // default "host"
}
```

- **`"host"` (default):** `#iframe-wrapper` scrolls; iframe grows to fit its content. Same behaviour you've always had.
- **`"iframe"`:** iframe stays at viewport height; iframe's own document scrolls internally.

Only affects scroll mode. Paginated and fixed-layout are unchanged regardless of the value.

## When to use `"iframe"`

Use `"iframe"` mode when your integrator-supplied injectables style the iframe body to fill the viewport (for example `body { height: 100% }` on cover pages). In default `"host"` mode, that styling combined with iframe-grows-to-content produces a feedback loop where the iframe's height grows on every paint. `"iframe"` mode prevents the loop because the iframe is fixed-size; the body overflows and scrolls inside it.

If you don't inject those kinds of body styles and your integration works today, leave `scrollContainer` unset.

## Behaviour notes

- **Position is portable across modes.** Saved bookmarks and reading positions computed in one mode restore correctly in the other. The progression ratio (`scrollOffset / scrollExtent`) is identical regardless of which element provides the scrollbar.
- **Selection, annotations, line focus, TTS overlays:** these read the iframe's internal scroll position, which is more accurate in `"iframe"` mode. No configuration change needed.
- **Scrollbar position changes.** In `"host"` mode the scrollbar lives on `#iframe-wrapper`; in `"iframe"` mode it lives inside the iframe. Style accordingly if your CSS targets a specific scrollbar location.

## Things to check before enabling

### Custom scrollbar CSS

Any rule you have like:

```css
#iframe-wrapper::-webkit-scrollbar { ... }
#iframe-wrapper { scrollbar-width: thin; }
```

stops applying to chapter scroll in `"iframe"` mode — the wrapper no longer scrolls. To style the in-iframe scrollbar, inject the rule into the iframe via the reader's `injectables`:

```ts
injectables: [
  { type: "style-inline", source: `html::-webkit-scrollbar { width: 6px }` },
]
```

### Programmatic scroll from outside the reader

Any external code that scrolls the wrapper directly:

```js
document.querySelector("#iframe-wrapper").scrollTo({ top: 0 });
```

won't move chapter content in `"iframe"` mode. Use the reader API instead — `reader.goToProgression(0)` or other navigation methods work in both modes.

### Cross-origin chapter content

`"iframe"` mode attaches a scroll listener on `iframe.contentWindow`. If chapter content is served from a different origin than the host page, browser cross-origin policy blocks that listener and scroll-driven features (position save, atStart/atEnd UI, anchor visibility) won't fire. R2D2BC's standard webpub setup serves chapters same-origin via the fetcher, so this only matters if you've configured a non-standard cross-origin source.

### Switching modes at runtime

`scrollContainer` is part of `IFrameAttributes`, so you can switch at runtime via `reader.applyAttributes({ scrollContainer: "iframe" })`. The reader re-applies sizing on the next resize. Save the user's position before switching and restore it after, in case any layout reflow nudges the offset.

### Touch / keyboard navigation

Swipe and arrow-key navigation work the same in both modes — they go through the navigator's own page-turn API, not directly through the scroll container.

## Example

```ts
D2Reader.load({
  url: new URL(manifest),
  attributes: {
    scrollContainer: "iframe",
  },
  // ...rest of config
});
```

That's it.
