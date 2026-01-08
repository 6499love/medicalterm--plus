# MedicalTerm-Plus

**MedicalTerm-Plus** 是一个医学术语翻译与检索的单页应用（SPA），采用 **完全客户端运行架构**，无需后端服务即可使用。

该项目基于 **Google Gemini AI Studio 模板** 构建，集成了本地 JSON 医学词库、AI 驱动翻译能力、模糊搜索引擎以及浏览器本地存储等功能，适用于医学文献翻译、医疗器械出海资料整理及内部术语管理等场景。

---

## ✨ 主要功能

- 医学术语智能翻译（支持 Gemini API，兼容 OpenAI 风格 API）
- 本地 JSON 医学词典与术语别名匹配
- 基于 Fuse.js 的模糊搜索
- 用户自定义词典管理
- 批量翻译与 Excel 导出
- 浏览器 `localStorage` 本地数据持久化
- Web Speech API 语音支持
- 专业模式与反射能力

---

## 🛠 技术栈

- React + TypeScript
- Vite
- Fuse.js
- Web Speech API
- localStorage

代码构成比例：
- TypeScript：99.1%
- HTML：0.9%

---

## 🚀 本地运行

### 环境要求
- Node.js

### 安装依赖
```bash
npm install
````

### 配置 API Key

在 `.env.local` 文件中设置：

```env
GEMINI_API_KEY=your_api_key_here
```

### 启动开发

```bash
npm run dev
```

---

## 📖 详细使用说明

### 1. 初始设置

#### 1.1 配置 API 密钥

首次使用时，需要配置 AI 翻译功能的 API 密钥：

1. 点击左侧导航栏的 **"设置"** 按钮
2. 在 **"API 配置"** 区域选择服务提供商：
   - **智谱 GLM**：适合中国用户，免费额度较多
   - **Google Gemini**：全球通用，免费配额充足
   - **OpenAI / 本地**：支持 OpenAI API 或本地部署的 LLM
3. 点击 **"点击获取 API Key"** 链接，前往对应平台注册并获取密钥
4. 将 API Key 粘贴到输入框中
5. （可选）填写用户名、模型名称等信息
6. 勾选 **"记住 API Key"** 以便下次自动加载
7. 点击 **"保存配置"** 按钮

**注意**：所有 API Key 都存储在浏览器本地，不会上传到任何服务器。

#### 1.2 调整搜索设置

在设置页面还可以调整：
- **模糊搜索阈值**：数值越低，匹配越严格（0.0 为精确匹配）
- **自动发音**：搜索结果出现时自动播放英文发音
- **自动复制**：自动将最佳匹配结果复制到剪贴板

---

### 2. 核心功能使用

#### 2.1 词库查找（快速查询单个术语）

**使用场景**：快速查询单个医学术语的翻译

**操作步骤**：
1. 点击左侧导航栏的 **"词库查找"** 按钮
2. 在搜索框中输入：
   - 中文术语（例如：感冒）
   - 英文术语（例如：Common Cold）
   - 拼音全拼（例如：ganmao）
   - 拼音首字母（例如：gm）
3. 系统会实时显示匹配结果，标注最佳匹配
4. 每个结果卡片显示：
   - 中英文对照
   - 拼音标注
   - 分类标签
   - 使用场景
   - 易混淆词汇警告
5. 点击 **"发音"** 按钮可朗读英文术语
6. 点击 **"复制"** 按钮可复制术语对照
7. 点击 ⭐ 图标可收藏该术语

**智能建议**：
- 如果输入有拼写错误，系统会显示 **"您是不是要找："** 提示最相似的术语

**添加新术语**：
- 如果搜索无结果，点击 **"添加到我的词典"** 按钮可快速添加新术语

---

#### 2.2 翻译助手（AI 驱动的全文翻译）

**使用场景**：翻译完整的医学文档、段落或句子

**操作步骤**：

1. 点击左侧导航栏的 **"翻译"** 按钮
2. 在左侧编辑区输入或粘贴医学文本
3. 选择翻译模式：
   - **极速模式**：单次 AI 调用，快速翻译
   - **专家模式**：多步骤工作流（初稿 → 专家审校 → 最终润色），适合高精度要求的文档
4. 点击 **"立即翻译"** 按钮
5. 系统会自动：
   - 检测文本中的医学术语（显示在右上角）
   - 调用 AI 进行翻译
   - 在右侧显示翻译结果
   - 高亮标注已识别的医学术语

**查看术语详情**：
- 切换到 **"分析"** 模式查看术语高亮
- 点击高亮的术语可查看其详细定义
- 双击术语可跳转到词典查看完整信息

**专家模式特色**：
- 翻译完成后，点击 **"专家级改进建议"** 可查看 AI 的审校意见和改进建议

**Token 估算**：
- 系统会在左下角显示预估的 Token 数量和预计费用提示

---

#### 2.3 批量翻译

**使用场景**：一次性翻译大量术语列表

**操作步骤**：

1. 点击左侧导航栏的 **"批量"** 按钮
2. 在左侧输入框中粘贴术语列表（每行一个）
3. 点击 **"开始处理"** 按钮
4. 系统会自动：
   - 优先从本地词库匹配
   - 对未匹配项使用 AI 翻译
   - 实时显示处理进度
5. 右侧显示翻译结果，每项标注来源：
   - 📖 图标：词库匹配
   - ✨ 图标：AI 翻译
6. 点击 **"导出 Excel"** 按钮可将结果导出为 Excel 文件

**注意**：
- 如果未配置 API，批量翻译仅支持词库匹配
- 配置 API 后，支持混合模式（词库 + AI）

---

#### 2.4 词库管理

**使用场景**：查看系统词库、管理个人词库

**操作步骤**：

1. 点击左侧导航栏的 **"词库添加"** 按钮
2. 选择标签页：
   - **系统词库**：查看内置的医学术语库
   - **我的词库**：管理个人添加的术语

**添加术语**（在"我的词库"标签下）：
1. 点击 **"添加术语"** 按钮
2. 填写表单：
   - **中文术语**（必填）
   - **英文定义**（必填）
   - **全拼 / 拼音首字母**（自动生成）
   - **别名 / 同义词**（用逗号分隔）
   - **分类**（如：内科、外科等）
   - **备注**（用法说明）
3. 点击 **"保存术语"** 按钮

**编辑术语**：
- 点击术语卡片右上角的 ✏️ 图标进行编辑

**删除术语**：
- 点击术语卡片右上角的 🗑️ 图标删除

**查看详情**：
- 点击术语卡片可打开详情弹窗，查看完整信息

**导入/导出**：
- 点击 **"导入 JSON"** 按钮可批量导入术语（支持 JSON 格式）
- 点击 **"导出 JSON"** 按钮可导出个人词库备份
- 点击 **❓ 帮助图标**可查看导入助手，使用 ChatGPT/Claude 将 Excel 转换为 JSON

**排序与筛选**：
- 系统词库支持按中文拼音或英文字母排序
- 我的词库支持搜索框实时筛选

---

#### 2.5 收藏夹

**使用场景**：快速访问常用术语

**操作步骤**：

1. 在任何术语结果中点击 ⭐ 图标收藏
2. 点击左侧导航栏的 **"收藏"** 按钮查看所有收藏的术语
3. 点击收藏的术语卡片可查看详情
4. 点击术语卡片可跳转到词典查看完整信息
5. 点击 🗑️ 图标可取消收藏

---

#### 2.6 搜索历史

**使用场景**：回顾最近的搜索记录

**操作步骤**：

1. 点击左侧导航栏的 **"历史"** 按钮
2. 查看最近的搜索记录（按时间倒序）
3. 每条记录显示：
   - 搜索关键词
   - 匹配结果
   - 搜索时间
4. 点击 **"清空历史"** 按钮可清除所有历史记录

---

### 3. 高级功能

#### 3.1 划词翻译

**功能说明**：在翻译助手中选中文本后，可快速翻译选中内容

**使用方法**：
1. 在网页上选中任意文本
2. 会自动弹出翻译按钮
3. 点击按钮后自动跳转到翻译器并填充查询

---

#### 3.2 术语对齐

**功能说明**：AI 翻译时会自动标注原文和译文中的术语对应关系

**使用方法**：
1. 在翻译助手中完成翻译
2. 切换到"分析"模式
3. 鼠标悬停在高亮术语上，原文和译文中对应的术语会同时高亮

---

#### 3.3 多语言支持

**切换语言**：
1. 点击右上角的 **"语言"** 下拉菜单
2. 选择"中文"或"English"
3. 整个界面会切换语言（数据不受影响）

---

### 4. 数据管理与安全

#### 4.1 数据存储

- **存储位置**：所有数据（用户词库、收藏、历史、API Key）都存储在浏览器的 `localStorage` 中
- **数据安全**：数据不会上传到任何服务器，100% 客户端运行
- **隐私保护**：API Key 仅用于调用第三方 AI 服务，不会被本应用收集

#### 4.2 数据备份

**建议定期备份个人词库**：

1. 进入"词库添加"页面
2. 切换到"我的词库"标签
3. 点击"导出 JSON"按钮
4. 将导出的 JSON 文件保存到本地或云盘

**恢复数据**：
1. 点击"导入 JSON"按钮
2. 选择之前导出的 JSON 文件
3. 系统会自动合并导入的数据（不会覆盖现有数据）

#### 4.3 清除数据

**清除浏览器缓存会导致所有数据丢失！**

如需完全清除数据：
1. 在浏览器设置中清除该网站的 Cookie 和缓存
2. 或者在开发者工具中清除 `localStorage`

---

### 5. 常见问题 (FAQ)

#### 5.1 AI 翻译不可用？

**原因**：未配置 API Key 或 API Key 无效

**解决方案**：
1. 进入"设置"页面配置有效的 API Key
2. 确认 API Key 有足够的配额
3. 检查网络连接是否正常
4. 尝试切换不同的服务提供商

---

#### 5.2 搜索结果不准确？

**原因**：模糊搜索阈值设置不当

**解决方案**：
1. 进入"设置"页面
2. 调整"模糊搜索阈值"
3. 数值越小匹配越严格（0.0 为精确匹配）
4. 推荐值：0.3

---

#### 5.3 如何批量导入现有词库？

**方法 1：使用 AI 辅助转换**

1. 准备 Excel 或 CSV 文件（包含中文、英文列）
2. 进入"词库添加"页面，点击"❓ 帮助图标"
3. 复制提示词 1，在 ChatGPT/Claude 中运行
4. 将 Excel 数据粘贴给 AI，生成 JSON
5. 复制提示词 2，让 AI 补充拼音和别名
6. 将最终 JSON 保存为文件
7. 点击"导入 JSON"按钮导入

**方法 2：手动编写 JSON**

参考格式：
```json
[
  {
    "chinese_term": "感冒",
    "english_term": "Common Cold",
    "pinyin_full": "gan mao",
    "pinyin_first": "gm",
    "category": "内科",
    "note": "常见的上呼吸道感染",
    "related_terms": ["伤风", "上感"]
  }
]
```

---

#### 5.4 翻译质量不理想？

**建议**：
1. 使用"专家模式"进行翻译（多步骤审校）
2. 完善个人词库，添加专业术语
3. 翻译后查看"专家级改进建议"
4. 尝试使用不同的 AI 模型（在设置中配置）

---

#### 5.5 如何提高翻译速度？

**建议**：
1. 使用"极速模式"代替"专家模式"
2. 使用"批量翻译"功能处理大量术语
3. 优先完善本地词库，减少 AI 调用
4. 选择响应速度快的 API 提供商

---

### 6. 技术说明

#### 6.1 搜索算法

- **精确匹配**：中文、英文、拼音全拼、拼音首字母的完全匹配
- **模糊搜索**：基于 Fuse.js 的模糊匹配算法
- **别名匹配**：支持术语别名和同义词搜索

#### 6.2 AI 翻译原理

- **术语识别**：正则表达式 + AI 语义分析
- **术语对齐**：AI 生成原文和译文的术语映射关系
- **多步翻译**（专家模式）：
  1. 初稿翻译
  2. 专家 AI 审校
  3. 最终润色
  4. 生成改进建议

#### 6.3 性能优化

- **防抖处理**：搜索框输入有 300ms 延迟，避免频繁查询
- **分页加载**：词典列表每页显示 10 条
- **本地优先**：优先使用本地词库，减少 API 调用
- **缓存机制**：API 响应结果会缓存在内存中

---

## 📖 User Guide (English)

### 1. Initial Setup

#### 1.1 Configure API Key

To use AI translation features, you need to configure an API key:

1. Click the **"Settings"** button in the left navigation bar
2. Select a service provider in the **"API Configuration"** section:
   - **Zhipu GLM**: Suitable for users in China, with generous free quota
   - **Google Gemini**: Global access, generous free quota
   - **OpenAI / Local**: Supports OpenAI API or locally deployed LLMs
3. Click **"Get API Key Here"** to visit the provider's platform and obtain a key
4. Paste the API Key into the input field
5. (Optional) Fill in username, model name, etc.
6. Check **"Remember API Key"** to auto-load next time
7. Click **"Save Configuration"**

**Note**: All API Keys are stored locally in your browser and never uploaded to any server.

#### 1.2 Adjust Search Settings

In the Settings page, you can also adjust:
- **Fuzzy Search Threshold**: Lower values = stricter matching (0.0 = exact match)
- **Auto-play Pronunciation**: Automatically speak English terms in search results
- **Auto-copy to Clipboard**: Automatically copy the best match to clipboard

---

### 2. Core Features

#### 2.1 Term Search (Quick Lookup)

**Use Case**: Quickly look up a single medical term

**Steps**:
1. Click **"Term Search"** in the left navigation bar
2. Enter in the search box:
   - Chinese term (e.g., 感冒)
   - English term (e.g., Common Cold)
   - Full pinyin (e.g., ganmao)
   - First-letter pinyin (e.g., gm)
3. The system will display matching results in real-time, marking the best match
4. Each result card shows:
   - Chinese-English pair
   - Pinyin annotation
   - Category tags
   - Usage scenarios
   - Mistranslation warnings
5. Click **"Pronounce"** to hear the English term
6. Click **"Copy"** to copy the term pair
7. Click the ⭐ icon to save the term to favorites

**Smart Suggestions**:
- If you have a typo, the system shows **"Did you mean:"** with the closest match

**Add New Terms**:
- If no results are found, click **"Add to Dictionary"** to quickly add a new term

---

#### 2.2 Translation Assistant (AI-Powered Full-Text Translation)

**Use Case**: Translate complete medical documents, paragraphs, or sentences

**Steps**:

1. Click **"Translate"** in the left navigation bar
2. Enter or paste medical text in the left edit area
3. Choose translation mode:
   - **Fast Mode**: Single AI call, quick translation
   - **Pro Mode**: Multi-step workflow (Draft → Review → Polish), best for high-stakes documents
4. Click **"Translate Now"**
5. The system will automatically:
   - Detect medical terms in the text (shown in the top-right corner)
   - Call AI for translation
   - Display translation results on the right side
   - Highlight identified medical terms

**View Term Details**:
- Switch to **"Analyze"** mode to see highlighted terms
- Click on a highlighted term to view its detailed definition
- Double-click a term to jump to the dictionary for full information

**Pro Mode Features**:
- After translation, click **"Expert Suggestions"** to view AI's review and improvement suggestions

**Token Estimation**:
- The system displays estimated token count and cost hints at the bottom left

---

#### 2.3 Batch Translation

**Use Case**: Translate a large list of terms at once

**Steps**:

1. Click **"Batch"** in the left navigation bar
2. Paste a list of terms in the left input box (one per line)
3. Click **"Start Processing"**
4. The system will automatically:
   - Match from local dictionary first
   - Use AI translation for unmatched items
   - Display processing progress in real-time
5. The right side shows translation results, each marked with source:
   - 📖 icon: Dictionary match
   - ✨ icon: AI translation
6. Click **"Export Excel"** to export results to an Excel file

**Note**:
- Without API configured, batch translation only supports dictionary matching
- With API, supports mixed mode (Dictionary + AI)

---

#### 2.4 Dictionary Management

**Use Case**: View system dictionary, manage personal dictionary

**Steps**:

1. Click **"Add Terms"** in the left navigation bar
2. Select a tab:
   - **System Terms**: View built-in medical term library
   - **My Terms**: Manage personally added terms

**Add Terms** (in "My Terms" tab):
1. Click **"Add Term"** button
2. Fill in the form:
   - **Chinese Term** (required)
   - **English Definition** (required)
   - **Full Pinyin / First Letter** (auto-generated)
   - **Aliases / Synonyms** (comma-separated)
   - **Category** (e.g., Internal Medicine, Surgery)
   - **Note** (usage instructions)
3. Click **"Save Term"**

**Edit Terms**:
- Click the ✏️ icon in the top-right corner of a term card to edit

**Delete Terms**:
- Click the 🗑️ icon in the top-right corner of a term card to delete

**View Details**:
- Click a term card to open a detail popup with full information

**Import/Export**:
- Click **"Import JSON"** to batch import terms (supports JSON format)
- Click **"Export JSON"** to export your personal dictionary backup
- Click the **❓ help icon** to view the import assistant, which helps you convert Excel to JSON using ChatGPT/Claude

**Sort & Filter**:
- System dictionary supports sorting by Chinese pinyin or English alphabetically
- My dictionary supports real-time search filtering

---

#### 2.5 Favorites

**Use Case**: Quick access to frequently used terms

**Steps**:

1. Click the ⭐ icon on any term result to save it
2. Click **"Saved"** in the left navigation bar to view all saved terms
3. Click a saved term card to view details
4. Click a term card to jump to the dictionary for full information
5. Click the 🗑️ icon to remove from favorites

---

#### 2.6 Search History

**Use Case**: Review recent search records

**Steps**:

1. Click **"History"** in the left navigation bar
2. View recent search records (in reverse chronological order)
3. Each record shows:
   - Search keyword
   - Match result
   - Search time
4. Click **"Clear All"** to clear all history

---

### 3. Advanced Features

#### 3.1 Text Selection Translation

**Feature**: Quickly translate selected text in the translation assistant

**Usage**:
1. Select any text on the webpage
2. A translation button will automatically appear
3. Click the button to jump to the translator with the query filled in

---

#### 3.2 Term Alignment

**Feature**: AI translation automatically annotates term correspondences between source and target

**Usage**:
1. Complete a translation in the translation assistant
2. Switch to "Analyze" mode
3. Hover over a highlighted term, and corresponding terms in both source and target will highlight simultaneously

---

#### 3.3 Multi-language Support

**Switch Language**:
1. Click the **"Language"** dropdown in the top-right corner
2. Select "中文" or "English"
3. The entire interface will switch languages (data is not affected)

---

### 4. Data Management & Security

#### 4.1 Data Storage

- **Storage Location**: All data (user dictionary, favorites, history, API Key) is stored in the browser's `localStorage`
- **Data Security**: Data is never uploaded to any server, 100% client-side
- **Privacy Protection**: API Keys are only used to call third-party AI services and are never collected by this application

#### 4.2 Data Backup

**Regularly backup your personal dictionary**:

1. Go to the "Add Terms" page
2. Switch to the "My Terms" tab
3. Click "Export JSON"
4. Save the exported JSON file locally or to cloud storage

**Restore Data**:
1. Click "Import JSON"
2. Select a previously exported JSON file
3. The system will automatically merge imported data (won't overwrite existing data)

#### 4.3 Clear Data

**Clearing browser cache will cause all data loss!**

To completely clear data:
1. Clear cookies and cache for this site in browser settings
2. Or clear `localStorage` in developer tools

---

### 5. FAQ

#### 5.1 AI Translation Not Available?

**Reason**: API Key not configured or invalid

**Solution**:
1. Go to Settings page and configure a valid API Key
2. Ensure the API Key has sufficient quota
3. Check network connection
4. Try switching to a different service provider

---

#### 5.2 Search Results Not Accurate?

**Reason**: Improper fuzzy search threshold setting

**Solution**:
1. Go to Settings page
2. Adjust "Fuzzy Search Threshold"
3. Lower values = stricter matching (0.0 = exact match)
4. Recommended value: 0.3

---

#### 5.3 How to Batch Import Existing Dictionary?

**Method 1: Use AI-Assisted Conversion**

1. Prepare an Excel or CSV file (with Chinese and English columns)
2. Go to "Add Terms" page, click the "❓ help icon"
3. Copy prompt 1 and run it in ChatGPT/Claude
4. Paste your Excel data to AI to generate JSON
5. Copy prompt 2 to have AI add pinyin and aliases
6. Save the final JSON as a file
7. Click "Import JSON" to import

**Method 2: Manually Write JSON**

Reference format:
```json
[
  {
    "chinese_term": "感冒",
    "english_term": "Common Cold",
    "pinyin_full": "gan mao",
    "pinyin_first": "gm",
    "category": "Internal Medicine",
    "note": "Common upper respiratory infection",
    "related_terms": ["伤风", "上感"]
  }
]
```

---

#### 5.4 Translation Quality Not Ideal?

**Suggestions**:
1. Use "Pro Mode" for translation (multi-step review)
2. Improve your personal dictionary with specialized terms
3. Check "Expert Suggestions" after translation
4. Try different AI models (configure in Settings)

---

#### 5.5 How to Improve Translation Speed?

**Suggestions**:
1. Use "Fast Mode" instead of "Pro Mode"
2. Use "Batch Translation" for large volumes
3. Improve local dictionary to reduce AI calls
4. Choose API providers with faster response times

---

### 6. Technical Details

#### 6.1 Search Algorithm

- **Exact Match**: Complete match for Chinese, English, full pinyin, first-letter pinyin
- **Fuzzy Search**: Fuzzy matching based on Fuse.js algorithm
- **Alias Match**: Supports searching by term aliases and synonyms

#### 6.2 AI Translation Principles

- **Term Recognition**: Regular expressions + AI semantic analysis
- **Term Alignment**: AI generates term mapping between source and target
- **Multi-step Translation** (Pro Mode):
  1. Draft translation
  2. Expert AI review
  3. Final polishing
  4. Generate improvement suggestions

#### 6.3 Performance Optimization

- **Debounce**: Search input has 300ms delay to avoid frequent queries
- **Pagination**: Dictionary lists display 10 items per page
- **Local First**: Prioritizes local dictionary to reduce API calls
- **Caching**: API responses are cached in memory

---

## 📄 开源协议

本项目当前未明确声明开源许可证。

```
