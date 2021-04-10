/* eslint-disable no-undef */
(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
    ? define(factory)
    : (global.Splitting = factory());
})(this, function () {
  "use strict";

  var root = document;
  var createText = root.createTextNode.bind(root);

  /**
   * # setProperty
   * Apply a CSS var
   * @param el{HTMLElement}
   * @param varName {string}
   * @param value {string|number}
   */
  function setProperty(el, varName, value, key) {
    if (key != undefined) {
      el.setAttribute("data-" + key + "-index", value);
    } else {
      el.style.setProperty(varName, value);
    }
  }

  /**
   *
   * @param {Node} el
   * @param {Node} child
   */
  function appendChild(el, child) {
    return el.appendChild(child);
  }

  function createElement(parent, key, text, whitespace) {
    var el = root.createElement("span");
    //   key;// && (el.className = "orange");
    if (text) {
      if (!whitespace) {
        if (text.replace(/[^a-zA-Z0-9 ]/g, "").length > 0) {
          el.setAttribute("data-" + key, text.replace(/[^a-zA-Z0-9 ]/g, ""));
        } else {
          el.setAttribute("data-" + key, "");
        }
      } else {
        el.setAttribute("data-" + key, "");
      }
      el.textContent = text;
    }
    return (parent && appendChild(parent, el)) || el;
  }

  function getData(el, key) {
    return el.getAttribute("data-" + key);
  }

  /**
   *
   * @param e {import('../types').Target}
   * @param parent {HTMLElement}
   * @returns {HTMLElement[]}
   */
  function $(e, parent) {
    return !e || e.length == 0
      ? // null or empty string returns empty array
        []
      : e.nodeName
      ? // a single element is wrapped in an array
        [e]
      : // selector and NodeList are converted to Element[]
        [].slice.call(e[0].nodeName ? e : (parent || root).querySelectorAll(e));
  }

  /**
   * Creates and fills an array with the value provided
   * @template {T}
   * @param {number} len
   * @param {() => T} valueProvider
   * @return {T}
   */
  function Array2D(len) {
    var a = [];
    for (; len--; ) {
      a[len] = [];
    }
    return a;
  }

  function each(items, fn) {
    items && items.some(fn);
  }

  function selectFrom(obj) {
    return function (key) {
      return obj[key];
    };
  }

  /**
   * # Splitting.index
   * Index split elements and add them to a Splitting instance.
   *
   * @param element {HTMLElement}
   * @param key {string}
   * @param items {HTMLElement[] | HTMLElement[][]}
   */
  function index(element, key, items) {
    var prefix = "--" + key;
    var cssVar = prefix + "-index";

    each(items, function (items, i) {
      if (Array.isArray(items)) {
        each(items, function (item) {
          setProperty(item, cssVar, i, key);
        });
      } else {
        setProperty(items, cssVar, i, key);
      }
    });

    setProperty(element, prefix + "-total", items.length);
  }

  /**
   * @type {Record<string, import('./types').ISplittingPlugin>}
   */
  var plugins = {};

  /**
   * @param by {string}
   * @param parent {string}
   * @param deps {string[]}
   * @return {string[]}
   */
  function resolvePlugins(by, parent, deps) {
    // skip if already visited this dependency
    var index = deps.indexOf(by);
    if (index == -1) {
      // if new to dependency array, add to the beginning
      deps.unshift(by);

      // recursively call this function for all dependencies
      each(plugins[by].depends, function (p) {
        resolvePlugins(p, by, deps);
      });
    } else {
      // if this dependency was added already move to the left of
      // the parent dependency so it gets loaded in order
      var indexOfParent = deps.indexOf(parent);
      deps.splice(index, 1);
      deps.splice(indexOfParent, 0, by);
    }
    return deps;
  }

  /**
   * Internal utility for creating plugins... essentially to reduce
   * the size of the library
   * @param {string} by
   * @param {string} key
   * @param {string[]} depends
   * @param {Function} split
   * @returns {import('./types').ISplittingPlugin}
   */
  function createPlugin(by, depends, key, split) {
    return {
      by: by,
      depends: depends,
      key: key,
      split: split,
    };
  }

  /**
   *
   * @param by {string}
   * @returns {import('./types').ISplittingPlugin[]}
   */
  function resolve(by) {
    return resolvePlugins(by, 0, []).map(selectFrom(plugins));
  }

  /**
   * Adds a new plugin to splitting
   * @param opts {import('./types').ISplittingPlugin}
   */
  function add(opts) {
    plugins[opts.by] = opts;
  }

  /**
   * # Splitting.split
   * Split an element's textContent into individual elements
   * @param el {Node} Element to split
   * @param key {string}
   * @param splitOn {string}
   * @param includeSpace {boolean}
   * @returns {HTMLElement[]}
   */
  function splitText(el, key, splitOn, includePrevious, preserveWhitespace) {
    // Combine any strange text nodes or empty whitespace.
    el.normalize();

    // Use fragment to prevent unnecessary DOM thrashing.
    var elements = [];
    var F = document.createDocumentFragment();

    if (includePrevious) {
      elements.push(el.previousSibling);
    }

    var allElements = [];
    $(el.childNodes).some(function (next) {
      if (next.tagName && !next.hasChildNodes()) {
        // keep elements without child nodes (no text and no children)
        allElements.push(next);
        return;
      }
      if (
        next.tagName == "select" ||
        next.tagName == "input" ||
        next.tagName == "option" ||
        next.tagName == "textarea" ||
        next.tagName == "script"
      ) {
        allElements.push(next);
        return;
      }
      // Recursively run through child nodes
      if (next.childNodes && next.childNodes.length) {
        allElements.push(next);
        elements.push.apply(
          elements,
          splitText(next, key, splitOn, includePrevious, preserveWhitespace)
        );
        return;
      }

      // Get the text to split, trimming out the whitespace
      /** @type {string} */
      var wholeText = next.wholeText || "";
      var contentsTrimmed = wholeText.trim();
      // var contents = wholeText;

      // If there's no text left after trimming whitespace, continue the loop
      if (contentsTrimmed.length) {
        // insert leading space if there was one
        allElements.push(
          createElement(F, "whitespace", " ", preserveWhitespace)
        );
        if (wholeText[0] === " ") {
          allElements.push(createText(" "));
        }
        // Concatenate the split text children back into the full array
        each(contentsTrimmed.split(splitOn), function (splitText, i) {
          if (i && preserveWhitespace) {
            allElements.push(
              createElement(F, "whitespace", " ", preserveWhitespace)
            );
          }
          var splitEl = createElement(F, key, splitText);
          elements.push(splitEl);
          allElements.push(splitEl);
        });
        // insert trailing space if there was one
        if (wholeText[wholeText.length - 1] === " ") {
          allElements.push(createText(" "));
        }
        allElements.push(
          createElement(F, "whitespace", " ", preserveWhitespace)
        );
      } else {
        allElements.push(
          createElement(F, "whitespace", " ", preserveWhitespace)
        );
      }
    });

    each(allElements, function (el) {
      appendChild(F, el);
    });

    // Clear out the existing element
    el.innerHTML = "";
    appendChild(el, F);
    return elements;
  }

  /** an empty value */
  var _ = 0;

  function copy(dest, src) {
    for (var k in src) {
      dest[k] = src[k];
    }
    return dest;
  }

  var WORDS = "words";

  var wordPlugin = createPlugin(
    /*by: */ WORDS,
    /*depends: */ _,
    /*key: */ "word",
    /*split: */ function (el) {
      return splitText(el, "word", /\s+/, 0, 1);
    }
  );

  /**
   * # Splitting
   *
   * @param opts {import('./types').ISplittingOptions}
   */
  function Splitting(opts) {
    opts = opts || {};
    var key = opts.key;

    return $(opts.target || "[data-splitting]").map(function (el) {
      var ctx = el["🍌"];
      if (!opts.force && ctx) {
        return ctx;
      }

      ctx = el["🍌"] = { el: el };
      var items = resolve(opts.by || getData(el, "splitting") || CHARS);
      var opts2 = copy({}, opts);
      each(items, function (plugin) {
        if (plugin.split) {
          var pluginBy = plugin.by;
          var key2 = (key ? "-" + key : "") + plugin.key;
          var results = plugin.split(el, opts2, ctx);
          key2 && index(el, key2, results);
          ctx[pluginBy] = results;
          el.classList.add(pluginBy);
        }
      });

      el.classList.add("splitting");
      return ctx;
    });
  }

  function detectGrid(el, options, side) {
    var items = $(options.matching || el.children, el);
    var c = {};

    each(items, function (w) {
      var val = Math.round(w[side]);
      (c[val] || (c[val] = [])).push(w);
    });

    return Object.keys(c).map(Number).sort(byNumber).map(selectFrom(c));
  }

  function byNumber(a, b) {
    return a - b;
  }

  var linePlugin = createPlugin(
    /*by: */ "lines",
    /*depends: */ [WORDS],
    /*key: */ "line",
    /*split: */ function (el, options, ctx) {
      return detectGrid(el, { matching: ctx[WORDS] }, "offsetTop");
    }
  );

  // install plugins
  // word/char plugins
  add(wordPlugin);
  add(linePlugin);

  return Splitting;
});
