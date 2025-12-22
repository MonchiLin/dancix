import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { highlightedWordId, setHighlightedWord } from '../lib/store/wordHighlight';
import { audioState } from '../lib/store/audioStore';

export interface ArticleReaderProps {
    id?: string;
    title: string;
    publishDate: string;
    stats: {
        wordCount: number;
        readingTime: string;
        readCount: number;
    };
    level: 1 | 2 | 3;
    content: string[];
    targetWords?: string[];
    onLevelChange?: (level: 1 | 2 | 3) => void;
    className?: string;
    contentRef?: React.Ref<HTMLElement>;
}

export const ArticleReader: React.FC<ArticleReaderProps> = ({
    title,
    publishDate,
    stats,
    level,
    content,
    targetWords = [],
    onLevelChange,
    className,
    contentRef,
}) => {
    const activeId = useStore(highlightedWordId);

    // Auto-scroll logic when highlighted word changes
    useEffect(() => {
        if (!activeId) return;

        // Slight delay to ensure DOM is ready
        const selector = `[data-word="${activeId.toLowerCase()}"]`;
        const element = document.querySelector(selector);

        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeId]);

    return (
        <div className={clsx("w-full transition-all duration-500", className)}>
            {/* Editorial Layout: No Container, just Content */}

            {/* Article Header */}
            <header className="mb-12 md:mb-16">
                {/* Meta Top Line with Level Control */}
                <div className="flex items-center justify-between text-xs md:text-sm font-bold tracking-widest uppercase text-stone-500 mb-6 border-b-2 border-slate-900 pb-2">
                    <div className="flex items-center gap-3">
                        <span className="text-slate-900">{publishDate}</span>
                        <span className="text-stone-300">|</span>
                        <span>{stats.readCount} Reads</span>
                        <span className="text-stone-300">|</span>
                        <span>{stats.readingTime}</span>
                    </div>
                    <div className="flex gap-1">
                        {[1, 2, 3].map((l) => {
                            const isActive = level === l;
                            return (
                                <button
                                    key={l}
                                    onClick={() => onLevelChange?.(l as 1 | 2 | 3)}
                                    className={clsx(
                                        "w-6 h-6 flex items-center justify-center text-xs font-bold transition-all rounded-sm border leading-none",
                                        isActive
                                            ? "bg-slate-900 !text-white border-slate-900"
                                            : "bg-transparent text-stone-400 border-transparent hover:border-stone-200 hover:text-stone-600"
                                    )}
                                >
                                    {l}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Huge Serif Title */}
                <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1] font-serif">
                    {title}
                </h1>
            </header>

            {/* Article Content */}
            <article ref={contentRef} className="font-serif leading-loose text-xl md:text-2xl text-slate-800/90 space-y-8">
                {content.map((text, idx) => (
                    <TokenizedParagraph
                        key={idx}
                        index={idx}
                        text={text}
                        targetWords={targetWords}
                        activeWordId={activeId}
                    />
                ))}
            </article>
        </div>
    );
};

// Memoized paragraph component to prevent regex re-computation and ensure stable offsets
const TokenizedParagraph = React.memo(({ index, text, targetWords, activeWordId }: {
    index: number;
    text: string;
    targetWords: string[];
    activeWordId: string | null;
}) => {
    // Audio State
    const audio = useStore(audioState);
    const isPlaying = audio.isPlaying;
    const isAudioActive = isPlaying && audio.currentIndex === index;
    const audioCharIndex = audio.charIndex;

    // Pre-calculate tokens and their offsets once per text change
    // We strictly use regex to find tokens and track their absolute start/end indices
    const tokens = React.useMemo(() => {
        const parts: { text: string; start: number; end: number; isWord: boolean }[] = [];
        let offset = 0;
        // Split by word boundary but keep delimiters. 
        // Note: JS split with capture group includes delimiters.
        const rawParts = text.split(/(\b)/);

        rawParts.forEach(part => {
            if (!part) return;
            const len = part.length;
            // Naive word check: has alphanumeric char
            const isWord = /\w/.test(part);

            parts.push({
                text: part,
                start: offset,
                end: offset + len,
                isWord
            });
            offset += len;
        });
        return parts;
    }, [text]);

    // Visual Style Update: text-[19px], leading-relaxed (1.8), #333 text color
    const pClassName = clsx(
        "mb-8 text-stone-800 transition-colors duration-300 rounded-lg p-1 -ml-1",
        isAudioActive && "bg-orange-50/50 border-l-4 border-orange-400 pl-4",
    );

    return (
        <p className={pClassName}>
            {tokens.map((token, i) => {
                const lowerPart = token.text.toLowerCase();
                const isTarget = token.isWord && targetWords.some(w => w.toLowerCase() === lowerPart);

                // Highlight Logic:
                // Check if audioCharIndex falls within token [start, end)
                const isSpeaking = isAudioActive && (audioCharIndex >= token.start && audioCharIndex < token.end);

                if (isSpeaking) {
                    return (
                        <span key={i} className="bg-orange-200 rounded px-0.5 -mx-0.5 transition-colors duration-75 text-gray-900 font-medium">
                            {token.text}
                        </span>
                    );
                }

                if (isTarget) {
                    const isHighlighted = activeWordId?.toLowerCase() === lowerPart;
                    return (
                        <motion.span
                            key={i}
                            data-word={lowerPart}
                            animate={isHighlighted ? {
                                scale: [1, 1.2, 1],
                                backgroundColor: ["rgba(255,255,255,0)", "rgba(234, 88, 12, 0.2)", "rgba(255,255,255,0)"],
                                transition: { duration: 0.6 }
                            } : {}}
                            style={{
                                color: '#ea580c',
                                fontWeight: 600,
                                borderBottom: '2px dotted #ea580c', // Thicker dotted line for better visibility
                                cursor: 'pointer',
                                display: 'inline-block'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setHighlightedWord(token.text);
                            }}
                        >
                            {token.text}
                        </motion.span>
                    );
                }

                return <span key={i}>{token.text}</span>;
            })}
        </p>
    );
});
