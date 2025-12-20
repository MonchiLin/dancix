# implementation_plan.md

# 每日单词阅读生成站 (Daily Vocabulary Reader) - Cloudflare Edition + UI

## 目标描述
搭建一个基于 **Astro** 的全栈个人网站，部署于 Cloudflare Pages。
核心体验：**极简、沉浸式阅读**，支持“纸质感”的亮色模式与“护眼”的深色模式。
核心功能：抓取/导入 -> AI 生成 -> D1 存储（长期归档可回看）-> `web-highlighter` 高亮批注 -> **AI 长难句解析**。

## 关键前提与风险 (务必先确认)
1. **启用 Cron Worker**：已引入独立 Worker + Scheduled Trigger。规则：每小时抓词；北京时间 12/13/14 点尝试生成（同日每个 profile 最多 3 次，成功后不再重试）。
2. **扇贝数据抓取的稳定性未知**：`shanby.js` 依赖登录态 Cookie + 私有接口/加密返回。
    * Worker 侧通常只能把 Cookie 当作 Secret 使用，可能**过期/被风控**。
    * 部署策略：Cookie 以环境变量提供（例如 `SHANBAY_COOKIE`），仅后端使用，不落库、不回传前端。
    * 若该路径不可长期维护，需要准备 Plan B：手动导入、换数据源、或仅做阅读/批注不做自动抓取。
3. **LLM 输出需“强结构化”**：文章内容与词高亮依赖稳定 JSON；需要可验证的结构化输出约束 + 严格校验；如校验失败允许**最多 1 次**“结构修复/重生成”再校验，仍失败则报错退出。
4. **联网搜索能力的边界**：启用 OpenAI Responses API 的 `web_search` 工具以满足“当日真实新闻”时效性，但这会带来：
    * **兼容性**：仅 OpenAI `/v1/responses` + 内置 `web_search` 支持；OpenAI-compatible 代理若不支持会 404（Fail Fast，不做兜底）。
    * **重要限制**：部分实现不允许 `web_search` 与 JSON mode（`text.format=json_object`）同时启用；需要两阶段：先 `web_search` 做研究，再关闭 `web_search` 并启用 JSON mode 生成结构化输出。
    * **展示要求**：`web_search` 生成内容必须附带可点击来源：产物 JSON 中包含 `sources`（URL 数组），前端文章页展示来源列表。
    * **配置约束**：`LLM_BASE_URL` 必须以 `/v1` 结尾（不自动修正，配置错误直接失败）。
5. **接口安全边界**：使用“共享 Admin Key”的简单鉴权：前端设置里输入 key 并本地保存；请求携带 key；后端从环境变量（例如 `ADMIN_KEY`）读取并比对，不匹配直接 401。未授权用户**只渲染文章正文**，不渲染任何交互功能（单词信息弹窗、长选择 AI 解析、批注/高亮等）；同时后端对所有“管理员接口”（包括 `highlights` 读写、AI 解析等）做二次校验，配合基础速率限制与日志脱敏（避免泄露 key）。
6. **环境变量按字面值读取**：不做 `trim`、不替换空格/换行；配置值不合法直接失败并提示（Fail Fast），避免“看似成功但实际用错了凭据”。

## 关键原则
> [!IMPORTANT]
> **Error Handling Strategy**: **Fail Fast (快速失败)**。
> 含义：不做静默降级；不做无限重试。一旦依赖失败（网络/API/数据不符合约定），立即中止并把错误显式暴露出来（UI 错误态/日志），保证失败可见、可定位、可操作。对于 **LLM 输出结构不符合 schema** 的情况，允许**最多 1 次**“结构修复/重生成”再校验，仍失败则立即报错退出。
> **src/stories 并非无用文件, 相反, 这些文件是用于测试组件的文件.**

