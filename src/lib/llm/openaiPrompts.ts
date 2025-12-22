import { DAILY_NEWS_PROMPT_MD } from '../prompts/dailyNewsPrompt';

export const DAILY_NEWS_SYSTEM_PROMPT = DAILY_NEWS_PROMPT_MD;

export const WORD_SELECTION_SYSTEM_PROMPT = `You are an expert vocabulary curator. Your task is to select words from a candidate list that would work well together in a coherent news article.

SELECTION CRITERIA:
1. Prefer words that are DUE for review (due=true)
2. Prefer NEW words over REVIEW words
3. Select 4-7 words that can naturally fit into a single news story
4. Consider semantic relationships - words that could appear in the same context

OUTPUT FORMAT:
Respond with a JSON object containing:
{
  "selected_words": ["word1", "word2", ...],
  "selection_reasoning": "Brief explanation of why these words were selected"
}`;

export function buildWordSelectionUserPrompt(args: {
    candidateWordsJson: string;
    topicPreference: string;
    currentDate: string;
}) {
    return `CURRENT_DATE: ${args.currentDate}
TOPIC_PREFERENCE: ${args.topicPreference}

CANDIDATE_WORDS:
${args.candidateWordsJson}

Please select 4-7 words from the candidates that would work well together in a news article matching the topic preference. Consider the due status and word type when making your selection.

Respond with a valid JSON object.`;
}

export function buildResearchUserPrompt(args: {
    selectedWords: string[];
    topicPreference: string;
    currentDate: string;
}) {
    return `Based on the selected vocabulary words: ${args.selectedWords.join(', ')}

Topic preference: ${args.topicPreference}
Date: ${args.currentDate}

Please search for recent news that could naturally incorporate these words. Find 2-5 reliable sources about a current event that matches the topic preference.`;
}

export function buildDraftGenerationUserPrompt(args: {
    selectedWords: string[];
    sourceUrls: string[];
    systemPrompt: string;
    currentDate: string;
    topicPreference: string;
}) {
    return `Now write three versions of a news article (Easy/Medium/Hard levels) based on the research.

TARGET_VOCABULARY: ${JSON.stringify(args.selectedWords)}
TOPIC_PREFERENCE: ${args.topicPreference}
CURRENT_DATE: ${args.currentDate}
SOURCE_URLS: ${args.sourceUrls.join('\n')}

Follow the writing guidelines from the system prompt. Write the content in a natural, engaging style.`;
}

export function buildJsonConversionUserPrompt(args: {
    draftText: string;
    sourceUrls: string[];
    selectedWords: string[];
}) {
    return `Convert the article draft into the required JSON format. You MUST output a valid JSON object.

The JSON object must include:
- title: Article title
- topic: Topic category
- sources: ${JSON.stringify(args.sourceUrls)}
- articles: Array of 3 objects with level (1/2/3), level_name, content, difficulty_desc
- word_usage_check: { target_words_count, used_count, missing_words }
- word_definitions: Array of { word, phonetic, definitions: [{ pos, definition }] }

Target words to check: ${JSON.stringify(args.selectedWords)}

Draft content:
${args.draftText}

Respond with only valid JSON, no markdown code blocks.`;
}
