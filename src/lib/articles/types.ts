export interface WordDefinition {
    word: string;
    phonetic: string;
    definitions: { pos: string; definition: string }[];
}

export interface ArticleParsedContent {
    result?: {
        sources?: string[];
        word_definitions?: WordDefinition[];
        articles?: Array<{
            level: 1 | 2 | 3;
            level_name: string;
            content: string;
            title?: string;
            difficulty_desc: string;
        }>;
    };
}

export interface SidebarWord {
    word: string;
    phonetic: string;
    definitions: { pos: string; definition: string }[];
}