## 拟定架构
*   **Web App**: Astro (SSR) + React，部署在 **Cloudflare Pages**。
*   **Tasks/ETL**: 由 Cron Worker 每小时抓词，并在北京时间 12/13/14 点触发生成；管理员接口仍可手动触发。
*   **Data**: Cloudflare D1 (SQLite) + Drizzle ORM（schema/migration 统一管理）。
*   **Style**: TailwindCSS + Radix Themes + Typography Plugin。
*   **Annotation**: `web-highlighter`（前端高亮/选择锚定 + 持久化数据结构，后端落库）。
*   **AI**: OpenAI SDK（**Responses API**，`client.responses.create`）+ 内置 `web_search`（联网搜索）；为兼容 `web_search` 与 JSON mode 的限制，采用“两阶段”调用（research → JSON generation）。输出必须是结构化 JSON（严格校验；允许一次修复后再校验）。若使用 OpenAI-compatible 服务，必须同时支持 `/v1/responses` 与内置 web search 工具，否则该能力不可用（不做兜底）。
*   **SRS**: FSRS（`ts-fsrs`），复习反馈四级：`again/hard/good/easy`。

## 详细功能规划

### 0. AI 生成配置表（Profiles 驱动）
用配置表驱动“**生成策略**”（每个 profile = 一套生成参数），通过“多个 profile”决定每天生成多少套，而不把策略写死在代码逻辑里。
约束：**每次生成必定一次性产出三档（Easy/Medium/Hard）**，三档不按档位拆分生成（避免“按档位分别生成”带来的套件不一致与额外复杂度）。
同时支持“生成多套”：允许存在多条 `generation_profiles`；一次触发会对所有 profile 各生成一套产物（对应多条 `tasks`，`type='article_generation'`），在当日归档页进行选择与发布。

**Profile 字段（建议）**
*   **Topic Preference**: 主题偏好标签列表（随不同 profile 变化；前端以 tags 展示；以逗号/换行分隔），作为提示词输入（例如 `US Pop Culture, Gaming, Tech`）。
*   **Model Setting**: 模型设置（JSON 对象；默认 `{ "model": "gpt-5.2" }`；可选 `temperature/max_output_tokens` 等）。
*   **Concurrency**: 并发上限（避免突发失败或被限流）。
*   **Timeout**: 单次生成超时上限（超时直接失败，不做降级）。

**Model Setting（示例）**
```json
{ "model": "gpt-5.2" }
```

> 备注：`model_setting.model` 以你接入的 OpenAI-compatible 服务实际模型名为准；同一模型想生成多套就建多个 profile（不需要数组/计数）。

### 1. 任务：先抓取单词，再生成文章（定时 + 可手动触发）
触发方式：
*   定时触发（每小时抓词；北京时间 12/13/14 点生成）。
*   管理员仍可手动触发。

约束：先抓取当日 NEW/REVIEW 写入 `daily_words`，再创建生成任务；同一天可多次生成（多套），用于 A/B、不同 profile（不同模型/参数）或重复生成；不做无限重试/兜底/降级（Fail Fast，LLM 结构化输出允许一次修复重生成）。

#### 文章生成任务（依赖 daily_words 预抓取）（写 `tasks`，`type='article_generation'`，同一天可多套）
1.  **Task(gen_set)**: 创建一条 `tasks`（套件任务开始，`type='article_generation'`，`task_date=YYYY-MM-DD`，关联 `profile_id`，`status='running'`）。
2.  **Fetch Words（Shanbay, Admin）**: 管理员先调用 `shanbay.ts` 拉取当日 NEW/REVIEW，写入 `daily_words`（新学/复习分开存）。
    *   认证策略：使用登录态凭据作为 Secret（例如环境变量 `SHANBAY_COOKIE`）；若认证/解密失败则 Fail Fast，并在日志中明确提示需要更新凭据（不得输出凭据明文）。
    *   数据校验（Fail Fast）：今日 `NEW+REVIEW` 为空时抓取接口直接报错，不写入 `daily_words`；生成时若未找到 `daily_words` 也会失败。
    *   计数：写入 `daily_words`，生成时再写入 `tasks.result_json`（例如 `{ "new_count": 12, "review_count": 34 }`）。
