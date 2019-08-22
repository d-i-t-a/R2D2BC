interface EpubReadingSystemObject {
  readonly name: string,
  readonly version: string
}

interface EpubReadingSystem extends Navigator {
  epubReadingSystem: EpubReadingSystemObject
}