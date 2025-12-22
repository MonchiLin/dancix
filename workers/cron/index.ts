import { drizzle } from 'drizzle-orm/d1';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import * as schema from '../../db/schema';
import { fetchAndStoreDailyWords } from '../../src/lib/words/dailyWords';
import { TaskQueue } from '../../src/lib/tasks/TaskQueue';

dayjs.extend(utc);
dayjs.extend(timezone);

const TJ_TIMEZONE = 'Asia/Shanghai';

type CronEnv = {
	DB: D1Database;
	SHANBAY_COOKIE: string;
	[key: string]: unknown;
};

export default {
	async scheduled(event: ScheduledEvent, env: CronEnv, ctx: ExecutionContext) {
		const db = drizzle(env.DB, { schema });
		const now = dayjs().tz(TJ_TIMEZONE);
		const taskDate = now.format('YYYY-MM-DD');
		const hour = now.hour();

		console.log(`[cron] Triggered at ${now.format('YYYY-MM-DD HH:mm:ss')} (Asia/Shanghai)`);

		// === 1. Fetch Words (每天 10:00) ===
		if (hour === 10) {
			console.log(`[cron] Starting fetchAndStoreDailyWords for ${taskDate}`);
			try {
				const result = await fetchAndStoreDailyWords(db, {
					taskDate,
					shanbayCookie: env.SHANBAY_COOKIE
				});
				console.log(`[cron] Fetch result:`, result);
			} catch (err) {
				console.error('[cron] Fetch failed:', err);
			}
		}

		// === 2. Auto-enqueue Tasks (11:00 - 15:00 only) ===
		const isAutoEnqueueTime = (hour >= 11 && hour <= 15);

		if (isAutoEnqueueTime) {
			console.log(`[cron] Auto-enqueue time window, creating tasks for ${taskDate}`);
			try {
				const queue = new TaskQueue(db);
				await queue.enqueue(taskDate, 'cron');
			} catch (err) {
				console.error('[cron] Auto-enqueue failed:', err);
			}
		}

		// === 3. Process Queue (every 5 minutes, all day) ===
		// This handles both auto-enqueued tasks and manually created tasks
		console.log(`[cron] Processing queue for ${taskDate}`);
		try {
			const queue = new TaskQueue(db);
			await queue.processQueue(taskDate, env as any);
		} catch (err) {
			console.error('[cron] Queue processing failed:', err);
		}
	}
};