3.  **Save Words**: 以 `daily_words` 为词源写入 `words` 并初始化 `word_learning_records`（已存在则忽略）。
    *   一致性：对 `words` 与 `word_learning_records` 采用幂等写入（已存在则忽略）；任一环节失败则整套任务直接失败并可安全重跑（Fail Fast，不做复杂补偿）。
4.  **Apply SRS Sync（FSRS / `ts-fsrs`）**: 将本次 `daily_words` 的 NEW/REVIEW 视为“今天已学习/已复习过”的事实，推进本地 FSRS 卡片（让 `due_at` 往后走，避免同一词被再次判定为到期）。
    *   幂等：每个词每天最多推进一次（见 `word_learning_records.last_shanbay_sync_date`）；同一天多次生成文章也不会重复推进。
    *   落库：推进成功后将该词 `word_learning_records.last_shanbay_sync_date = task_date`（与卡片更新同一事务提交）。
    *   智能推断四级评分（确定性规则；仅用于“扇贝同步推进”，不等同于你的手动复习打分）：
        *   统一基准：以 `task_date`（Asia/Shanghai 的 YYYY-MM-DD）为“今天”，并将 `due_at` 映射为 `due_date`（Asia/Shanghai 的 YYYY-MM-DD）。
        *   计算：`early_days = max(0, due_date - task_date)`；`late_days = max(0, task_date - due_date)`（按“天”比较，避免时区/小时级抖动）。
        *   规则（始终返回 `hard/good/easy`；永远不自动推断 `again`）：
            *   `state IN ('new','learning')` -> `good`
            *   `state='relearning'` -> `hard`（已进入重学阶段，保守推进）
            *   `state='review'`：
                *   `early_days >= 2` -> `easy`
                *   `late_days >= 2` -> `hard`
                *   其他情况 -> `good`
            *   加权（仅在边界时触发，保证规则稳定）：
                *   若 `lapses > 0` 且 `late_days >= 1`：将 `good` 下调为 `hard`
    *   可观测：将“推断后的 input_words（NEW/REVIEW）”写入该套件任务 `tasks.result_json` 以便未来可重放再次生成（不建快照表）。
5.  **Smart Word Selection（智能选词）**: 从 `daily_words` 中智能选择词汇用于文章生成。
    *   **排除已用词**：查询当日所有 `articles.content_json.input_words.selected`，排除已在今日文章中使用的词。
    *   **优先级排序**：新词+到期 > 复习词+到期 > 纯到期词。
    *   **每篇 12 个词**：由 AI 从候选词中挑选最适合写入新闻的 12 个词（不足 12 个则一次用完）。
    *   **词表记录**：选中词写入 `articles.content_json.input_words.selected`，便于前端高亮与后续排除。
6.  **Generate（三阶段多轮 LLM）**: 使用多轮对话保持上下文，调用 LLM 生成三档文章。
    *   **阶段 1 - 选词**：把全部候选词（含 SRS 信息）给 AI，让 AI 选 12 个"最适合写进新闻"的词。
    *   **阶段 2 - 搜新闻**：开启 `web_search`，基于选中词 + 主题偏好搜索当日英文新闻源（BBC/CNN/Reuters 等）。
    *   **阶段 3 - 写文章**：开启 JSON mode，基于选中词 + 新闻事实生成三档 Easy/Medium/Hard 文章，同时生成 `word_definitions`（每个词的音标 + 中文释义）。
    *   强制结构：采用结构化输出约束；校验失败允许一次修复重生成。
7.  **Auto Publish**:
    *   生成成功即**自动发布**：写入 `generation_jobs`（审计）与 `articles`（status='published', published_at=now）以及更新 `tasks.published_at`。
