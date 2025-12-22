/**
 * LLM Prompts - 重构版
 * 
 * 四轮对话架构：
 * 1. 选词 (Word Selection)
 * 2. 研究 (Research) 
 * 3. 草稿生成 (Draft Generation) - 内联写作规范
 * 4. JSON 转换 (JSON Conversion) - 完整 Schema
 */

// ============================================
// 统一 System Prompt (精简版，所有轮次共用)
// ============================================

export const UNIFIED_SYSTEM_PROMPT = `你是一位专业的 ESL 内容开发专家，精通 CEFR 语言评估标准。
你的任务是帮助用户创建高质量的分级英语新闻阅读材料，对标 English News in Levels 的专业水准。
请按照用户的指令逐步完成任务。`;

// ============================================
// 第1轮：选词
// ============================================

export const WORD_SELECTION_SYSTEM_PROMPT = `你是词汇策展专家。你的任务是从候选词表中选出 4-7 个能自然融入同一篇新闻报道的词汇。

选词标准：
1. 优先选择到期复习的词 (due=true)
2. 优先选择新词 (type=new)
3. 选出的词应能自然出现在同一主题的新闻中
4. 考虑词汇间的语义关联性

输出格式：返回 JSON 对象：
{
  "selected_words": ["word1", "word2", ...],
  "selection_reasoning": "简要说明选词理由"
}`;

export function buildWordSelectionUserPrompt(args: {
    candidateWordsJson: string;
    topicPreference: string;
    currentDate: string;
}) {
    return `当前日期: ${args.currentDate}
主题偏好: ${args.topicPreference}

候选词表:
${args.candidateWordsJson}

请从候选词中选出 4-7 个适合的词汇。返回 JSON 对象。`;
}

// ============================================
// 第2轮：研究
// ============================================

export function buildResearchUserPrompt(args: {
    selectedWords: string[];
    topicPreference: string;
    currentDate: string;
}) {
    return `已选词汇: ${args.selectedWords.join(', ')}
主题偏好: ${args.topicPreference}
日期: ${args.currentDate}

请搜索当天的真实新闻，找到能自然融入这些词汇的新闻事件。提供 2-5 个可靠来源。`;
}

// ============================================
// 第3轮：草稿生成 (内联写作规范)
// ============================================

const WRITING_GUIDELINES = `
## 分级写作规范

### Level 1 (Easy / Elementary)
- **目标**: 让初学者也能理解
- **时态**: 一般现在时为主，少量过去时/现在完成时
- **句法**: 
  - 短句 SVO 结构为主
  - 避免被动语态和定语从句
  - 禁止使用分号
  - 每句 8-14 个单词
- **连接词**: 限于 and/but/because/so/when
- **段落**: 每段 2-3 句

### Level 2 (Medium / Intermediate)
- **目标**: 标准新闻叙事，类似 USA Today
- **时态**: 一般过去时为主，可用现在时表述事实
- **句法**:
  - 允许并列句
  - 允许简单从句 (when/because/if)
  - 允许简单定语从句 (who/which)，避免嵌套
  - 每句 14-22 个单词
- **段落**: 每段 2-4 句

### Level 3 (Hard / Advanced)
- **目标**: 母语者级别的深度报道
- **时态**: 自由使用所有时态
- **句法**:
  - 建议至少一处高级结构（分词短语/同位语/被动语态）
  - 允许复杂句，但保持清晰
  - 每句 18-30 个单词
- **段落**: 每段 2-4 句，偏分析与影响

## 词汇处理
- 所有目标词汇必须在三个级别中都尝试使用
- 自然优先：不要硬塞，允许少量缺失
- Level 1 策略：对难词使用"定义式引入"
  - 错误: The negotiation failed.
  - 正确: They talk about the deal. This is a negotiation.
- 不要对词汇加粗，前端会处理高亮

## 排版要求
- 段落之间空一行
- 不要"一句一行"
- 每段建议 2-4 句
`;

export function buildDraftGenerationUserPrompt(args: {
    selectedWords: string[];
    sourceUrls: string[];
    currentDate: string;
    topicPreference: string;
}) {
    return `请根据研究结果，为以下词汇写三个难度级别的新闻文章。

目标词汇: ${JSON.stringify(args.selectedWords)}
主题偏好: ${args.topicPreference}
日期: ${args.currentDate}
来源: ${args.sourceUrls.join('\n')}

${WRITING_GUIDELINES}

请直接开始写作，不要输出规划过程。先写 Level 1，再写 Level 2，最后写 Level 3。`;
}

// ============================================
// 第4轮：JSON 转换 (完整 Schema)
// ============================================

const JSON_SCHEMA = `
{
  "title": "文章标题（英文，简短有力）",
  "topic": "主题分类（如 Gaming, Tech, Science）",
  "sources": ["来源URL1", "来源URL2"],
  "articles": [
    {
      "level": 1,
      "level_name": "Easy",
      "content": "Level 1 正文 (Markdown格式，段落间用\\n\\n分隔)",
      "difficulty_desc": "Elementary (A1-A2)"
    },
    {
      "level": 2,
      "level_name": "Medium", 
      "content": "Level 2 正文",
      "difficulty_desc": "Intermediate (B1-B2)"
    },
    {
      "level": 3,
      "level_name": "Hard",
      "content": "Level 3 正文",
      "difficulty_desc": "Advanced (C1+)"
    }
  ],
  "word_usage_check": {
    "target_words_count": 5,
    "used_count": 4,
    "missing_words": ["未使用的词"]
  },
  "word_definitions": [
    {
      "word": "negotiate",
      "phonetic": "/nɪˈɡoʊʃieɪt/",
      "definitions": [
        { "pos": "verb", "definition": "to discuss something in order to reach an agreement" }
      ]
    }
  ]
}`;

export function buildJsonConversionUserPrompt(args: {
    draftText: string;
    sourceUrls: string[];
    selectedWords: string[];
}) {
    return `请将文章草稿转换为以下 JSON 格式。你必须输出一个有效的 JSON 对象。

目标词汇: ${JSON.stringify(args.selectedWords)}
来源 URL: ${JSON.stringify(args.sourceUrls)}

JSON Schema:
${JSON_SCHEMA}

重要说明:
1. word_definitions 必须为每个目标词汇提供定义（IPA 音标 + 词性 + 释义）
2. 检查每个词在文章中的使用情况，填写 word_usage_check
3. articles.content 使用 Markdown 格式，段落间用 \\n\\n 分隔
4. 只输出 JSON，不要输出其他内容

草稿内容:
${args.draftText}

请输出 JSON。`;
}

// ============================================
// 兼容性导出 (供 TaskQueue 使用)
// ============================================

export const DAILY_NEWS_SYSTEM_PROMPT = UNIFIED_SYSTEM_PROMPT;
