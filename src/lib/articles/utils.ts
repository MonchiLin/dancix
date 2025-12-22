import type { ArticleParsedContent, SidebarWord, WordDefinition } from "./types";

export function parseArticleContent(jsonString: string): ArticleParsedContent {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        throw new Error("Invalid content_json: JSON parse failed");
    }
}

export function extractSources(parsed: ArticleParsedContent): string[] {
    const sources = parsed?.result?.sources;
    if (
        !Array.isArray(sources) ||
        !sources.every((s: unknown) => typeof s === "string")
    ) {
        throw new Error("Invalid content_json: sources must be string[]");
    }
    return sources;
}

export function extractWordDefinitions(
    parsed: ArticleParsedContent,
): WordDefinition[] {
    const defs = parsed?.result?.word_definitions;
    if (!Array.isArray(defs)) {
        throw new Error("Invalid content_json: word_definitions must be array");
    }
    return defs;
}

export function mapToSidebarWords(defs: WordDefinition[]): SidebarWord[] {
    return defs.map((w) => ({
        word: w.word,
        phonetic: w.phonetic || "",
        definitions: w.definitions || [],
    }));
}

const weekdayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

export function formatDateLabel(value?: string | null): string {
    if (!value) return "";
    const iso = value.includes("T") ? value : `${value}T00:00:00`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return value;
    const weekday = weekdayNames[date.getDay()] ?? "";
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return weekday ? `${weekday}, ${yyyy}/${mm}/${dd}` : `${yyyy}/${mm}/${dd}`;
}

export function getInitialArticleData(parsed: ArticleParsedContent) {
    const articles = parsed?.result?.articles;
    if (!Array.isArray(articles) || articles.length === 0) return null;

    const sorted = [...articles].sort((a, b) => a.level - b.level);
    const current = sorted[0];
    if (!current) return null;

    const text = current.content ?? "";
    const words = text.trim().split(/\s+/).filter(Boolean);
    const count = words.length;
    const minutes = count ? Math.max(1, Math.ceil(count / 120)) : 0;
    const minuteLabel = minutes === 1 ? "minute" : "minutes";

    return {
        content: text,
        readingTime: `${minutes} ${minuteLabel}`,
    };
}