8.  **Finish GenSet**: 更新任务 `tasks.status`（`succeeded/failed/canceled`）。

### 2. 前端阅读与交互
*   **Settings / Admin Key（简单鉴权）**:
    *   页面提供“设置”入口：输入 Admin Key -> 保存到浏览器（localStorage）；显示当前“管理员/游客”状态。
    *   后端配置：通过环境变量文件/平台变量设置 `ADMIN_KEY`（本地与线上分别配置）；后端仅做字符串相等校验。
    *   未授权默认行为：仅渲染文章正文，不渲染任何交互功能（例如点击单词弹出单词信息、长选择进行 AI 解析、添加/编辑/删除批注）。
*   **Home（日历）**:
    *   首页以日历形式展示（Asia/Shanghai）。点击某天进入“当日归档页”。
    *   管理员视角：日历格子展示该日状态：已发布（成功）/失败/未生成。
    *   非管理员视角：只展示“已发布”的内容入口。
*   **Day View（当日归档 + 套件选择）**:
    *   同一天可能存在多套产物（多条 `tasks`，`type='article_generation'`）：用于 A/B、不同模型组合、或多次生成。
    *   **自动展示所有生成成功的套件**（`tasks.status='succeeded'`）。
    *   管理员可删除失败/取消/不满意的任务。
    *   非管理员只可访问成功的套件；没有时显示空态提示。
*   **Reading View**: SSR 渲染文章；同一篇文章内包含三档（Easy/Medium/Hard）可切换；针对该文章的 `target_words` 进行高亮（橙色下划线）。
    *   **2 列布局**：左侧词汇侧栏（`WordSidebar`），右侧文章内容；响应式（移动端堆叠）。
    *   **词汇侧栏**：显示每个词的音标 + 中文释义（来自 `word_definitions`）；支持 TTS 发音；支持标记掌握状态（unknown/familiar/mastered）。
*   **Review（仅管理员渲染）**:
    *   提供“复习”入口：按 `word_learning_records.due_at` 展示到期单词列表（可筛选 `mastery_status`）。
    *   每个词提供四级反馈按钮：`again/hard/good/easy`；提交后写入 `word_reviews` 并更新 `word_learning_records`（FSRS 卡片状态）。
*   **Empty State（无词表）**:
    *   当日生成任务失败且原因是“未采集到单词”时：页面提示“今日未采集到单词”。
    *   管理员可点击“确认今日未背单词 -> 结束今日”（把该生成任务 `tasks.type='article_generation'` 标记为 `status='canceled'`）；非管理员只显示提示不显示按钮。
*   **Highlights/Notes（仅管理员渲染）**:
    *   集成 `web-highlighter`：支持选中文本高亮、点击高亮查看/编辑笔记。
    *   管理员能力：创建/编辑/删除 `highlights`（对应后端增删改接口）。
    *   持久化以 `HighlightSource` 为准：`startMeta/endMeta/text/id`，并附带 `note/style` 等业务字段。
    *   非管理员：不请求 `highlights` 数据、不渲染高亮/批注 UI。
    *   文章 DOM 必须稳定（Fail Fast）：渲染结构变更可能导致历史高亮无法还原；还原失败时直接显式报错并提供清理/重建路径。
*   **AI Deep Dive（仅管理员渲染）**:
    *   长按/选中长文本 -> 呼出 "AI 解析"。
    *   侧边栏流式显示语法分析与翻译。
    *   复用 Admin Key + 速率限制，避免被滥用与成本失控。

