declare module 'kuroshiro' {
  export default class Kuroshiro {
    init(analyzer: unknown): Promise<void>;
    convert(
      value: string,
      options?: {
        to?: 'hiragana' | 'katakana' | 'romaji';
        mode?: 'normal' | 'spaced' | 'okurigana' | 'furigana';
        romajiSystem?: 'nippon' | 'passport' | 'hepburn';
      }
    ): Promise<string>;
  }
}

declare module 'kuroshiro-analyzer-kuromoji' {
  export default class KuromojiAnalyzer {
    constructor(options?: { dictPath?: string });
  }
}
