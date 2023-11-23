import "react-app-polyfill/ie11";
import "regenerator-runtime/runtime";
import * as React from "react";
import * as ReactDOM from "react-dom";
import D2Reader from "../../src";
import readiumBefore from "url:./readium-css/ReadiumCSS-before.css";
import readiumAfter from "url:./readium-css/ReadiumCSS-after.css";
import readiumDefault from "url:./readium-css/ReadiumCSS-default.css";

const App = () => {
  const [reader, setReader] = React.useState<D2Reader | null>(null);
  const [_state, setState] = React.useState(0);

  function didUpdate() {
    setState((state) => state + 1);
  }

  React.useEffect(() => {
    const url = new URL("https://alice.dita.digital/manifest.json");
    D2Reader.load({
      url,
      injectables: injectables,
      injectablesFixed: [],
    }).then(setReader);
  }, []);

  function scroll() {
    reader?.scroll(true);
    didUpdate();
  }
  function paginate() {
    reader?.scroll(false);
    didUpdate();
  }

  const isScrolling = reader?.currentSettings.verticalScroll ?? false;

  return (
    <div>
      <div>
        {!reader ? (
          <strong>Loading reader...</strong>
        ) : (
          <div style={{ position: "fixed", top: "0px", zIndex: 2 }}>
            <button onClick={reader.previousPage}>Prev Page</button>
            <button onClick={reader.nextPage}>Next Page</button>
            {isScrolling ? (
              <button onClick={paginate}>Paginate</button>
            ) : (
              <button onClick={scroll}>Scroll</button>
            )}
          </div>
        )}
        <div
          id="D2Reader-Container"
          style={{
            border: "solid 5px rebeccapurple",
          }}
        >
          <main
            tabIndex={-1}
            id="iframe-wrapper"
            style={{
              height: "calc(100vh - 10px)",
            }}
          >
            <div id="reader-loading" className="loading"></div>
            <div id="reader-error"></div>
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
