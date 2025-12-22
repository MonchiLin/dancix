import { RotateCw, Trash2 } from 'lucide-react';
import { type TaskRow, formatTime } from './shared';
import { clsx } from 'clsx';

type TaskQueueListProps = {
    tasks: TaskRow[];
    loading?: boolean;
    onRefresh: () => void;
    onDelete: (id: string) => void;
};

export default function TaskQueueList({ tasks, onRefresh, onDelete }: TaskQueueListProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Task Queue</span>
                <button onClick={onRefresh} className="text-stone-400 hover:text-stone-900 transition-colors" title="Refresh">
                    <RotateCw size={12} />
                </button>
            </div>

            {tasks.length === 0 ? (
                <div className="text-xs text-stone-400 italic font-serif py-2">
                    No active tasks
                </div>
            ) : (
                tasks.map(t => (
                    <div key={t.id} className="group flex flex-col gap-1 py-2 border-b border-dotted border-stone-200 last:border-0 hover:bg-stone-50 -mx-2 px-2 transition-colors">
                        <div className="flex justify-between items-center">
                            <span className="font-serif font-bold text-stone-800 text-sm">
                                {t.profileName || 'Default Edition'}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className={clsx(
                                    "w-1.5 h-1.5 rounded-full",
                                    {
                                        'bg-stone-300': t.status === 'queued',
                                        'bg-orange-500 animate-pulse': t.status === 'running',
                                        'bg-green-600': t.status === 'succeeded',
                                        'bg-red-600': t.status === 'failed',
                                    }
                                )} title={t.status} />
                                <button
                                    onClick={() => onDelete(t.id)}
                                    className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-600 transition-all"
                                    title="Delete Task"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-500">
                            <span className="font-mono">{formatTime(t.created_at)}</span>
                            {t.status === 'failed' && <span className="text-red-600 font-bold">Failed</span>}
                            {t.status === 'running' && <span className="text-orange-600 font-bold">Processing</span>}
                        </div>

                        {t.error_message && (
                            <div className="text-[10px] text-red-600 font-serif italic mt-1 bg-red-50 p-1.5 leading-tight">
                                {t.error_message}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}