## 目录结构规划
```bash
/
├── db/
│   ├── schema.ts          # Drizzle ORM Schema
│   └── schema.sql         # D1 init SQL (used by db:init:local)
├── prompts/               # Prompt markdown
│   └── daily_news.md
├── src/
│   ├── lib/
│   │   ├── shanbay.ts     # 扇贝 API 逻辑 (Fail Fast)
│   │   ├── srs.ts         # FSRS 同步/推进
│   │   ├── admin.ts       # Admin 鉴权逻辑
│   │   ├── db.ts          # 数据库连接
│   │   ├── http.ts        # HTTP 工具
│   │   ├── time.ts        # 时间工具 (Asia/Shanghai)
│   │   ├── utils.ts       # 通用工具
│   │   ├── llm/
│   │   │   └── openaiCompatible.ts  # OpenAI Responses API + web_search
│   │   ├── prompts/       # 提示词模板
│   │   ├── schemas/       # Zod schema 定义
│   │   └── tasks/         # 任务处理逻辑
│   ├── components/
│   │   ├── MacOSCalender.tsx    # macOS 风格日历组件
│   │   ├── Calendar.tsx         # 通用日历组件
│   │   ├── HomeWorkspace.tsx    # 首页工作区（日历 + 侧边栏）
│   │   ├── DayDetailsSidebar.tsx # 日期详情侧边栏
│   │   ├── AdminDayPanel.tsx    # 当日任务管理（生成/取消/删除）
│   │   ├── SettingsPanel.tsx    # Admin Key 设置入口
│   │   ├── ProfilesPanel.tsx    # Profiles 增删改查
│   │   ├── ArticleTabs.tsx      # 三档文章切换
│   │   ├── ArticleReader.tsx    # 文章阅读器（含词汇高亮）
│   │   ├── WordSidebar.tsx      # 词汇侧栏（音标+释义+TTS+掌握状态）
│   │   └── AIChatSidebar.tsx    # AI 聊天侧边栏
│   ├── pages/
│   │   ├── index.astro          # 首页 (日历 + 侧边栏)
│   │   ├── day/[date].astro     # 当日归档页
│   │   ├── article/[id].astro   # 阅读页 (SSR)
│   │   └── api/                 # API Routes
│   │       ├── admin/           # 管理员接口
│   │       │   └── words/[word].ts  # 更新词汇掌握状态
│   │       ├── articles/        # 文章接口
│   │       ├── day/             # 日期数据接口
│   │       └── chat.ts          # AI 聊天接口
│   ├── layouts/
│   │   └── Layout.astro         # 全局布局
│   ├── stories/                 # Storybook 组件故事
│   └── styles/
│       └── global.css           # 全局样式
├── migrations/            # Drizzle migrations
├── .storybook/            # Storybook 配置
├── astro.config.mjs       # Cloudflare Adapter + React + Tailwind v4
├── tailwind.config.js     # Tailwind 配置
├── drizzle.config.ts      # Drizzle 配置
└── wrangler.jsonc         # Cloudflare bindings (D1)
```

## 数据库表结构 (D1 / SQLite)
提示：当前不使用 migrations；初始化请运行 `npm run db:init:local`。
目标：把“每日跑批 -> 多模型多版本文章 -> 阅读/批注/解析”固化成**可回溯、可对比、可发布**的数据契约。

**约定**
*   `id`: `TEXT`（建议 UUID/ULID），由应用层生成。
*   时间：统一用 `TEXT` 的 `CURRENT_TIMESTAMP`（UTC）或 ISO8601 字符串；字段名用 `*_at`。
*   JSON：统一以 `TEXT` 存储，并用 `json_valid(...)` 做硬校验（不合法直接写入失败 = Fail Fast）。
*   外键：SQLite 需要开启 `foreign_keys` 才会生效；是否启用属于运行时配置，但表结构按“有外键”设计。

