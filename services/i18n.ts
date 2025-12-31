
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'zh-CN' | 'en-US';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'zh-CN',
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: 'mtt_language',
    }
  )
);

const translations = {
  'zh-CN': {
    // Layout
    APP_TITLE: 'MediTerm',
    APP_SUBTITLE: '医学术语翻译',
    NAV_TRANSLATE: '词库查找',
    NAV_ASSISTANT: '翻译',
    NAV_DICTIONARY: '词库添加',
    NAV_BATCH: '批量',
    NAV_SAVED: '收藏',
    NAV_HISTORY: '历史',
    NAV_SETTINGS: '设置',
    LBL_LANGUAGE: '语言',
    FOOTER_NOTE: '100% 客户端安全。数据仅存储在浏览器中。',
    
    // Translator
    HEADER_TITLE: '医学翻译器',
    HEADER_SUBTITLE: '离线搜索 {count} 个医学术语。',
    INPUT_PLACEHOLDER: '输入中文术语、英文定义或拼音...',
    NO_MATCH: '未找到 "{query}" 的结果。',
    BTN_ADD_TO_DICT: '添加到我的词典',
    BTN_TRANSLATE_ACTION: '翻译',
    BTN_TRANSLATE_NOW: '立即翻译',
    DID_YOU_MEAN: '您是不是要找：',
    BEST_MATCH: '最佳匹配',
    SOURCE_USER: '用户',
    SOURCE_SYSTEM: '系统',
    AVOID: '避免混淆',
    BTN_PRONOUNCE: '发音',
    BTN_COPY: '复制',
    
    // Add Term Modal / Form
    MODAL_TITLE: '添加新术语',
    BTN_ADD_TERM: '添加术语',
    BTN_SAVE_TERM: '保存术语',
    LBL_CHINESE_TERM: '中文术语',
    LBL_ENGLISH_DEF: '英文定义',
    LBL_PINYIN_FULL: '全拼',
    LBL_PINYIN_FIRST: '拼音首字母',
    LBL_AUTO_GEN: '(自动生成)',
    LBL_ALIASES: '别名 / 同义词',
    LBL_CATEGORY: '分类',
    LBL_NOTE: '备注',
    LBL_NOTE_USAGE: '备注 / 用法',
    LBL_USAGE: '用法',
    LBL_ADDED: '添加于 {date}',
    BTN_CANCEL: '取消',
    BTN_SAVE: '保存',
    BTN_CLOSE: '关闭',
    MSG_TERM_ADDED: '术语添加成功！',
    
    // Form Placeholders
    PH_CHINESE: '例如：感冒',
    PH_ENGLISH: '例如：Common Cold',
    PH_ALIASES: '以逗号分隔，例如：伤风, 上感',
    PH_CATEGORY: '例如：内科',
    PH_NOTE: '可选：备注或用法说明',

    // Import Assistant
    IMP_TITLE: '导入助手',
    IMP_DESC: '使用这些提示词让 ChatGPT/Claude 帮您准备数据。',
    IMP_STEP1_TITLE: '1. Excel/CSV 转 JSON',
    IMP_STEP2_TITLE: '2. 补充数据 (拼音 & 别名)',
    BTN_DONE: '完成',
    TITLE_IMPORT_HELP: '导入帮助',
    TOAST_PROMPT_COPIED: '提示词已复制！',

    // Toast
    TOAST_COPY_SUCCESS: '已复制到剪贴板',
    TOAST_COPY_FAIL: '复制失败',

    // Assistant
    AST_TITLE: '翻译助手',
    AST_SUBTITLE: 'AI 驱动的医学文本翻译与分析',
    AST_DETECTED: '检测到 {count} 个术语',
    MODE_FAST: '极速模式',
    MODE_PRO: '专家模式',
    MODE_PRO_DESC: '多步骤智能工作流：初稿 -> 专家审校 -> 最终润色。适合高精度要求的医学文档。',
    AST_SOURCE: '原文',
    AST_MODE_EDIT: '编辑',
    AST_MODE_ANALYZE: '分析',
    AST_PLACEHOLDER: '在此输入医学文本...',
    AST_EMPTY: '暂无分析内容',
    AST_TARGET: '译文',
    AST_AUTO_PREVIEW: '自动预览',
    AST_STATUS_TRANSLATING: '翻译中...',
    AST_STATUS_DRAFTING: '正在生成初稿...',
    AST_STATUS_REVIEWING: '专家AI正在审校...',
    AST_STATUS_POLISHING: '正在进行最终润色...',
    AST_TARGET_PLACEHOLDER: '翻译结果将显示在这里...',
    ERR_AI_DISABLED_TITLE: 'AI 功能未启用',
    ERR_AI_DISABLED_MSG: '请在设置中配置 API Key 以启用实时医学翻译功能。',
    BTN_GOTO_SETTINGS: '前往设置',
    ERR_TRANS_FAILED: '翻译请求失败',
    ERR_CHECK_KEY: '请检查您的 API Key 或网络连接',
    ERR_QUOTA_EXCEEDED: 'API 调用次数超限 (429)。请检查您的套餐配额或稍后重试。',
    BTN_EXPERT_SUGGESTIONS: '专家级改进建议',
    ERR_TROUBLESHOOT: '故障排除',
    ERR_CAUSES: '常见原因：API Key 无效、账户余额不足、模型名称错误或网络连接不稳定。',
    ERR_ACTION: '建议：检查设置中的 API 配置，确认 Key 有效且有可用额度。',
    
    // Token Estimates
    TOKEN_ESTIMATE_SHORT: '预计本次约 {count} 个 tokens。',
    TOKEN_ESTIMATE_MEDIUM: '预计本次约 {count} 个 tokens，翻译时间和调用成本会略有增加。',
    TOKEN_ESTIMATE_LONG: '文本较长，预计约 {count} 个 tokens，系统将自动分段翻译，可能耗时更长。',

    // Batch
    BATCH_TITLE: '批量翻译',
    LBL_INPUT: '输入文本 (每行一个)',
    PLACEHOLDER_INPUT: '在此输入需要翻译的术语，每行一个...',
    BTN_TRANSLATE_ALL: '开始处理',
    LBL_RESULTS: '处理结果',
    BTN_EXPORT: '导出 Excel',
    EMPTY_RESULTS: '暂无结果',
    NOT_FOUND: '未找到',
    BATCH_PROCESSING: '正在处理中 (混合模式: 词库 + AI)...',
    BATCH_SOURCE_DICT: '词库匹配',
    BATCH_SOURCE_AI: 'AI 翻译',
    BATCH_WAIT_AI: '正在调用 AI 翻译剩余项...',

    // Dictionary
    DICT_TITLE: '医学词典',
    BTN_IMPORT_JSON: '导入 JSON',
    BTN_EXPORT_JSON: '导出 JSON',
    IMPORT_SUCCESS: '成功导入 {count} 个术语',
    IMPORT_NO_DATA: '文件中未发现有效数据',
    IMPORT_FORMAT_ERROR: '文件格式错误',
    IMPORT_PARSE_ERROR: '无法解析文件',
    TAB_SYSTEM: '系统词库',
    TAB_USER: '我的词库',
    FILTER_PLACEHOLDER: '搜索术语...',
    DICT_COUNT: '{count} 个术语',
    EMPTY_DICT: '暂无相关术语',
    EMPTY_USER_DICT: '您的个人词库为空',
    PAGE_INFO: '第 {current} / {total} 页',
    DETAIL_TITLE: '术语详情',
    LBL_ROOT_ANALYSIS: '词根分析',
    BTN_REMOVE_TERM: '删除术语',

    // History
    HIST_TITLE: '搜索历史',
    BTN_CLEAR_ALL: '清空历史',
    EMPTY_HIST: '暂无搜索记录',
    NO_MATCH_TEXT: '无匹配结果',

    // Favorites
    SAVED_TITLE: '收藏术语',
    EMPTY_SAVED: '暂无收藏术语',

    // Settings
    SETTINGS_TITLE: '设置',
    SET_API_TITLE: 'API 配置',
    SET_PROVIDER: '服务提供商',
    SET_API_KEY: 'API Key',
    HELP_GET_KEY: '一般获取 API Key 的流程如下：\n前往官方平台 → 登录账号 → 打开 API Key 管理页面 → 创建新 Key → 复制并填写到此处',
    SET_BASE_URL: 'Base URL (可选)',
    SET_MODEL: '模型 (可选)',
    SET_USERNAME: '用户名 (可选)',
    PH_USERNAME: '用户',
    HINT_GEMINI_KEY: '在 Google AI Studio 获取免费 Key',
    HINT_OPENAI_KEY: '使用 OpenRouter 或本地 LLM 的 Key',
    HINT_GLM_KEY: '使用智谱 AI (BigModel) 的 API Key',
    HINT_LOCAL_STORAGE: 'Key 仅存储在本地浏览器中，绝不会上传至服务器',
    BTN_GET_KEY: '点击获取 API Key',
    BTN_SAVE_CONFIG: '保存配置',
    BTN_LOGOUT: '退出登录',
    STATUS_CONNECTED: '已连接',
    SET_FUZZY: '模糊搜索阈值',
    SET_FUZZY_DESC: '数值越低匹配越严格 (0.0 = 精确匹配)',
    SET_AUTOPLAY: '自动发音',
    SET_AUTOPLAY_DESC: '搜索结果出现时自动播放英文发音',
    SET_AUTOCOPY: '自动复制',
    SET_AUTOCOPY_DESC: '自动将最佳匹配结果复制到剪贴板',
    SET_REMEMBER_KEY: '记住 API Key',
    SET_REMEMBER_KEY_DESC: '下次访问时自动加载 (存储在本地)',
    SET_NOTE: '注意：所有数据均存储在您的本地浏览器中。清除浏览器缓存可能会导致数据丢失。建议定期导出您的个人词典。',
    PROVIDER_OPENAI_LOCAL: 'OpenAI / 本地',
    PROVIDER_GEMINI: 'Google Gemini',
    PROVIDER_GLM: '智谱 GLM',
    
    // Popup
    TOOLTIP_TRANSLATE: '翻译',
  },
  'en-US': {
    // Layout
    APP_TITLE: 'MediTerm',
    APP_SUBTITLE: 'Medical Term Translator',
    NAV_TRANSLATE: 'Term Search',
    NAV_ASSISTANT: 'Translate',
    NAV_DICTIONARY: 'Add Terms',
    NAV_BATCH: 'Batch',
    NAV_SAVED: 'Saved',
    NAV_HISTORY: 'History',
    NAV_SETTINGS: 'Settings',
    LBL_LANGUAGE: 'Language',
    FOOTER_NOTE: '100% Client-side secure. Data stored only in browser.',

    // Translator
    HEADER_TITLE: 'Medical Translator',
    HEADER_SUBTITLE: 'Search {count} medical terms offline.',
    INPUT_PLACEHOLDER: 'Enter Chinese term, English def, or Pinyin...',
    NO_MATCH: 'No results for "{query}".',
    BTN_ADD_TO_DICT: 'Add to Dictionary',
    BTN_TRANSLATE_ACTION: 'Translate',
    BTN_TRANSLATE_NOW: 'Translate Now',
    DID_YOU_MEAN: 'Did you mean:',
    BEST_MATCH: 'Best Match',
    SOURCE_USER: 'User',
    SOURCE_SYSTEM: 'System',
    AVOID: 'Avoid',
    BTN_PRONOUNCE: 'Pronounce',
    BTN_COPY: 'Copy',
    
    // Add Term Modal / Form
    MODAL_TITLE: 'Add New Term',
    BTN_ADD_TERM: 'Add Term',
    BTN_SAVE_TERM: 'Save Term',
    LBL_CHINESE_TERM: 'Chinese Term',
    LBL_ENGLISH_DEF: 'English Definition',
    LBL_PINYIN_FULL: 'Full Pinyin',
    LBL_PINYIN_FIRST: 'First Letter Pinyin',
    LBL_AUTO_GEN: '(Auto-generated)',
    LBL_ALIASES: 'Aliases / Synonyms',
    LBL_CATEGORY: 'Category',
    LBL_NOTE: 'Note',
    LBL_NOTE_USAGE: 'Note / Usage',
    LBL_USAGE: 'Usage',
    LBL_ADDED: 'Added on {date}',
    BTN_CANCEL: 'Cancel',
    BTN_SAVE: 'Save',
    BTN_CLOSE: 'Close',
    MSG_TERM_ADDED: 'Term added successfully!',

    // Form Placeholders
    PH_CHINESE: 'e.g. 感冒',
    PH_ENGLISH: 'e.g. Common Cold',
    PH_ALIASES: 'Comma separated, e.g. 伤风, 上感',
    PH_CATEGORY: 'e.g. Internal Medicine',
    PH_NOTE: 'Optional usage notes',

    // Import Assistant
    IMP_TITLE: 'Import Assistant',
    IMP_DESC: 'Use these prompts with ChatGPT/Claude to prepare your data.',
    IMP_STEP1_TITLE: '1. Convert Excel/CSV to JSON',
    IMP_STEP2_TITLE: '2. Enrich Data (Pinyin & Aliases)',
    BTN_DONE: 'Done',
    TITLE_IMPORT_HELP: 'Import Help',
    TOAST_PROMPT_COPIED: 'Prompt copied!',

    // Toast
    TOAST_COPY_SUCCESS: 'Copied to clipboard',
    TOAST_COPY_FAIL: 'Failed to copy',

    // Assistant
    AST_TITLE: 'Translation Assistant',
    AST_SUBTITLE: 'AI-powered medical text translation & analysis',
    AST_DETECTED: '{count} terms detected',
    MODE_FAST: 'Fast',
    MODE_PRO: 'Pro',
    MODE_PRO_DESC: 'Multi-step agentic workflow: Draft -> Review -> Polish. Best for high-stakes docs.',
    AST_SOURCE: 'Source',
    AST_MODE_EDIT: 'Edit',
    AST_MODE_ANALYZE: 'Analyze',
    AST_PLACEHOLDER: 'Enter medical text here...',
    AST_EMPTY: 'No text to analyze',
    AST_TARGET: 'Translation',
    AST_AUTO_PREVIEW: 'Auto-Preview',
    AST_STATUS_TRANSLATING: 'Translating...',
    AST_STATUS_DRAFTING: 'Drafting...',
    AST_STATUS_REVIEWING: 'Reviewing...',
    AST_STATUS_POLISHING: 'Polishing...',
    AST_TARGET_PLACEHOLDER: 'Translation will appear here...',
    ERR_AI_DISABLED_TITLE: 'AI Features Disabled',
    ERR_AI_DISABLED_MSG: 'Please configure your API key in Settings to enable real-time medical translation.',
    BTN_GOTO_SETTINGS: 'Go to Settings',
    ERR_TRANS_FAILED: 'Translation Request Failed',
    ERR_CHECK_KEY: 'Check your API key or connection',
    ERR_QUOTA_EXCEEDED: 'API quota exceeded (429). Please check your plan or try again later.',
    BTN_EXPERT_SUGGESTIONS: 'Expert Suggestions',
    ERR_TROUBLESHOOT: 'Troubleshooting',
    ERR_CAUSES: 'Common causes: Invalid API Key, Insufficient balance, Incorrect model name, or Network issues.',
    ERR_ACTION: 'Suggestion: Check API configuration in Settings to ensure the Key is valid and has quota.',
    
    // Token Estimates
    TOKEN_ESTIMATE_SHORT: 'Estimated ~{count} tokens.',
    TOKEN_ESTIMATE_MEDIUM: 'Estimated ~{count} tokens. Translation time and cost may increase slightly.',
    TOKEN_ESTIMATE_LONG: 'Long text (~{count} tokens). System will split segments automatically; may take longer.',

    // Batch
    BATCH_TITLE: 'Batch Translation',
    LBL_INPUT: 'Input Text (One per line)',
    PLACEHOLDER_INPUT: 'Enter terms to translate here...',
    BTN_TRANSLATE_ALL: 'Start Processing',
    LBL_RESULTS: 'Results',
    BTN_EXPORT: 'Export Excel',
    EMPTY_RESULTS: 'No results yet',
    NOT_FOUND: 'Not Found',
    BATCH_PROCESSING: 'Processing (Mixed Mode: Dict + AI)...',
    BATCH_SOURCE_DICT: 'Dictionary',
    BATCH_SOURCE_AI: 'AI Translate',
    BATCH_WAIT_AI: 'Calling AI for remaining items...',

    // Dictionary
    DICT_TITLE: 'Medical Dictionary',
    BTN_IMPORT_JSON: 'Import JSON',
    BTN_EXPORT_JSON: 'Export JSON',
    IMPORT_SUCCESS: 'Imported {count} terms successfully',
    IMPORT_NO_DATA: 'No valid terms found in file',
    IMPORT_FORMAT_ERROR: 'Invalid file format',
    IMPORT_PARSE_ERROR: 'Failed to parse file',
    TAB_SYSTEM: 'System Terms',
    TAB_USER: 'My Terms',
    FILTER_PLACEHOLDER: 'Search terms...',
    DICT_COUNT: '{count} terms',
    EMPTY_DICT: 'No terms found',
    EMPTY_USER_DICT: 'Your dictionary is empty',
    PAGE_INFO: 'Page {current} of {total}',
    DETAIL_TITLE: 'Term Details',
    LBL_ROOT_ANALYSIS: 'Root Analysis',
    BTN_REMOVE_TERM: 'Remove Term',

    // History
    HIST_TITLE: 'Search History',
    BTN_CLEAR_ALL: 'Clear All',
    EMPTY_HIST: 'No history yet',
    NO_MATCH_TEXT: 'No match found',

    // Favorites
    SAVED_TITLE: 'Saved Terms',
    EMPTY_SAVED: 'No saved terms yet',

    // Settings
    SETTINGS_TITLE: 'Settings',
    SET_API_TITLE: 'API Configuration',
    SET_PROVIDER: 'Provider',
    SET_API_KEY: 'API Key',
    HELP_GET_KEY: 'General process to obtain API Key:\nGo to official platform → Login → Open API Key management → Create new Key → Copy and paste here',
    SET_BASE_URL: 'Base URL (Optional)',
    SET_MODEL: 'Model (Optional)',
    SET_USERNAME: 'Username (Optional)',
    PH_USERNAME: 'User',
    HINT_GEMINI_KEY: 'Get a free key at Google AI Studio',
    HINT_OPENAI_KEY: 'Use a key from OpenRouter or local LLM',
    HINT_GLM_KEY: 'Use API Key from Zhipu AI (BigModel)',
    HINT_LOCAL_STORAGE: 'Keys are stored locally in your browser and never sent to our servers',
    BTN_GET_KEY: 'Get API Key Here',
    BTN_SAVE_CONFIG: 'Save Configuration',
    BTN_LOGOUT: 'Log out',
    STATUS_CONNECTED: 'Connected',
    SET_FUZZY: 'Fuzzy Search Threshold',
    SET_FUZZY_DESC: 'Lower values = stricter matching (0.0 = exact)',
    SET_AUTOPLAY: 'Auto-play Pronunciation',
    SET_AUTOPLAY_DESC: 'Automatically speak English terms in search results',
    SET_AUTOCOPY: 'Auto-copy to Clipboard',
    SET_AUTOCOPY_DESC: 'Automatically copy best match to clipboard',
    SET_REMEMBER_KEY: 'Remember API Key',
    SET_REMEMBER_KEY_DESC: 'Auto-load Key next time (Stored locally)',
    SET_NOTE: 'Note: All data is stored locally in your browser. Clearing browser cache may lose your data.',
    PROVIDER_OPENAI_LOCAL: 'OpenAI / Local',
    PROVIDER_GEMINI: 'Google Gemini',
    PROVIDER_GLM: 'Zhipu GLM',

    // Popup
    TOOLTIP_TRANSLATE: 'Translate',
  }
};

export const useTranslation = () => {
  const { language } = useLanguageStore();
  
  const t = (key: keyof typeof translations['zh-CN'], params?: Record<string, any>) => {
    let text = translations[language][key] || translations['zh-CN'][key] || key;
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    
    return text;
  };

  return { t, language };
};