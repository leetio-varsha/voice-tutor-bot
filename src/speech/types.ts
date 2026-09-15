export interface WordScore {
  word: string;
  /** 0-100 */
  accuracy: number;
  /** "None" | "Mispronunciation" | "Omission" | "Insertion" | ... as reported by the assessor */
  errorType: string;
}

export interface PronunciationResult {
  pronScore: number;
  accuracy: number;
  fluency: number;
  completeness?: number;
  words: WordScore[];
}

export interface Recognition {
  text: string;
  /** Lowercase, unpunctuated form (Azure only); the better reference text for assessment. */
  lexical?: string;
  pronunciation?: PronunciationResult;
}
