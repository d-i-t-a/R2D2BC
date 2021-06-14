import "react-app-polyfill/ie11";
import "regenerator-runtime/runtime";
import * as React from "react";
import * as ReactDOM from "react-dom";
import Reader from "../../src/Reader";

const App = () => {
  const [reader, setReader] = React.useState<Reader | null>(null);

  React.useEffect(() => {
    const url = new URL("https://alice.dita.digital/manifest.json");
    Reader.build({
      url,
      injectables: injectables as any,

      // all of these were required
      userSettings: {
        verticalScroll: "readium-scroll-off",
      },
      initialAnnotations: undefined,
      lastReadingPosition: undefined,
      upLinkUrl: undefined,
      material: {
        settings: {
          fontOverride: false,
          advancedSettings: false,
          pageMargins: false,
          lineHeight: false,
        },
      },
      rights: {
        autoGeneratePositions: false,
      },
      tts: undefined,
      search: { color: "red", current: "blah" },
      annotations: { initialAnnotationColor: "blue" },
      highlighter: { selectionMenuItems: [] },
      useLocalStorage: false,
      attributes: { margin: 2 },
    } as any).then(setReader);
  }, []);

  const isScrolling = reader?.currentSettings().verticalScroll ?? false;

  return (
    <div>
      <div style={{ height: "100vh", overflow: "hidden" }}>
        {!reader ? (
          <strong>Loading reader...</strong>
        ) : (
          <div>
            <button onClick={reader.previousPage}>Prev Page</button>
            <button onClick={reader.nextPage}>Next Page</button>
            {isScrolling ? (
              <button onClick={() => reader.scroll(false)}>Paginate</button>
            ) : (
              <button onClick={() => reader.scroll(true)}>Scroll</button>
            )}
          </div>
        )}
        <div
          id="D2Reader-Container"
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "scroll",
          }}
        >
          <div id="headerMenu" />
          <div id="footerMenu" />
          <main
            style={{ overflow: "hidden" }}
            tabIndex={-1}
            id="iframe-wrapper"
          >
            <div id="reader-loading" className="loading"></div>
            <div id="reader-error" className="error"></div>
          </main>
        </div>
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));

const injectables = [
  {
    type: "style",
    url: "http://localhost:1234/viewer/readium-css/ReadiumCSS-before.css",
    r2before: true,
  },
  {
    type: "style",
    url: "http://localhost:1234/viewer/readium-css/ReadiumCSS-default.css",
    r2default: true,
  },
  {
    type: "style",
    url: "http://localhost:1234/viewer/readium-css/ReadiumCSS-after.css",
    r2after: true,
  },
  {
    type: "style",
    url: "http://localhost:1234/viewer/injectables/pagebreak/pagebreak.css",
    r2after: true,
  },
  // { type: 'style', url: 'http://localhost:1234/viewer/readium-css/neon-after.css', r2after: true, appearance: 'neon' },
  {
    type: "script",
    url:
      "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.6/MathJax.js?config=TeX-MML-AM_CHTML&latest",
  },
  {
    type: "style",
    url: "http://localhost:1234/viewer/fonts/opendyslexic/opendyslexic.css",
    fontFamily: "opendyslexic",
    systemFont: false,
  },
  { type: "style", fontFamily: "Courier", systemFont: true },
  // {
  //   type: 'script',
  //   url: 'http://localhost:1234/viewer/injectables/click/click.js',
  // },
  // {
  //   type: 'script',
  //   url: 'http://localhost:1234/viewer/injectables/footnotes/footnotes.js',
  // },
  {
    type: "style",
    url: "http://localhost:1234/viewer/injectables/footnotes/footnotes.css",
  },
  // {
  //   type: 'script',
  //   url: 'http://localhost:1234/viewer/injectables/glossary/glossary.js',
  // },
  {
    type: "style",
    url: "http://localhost:1234/viewer/injectables/glossary/glossary.css",
  },
  {
    type: "style",
    url: "http://localhost:1234/viewer/injectables/style/style.css",
  },
];
