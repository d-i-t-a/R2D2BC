# R2D2BC Angular Example

A standalone Angular component that integrates the `@d-i-t-a/reader` EPUB reader. This is meant to be dropped into an existing Angular project, not a full Angular CLI scaffold.

## Prerequisites

- Angular 16+ (standalone component API)
- `@d-i-t-a/reader` installed in your project

## Installation

1. Install the reader package:

```bash
npm install @d-i-t-a/reader
```

2. Copy ReadiumCSS files into your project's assets directory:

```
src/assets/readium-css-v2/
  ReadiumCSS-before.css
  ReadiumCSS-after.css
  ReadiumCSS-default.css
  ReadiumCSS-dita-patch.css
```

You can find these CSS files in the `viewer/readium-css-v2/` directory of the R2D2BC repository, or download them from the [Readium CSS releases](https://github.com/readium/readium-css-v2/releases).

3. Copy `reader.component.ts` into your Angular project (e.g., `src/app/reader/reader.component.ts`).

4. Update the injectable paths in `reader.component.ts` if your asset directory differs from `/assets/readium-css-v2/`.

5. Update the manifest URL to point to your EPUB publication's `manifest.json`.

## Usage

### In a route

```typescript
// app.routes.ts
import { Routes } from "@angular/router";
import { ReaderComponent } from "./reader/reader.component";

export const routes: Routes = [
  { path: "read", component: ReaderComponent },
];
```

### In a template

```typescript
// some-parent.component.ts
import { Component } from "@angular/core";
import { ReaderComponent } from "./reader/reader.component";

@Component({
  selector: "app-parent",
  standalone: true,
  imports: [ReaderComponent],
  template: `<app-reader />`,
})
export class ParentComponent {}
```

### With a dynamic manifest URL

To pass the manifest URL dynamically (e.g., from a route parameter), modify the component to accept an `@Input()`:

```typescript
import { Component, Input, OnInit, OnDestroy } from "@angular/core";
import D2Reader from "@d-i-t-a/reader";

@Component({ ... })
export class ReaderComponent implements OnInit, OnDestroy {
  @Input() manifestUrl = "https://alice.dita.digital/manifest.json";

  async ngOnInit(): Promise<void> {
    const url = new URL(this.manifestUrl);
    this.reader = await D2Reader.load({ url, ... });
  }
}
```

## Configuration

### Rights

The example enables these rights by default:

| Right                    | Default |
|--------------------------|---------|
| `enableBookmarks`        | `true`  |
| `enableAnnotations`      | `true`  |
| `enableSearch`           | `true`  |
| `autoGeneratePositions`  | `true`  |

### Injectables

ReadiumCSS requires three stylesheets injected in order:

- `ReadiumCSS-before.css` with `r2before: true`
- `ReadiumCSS-default.css` with `r2default: true`
- `ReadiumCSS-after.css` with `r2after: true`

### Required DOM Structure

The reader requires this DOM hierarchy to be present:

```html
<div id="D2Reader-Container">
  <main id="iframe-wrapper">
    <div id="reader-loading"></div>
    <div id="reader-error"></div>
  </main>
</div>
```

The component template already includes this structure.

## Features

- **Navigation**: Previous/next page buttons
- **Scroll mode toggle**: Switch between paginated and scroll view
- **Bookmarks**: Save bookmarks at the current position
- **Table of Contents**: Slide-out sidebar with nested chapter navigation
- **Settings panel**: Font size adjustment, appearance themes (light/sepia/dark), reset
- **Page info**: Chapter title, page position, and progress percentage
- **Progress bar**: Visual indicator below the toolbar
- **Cleanup**: Calls `reader.stop()` on component destroy to prevent memory leaks

## Customization

The component uses inline styles. To customize, either edit the `styles` array in the component decorator or extract them to a separate CSS/SCSS file:

```typescript
@Component({
  selector: "app-reader",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./reader.component.html",
  styleUrls: ["./reader.component.scss"],
})
```
