/// <reference types="@cloudflare/workers-types" />

import type { Runtime } from '@astrojs/cloudflare';

type LumaWordsEnv = {
	DB: D1Database;
	ADMIN_KEY: string;
	SHANBAY_COOKIE: string;
	LLM_API_KEY: string;
	LLM_BASE_URL: string;
	LLM_MODEL_DEFAULT: string;
};

declare global {
	namespace App {
		interface Locals extends Runtime<LumaWordsEnv> { }
	}
}

export { };
