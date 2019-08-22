[![DepShield Badge](https://depshield.sonatype.org/badges/d-i-t-a/R2D2BC/depshield.svg)](https://depshield.github.io)

## Quickstart

Clone this repo, then

```
npm install
```

## Examples

Examples demonstrate how this webpub-viewer can be used:

1. with assets served by r2-streamer-js (in-memory model);

### Streamed

The `examples/streamed` folder contains the webpub-viewer (`readers/viewer` folder), the r2-streamer-js (ES6/ES2015 bundle in `server` folder) and example files (`epubs` folder).

In this example, assets are served by the r2-streamer-js (in-memory model).

This example runs on `http`.

#### Usage

- Update the web reader files if needed (`npm run examples`)
- Start the server with `npm run streamed`
```
npm run build && npm run examples && npm run streamed
```
- Open http://localhost:4444 in the browser
- Pick a publication
- You can see its manifest (`json`) and open it in the webpub-viewer of your choice
- To stop the server, type `ctrl + c`


## Icons

Icons used in the shared version are part of the official [Material Design Icons](https://material.io/tools/icons/?style=outline) collection (outline version).
