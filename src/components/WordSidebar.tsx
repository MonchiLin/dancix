import { SoundOutlined } from '@ant-design/icons';
import { useStore } from '@nanostores/react';
import { highlightedWordId, setHighlightedWord } from '../lib/store/wordHighlight';

export type WordDefinition = {
    word: string;
    phonetic: string;
    definitions: { pos: string; definition: string }[];
};

export type WordInfo = WordDefinition;

function speak(text: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent triggering word selection
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

function WordCard({ wordInfo }: { wordInfo: WordInfo }) {
    const activeId = useStore(highlightedWordId);
    const isActive = activeId?.toLowerCase() === wordInfo.word.toLowerCase();

    return (
        <div
            className={`group relative pl-4 py-2 transition-all duration-300 cursor-pointer ${isActive
                ? 'border-l-4 border-slate-900'
                : 'border-l-4 border-transparent hover:border-stone-200'
                }`}
            onClick={() => setHighlightedWord(wordInfo.word)}
        >
            <div className="relative flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                        <div className={`text-base font-bold font-serif tracking-tight ${isActive ? 'text-slate-900' : 'text-stone-700'}`}>
                            {wordInfo.word}
                        </div>
                        {wordInfo.phonetic && (
                            <div className="text-xs font-mono text-stone-400">{wordInfo.phonetic}</div>
                        )}
                    </div>

                    <div className="space-y-1">
                        {wordInfo.definitions.map((def, i) => (
                            <div key={i} className="text-sm leading-snug line-clamp-3 text-stone-500 font-serif">
                                <span className="italic text-stone-400 mr-1">
                                    {def.pos}.
                                </span>
                                {def.definition}
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    className={`p-1 rounded-full transition-all shrink-0 ${isActive
                        ? 'text-slate-900'
                        : 'text-stone-300 hover:text-stone-500'}`}
                    title="Pronounce"
                    onClick={(e) => speak(wordInfo.word, e)}
                >
                    <SoundOutlined className="text-xs" />
                </button>
            </div>
        </div>
    );
}

export function WordSidebar({ words }: { words: WordInfo[] }) {
    if (!words || words.length === 0) return null;

    return (
        <div className="space-y-4 font-serif">
            <div className="flex items-center justify-between mb-4 border-b-2 border-slate-900 pb-2">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-900">
                    Margin Notes
                </div>
            </div>
            <div className="flex flex-col space-y-4">
                {words.map((w) => (
                    <WordCard key={w.word} wordInfo={w} />
                ))}
            </div>
        </div>
    );
}

export default WordSidebar;
