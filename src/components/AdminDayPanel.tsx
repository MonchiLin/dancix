import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { type TaskRow, fetchJson } from './admin/shared';
import AdminActions from './admin/AdminActions';
import TaskQueueList from './admin/TaskQueueList';

const ADMIN_KEY_STORAGE = 'luma-words_admin_key';

export default function AdminDayPanel(props: { date: string; onRefreshRequest?: () => void }) {
	const [adminKey, setAdminKey] = useState<string | null>(null);
	const [isAdmin, setIsAdmin] = useState(false);
	const [tasks, setTasks] = useState<TaskRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// 默认不折叠，方便用户直接操作，或者根据用户习惯改为 true
	const [collapsed, setCollapsed] = useState(true);

	const canUse = useMemo(() => isAdmin && !!adminKey, [isAdmin, adminKey]);

	// 校验管理员权限
	useEffect(() => {
		try {
			const key = localStorage.getItem(ADMIN_KEY_STORAGE);
			setAdminKey(key && key.trim() ? key.trim() : null);
		} catch {
			setAdminKey(null);
		}
	}, []);

	useEffect(() => {
		if (!adminKey) return;
		let canceled = false;
		(async () => {
			try {
				await fetchJson('/api/admin/check', adminKey);
				if (!canceled) setIsAdmin(true);
			} catch {
				if (!canceled) setIsAdmin(false);
			}
		})();
		return () => {
			canceled = true;
		};
	}, [adminKey]);

	// 加载任务
	async function refresh() {
		if (!adminKey) return;
		if (tasks.length === 0) setLoading(true);
		setError(null);
		try {
			const data = await fetchJson<{ tasks?: TaskRow[] }>(`/api/admin/tasks?task_date=${encodeURIComponent(props.date)}`, adminKey);
			setTasks(data?.tasks ?? []);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	// 初次加载
	useEffect(() => {
		if (!canUse) return;
		void refresh();
	}, [canUse, props.date]);

	// 自动轮询刷新
	useEffect(() => {
		if (!canUse) return;
		const hasActiveTasks = tasks.some(t => t.status === 'running' || t.status === 'queued');
		if (!hasActiveTasks) return;

		const timer = setInterval(() => {
			fetchJson<{ tasks?: TaskRow[] }>(`/api/admin/tasks?task_date=${encodeURIComponent(props.date)}`, adminKey!)
				.then(data => {
					const newTasks = data?.tasks ?? [];
					setTasks(newTasks);

					// 检查是否有任务刚刚完成 (从我们的视角看，只要有 succeeded 的任务，也许是新的)
					// 更精确的做法：保存上一帧状态。但这里简化处理：只要 wheel 在转，每次拉取到新状态后，
					// 如果发现有 succeeded 的任务且之前 tasks 里对应状态不是 succeeded (或者简单地，通知父级尝试刷新)
					// 为了避免过度刷新，我们只在检测到“任务数量”或“完成状态”变化时触发？
					// 这里的简单策略：只要处于 Active 轮询模式，每当发现有任务变成了 succeeded，就触发一次内容刷新。
					// 实际上，只要轮询到数据，为了保险起见，都可以尝试让父组件刷新一下内容（如果 payload 不大）。
					// 鉴于 10s 一次，频率不高，我们尝试：如果本次结果中有 succeeded 的任务，且当前组件处于轮询态，就请求父组件刷新。
					const hasSucceeded = newTasks.some(t => t.status === 'succeeded');
					if (hasSucceeded && props.onRefreshRequest) {
						props.onRefreshRequest();
					}
				})
				.catch(console.error);
		}, 10000);

		return () => clearInterval(timer);
	}, [canUse, tasks, adminKey, props.date, props.onRefreshRequest]);


	async function generate() {
		if (!adminKey) return;
		setLoading(true);
		setError(null);
		try {
			await fetchJson('/api/admin/tasks/generate', adminKey, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ task_date: props.date })
			});
			await refresh();
			setCollapsed(false);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	async function fetchWords() {
		if (!adminKey) return;
		setLoading(true);
		setError(null);
		try {
			await fetchJson('/api/admin/words/fetch', adminKey, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ task_date: props.date })
			});
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	async function deleteTask(taskId: string) {
		if (!adminKey) return;
		if (!confirm('确定删除这个任务吗？这会同时删除关联的文章和批注。')) return;
		setLoading(true);
		setError(null);
		try {
			await fetchJson(`/api/admin/tasks/${taskId}/delete`, adminKey, { method: 'POST' });
			await refresh();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	if (!canUse) return null;

	return (
		<div className="mb-8 border-b border-stone-200 pb-4">
			{/* Header */}
			<button
				className="w-full group flex items-center justify-between py-2 cursor-pointer select-none hover:bg-stone-50 transition-colors -mx-2 px-2 rounded-sm"
				onClick={() => setCollapsed(!collapsed)}
			>
				<div className="flex items-center gap-2 text-xs font-bold text-stone-900 uppercase tracking-widest">
					<span>Admin Controls</span>
					{loading && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />}
				</div>
				<div className={`transform transition-transform duration-300 text-stone-400 ${!collapsed ? 'rotate-180' : ''}`}>
					<ChevronDown size={14} />
				</div>
			</button>

			{/* Content Body */}
			<div
				className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
			>
				<div className="overflow-hidden">
					<div className="pt-4 space-y-6">
						<AdminActions
							loading={loading}
							onFetchWords={fetchWords}
							onGenerate={generate}
						/>

						{error && (
							<div className="text-xs font-serif text-red-700 bg-red-50 p-3 italic border-l-2 border-red-700">
								Error: {error}
							</div>
						)}

						<TaskQueueList
							tasks={tasks}
							onRefresh={refresh}
							onDelete={deleteTask}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
