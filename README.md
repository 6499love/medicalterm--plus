# MediTerm Glass Pro

> 医学术语翻译工具｜Medical terminology translator  
> 一个面向医疗器械、重症医学、产品资料翻译和内部术语管理的本地优先型术语工具。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![LocalStorage](https://img.shields.io/badge/Storage-LocalStorage-blue)
![License](https://img.shields.io/badge/License-TBD-lightgrey)

## 在线体验

- 主域名：[www.meditermglasspro.icu](https://www.meditermglasspro.icu/)
- Vercel 备用访问：[medical-term-translator.vercel.app](https://medical-term-translator.vercel.app/)
- GitHub 仓库：[6499love/medical-term-translator](https://github.com/6499love/medical-term-translator)

## 项目简介

**MediTerm Glass Pro** 是一个医学术语翻译和术语管理工具。

它适合用于医疗器械产品资料、英文彩页、说明书、培训材料、PPT、视频脚本和市场内容制作，帮助用户把常用医学术语、产品术语和内部标准译法沉淀成可复用的词库。

它不是一个“万能 AI 翻译器”，更像一个**自己的医学术语本 + 翻译记忆库**：

- 普通翻译工具像“临时问路”，每次都要重新解释上下文。
- MediTerm Glass Pro 像“自己的术语本”，把固定译法保存下来，下次直接复用。

## 为什么做这个项目

在医疗器械资料翻译中，真正麻烦的往往不是整段文字翻不出来，而是：

- 同一个术语在不同资料里翻译不一致
- 产品功能、临床场景、招标参数里的表达容易写错
- 医学术语、产品术语、公司内部叫法混在一起
- 查完词后没有沉淀，下次还要重新查
- 英文彩页、PPT、说明书、视频脚本之间缺少统一术语库

这个项目的目标是帮助医疗器械相关团队更稳定地管理中英文术语，减少重复查询和重复修正。

## 核心功能

### 1. 医学术语快速查询

支持输入：

- 中文术语
- 英文术语
- 拼音
- 拼音首字母
- 模糊关键词

系统会根据系统词库和用户词库进行匹配，并展示推荐译法。

### 2. 系统词库

项目内置医学相关术语词库，适合沉淀以下内容：

- 医疗器械术语
- 重症医学术语
- 电动病床功能术语
- 血气分析相关术语
- 呼吸治疗相关术语
- 微循环相关术语
- 产品宣传资料常用表达
- 招标参数与说明书常见表达

### 3. 用户自定义词典

用户可以添加自己的术语，包括：

- 中文术语
- 英文译法
- 完整拼音
- 拼音首字母
- 分类
- 备注 / 用法说明

自定义术语保存在浏览器本地，适合逐步建立自己的专业词库。

### 4. 批量翻译

支持多行术语批量查询，每行一个词条。

适合处理：

- 产品参数表
- 招标参数清单
- 彩页术语表
- 说明书字段
- PPT 页面固定词汇
- 视频脚本术语列表

### 5. 收藏与历史记录

支持收藏高频术语，并保存近期查询历史，方便反复使用常见表达。

### 6. 发音与复制

支持英文发音和一键复制结果，方便用于英文资料编写和校对。

### 7. 本地优先

用户自定义词典、收藏、历史记录和设置保存在浏览器本地。

当前核心逻辑不依赖后端数据库，适合个人或小团队快速使用。

> 注意：如果清除浏览器缓存、更换浏览器或更换设备，本地保存的数据可能丢失。建议定期导出或备份重要词库。

## 适用人群

MediTerm Glass Pro 适合：

- 医疗器械市场人员
- 产品经理 / 产品工程师
- 海外资料翻译人员
- 医学内容编辑
- 销售培训资料制作人员
- 需要统一中英文术语的团队

## 典型使用场景

- 产品彩页英文版制作
- 医疗器械说明书术语校对
- 招标参数中英文整理
- PPT / 视频脚本术语统一
- 公司内部术语库沉淀
- 医学器械相关网页、Demo、培训材料制作
- 海外市场内容制作

## 技术栈

- React
- TypeScript
- Vite
- Fuse.js
- Zustand
- Lucide React
- LocalStorage
- Web Speech API

## 本地运行

### 环境要求

请先安装：

- Node.js
- npm

### 1. 克隆项目

```bash
git clone https://github.com/6499love/medical-term-translator.git
cd medical-term-translator
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发环境

```bash
npm run dev
```

启动后，在浏览器中打开终端提示的本地地址。

常见地址为：

```bash
http://localhost:5173
```

### 4. 构建生产版本

```bash
npm run build
```

### 5. 预览构建结果

```bash
npm run preview
```

## 词库数据结构

项目中的术语数据围绕统一结构设计。

示例：

```json
{
  "id": "term_001",
  "chinese_term": "一键PLR位",
  "english_term": "One-button standard PLR position",
  "pinyin_full": "yi jian PLR wei",
  "pinyin_first": "yjplrw",
  "category": "Electric Hospital Bed",
  "note": "用于描述病床一键完成被动抬腿体位。",
  "usage": "适用于产品彩页、功能说明、培训材料。",
  "root_analysis": "PLR = Passive Leg Raising",
  "mistranslation": [
    "One-key PLR location",
    "PLR place"
  ],
  "source": "system",
  "tags": ["PLR", "hospital bed"]
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `id` | 术语 ID |
| `chinese_term` | 中文术语 |
| `english_term` | 推荐英文译法 |
| `pinyin_full` | 完整拼音，用于拼音搜索 |
| `pinyin_first` | 拼音首字母，用于快速检索 |
| `category` | 术语分类 |
| `note` | 备注说明 |
| `usage` | 使用场景 |
| `root_analysis` | 词根、缩写或术语拆解 |
| `mistranslation` | 不推荐使用的错误译法 |
| `source` | 术语来源：系统词库或用户词库 |
| `tags` | 标签 |

## 与普通翻译工具的区别

| 普通翻译工具 | MediTerm Glass Pro |
|---|---|
| 适合临时翻译句子 | 适合沉淀固定术语 |
| 每次都要重新输入上下文 | 可以长期复用标准译法 |
| 结果可能不稳定 | 更强调术语一致性 |
| 不适合管理内部叫法 | 支持用户自定义词典 |
| 更像一次性工具 | 更像个人/团队术语库 |

## 隐私说明

MediTerm Glass Pro 当前采用本地优先设计：

- 用户词典保存在浏览器 LocalStorage
- 查询历史保存在浏览器 LocalStorage
- 收藏记录保存在浏览器 LocalStorage
- 设置项保存在浏览器 LocalStorage
- 不需要登录
- 不需要后端数据库

请注意：

- 清除浏览器缓存可能会删除本地数据
- 更换浏览器后，本地词库不会自动同步
- 正式团队协作场景建议增加导入、导出、版本管理和权限管理能力

## 注意事项

本项目用于医学术语查询、资料翻译辅助和内部术语管理，不构成：

- 医学建议
- 临床诊断意见
- 法规注册意见
- 正式认证翻译
- 产品合规声明

涉及以下内容时，建议由专业人员复核：

- 注册资料
- 临床文件
- 法规文件
- 医疗声明
- 产品适应症
- 风险警示
- 对外发布的正式英文材料

## Roadmap

后续可继续扩展：

- [ ] 增加更多医学器械分类词库
- [ ] 支持 Excel / CSV 批量导入
- [ ] 支持词库导出和备份
- [ ] 支持术语审核流程
- [ ] 支持术语版本管理
- [ ] 支持长文本中的术语识别与高亮
- [ ] 支持中英双语对照导出
- [ ] 支持团队共享词库
- [ ] 支持可选 AI 翻译能力，用于非词库内容辅助翻译

## 贡献方式

欢迎通过 Issue 或 Pull Request 提交：

- 医学术语补充
- 错误译法修正
- 功能建议
- UI 优化建议
- Bug 反馈
- 文档改进

提交术语时，建议尽量包含：

- 中文术语
- 推荐英文译法
- 所属分类
- 使用场景
- 是否有容易误译的表达

## License

当前项目尚未明确开源协议。

如果你希望正式开源，建议后续补充 `LICENSE` 文件。常见选择包括：

- MIT License：更开放，适合工具类项目
- Apache License 2.0：更重视专利授权说明
- GPL：更强调开源传染性

## Author

Created by [6499love](https://github.com/6499love)

Built for medical terminology translation, medical-device content workflows and healthcare documentation support.
