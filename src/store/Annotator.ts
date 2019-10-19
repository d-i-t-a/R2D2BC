
import { ReadingPosition } from "../model/Locator";

interface Annotator {
    initLastReadingPosition(position: ReadingPosition): Promise<void>;
    getLastReadingPosition(): Promise<any>;
    saveLastReadingPosition(position: any): Promise<void>;

    initBookmarks(list: any): Promise<any>;
    saveBookmark(bookmark: any): Promise<any>;
    deleteBookmark(bookmark: any): Promise<any>;
    getBookmarks(href?:string): Promise<any>;
    locatorExists(locator: any, type:AnnotationType): Promise<any>;
}

export enum AnnotationType {
    Bookmark
}

export default Annotator;