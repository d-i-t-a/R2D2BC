# MIGRATION GUIDE

## 1.x -> 2.0.x


Store instance for use of any reader api:
```let d2reader = undefined;
D2Reader.load({
    url: new URL('{!! $url !!}'),
}).then(instance => {
    d2reader = instance;
});
```



Accessors (if you use any of these as functions before, now these are all accessors)
- annotations
- atEnd
- atStart
- bookmarks
- currentLocator
- currentResource
- currentSettings
- mostRecentNavigatedTocItem (still find that a better name would be good, but didn’t come up with one 🙂 )
- positions
- publicationLanguage ( we might want to expose more metadata than just language )
- readingOrder
- tableOfContents
- totalResources


Replace any Static call with an Instance call:

change this:

    onclick="D2Reader.applyUserSettings({verticalScroll:false});">

to this:

    onclick="d2reader.applyUserSettings({verticalScroll:false});">

change this:

    D2Reader.currentSettings().then( result => {
        .....
    })

to this:

    let result = d2reader.currentSettings;

PLESE NOTE: the above two are just two examples, you should make sure that any of the accessors that were functions before, to migrate.



HTML & CSS adjustments:

no need for this anymore, remove it:

    <script> var exports = {}; </script>

remove the style from the following div:

    <div id="D2Reader-Container" style="width: 100%; height: 100%; position: relative;">

change:

    <main style="overflow: hidden" tabindex=-1 id="iframe-wrapper">

to:

    <main style="height: 100vh" tabindex=-1 id="iframe-wrapper">

or whatever the height is that you need, for example height minus navigation bars etc.
the reader works now even in a widget style so whatever the height or width set it for the container and/or the main element.

move the toolbox div into the main div and wrap it with the following div:
PLEASE NOTE: Make sure this div is further to the top in the main div.

```
<div style="height: 0px">
    <div id="highlight-toolbox" class="highlight-toolbox" >
        .....
    </div>
</div>
```


A Minimal Implementation example:
```
<!DOCTYPE html>
<html lang="en">

    <head>
        <title>D2 Reader</title>
        <meta charset="utf-8" />
        <meta name="author" content="Aferdita Muriqi" />
        <meta name="description" content="A viewer application for EPUB files." />
        <meta name="viewport"
              content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    
        <!-- R2 Reader CSS -->
        <link rel="stylesheet" href="reader.css" />
        <script src="reader.js"></script>
    </head>

    <body>
    
        <div class="content" id="root">
            <div id="D2Reader-Container">
                <main style="height: 100vh" tabindex=-1 id="iframe-wrapper">
                    <div id="reader-loading" class="loading"></div>
                    <div id="reader-error" class="error"></div>
                    <div style="height: 0px">
                        <div id="highlight-toolbox" class="highlight-toolbox" >
                            .....
                        </div>
                    </div>
                </main>
            </div>
        </div>
    
        <script>
    
            let injectables = [
                { type: 'style', url: '/viewer/readium-css/ReadiumCSS-before.css', r2before: true },
                { type: 'style', url: '/viewer/readium-css/ReadiumCSS-default.css', r2default: true },
                { type: 'style', url: '/viewer/readium-css/ReadiumCSS-after.css', r2after: true },
            ]
    
            let d2reader = undefined;
            D2Reader.load({
                url: new URL("...."),
                injectables: injectables,
                injectablesFixed: [],
            }).then(instance => {
                d2reader = instance
            });
    
        </script>
    
    </body>

</html>

```
