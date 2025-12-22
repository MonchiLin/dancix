import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../../db/schema';
import { dailyWords, words } from '../../../db/schema';
import { fetchShanbayTodayWords } from '../shanbay';

type Db = DrizzleD1Database<typeof schema>;

function uniqueStrings(input: string[]) {
	return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

export async function fetchAndStoreDailyWords(
	db: Db,
	args: {
		taskDate: string;
		shanbayCookie: string;
	}
) {
	const shanbay = await fetchShanbayTodayWords(args.shanbayCookie);
	if (!Array.isArray(shanbay.newWords) || !Array.isArray(shanbay.reviewWords)) {
		throw new Error('Shanbay: invalid word payload');
	}
	const newWords = uniqueStrings(shanbay.newWords);
	const reviewWords = uniqueStrings(shanbay.reviewWords);
	const total = newWords.length + reviewWords.length;
	if (total === 0) {
		// 快速失败：空词表视为今日未学习。
		throw new Error('No words found from Shanbay.');
	}

	const now = new Date().toISOString();
	await db
		.insert(dailyWords)
		.values({
			date: args.taskDate,
			newWordsJson: JSON.stringify(newWords),
			reviewWordsJson: JSON.stringify(reviewWords),
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: dailyWords.date,
			set: {
				newWordsJson: JSON.stringify(newWords),
				reviewWordsJson: JSON.stringify(reviewWords),
				updatedAt: now
			}
		});

	// 写入 words 表（幂等）
	const allWords = [...new Set([...newWords, ...reviewWords])];
	const WORD_INSERT_CHUNK_SIZE = 20;

	for (let i = 0; i < allWords.length; i += WORD_INSERT_CHUNK_SIZE) {
		const chunk = allWords.slice(i, i + WORD_INSERT_CHUNK_SIZE);
		await db
			.insert(words)
			.values(chunk.map((w) => ({ word: w, origin: 'shanbay' as const })))
			.onConflictDoNothing();
	}

	return {
		taskDate: args.taskDate,
		newCount: newWords.length,
		reviewCount: reviewWords.length
	};
}

