import { useEffect, useState } from 'react';
import { Drawer, Tabs, Tooltip, Popconfirm, message } from 'antd';
import { BookOpen, Trash2 } from 'lucide-react';
import AdminDayPanel from './AdminDayPanel';

type Article = {
    id: string;
    model: string;
    title: string;
};

type Task = {
    id: string;
    publishedAt: string | null;
};

type PublishedTaskGroup = {
    task: Task;
    articles: Article[];
};

type DayDetailsSidebarProps = {
    date: string | null;
    className?: string;
};

export default function DayDetailsSidebar({ date, className }: DayDetailsSidebarProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{ publishedTaskGroups: PublishedTaskGroup[] }>({
        publishedTaskGroups: []
    });
    const [wordsOpen, setWordsOpen] = useState(false);
    const [wordsLoading, setWordsLoading] = useState(false);
    const [newWords, setNewWords] = useState<string[]>([]);
    const [reviewWords, setReviewWords] = useState<string[]>([]);

    const loadDayData = () => {
        if (!date) return;

        // 如果已经在 loading，就不重复触发，避免闪烁
        // (可选优化：后台静默刷新不应该设置全局 loading，这里简单复用逻辑)
        // 为了体验更好，我们把 setLoading(true) 改为仅在 data 为空时显示骨架屏，
        // 或者我们区分 isRefreshing 和 isLoading。
        // 简单起见，这里复用 logic 但不强制全屏 loading 如果已有数据。

        let canceled = false;
        // 只有第一次或者数据为空时才显示 loading 状态，避免轮询时的频繁闪烁
        if (data.publishedTaskGroups.length === 0) setLoading(true);

        fetch(`/api/day/${date}`)
            .then(res => res.json())
            .then((json: any) => {
                if (canceled) return;
                if (json.error) {
                    console.error(json.error);
                    // 仅当出错且无数据时才重置
                    if (data.publishedTaskGroups.length === 0) setData({ publishedTaskGroups: [] });
                } else {
                    setData(json);
                }
            })
            .catch(err => {
                console.error(err);
            })
            .finally(() => {
                if (!canceled) setLoading(false);
            });

        return () => { canceled = true; };
    };

    useEffect(() => {
        const cancel = loadDayData();
        return () => {
            if (cancel) cancel();
        };
    }, [date]);

    useEffect(() => {
        setWordsOpen(false);
        setNewWords([]);
        setReviewWords([]);
    }, [date]);

    async function deleteArticle(articleId: string) {
        const adminKey = localStorage.getItem('luma-words_admin_key');
        if (!adminKey) {
            message.error('请先设置管理员密钥');
            return;
        }

        try {
            const resp = await fetch(`/api/admin/articles/${articleId}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Key': adminKey }
            });
            const json: { ok?: boolean; error?: string } = await resp.json();
            if (!resp.ok) {
                throw new Error(json.error || '删除失败');
            }
            message.success('文章已删除');
            // 更新本地状态，移除该文章
            setData(prev => ({
                ...prev,
                publishedTaskGroups: prev.publishedTaskGroups.map(group => ({
                    ...group,
                    articles: group.articles.filter(a => a.id !== articleId)
                })).filter(group => group.articles.length > 0)
            }));
        } catch (err) {
            message.error(err instanceof Error ? err.message : '删除失败');
        }
    }

    async function openWords() {
        if (!date) return;
        setWordsOpen(true);
        if (wordsLoading || newWords.length > 0 || reviewWords.length > 0) return;
        setWordsLoading(true);
        try {
            const resp = await fetch(`/api/day/${date}/words`);
            const json: any = await resp.json();
            if (!resp.ok) throw new Error(json?.error || 'Failed to load words');
            setNewWords(Array.isArray(json?.new_words) ? json.new_words : []);
            setReviewWords(Array.isArray(json?.review_words) ? json.review_words : []);
        } catch (err) {
            console.error(err);
            setNewWords([]);
            setReviewWords([]);
        } finally {
            setWordsLoading(false);
        }
    }

    if (!date) {
        return (
            <div className={`p-8 h-full flex flex-col items-center justify-center text-stone-400 ${className}`}>
                <div className="w-16 h-px bg-stone-300 mb-4"></div>
                <p className="font-serif italic text-lg">Select an edition from the archive</p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-full font-serif text-slate-900 ${className}`}>
            {/* 顶部刊头信息 */}
            <div className="pb-6 border-b-2 border-slate-900 mb-6">
                <div className="flex items-end justify-between">
                    <div>
                        <span className="block text-xs font-bold tracking-widest uppercase text-stone-500 mb-1">
                            Daily Edition
                        </span>
                        <h2 className="text-5xl font-black tracking-tight text-slate-900 font-serif leading-none">
                            {new Date(date).getDate()}
                        </h2>
                        <span className="text-xl italic text-stone-600 font-serif">
                            {new Date(date).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                    </div>

                    {date && (
                        <div className="flex gap-2">
                            <Tooltip title="Vocabulary Index">
                                <button
                                    onClick={openWords}
                                    className="flex items-center gap-2 px-3 py-1.5 border border-stone-300 hover:bg-stone-100 hover:border-stone-400 transition-colors rounded-sm group"
                                >
                                    <span className="text-xs font-sans font-bold uppercase tracking-wider text-stone-500 group-hover:text-stone-800">Index</span>
                                    <BookOpen size={16} className="text-stone-400 group-hover:text-stone-800" />
                                </button>
                            </Tooltip>
                        </div>
                    )}
                </div>
            </div>

            {/* 文章列表 - 报纸栏目样式 */}
            <div className="flex-1 space-y-8">
                {loading ? (
                    <div className="animate-pulse space-y-8">
                        {[1, 2].map(i => (
                            <div key={i} className="space-y-3">
                                <div className="h-6 bg-stone-200 w-3/4"></div>
                                <div className="h-4 bg-stone-200"></div>
                                <div className="h-4 bg-stone-200 w-5/6"></div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        {/* Admin Control Hook */}
                        <div className="mb-8">
                            <AdminDayPanel date={date} onRefreshRequest={loadDayData} />
                        </div>

                        {data.publishedTaskGroups.length > 0 ? (
                            <div className="space-y-0 divide-y divide-stone-200 border-b border-stone-200">
                                {data.publishedTaskGroups.map((group, groupIdx) => (
                                    <div
                                        key={group.task.id}
                                        className="py-6 first:pt-0 animate-in fade-in slide-in-from-bottom-2 duration-700"
                                        style={{ animationDelay: `${groupIdx * 100}ms` }}
                                    >
                                        <div className="grid gap-8">
                                            {group.articles.length === 0 ? (
                                                <div className="text-sm text-stone-400 italic font-serif">
                                                    No articles in this section.
                                                </div>
                                            ) : (
                                                group.articles.map((a) => (
                                                    <div key={a.id} className="group relative">
                                                        <a href={`/article/${a.id}`} className="block group-hover:opacity-70 transition-opacity">
                                                            <div className="flex flex-col gap-2">
                                                                <h3 className="font-serif text-2xl font-bold text-slate-900 leading-tight">
                                                                    {a.title}
                                                                </h3>
                                                                <div className="pt-2 flex items-center justify-between">
                                                                    <span className="text-xs font-sans font-bold uppercase tracking-widest text-stone-400">Read Article</span>
                                                                    {/* Delete Action */}
                                                                    <Popconfirm
                                                                        title="Archive Article"
                                                                        description="Remove this article from the edition?"
                                                                        onConfirm={(e) => {
                                                                            e?.stopPropagation();
                                                                            deleteArticle(a.id);
                                                                        }}
                                                                        okText="Archive"
                                                                        cancelText="Cancel"
                                                                        okButtonProps={{ danger: true, size: 'small' }}
                                                                    >
                                                                        <button
                                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 text-stone-300 transition-all"
                                                                            onClick={(e) => e.preventDefault()}
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </Popconfirm>
                                                                </div>
                                                            </div>
                                                        </a>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center text-stone-400 gap-4 border-y border-stone-200">
                                <span className="font-serif italic text-lg text-stone-500">No content published for this date.</span>
                            </div>
                        )}
                    </>
                )}
            </div>
            <Drawer
                title={
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Vocabulary</span>
                        <span className="font-serif text-xl font-bold text-stone-800">
                            {date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </span>
                    </div>
                }
                placement="right"
                onClose={() => setWordsOpen(false)}
                open={wordsOpen}
                styles={{
                    mask: {
                        backdropFilter: 'blur(4px)',
                        background: 'rgba(0, 0, 0, 0.2)'
                    },
                    header: {
                        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
                        padding: '24px 24px 16px'
                    },
                    body: {
                        padding: '16px 24px'
                    },
                    wrapper: {
                        width: 400,
                        boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.08)'
                    }
                }}
                className="!bg-white/80 !backdrop-blur-2xl"
            >
                {wordsLoading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-3 text-stone-400">
                        <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-400 rounded-full animate-spin"></div>
                        <span className="text-xs uppercase tracking-wide">Loading Words...</span>
                    </div>
                ) : newWords.length + reviewWords.length === 0 ? (
                    <div className="py-20 text-center text-stone-400 flex flex-col items-center gap-3">
                        <div className="p-3 bg-stone-100 rounded-full">
                            <BookOpen size={20} className="opacity-40" />
                        </div>
                        <p className="text-sm">No vocabulary collected yet.</p>
                    </div>
                ) : (
                    <Tabs
                        defaultActiveKey="new"
                        items={[
                            {
                                key: 'new',
                                label: <span className="text-xs font-semibold uppercase tracking-wider">New Words <span className="ml-1 px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[10px]">{newWords.length}</span></span>,
                                children: (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {newWords.map((word) => (
                                            <span
                                                key={word}
                                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-stone-200 text-stone-700 shadow-sm hover:border-stone-300 hover:shadow transition-all cursor-default select-all"
                                            >
                                                {word}
                                            </span>
                                        ))}
                                    </div>
                                )
                            },
                            {
                                key: 'review',
                                label: <span className="text-xs font-semibold uppercase tracking-wider">Review <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[10px]">{reviewWords.length}</span></span>,
                                children: (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {reviewWords.map((word) => (
                                            <span
                                                key={word}
                                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-orange-50/50 border border-orange-100 text-orange-800 shadow-sm hover:border-orange-200 hover:shadow transition-all cursor-default select-all"
                                            >
                                                {word}
                                            </span>
                                        ))}
                                    </div>
                                )
                            }
                        ]}
                    />
                )}
            </Drawer>
        </div>
    );
}