### 1) 生成配置（Profiles）
`generation_profiles`：一套“生成策略”（model_setting + topic 偏好 + 并发/超时）；通过多个 profile 决定每天生成多少套；每套生成一次性产出同一故事的三档（Easy/Medium/Hard）。
```sql
CREATE TABLE IF NOT EXISTS generation_profiles (
  id                TEXT PRIMARY KEY, -- UUID/ULID
  name              TEXT NOT NULL, -- profile 名称（人类可读）
  topic_preference  TEXT NOT NULL, -- 主题偏好标签列表（传给 prompt 的 TOPIC_PREFERENCE；逗号/换行分隔；随 profile 变化）
  model_setting_json TEXT NOT NULL CHECK (json_valid(model_setting_json)), -- 模型设置（JSON 对象；默认 { "model": "gpt-5.2" }；可选 temperature/max_output_tokens 等）
  concurrency       INTEGER NOT NULL CHECK (concurrency > 0), -- 并发上限
  timeout_ms        INTEGER NOT NULL CHECK (timeout_ms > 0), -- 单任务超时上限（ms）
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS idx_generation_profiles_topic_preference
  ON generation_profiles(topic_preference);
```

### 2) 任务表（按天关联）
`tasks`：承载“生成文章套件”任务（任务内置：拉取扇贝单词 -> 入库 -> 生成）；按 `task_date`（Asia/Shanghai，YYYY-MM-DD）与前端日历对齐。
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id                 TEXT PRIMARY KEY, -- UUID/ULID
  task_date          TEXT NOT NULL, -- 业务日期：YYYY-MM-DD（Asia/Shanghai）
  type               TEXT NOT NULL CHECK (type IN ('article_generation')), -- 任务类型：生成文章套件（依赖 daily_words 预抓取）
  trigger_source     TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_source IN ('manual')), -- 触发方式：管理员手动
  status             TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  profile_id         TEXT NOT NULL REFERENCES generation_profiles(id), -- 使用的生成策略（profile）
  result_json        TEXT NULL CHECK (result_json IS NULL OR json_valid(result_json)), -- 任务结果（结构化摘要：可包含 {new_count,review_count} + input_words）
  error_message      TEXT NULL, -- 失败原因（可读）
  error_context_json TEXT NULL CHECK (error_context_json IS NULL OR json_valid(error_context_json)), -- {stage, provider/model, request_id, http_status,...}
  created_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  started_at         TEXT NULL,
  finished_at        TEXT NULL,
  published_at       TEXT NULL, -- 仅 article_generation 使用：非空表示“对外展示”
  CHECK (type = 'article_generation' OR published_at IS NULL) -- 只有文章任务可发布（当前 type 仅保留 article_generation）
);

