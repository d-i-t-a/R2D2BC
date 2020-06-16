**R2D2BC** is an implementation of the [Readium v2](https://github.com/readium/architecture) EPUB reader for the web.
It is built as a modular toolkit (rather than a full-featured app) so that applications can use it to 
handle the EPUB-related functions while customizing the own design, user interface, and extensions.

# Goals

- Follow the Readium architecture specification for best interoperability
- Allow maximum configurability via API methods, callbacks, code and style injection, and clear separation of functions.
- Modularity 
- Clarity of code and ease of maintenance
- Speed
- Accessibility
- Free and open source

The R2D2BC project intentionally includes only a base-bones demonstration user interface, and no sample content.
Any implementer can add their own functionality and design without refactoring the whole project.

See below for projects that provide the necessary other elements to try it out and see it in action.

# Architecture

This project implements most components of the [Readium Architecture](https://github.com/readium/architecture):

- Implements Locator
- Implements UserSettings
- Implements Webpub Manifest
- Implements the Readium shared models
- Integrates Readium CSS
- Integrates a simple Navigator for reflowable publications

Additionally it:
- Provides a decoupled Minimal UI
- Provides build system optimization (Webpack)

# Origins

Here is the original proposal, initiated by Aferdita Muriqi to the
[Readium Weekly Eng Meeting - 05/22/2019](https://docs.google.com/document/d/1krNe8TUtvajpljcSS4nN_2cHfWO4_Hsag5LnJ4hj_CM/edit#)

Subsequent development of R2D2BC has been supported by [DITA](https://github.com/d-i-t-a), [Bokbasen](https://www.bokbasen.no/), and [CAST](http://www.cast.org) - which explains the D2, B, and C in the name.

# Extensions and Implementations

The R2D2BC reader has been used in:
- The [Clusive](https://github.com/cast-org/clusive) learning environment


[![DepShield Badge](https://depshield.sonatype.org/badges/d-i-t-a/R2D2BC/depshield.svg)](https://depshield.github.io)
