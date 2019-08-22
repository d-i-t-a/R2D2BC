import LocalStorageStore from "./store/LocalStorageStore";
import IFrameNavigator, { ReaderConfig, UpLinkConfig } from "./navigator/IFrameNavigator";
import BookSettings from "./model/user-settings/BookSettings";
import LocalAnnotator from "./store/LocalAnnotator";
import Publication from "./model/Publication";
import BookmarkModule from "./modules/BookmarkModule";

export const IS_DEV = (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev");

export async function unload() {

    if (IS_DEV) {console.log("unload reader")}
    document.body.onscroll = () => {}
    R2Navigator.stop()
    R2Settings.stop()
    R2BookmarkModule.stop()
}


var R2Settings:BookSettings;
var R2Navigator:IFrameNavigator;
var R2BookmarkModule:BookmarkModule;


export async function load(config: ReaderConfig) {
    
    var mainElement = document.getElementById("D2Reader-Container");
    var headerMenu = document.getElementById("headerMenu");
    var footerMenu = document.getElementById("footerMenu");
    var webpubManifestUrl = config.url;
    var store = new LocalStorageStore({
        prefix: webpubManifestUrl.href,
        useLocalStorage: true
    });
    var settingsStore = new LocalStorageStore({
        prefix: "r2d2bc-reader",
        useLocalStorage: true
    });


    var annotator = new LocalAnnotator({ store: store });

    var upLink:UpLinkConfig 
    if (config.upLinkUrl) {
        upLink = config.upLinkUrl;
    }

    const publication: Publication = await Publication.getManifest(webpubManifestUrl, store);

    BookSettings.create({
        store: settingsStore,
        headerMenu: headerMenu,
        ui: config.ui.settings,
    }).then(function (settings) {
        R2Settings = settings
        IFrameNavigator.create({
            mainElement: mainElement,
            headerMenu: headerMenu,
            footerMenu: footerMenu,
            publication: publication,
            settings: settings,
            annotator: annotator,
            upLink: upLink,
            ui: config.ui,
            initialLastReadingPosition: config.lastReadingPosition,
            staticBaseUrl: config.staticBaseUrl,
            material: config.material
        }).then(function (navigator) {
            R2Navigator = navigator
            // add custom modules
            if (config.rights.enableBookmarks) {
                // Bookmark Module
                BookmarkModule.create({
                    annotator: annotator,
                    headerMenu: headerMenu,
                    rights: config.rights,
                    publication: publication,
                    settings: settings,
                    delegate: navigator,
                    initialAnnotations: config.annotations,
                }).then(function (module) {
                    R2BookmarkModule = module
                })
            }
        });
    });
}

exports.load = function (config: ReaderConfig) {
    load(config)
}
exports.unload = function () {
    unload()
}
