[![DepShield Badge](https://depshield.sonatype.org/badges/d-i-t-a/R2D2BC/depshield.svg)](https://depshield.github.io)


Readium Web - goals and features

Here is a proposal, initiated by Aferdita: [Readium Weekly Eng Meeting - 05/22/2019](https://docs.google.com/document/d/1krNe8TUtvajpljcSS4nN_2cHfWO4_Hsag5LnJ4hj_CM/edit#)

The Readium Web project defines a toolkit (not a full featured app) based on the Readium Architecture, 
with an emphasis on speed, modularization and clarity of the code (= ease of maintenance).
and with the following core features:

- Implements Locator
- Implements UserSettings
- Implements Webpub manifest
- Implements the Readium shared models
- Integrates Readium CSS
- Integrates a simple Navigator for reflow publications
- Provides a decoupled Minimal UI
- Provides build system optimization (webpack for example)

Plus three extended modules: 
- a multi-iframe Navigator for reflow & FXL + spread publications
- a Navigator for audiobooks
- a Navigator for digital comics (DiViNa)

About modularity: any contributor or implementer can add their own functionality without refactoring the whole project.

About the minimal UI: it consists on a test application which provides 
- Navigation via the toc
- Control of user settings
- Bookmarks (demonstrating Locator usage)

The addition of a way to keep a publication in cache for offline reading (using service workers, workbox) is an open question. If added, the capability should be activable by configuration only. 

The addition of a way to protect content against hacking and add rights management features is open. 


