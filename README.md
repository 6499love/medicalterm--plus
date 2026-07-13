# MediTerm Glass Pro

> 面向医疗器械与医学内容工作的本地优先型术语库、双语翻译助手和批量处理工具。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-CDN-06B6D4?logo=tailwindcss&logoColor=white)
![Tesseract.js](https://img.shields.io/badge/OCR-Tesseract.js-5A67D8)
![License](https://img.shields.io/badge/License-Not_specified-lightgrey)

## 在线体验

- 产品网站：[www.meditermglasspro.icu](https://www.meditermglasspro.icu/)
- GitHub 仓库：[6499love/medicalterm--plus](https://github.com/6499love/medicalterm--plus)

## 项目简介

**MediTerm Glass Pro** 是一个面向医疗器械、重症医学和专业资料制作场景的中英双语术语工具。

它不只是一个“输入一句、翻译一句”的普通翻译器，更像是：

- 一本可以持续补充的医学术语本；
- 一套帮助团队统一译法的翻译记忆库；
- 一个优先使用专业词库、再调用 AI 的翻译助手。

普通翻译工具像是每次临时问路；MediTerm Glass Pro 更像是先把常用路线画进地图，下一次直接沿着统一路线走。

## 为什么做这个项目

医疗器械资料翻译的难点，往往不是完全翻不出来，而是同一个术语在不同材料中反复变化：

- 彩页、说明书、PPT 和视频脚本中的译法不一致；
- 医学术语、产品功能名和公司内部叫法混在一起；
- AI 翻译语言流畅，但可能没有遵循既定术语；
- 查过的词没有沉淀，下次仍要重新确认；
- 长文本中很难快速发现哪些内容已经命中词库；
- Excel、截图和批量术语表需要重复整理。

本项目希望把“查词、翻译、校对、沉淀词库”放进同一套工作流中。

## 核心功能

| 模块 | 主要能力 |
|---|---|
| 翻译助手 | 中英自动识别、快速模式、专业模式、术语表约束、长文本分段、Token 估算 |
| 分析模式 | 原文与译文术语高亮、双向联动、点击查看对应译法、双击进入词典 |
| 整句匹配 | 对 `term_type === "句子"` 的系统词条进行独立整句匹配，并显示词库参考译文 |
| 术语查询 | 中文、英文、拼音、拼音首字母和模糊搜索 |
| 批量翻译 | 多行处理、词库优先、AI 补充、Excel 导入与导出 |
| 图片 OCR | 上传、拖拽或粘贴图片，识别中英文文字后进入批量翻译 |
| 词库管理 | 系统词库浏览、产品筛选、内容类型筛选、自定义词条增删改 |
| 数据备份 | 用户词典 JSON 导入与导出 |
| 辅助功能 | 收藏、历史记录、发音、一键复制、自动复制设置 |

### 1. AI 翻译助手

翻译助手会先扫描输入文字中的词库术语，再把推荐译法作为术语表交给 AI。

支持两种模式：

- **快速模式**：完成一次术语约束翻译，速度更快、调用次数更少；
- **专业模式**：依次进行初译、审校、润色和术语对齐，更适合重要资料。

当文字较长时，系统会自动分段处理，并显示大致 Token 估算。

### 2. 双语术语联动高亮

进入分析模式后，系统会同时检查原文和译文：

- 完整术语命中后显示高亮；
- 可使用 `coreCN` / `coreEN` 识别核心词；
- 点击术语可查看对应译法；
- 原文与译文中的同一术语可以联动；
- 双击术语可跳转到词典详情；
- `highlight_enabled: false` 的词条仍可搜索，但不会参与正文高亮。

### 3. 整句严格匹配

系统会把整句匹配与普通术语高亮分开处理。

当输入中的完整句子命中系统词库中 `term_type: "句子"` 的条目时：

- 整句显示浅绿色背景；
- 显示“整句匹配”标记；
- 点击后展开词库参考译文；
- 可一键复制词库译文；
- 句子内部原有的术语高亮仍然保留。

匹配时会忽略大小写、空格、常见标点以及全角/半角差异，但仍要求内容位于完整句子边界内。

### 4. 医学术语查询

支持以下检索方式：

- 中文术语；
- 英文术语；
- 完整拼音；
- 拼音首字母；
- 别名和相关表达；
- 模糊关键词。

查询结果会区分系统词库与用户词库，并展示推荐译法、分类、使用场景、词根分析和误译提醒等信息。

### 5. 批量翻译与 Excel

批量翻译适合处理产品参数表、术语清单、PPT 固定表达和说明书字段。

处理逻辑为：

1. 优先使用系统词库和用户词库；
2. 未命中的内容在配置 API 后交给 AI 翻译；
3. 保留每一条结果的来源；
4. 支持导出为 `.xlsx` 文件。

也可以直接导入 Excel，系统会读取第一个工作表的第一列内容。

### 6. 图片 OCR

批量翻译页面集成了 Tesseract.js，可识别中文简体和英文。

支持：

- 选择本地图片；
- 将图片拖入页面；
- 从剪贴板直接粘贴截图；
- 预览并修改识别结果；
- 将识别文字加入批量翻译输入框。

支持的常见格式包括 PNG、JPG、JPEG 和 WebP。

### 7. 系统词库与用户词典

当前系统词库采用统一入口管理，并包含通用词库以及以下专业方向：

- 病床；
- 高流量与压缩机；
- 微循环；
- 其他医疗器械与医学表达。

系统词条可按产品和内容类型筛选。内容类型包括：

- 术语；
- 词语 / 短语；
- 句子；
- 标语；
- 参数。

用户可以创建自己的词条，并通过 JSON 文件进行导入、导出和备份。

## 支持的 AI 服务

| 服务 | 默认配置 |
|---|---|
| Google Gemini | `gemini-2.5-flash` |
| 智谱 GLM | `glm-4-flash` |
| 百度千帆 | `ernie-4.0-8k` |
| OpenAI Compatible | 自定义 Base URL 与模型名称 |

> 不配置 API Key 时，术语查询、词典管理、收藏、历史记录、OCR 和词库匹配仍可使用；AI 翻译相关功能不可用。

## 数据与隐私

项目采用本地优先设计：

- 用户词典保存在浏览器 LocalStorage；
- 收藏和历史记录保存在浏览器 LocalStorage；
- 翻译助手输入内容可保存在当前浏览器；
- API 配置由用户自行填写；
- 当前不依赖后端数据库，也不需要注册账号。

需要注意：

- 清除浏览器数据、更换浏览器或更换设备后，本地数据不会自动同步；
- 建议定期导出用户词典；
- 使用 AI 翻译时，原文会发送给你选择的第三方模型服务；
- 不建议在公共电脑上保存 API Key；
- 前端项目无法安全隐藏部署时写入的密钥，不要把生产密钥直接打包进公开网站。

## 技术栈

- React 19
- TypeScript 5.8
- Vite 6
- Tailwind CSS（CDN）
- Zustand
- Fuse.js
- pinyin-pro
- Tesseract.js
- SheetJS / XLSX
- Lucide React
- Google GenAI SDK
- Web Speech API
- LocalStorage

## 本地运行

### 环境要求

- Node.js 18 或更高版本
- npm

### 1. 克隆仓库

```bash
git clone https://github.com/6499love/medicalterm--plus.git
cd medicalterm--plus
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发环境

```bash
npm run dev
```

默认开发地址：

```text
http://localhost:3000
```

### 4. 构建生产版本

```bash
npm run build
```

### 5. 预览构建结果

```bash
npm run preview
```

## Gemini 本地环境变量（可选）

本地开发时，可以在项目根目录创建 `.env.local`：

```env
GEMINI_API_KEY=your_gemini_api_key
```

该配置会被打包到前端代码中，只适合个人本地开发或受控环境。公开部署时，请不要通过这种方式写入需要保密的生产密钥。

也可以直接在应用的“设置”页面填写模型服务和 API Key。

## 项目结构

```text
medicalterm--plus/
├─ components/                 # 页面与交互组件
│  ├─ TranslationAssistant.tsx # AI 翻译与分析模式
│  ├─ Translator.tsx           # 单条术语查询
│  ├─ BatchTranslation.tsx     # 批量翻译、Excel 与 OCR
│  └─ UserDictionary.tsx       # 系统词库和用户词典
├─ data/terms/                 # 分类词库
│  ├─ index.ts                 # 系统词库统一入口
│  ├─ bed_terms.ts
│  ├─ humidifier_terms.ts
│  └─ microcirculation_terms.ts
├─ services/
│  ├─ search.ts                # 检索与模糊匹配
│  ├─ textProcessing.ts        # 高亮、整句匹配与翻译流程
│  ├─ llm.ts                   # 模型服务适配
│  └─ translationChunkUtils.ts # Token 估算与长文本分段
├─ store.ts                    # Zustand 状态与本地持久化
├─ types.ts                    # 类型定义
├─ App.tsx                     # 页面路由入口
└─ vite.config.ts
```

## 词条数据结构

示例：

```ts
{
  id: "bed_sentence_001",
  chinese_term: "将床头抬高至三十度。",
  english_term: "Elevate the head of the bed to 30 degrees.",
  pinyin_full: "jiang chuang tou tai gao zhi san shi du",
  pinyin_first: "jcttgzssd",
  category: "Electric Hospital Bed",
  note: "用于病床体位调节相关资料。",
  usage_scenario: "产品彩页、操作指南、培训材料",
  root_analysis: "",
  mistranslation_warning: [],
  related_terms: [],
  source: "system",
  product: "病床",
  term_type: "句子",
  coreCN: "床头抬高",
  coreEN: "elevate the head of the bed",
  highlight_enabled: true
}
```

主要字段说明：

| 字段 | 说明 |
|---|---|
| `chinese_term` | 中文标准表达 |
| `english_term` | 英文标准表达 |
| `pinyin_full` | 完整拼音 |
| `pinyin_first` | 拼音首字母 |
| `category` | 专业分类 |
| `note` | 备注说明 |
| `usage_scenario` | 推荐使用场景 |
| `root_analysis` | 词根、缩写或表达拆解 |
| `mistranslation_warning` | 不推荐使用的误译 |
| `related_terms` | 别名或相关表达 |
| `product` | 所属产品线 |
| `term_type` | 术语、词语、句子、标语或参数 |
| `coreCN` / `coreEN` | 用于核心词识别 |
| `highlight_enabled` | 是否参与正文高亮 |
| `source` | 系统词库或用户词库 |

## 可用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 本地预览构建结果 |

## 当前限制

- 用户数据仅保存在当前浏览器，暂不支持跨设备同步；
- OCR 结果会受到截图清晰度、排版和字体影响；
- 第三方模型接口可能受到配额、网络、CORS 和服务可用性的影响；
- AI 翻译不能替代医学、法规和母语专业人员复核；
- 当前仓库尚未配置自动化测试和完整 CI 流程。

## Roadmap

- [x] 中英文术语与拼音检索
- [x] 用户词典与本地持久化
- [x] 收藏和历史记录
- [x] AI 快速翻译与专业翻译
- [x] 原文和译文术语联动高亮
- [x] 整句严格匹配与词库参考译文
- [x] Excel 批量导入与结果导出
- [x] 图片 OCR
- [x] 分类词库统一入口
- [ ] 系统词条审核、版本记录和变更日志
- [ ] CSV / Excel 词库批量导入
- [ ] 团队共享词库与权限管理
- [ ] 跨设备同步与云端备份
- [ ] 更完善的 OCR 裁剪、表格识别和结果校正
- [ ] 自动化测试、Lint 与 GitHub Actions
- [ ] 更安全的服务端 API 代理方案

## 贡献方式

欢迎通过 Issue 或 Pull Request 提交：

- 新的医学或医疗器械词条；
- 现有译法修正；
- 误译提醒和使用场景补充；
- Bug 反馈；
- UI 与交互优化；
- 文档改进。

提交词条时，建议尽量提供：

- 中文标准表达；
- 推荐英文译法；
- 所属产品和分类；
- 内容类型；
- 使用场景；
- 容易出现的错误译法；
- 可供核对的可靠来源。

## 医疗免责声明

本项目用于医学术语查询、资料翻译辅助和内部术语管理，不构成医学建议、临床诊断、法规注册意见、正式认证翻译或产品合规声明。

注册资料、临床文件、风险警示、适应症和对外发布的正式英文材料，应由具备相应资质或专业背景的人员复核。

## License

当前仓库尚未包含明确的 `LICENSE` 文件。

在正式添加开源许可证之前，请勿默认本项目可以被自由复制、商用或重新分发。若计划开放协作，可根据项目目标选择 MIT、Apache-2.0 或其他合适的许可证。

## Author

Created by [6499love](https://github.com/6499love)

Built for medical terminology translation, medical-device content workflows and healthcare documentation support.
