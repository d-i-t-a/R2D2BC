import "react-app-polyfill/ie11";
import "regenerator-runtime/runtime";
import * as React from "react";
import * as ReactDOM from "react-dom";
import D2Reader from "../../src";
// import "../../src/styles/sass/reader.scss";
import readiumBefore from "url:./readium-css/ReadiumCSS-before.css";
import readiumAfter from "url:./readium-css/ReadiumCSS-after.css";
import readiumDefault from "url:./readium-css/ReadiumCSS-default.css";

const App = () => {
  const [reader, setReader] = React.useState<D2Reader | null>(null);

  React.useEffect(() => {
    const url = new URL("https://alice.dita.digital/manifest.json");
    D2Reader.build({
      url,
      injectables: injectables as any,
      injectablesFixed: [],
    }).then(setReader);
  }, []);

  const isScrolling = reader?.currentSettings.verticalScroll ?? false;

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
    url: readiumBefore,
    r2before: true,
  },
  {
    type: "style",
    url: readiumDefault,
    r2default: true,
  },
  {
    type: "style",
    url: readiumAfter,
    r2after: true,
  },
];