CREATE INDEX IF NOT EXISTS idx_tasks_task_date
  ON tasks(task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_type
  ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_profile_id
  ON tasks(profile_id);
CREATE INDEX IF NOT EXISTS idx_tasks_published_at
  ON tasks(published_at);

```

### 3) 每日单词表
`daily_words`：保存当天抓取的单词清单（新学/复习分开），用于生成前置校验与展示。
```sql
CREATE TABLE IF NOT EXISTS daily_words (
  date              TEXT PRIMARY KEY, -- 业务日期：YYYY-MM-DD（Asia/Shanghai）
  new_words_json    TEXT NOT NULL CHECK (json_valid(new_words_json)),
  review_words_json TEXT NOT NULL CHECK (json_valid(review_words_json)),
  created_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
```
### 4) 单词表（全局字典 + 用户学习状态）
`words`：记录所有被采集/手工添加的单词；包含“来源”和“学习状态（了解/掌握等）”。（不记录每次采集的明细快照）
```sql
CREATE TABLE IF NOT EXISTS words (
  word          TEXT PRIMARY KEY, -- 单词本身作为主键/外键（唯一）
  mastery_status TEXT NOT NULL DEFAULT 'unknown' CHECK (mastery_status IN ('unknown', 'familiar', 'mastered')), -- 学习状态：unknown=未知/未标注，familiar=了解，mastered=掌握
  origin        TEXT NOT NULL CHECK (origin IN ('shanbay', 'article', 'manual')), -- 单词来源：采集/文章点击添加/手工录入
  origin_ref    TEXT NULL, -- 可选：来源上下文（例如 article_id/url 等，具体格式后续约定）
  created_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_words_mastery_status
  ON words(mastery_status);
CREATE INDEX IF NOT EXISTS idx_words_origin
  ON words(origin);
```

### 5) 单词学习记录（FSRS / `ts-fsrs` 卡片状态）
`word_learning_records`：与 `words` 1:1（用 `word` 作为外键），存储 `ts-fsrs` 的 `Card` 状态字段，用于实现间隔复习与“到期选词”；复习反馈采用四级：`again/hard/good/easy`（由管理员在复习 UI 中打分）。
```sql
CREATE TABLE IF NOT EXISTS word_learning_records (
  word               TEXT PRIMARY KEY REFERENCES words(word),
  created_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_shanbay_sync_date TEXT NULL, -- 上次从扇贝同步并推进 FSRS 的业务日期（Asia/Shanghai, YYYY-MM-DD；同一天多次生成也只推进一次）
  due_at             TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), -- ts-fsrs Card.due：下次到期时间（用于选词/排程）
  stability          REAL NOT NULL DEFAULT 0, -- ts-fsrs Card.stability：记忆稳定性
  difficulty         REAL NOT NULL DEFAULT 0, -- ts-fsrs Card.difficulty：固有难度
  elapsed_days       INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_days >= 0), -- ts-fsrs Card.elapsed_days：距上次复习的天数（用于调度）
  scheduled_days     INTEGER NOT NULL DEFAULT 0 CHECK (scheduled_days >= 0), -- ts-fsrs Card.scheduled_days：本次复习到下次复习的间隔天数
  learning_steps     INTEGER NOT NULL DEFAULT 0 CHECK (learning_steps >= 0), -- ts-fsrs Card.learning_steps：（重）学习阶段步数
  reps               INTEGER NOT NULL DEFAULT 0 CHECK (reps >= 0), -- ts-fsrs Card.reps：累计复习次数
  lapses             INTEGER NOT NULL DEFAULT 0 CHECK (lapses >= 0), -- ts-fsrs Card.lapses：遗忘次数
  state              TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning')), -- ts-fsrs Card.state
  last_review_at     TEXT NULL, -- ts-fsrs Card.last_review：上次复习时间（打分发生时写入）
  updated_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_word_learning_records_due_at
  ON word_learning_records(due_at);


### 6) 文章产物（面向前台展示）
`articles`：一篇文章 = `model` + `variant` 的产物；**单篇文章内包含三档（Easy/Medium/Hard）**；与 `tasks` 1:1 关联。
```sql
CREATE TABLE IF NOT EXISTS articles (
  id                TEXT PRIMARY KEY,
  generation_task_id TEXT NOT NULL REFERENCES tasks(id), -- 所属生成套件（tasks.type='article_generation'）
  model             TEXT NOT NULL, -- 模型名
  variant           INTEGER NOT NULL CHECK (variant >= 1), -- 变体序号
  title             TEXT NOT NULL, -- 展示标题
  content_json      TEXT NOT NULL CHECK (json_valid(content_json)), -- 文章结构化内容（包含三档内容 + 用于可重放的词表元数据）
  status            TEXT NOT NULL CHECK (status IN ('draft', 'published')), -- 文章自身发布态
  created_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  published_at      TEXT NULL,
  UNIQUE (generation_task_id, model, variant)
);

CREATE INDEX IF NOT EXISTS idx_articles_generation_task_id ON articles(generation_task_id);
CREATE INDEX IF NOT EXISTS idx_articles_status     ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_published  ON articles(published_at);
```


### 7) 高亮批注（web-highlighter）
`highlights`：以 `web-highlighter` 的 `HighlightSource` 为落库契约；支持软删。
```sql
CREATE TABLE IF NOT EXISTS highlights (
  id              TEXT PRIMARY KEY, -- highlight id（同 web-highlighter 的 id）
  article_id      TEXT NOT NULL REFERENCES articles(id),
  actor           TEXT NOT NULL, -- 单人站可固定为 owner；若多用户则引入 users/actors 表并改为外键
  start_meta_json TEXT NOT NULL CHECK (json_valid(start_meta_json)), -- DomMeta：{parentTagName,parentIndex,textOffset,extra?}
  end_meta_json   TEXT NOT NULL CHECK (json_valid(end_meta_json)), -- DomMeta：{parentTagName,parentIndex,textOffset,extra?}
  text            TEXT NOT NULL, -- 选中文本（用于还原校验/展示）
  note            TEXT NULL, -- 笔记（纯文本或 markdown，自行约定）
  style_json      TEXT NULL CHECK (style_json IS NULL OR json_valid(style_json)), -- 可选：颜色/标签/className 等展示信息
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), -- 更新 note/style 时必须同步更新时间
  deleted_at      TEXT NULL -- 软删（便于撤销/审计）
);

CREATE INDEX IF NOT EXISTS idx_highlights_article_id
  ON highlights(article_id);
CREATE INDEX IF NOT EXISTS idx_highlights_actor
  ON highlights(actor);
CREATE INDEX IF NOT EXISTS idx_highlights_article_actor
  ON highlights(article_id, actor);
```

### 10) （可选）长难句解析缓存/可保存
如果“AI 解析”需要缓存或可回看，再加 `ai_explanations`；否则先不建表。
```sql
CREATE TABLE IF NOT EXISTS ai_explanations (
  id               TEXT PRIMARY KEY,
  article_id       TEXT NOT NULL REFERENCES articles(id),
  actor            TEXT NOT NULL, -- 同 highlights.actor
  selection_hash   TEXT NOT NULL, -- 对选区做稳定哈希（基于 quote+位置+文章版本等）用于去重/缓存命中
  selection_json   TEXT NOT NULL CHECK (json_valid(selection_json)), -- 选区信息（quote、selector、必要上下文；避免存整篇文章）
  model            TEXT NOT NULL, -- 解析所用模型名
  result_json      TEXT NOT NULL CHECK (json_valid(result_json)), -- 解析结果（结构化）
  created_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (article_id, actor, selection_hash, model) -- 同一人同一段文本同一模型只存一份；需要刷新可用新模型或增加版本字段
);

CREATE INDEX IF NOT EXISTS idx_ai_explanations_article_id
  ON ai_explanations(article_id);
```

## 错误处理约束 (Fail Fast)
1.  任何依赖失败（抓取/生成/读写/解析）均不做静默降级：立即返回错误或中止本次任务。
2.  错误信息必须可操作：包含失败环节、关键上下文与明确下一步（例如更新凭据、修复配置、重跑任务）。
3.  不产生半成品（文章侧）：`articles/generation_jobs` 写入要么完整成功要么回滚；`words/word_learning_records` 的“入库/初始化”允许独立提交，但只有文章成功写入后才能回写 `word_learning_records.last_ai_article_at`。
4.  Fail Fast 粒度需明确：当某条 `tasks.type='article_generation'` 在任一阶段失败（拉词/入库/LLM/保存）时，默认视为该套件任务失败（避免部分缺失造成体验不一致）。
5.  鉴权失败不做任何管理员操作（包括读写/解析）：直接返回 401/403，且日志不得记录明文 key。
6.  任意 Secret 不得出现在日志/错误回显中：包括 `ADMIN_KEY`、`SHANBAY_COOKIE`、LLM Key 等。
7.  `NEW+REVIEW` 为空默认失败，但允许管理员显式确认“今日未背单词”将当日 `tasks.type='article_generation'` 标记为 `canceled`，视为“今日结束”。
8.  词表植入检查（如 `missing_words`）暂不作为失败条件：只记录在产物/任务元数据中，便于后续迭代 prompt 与选词策略。
