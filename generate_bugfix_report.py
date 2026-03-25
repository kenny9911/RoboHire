"""
Generate the bug fix report PDF for the 5 bugs reported by 刘林 (测试需求反馈-0323).
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ── Font setup ──────────────────────────────────────────────────────
# Register a CJK font that works on macOS
FONT_PATHS = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", "HiraginoSans", 0),
    ("/Library/Fonts/Arial Unicode.ttf", "ArialUnicode", None),
    ("/System/Library/Fonts/STHeiti Light.ttc", "STHeiti", 0),
]

FONT_NAME = None
for path, name, subfont_index in FONT_PATHS:
    if os.path.exists(path):
        try:
            if subfont_index is not None:
                pdfmetrics.registerFont(TTFont(name, path, subfontIndex=subfont_index))
            else:
                pdfmetrics.registerFont(TTFont(name, path))
            FONT_NAME = name
            break
        except Exception:
            continue

if not FONT_NAME:
    raise RuntimeError("No suitable CJK font found on this system")

# ── Styles ──────────────────────────────────────────────────────────
DARK = HexColor("#1a1a2e")
ACCENT = HexColor("#0f3460")
MUTED = HexColor("#555555")
LIGHT_BG = HexColor("#f0f4f8")
BORDER = HexColor("#d0d7de")

title_style = ParagraphStyle(
    "Title", fontName=FONT_NAME, fontSize=20, leading=28,
    alignment=TA_CENTER, textColor=DARK, spaceAfter=4,
)
subtitle_style = ParagraphStyle(
    "Subtitle", fontName=FONT_NAME, fontSize=11, leading=16,
    alignment=TA_CENTER, textColor=MUTED, spaceAfter=20,
)
h2_style = ParagraphStyle(
    "H2", fontName=FONT_NAME, fontSize=14, leading=20,
    textColor=ACCENT, spaceBefore=16, spaceAfter=8,
)
h3_style = ParagraphStyle(
    "H3", fontName=FONT_NAME, fontSize=11, leading=16,
    textColor=DARK, spaceBefore=6, spaceAfter=4,
)
body_style = ParagraphStyle(
    "Body", fontName=FONT_NAME, fontSize=10, leading=15,
    textColor=DARK, spaceAfter=3,
)
bullet_style = ParagraphStyle(
    "Bullet", fontName=FONT_NAME, fontSize=10, leading=15,
    textColor=DARK, leftIndent=16, spaceAfter=2,
)
small_style = ParagraphStyle(
    "Small", fontName=FONT_NAME, fontSize=9, leading=13,
    textColor=MUTED, spaceAfter=2,
)
label_style = ParagraphStyle(
    "Label", fontName=FONT_NAME, fontSize=9, leading=13,
    textColor=ACCENT, spaceAfter=1,
)

# ── Helper ──────────────────────────────────────────────────────────
def hr():
    return HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8, spaceBefore=8)

def bug_section(number, title, priority, description, root_cause, fix, files, scope):
    elements = []
    elements.append(Paragraph(f"Bug {number}: {title}", h2_style))
    elements.append(Paragraph(f"<b>优先级:</b> {priority}", small_style))
    elements.append(Spacer(1, 4))

    elements.append(Paragraph("<b>问题描述</b>", label_style))
    elements.append(Paragraph(description, body_style))
    elements.append(Spacer(1, 4))

    elements.append(Paragraph("<b>根因分析</b>", label_style))
    elements.append(Paragraph(root_cause, body_style))
    elements.append(Spacer(1, 4))

    elements.append(Paragraph("<b>修复方案</b>", label_style))
    if isinstance(fix, list):
        for item in fix:
            elements.append(Paragraph(f"- {item}", bullet_style))
    else:
        elements.append(Paragraph(fix, body_style))
    elements.append(Spacer(1, 4))

    elements.append(Paragraph("<b>修改文件</b>", label_style))
    for f in files:
        elements.append(Paragraph(f"- {f}", bullet_style))
    elements.append(Spacer(1, 4))

    elements.append(Paragraph("<b>影响范围</b>", label_style))
    elements.append(Paragraph(scope, body_style))

    elements.append(hr())
    return elements

# ── Build PDF ───────────────────────────────────────────────────────
OUTPUT = os.path.join(os.path.dirname(__file__), "RoboHire-BugFix-Report-0326.pdf")

doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=25*mm, rightMargin=25*mm,
    topMargin=25*mm, bottomMargin=20*mm,
)

story = []

# Title
story.append(Spacer(1, 10))
story.append(Paragraph("RoboHire 测试反馈修复报告", title_style))
story.append(Paragraph("2026-03-26", subtitle_style))
story.append(Paragraph("针对刘林提交的测试需求反馈 (0323) 的修复方案", subtitle_style))
story.append(hr())

# ── Bug 1 ───────────────────────────────────────────────────────────
story.extend(bug_section(
    1,
    "搜索候选人时仅出来一位候选人",
    "高 (High)",
    "在AI匹配弹窗中搜索职位名称（如\"AI产品销售\"），仅出现一位候选人，且标记名称为简历上传文件名。",
    "前端搜索仅在 name、currentRole、tags 三个字段中进行客户端筛选，未搜索简历全文内容。后端已支持全文搜索参数但前端未使用。",
    "新增防抖服务端搜索（300ms延迟），搜索范围扩展到姓名、职位、标签及简历全文内容。同时更新了 AutoMatchPanel 和 SmartMatching 两个组件。",
    ["AutoMatchPanel.tsx", "SmartMatching.tsx", "8个语言翻译文件 (en, zh, zh-TW, ja, es, fr, pt, de)"],
    "招聘项目匹配弹窗、智能匹配页面的候选人搜索",
))

# ── Bug 2 ───────────────────────────────────────────────────────────
story.extend(bug_section(
    2,
    "智能匹配后的标识不清楚",
    "中 (Medium)",
    "匹配结果的操作按钮（入围、淘汰等）仅显示图标，用户不理解各图标含义。",
    "操作按钮仅使用SVG图标+title提示，用户未悬停时无法识别功能。",
    "为\"入围\"和\"淘汰\"两个主要操作按钮添加可见文字标签，响应式设计（移动端隐藏文字仅显示图标）。",
    ["SmartMatching.tsx", "JobDetail.tsx"],
    "智能匹配结果列表、职位详情匹配结果",
))

# ── Bug 3 ───────────────────────────────────────────────────────────
story.extend(bug_section(
    3,
    "入围功能作用不清楚",
    "低 (Low)",
    "点击\"✓\"显示\"已入围\"，但用户不清楚入围后的流程和作用。",
    "缺少操作说明和反馈提示。",
    [
        "更新入围按钮的悬停提示为\"加入候选名单，进入下一轮筛选\"",
        "入围成功后显示提示消息\"候选人已入围，将进入下一轮筛选\"",
    ],
    ["SmartMatching.tsx", "8个语言翻译文件 (en, zh, zh-TW, ja, es, fr, pt, de)"],
    "智能匹配页面入围操作",
))

# ── Bug 4 ───────────────────────────────────────────────────────────
story.extend(bug_section(
    4,
    "偏好匹配分显示不一致",
    "中 (Medium)",
    "同一岗位的候选人，有的显示偏好匹配分，有的不显示，让用户困惑。",
    "前端条件渲染逻辑仅在候选人有偏好数据且分数&lt;100时才显示该列，无偏好数据时完全隐藏。",
    "始终显示偏好匹配分列。有数据时显示具体分数，无数据时显示\"—\"并通过悬停提示说明\"候选人未填写偏好信息\"。",
    ["SmartMatching.tsx", "8个语言翻译文件 (en, zh, zh-TW, ja, es, fr, pt, de)"],
    "智能匹配结果列表的偏好匹配分显示",
))

# ── Bug 5 ───────────────────────────────────────────────────────────
story.extend(bug_section(
    5,
    "同一候选人同一岗位2次匹配分数差别大",
    "最高 (Highest)",
    "同一候选人匹配同一岗位，两次得分分别为86和65，差距过大，严重影响用户对AI评分的信任。",
    "BaseAgent基类硬编码LLM温度参数为0.7，导致AI输出不确定性高。每次匹配都重新调用LLM，无结果缓存。",
    [
        "在BaseAgent中新增可覆写的 getTemperature() 方法（默认0.7）",
        "在评分相关Agent中覆写为0.1：ResumeMatchAgent、SkillMatchSkill、PreferenceMatchSkill、ExperienceMatchSkill",
        "创意类Agent（如招聘顾问）保持0.7不变",
        "预期重复匹配分数差异从 ±20分 降低到 ±5分 以内",
    ],
    [
        "BaseAgent.ts",
        "ResumeMatchAgent.ts",
        "SkillMatchSkill.ts",
        "PreferenceMatchSkill.ts",
        "ExperienceMatchSkill.ts",
    ],
    "所有AI匹配评分",
))

# ── File Summary ────────────────────────────────────────────────────
story.append(Paragraph("修改文件总览", h2_style))

story.append(Paragraph("<b>Backend</b>", label_style))
for f in [
    "backend/src/agents/BaseAgent.ts",
    "backend/src/agents/ResumeMatchAgent.ts",
    "backend/src/agents/skills/SkillMatchSkill.ts",
    "backend/src/agents/skills/PreferenceMatchSkill.ts",
    "backend/src/agents/skills/ExperienceMatchSkill.ts",
]:
    story.append(Paragraph(f"- {f}", bullet_style))

story.append(Spacer(1, 6))
story.append(Paragraph("<b>Frontend</b>", label_style))
for f in [
    "frontend/src/components/AutoMatchPanel.tsx",
    "frontend/src/pages/product/SmartMatching.tsx",
    "frontend/src/pages/product/JobDetail.tsx",
]:
    story.append(Paragraph(f"- {f}", bullet_style))

story.append(Spacer(1, 6))
story.append(Paragraph("<b>i18n (8个语言文件)</b>", label_style))
story.append(Paragraph("en, zh, zh-TW, ja, es, fr, pt, de", body_style))

story.append(hr())

# ── Verification ────────────────────────────────────────────────────
story.append(Paragraph("验证方式", h2_style))
checks = [
    "后端TypeScript编译通过 (npx tsc --noEmit)",
    "前端构建成功 (npm run build)",
    "手动测试：同一简历/岗位重复匹配，分数差异应在5分以内",
    "手动测试：匹配弹窗搜索职位关键词，应返回更多相关简历",
    "手动测试：所有候选人显示偏好匹配分列（无数据时显示\"—\"）",
    "手动测试：入围/淘汰按钮显示文字标签",
    "手动测试：入围操作后显示成功提示",
]
for i, check in enumerate(checks, 1):
    story.append(Paragraph(f"{i}. {check}", body_style))

# ── Build ───────────────────────────────────────────────────────────
doc.build(story)
print(f"Report generated: {OUTPUT}")
