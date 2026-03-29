"""
Generate a professional product introduction PDF brochure and social-media JPEG
for RoboHire — AI-powered recruitment platform.

Usage:
    python generate_product_intro.py

Outputs:
    docs/RoboHire-产品介绍.pdf   — Multi-page A4 brochure
    docs/RoboHire-产品介绍.jpg   — 1200×630 social card (WeChat / LinkedIn)
"""

import os
import fitz  # PyMuPDF — for PDF-to-JPEG conversion

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.colors import HexColor, white, Color
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether, Flowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle
from reportlab.graphics import renderPDF

# ═══════════════════════════════════════════════════════════════════
# Font setup
# ═══════════════════════════════════════════════════════════════════
FONT_PATHS = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", "HiraginoSans", 0),
    ("/Library/Fonts/Arial Unicode.ttf", "ArialUnicode", None),
    ("/System/Library/Fonts/STHeiti Light.ttc", "STHeiti", 0),
]

FONT = None
for path, name, subfont_index in FONT_PATHS:
    if os.path.exists(path):
        try:
            if subfont_index is not None:
                pdfmetrics.registerFont(TTFont(name, path, subfontIndex=subfont_index))
            else:
                pdfmetrics.registerFont(TTFont(name, path))
            FONT = name
            break
        except Exception:
            continue

if not FONT:
    raise RuntimeError("No suitable CJK font found")

# ═══════════════════════════════════════════════════════════════════
# Color palette
# ═══════════════════════════════════════════════════════════════════
BLUE_600    = HexColor("#2563eb")
BLUE_700    = HexColor("#1d4ed8")
BLUE_50     = HexColor("#eff6ff")
BLUE_100    = HexColor("#dbeafe")
CYAN_600    = HexColor("#0891b2")
SLATE_900   = HexColor("#0f172a")
SLATE_800   = HexColor("#1e293b")
SLATE_700   = HexColor("#334155")
SLATE_600   = HexColor("#475569")
SLATE_500   = HexColor("#64748b")
SLATE_400   = HexColor("#94a3b8")
SLATE_200   = HexColor("#e2e8f0")
SLATE_100   = HexColor("#f1f5f9")
SLATE_50    = HexColor("#f8fafc")
EMERALD_600 = HexColor("#059669")
EMERALD_50  = HexColor("#ecfdf5")
AMBER_600   = HexColor("#d97706")
AMBER_50    = HexColor("#fffbeb")
ROSE_600    = HexColor("#e11d48")
VIOLET_600  = HexColor("#7c3aed")
WHITE       = HexColor("#ffffff")

# ═══════════════════════════════════════════════════════════════════
# Styles
# ═══════════════════════════════════════════════════════════════════
W = A4[0] - 50 * mm  # usable width

def S(name, **kw):
    """Shorthand for ParagraphStyle with default font."""
    kw.setdefault("fontName", FONT)
    return ParagraphStyle(name, **kw)

s_hero_title = S("HeroTitle", fontSize=28, leading=38, alignment=TA_CENTER, textColor=SLATE_900, spaceAfter=6)
s_hero_sub   = S("HeroSub",   fontSize=13, leading=20, alignment=TA_CENTER, textColor=SLATE_600, spaceAfter=20)
s_badge      = S("Badge",     fontSize=8,  leading=12, alignment=TA_CENTER, textColor=BLUE_600, spaceAfter=10)
s_h1         = S("H1",        fontSize=20, leading=28, textColor=SLATE_900, spaceBefore=4, spaceAfter=6)
s_h1c        = S("H1C",       fontSize=20, leading=28, textColor=SLATE_900, spaceBefore=4, spaceAfter=6, alignment=TA_CENTER)
s_h2         = S("H2",        fontSize=14, leading=20, textColor=SLATE_900, spaceBefore=12, spaceAfter=4)
s_h3         = S("H3",        fontSize=11, leading=16, textColor=BLUE_600,  spaceBefore=8, spaceAfter=3)
s_body       = S("Body",      fontSize=9.5, leading=15, textColor=SLATE_700, spaceAfter=3)
s_body_c     = S("BodyC",     fontSize=10, leading=16, textColor=SLATE_600, alignment=TA_CENTER, spaceAfter=6)
s_bullet     = S("Bullet",    fontSize=9.5, leading=15, textColor=SLATE_700, leftIndent=14, spaceAfter=2)
s_small      = S("Small",     fontSize=8,  leading=12, textColor=SLATE_500, spaceAfter=2)
s_small_c    = S("SmallC",    fontSize=8,  leading=12, textColor=SLATE_500, alignment=TA_CENTER)
s_label      = S("Label",     fontSize=8.5, leading=12, textColor=BLUE_600, spaceAfter=1)
s_stat_val   = S("StatVal",   fontSize=22, leading=26, textColor=BLUE_600, alignment=TA_CENTER)
s_stat_lbl   = S("StatLbl",   fontSize=8,  leading=12, textColor=SLATE_500, alignment=TA_CENTER)
s_table_h    = S("TH",        fontSize=8.5, leading=12, textColor=WHITE)
s_table_b    = S("TB",        fontSize=8.5, leading=13, textColor=SLATE_700)
s_table_b_b  = S("TBBlue",    fontSize=8.5, leading=13, textColor=BLUE_700)
s_footer     = S("Footer",    fontSize=7,  leading=10, textColor=SLATE_400, alignment=TA_CENTER)
s_white_title = S("WTitle",   fontSize=22, leading=30, textColor=WHITE, alignment=TA_CENTER, spaceAfter=6)
s_white_sub  = S("WSub",      fontSize=11, leading=17, textColor=SLATE_400, alignment=TA_CENTER, spaceAfter=20)
s_white_body = S("WBody",     fontSize=10, leading=16, textColor=SLATE_400, alignment=TA_CENTER)
s_pain_title = S("PainTitle", fontSize=10, leading=15, textColor=SLATE_900, spaceAfter=2)
s_pain_body  = S("PainBody",  fontSize=8.5, leading=13, textColor=SLATE_600, spaceAfter=2)
s_step_num   = S("StepNum",   fontSize=24, leading=28, textColor=SLATE_200)
s_step_title = S("StepT",     fontSize=11, leading=16, textColor=SLATE_900, spaceAfter=1)
s_step_sub   = S("StepSub",   fontSize=7,  leading=10, textColor=SLATE_400, spaceAfter=4)
s_step_body  = S("StepBody",  fontSize=8.5, leading=13, textColor=SLATE_600)
s_diff_title = S("DiffTitle", fontSize=12, leading=17, textColor=SLATE_900, spaceAfter=3)
s_diff_body  = S("DiffBody",  fontSize=9,  leading=14, textColor=SLATE_600)

# ═══════════════════════════════════════════════════════════════════
# Custom flowables
# ═══════════════════════════════════════════════════════════════════

class ColorDot(Flowable):
    """A small colored circle used as an icon bullet."""
    def __init__(self, size=8, color=BLUE_600, label=None, label_color=WHITE):
        super().__init__()
        self._size = size
        self._color = color
        self._label = label
        self._label_color = label_color
        self.width = size + 4
        self.height = size + 2

    def draw(self):
        c = self.canv
        r = self._size / 2
        cx, cy = r + 1, r
        c.setFillColor(self._color)
        c.circle(cx, cy, r, fill=1, stroke=0)
        if self._label:
            c.setFillColor(self._label_color)
            c.setFont(FONT, self._size * 0.55)
            c.drawCentredString(cx, cy - self._size * 0.18, self._label)


class RoundedBox(Flowable):
    """A rounded rectangle background behind nested flowables."""
    def __init__(self, flowables, width, bg=SLATE_50, border=SLATE_200, padding=10, radius=6):
        super().__init__()
        self._flowables = flowables
        self._width = width
        self._bg = bg
        self._border = border
        self._padding = padding
        self._radius = radius
        # pre-calc height
        h = 0
        for f in flowables:
            fw, fh = f.wrap(width - 2 * padding, 10000)
            h += fh
        self._content_height = h
        self.width = width
        self.height = h + 2 * padding

    def draw(self):
        c = self.canv
        p = self._padding
        r = self._radius
        c.setFillColor(self._bg)
        c.setStrokeColor(self._border)
        c.setLineWidth(0.5)
        c.roundRect(0, 0, self._width, self.height, r, fill=1, stroke=1)
        y = self.height - p
        for f in self._flowables:
            fw, fh = f.wrap(self._width - 2 * p, 10000)
            y -= fh
            f.drawOn(c, p, y)


class ColorBar(Flowable):
    """A thin gradient-like colored bar."""
    def __init__(self, width, height=3, color=BLUE_600):
        super().__init__()
        self.width = width
        self.height = height
        self._color = color

    def draw(self):
        self.canv.setFillColor(self._color)
        self.canv.roundRect(0, 0, self.width, self.height, 1.5, fill=1, stroke=0)


class DarkBackground(Flowable):
    """Full-width dark background section."""
    def __init__(self, flowables, doc_width, bg=SLATE_900, padding=20):
        super().__init__()
        self._flowables = flowables
        self._doc_width = doc_width
        self._bg = bg
        self._padding = padding
        h = 0
        for f in flowables:
            fw, fh = f.wrap(doc_width - 2 * padding, 10000)
            h += fh
        self._content_height = h
        self.width = doc_width
        self.height = h + 2 * padding

    def draw(self):
        c = self.canv
        p = self._padding
        # extend to full page width
        margin = 25 * mm
        c.setFillColor(self._bg)
        c.rect(-margin, -4, A4[0], self.height + 8, fill=1, stroke=0)
        y = self.height - p
        for f in self._flowables:
            fw, fh = f.wrap(self._doc_width - 2 * p, 10000)
            y -= fh
            f.drawOn(c, p, y)


def hr():
    return HRFlowable(width="100%", thickness=0.5, color=SLATE_200, spaceAfter=8, spaceBefore=8)


# ═══════════════════════════════════════════════════════════════════
# Page template callbacks
# ═══════════════════════════════════════════════════════════════════
def page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT, 7)
    canvas.setFillColor(SLATE_400)
    canvas.drawCentredString(A4[0] / 2, 12 * mm, "RoboHire — AI Screens. AI Interviews. You Hire the Best.  |  robohire.io")
    canvas.restoreState()

def cover_bg(canvas, doc):
    """Draw a subtle gradient-like background on the cover page."""
    canvas.saveState()
    # Light gradient top
    canvas.setFillColor(HexColor("#f0f7ff"))
    canvas.rect(0, A4[1] * 0.55, A4[0], A4[1] * 0.45, fill=1, stroke=0)
    # Blue accent bar at very top
    canvas.setFillColor(BLUE_600)
    canvas.rect(0, A4[1] - 4 * mm, A4[0], 4 * mm, fill=1, stroke=0)
    canvas.restoreState()


# ═══════════════════════════════════════════════════════════════════
# BUILD PDF
# ═══════════════════════════════════════════════════════════════════
OUT_DIR = os.path.join(os.path.dirname(__file__), "docs")
PDF_PATH = os.path.join(OUT_DIR, "RoboHire-产品介绍.pdf")

doc = SimpleDocTemplate(
    PDF_PATH, pagesize=A4,
    leftMargin=25 * mm, rightMargin=25 * mm,
    topMargin=25 * mm, bottomMargin=20 * mm,
)

story = []

# ═══════════════════════════════════════════════════════════════════
# PAGE 1 — COVER
# ═══════════════════════════════════════════════════════════════════
story.append(Spacer(1, 30))
story.append(Paragraph("AI RECRUITING AGENTS", s_badge))
story.append(Spacer(1, 6))
story.append(Paragraph("从需求到录用<br/>全流程 AI 自动化", s_hero_title))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "RoboHire 用 AI Agents 驱动招聘全流程 — 需求澄清、简历筛选、自动邀约、AI 面试、评估决策。<br/>"
    "过去需要 42 天的招聘周期，现在只要几天。",
    s_hero_sub,
))

story.append(Spacer(1, 16))

# Stats row
stat_data = [
    [Paragraph("90%", s_stat_val), Paragraph("10x", s_stat_val), Paragraph("7×24", s_stat_val), Paragraph("7", s_stat_val)],
    [Paragraph("时间节省", s_stat_lbl), Paragraph("筛选效率", s_stat_lbl), Paragraph("全天候服务", s_stat_lbl), Paragraph("种语言支持", s_stat_lbl)],
]
stat_table = Table(stat_data, colWidths=[W / 4] * 4, rowHeights=[30, 16])
stat_table.setStyle(TableStyle([
    ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
    ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
    ("BOX",        (0, 0), (-1, -1), 0.5, SLATE_200),
    ("INNERGRID",  (0, 0), (-1, -1), 0.5, SLATE_200),
    ("BACKGROUND", (0, 0), (-1, -1), WHITE),
    ("TOPPADDING",    (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("ROUNDEDCORNERS", [6, 6, 6, 6]),
]))
story.append(stat_table)

story.append(Spacer(1, 30))
story.append(hr())

# ── Pain points (same page) ──
story.append(Paragraph("招聘，不该这么难", s_h1c))
story.append(Paragraph(
    "招到一个合适的人平均需要 42 天。招聘成本居高不下，HR 团队疲于奔命。",
    s_body_c,
))
story.append(Spacer(1, 10))

pain_points = [
    (VIOLET_600,  "需求不清，反复沟通", "用人部门一句\u201c招个厉害的人\u201d，HR 要来回确认岗位职责和硬性要求，需求澄清本身就耗掉好几天"),
    (BLUE_600,    "简历堆积如山", "一个岗位收到 200+ 份简历，逐份看完要花一整周，但真正匹配的可能只有 10 个人"),
    (AMBER_600,   "面试安排是噩梦", "协调候选人、面试官、会议室，一轮下来两周过去了，优秀候选人早已被竞争对手抢走"),
    (ROSE_600,    "评估全靠\u201c感觉\u201d", "不同面试官标准不一，主观判断多，事后复盘缺乏数据支撑"),
    (EMERALD_600, "重复劳动消耗精力", "80% 的时间花在筛选不合适的人，只有 20% 留给真正重要的沟通和决策"),
    (CYAN_600,    "跨语言招聘更难", "全球化团队需要多语言面试能力，传统方式根本无法覆盖"),
    (ROSE_600,    "小公司没有招聘能力", "初创团队和小微企业没有专职 HR、没有合格面试官，无力配备专业招聘角色，却同样需要找到优秀人才"),
]

pain_rows = []
for i in range(0, len(pain_points), 2):
    row = []
    for j in range(2):
        if i + j < len(pain_points):
            color, title, text = pain_points[i + j]
            cell_content = [
                ColorDot(8, color),
                Paragraph(f"<b>{title}</b>", s_pain_title),
                Paragraph(text, s_pain_body),
            ]
        else:
            cell_content = [Paragraph("", s_body)]
        row.append(cell_content)
    pain_rows.append(row)

col_w = W / 2 - 3
pain_table = Table(pain_rows, colWidths=[col_w, col_w])
pain_table.setStyle(TableStyle([
    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING",    (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING",   (0, 0), (-1, -1), 10),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ("BOX",           (0, 0), (0, 0), 0.5, SLATE_200),
    ("BOX",           (1, 0), (1, 0), 0.5, SLATE_200),
    ("BOX",           (0, 1), (0, 1), 0.5, SLATE_200),
    ("BOX",           (1, 1), (1, 1), 0.5, SLATE_200),
    ("BOX",           (0, 2), (0, 2), 0.5, SLATE_200),
    ("BOX",           (1, 2), (1, 2), 0.5, SLATE_200),
    ("BOX",           (0, 3), (0, 3), 0.5, SLATE_200),
    ("BOX",           (1, 3), (1, 3), 0.5, SLATE_200),
    ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
    ("ROUNDEDCORNERS", [4, 4, 4, 4]),
]))
story.append(pain_table)

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════
# PAGE 2 — SOLUTION: 6-STEP FLOW
# ═══════════════════════════════════════════════════════════════════
story.append(Paragraph("全流程自动化", s_badge))
story.append(Spacer(1, 4))
story.append(Paragraph("六大环节，一键启动", s_h1c))
story.append(Paragraph(
    "RoboHire 的 AI 招聘代理自动驱动每一个环节，你只需做最终决定。",
    s_body_c,
))
story.append(Spacer(1, 12))

steps = [
    ("01", "需求澄清与梳理", "AI Recruiting Consultant",
     "AI 招聘顾问通过对话式交互，帮你快速梳理岗位需求：职责范围、必备技能、经验要求、薪资预期。AI 会追问模糊的地方，10 分钟输出结构化岗位画像。",
     VIOLET_600),
    ("02", "一键创建岗位", "AI JD Generator",
     "基于梳理好的需求，AI 自动生成专业的职位描述（JD），包含岗位职责、任职要求、加分项。你只需确认或微调，一键发布。",
     BLUE_600),
    ("03", "AI 智能简历筛选", "AI Resume Screening Agent",
     "上传简历（支持批量），AI 立即启动。不是关键词匹配 \u2014 AI 真正理解上下文，精准识别匹配度、经验缺口和潜力亮点，几分钟处理 200+ 份简历。",
     EMERALD_600),
    ("04", "自动邀约面试", "Auto Interview Invitation",
     "筛选出的候选人，AI 自动发送面试邀请 \u2014 包含专属面试链接和二维码。候选人无需下载软件，你不需要协调任何人的日程。",
     AMBER_600),
    ("05", "AI 视频面试", "AI Video Interview",
     "AI 面试官 7\u00d724 小时在线，进行结构化视频面试。支持语音实时对话、根据回答智能追问、多语言切换（中/英/日/西/法/葡/德）。",
     ROSE_600),
    ("06", "面试评估与决策", "Multi-Agent Evaluation",
     "自动生成多维度评估报告：技能匹配度、经验分析、优势与短板、录用建议、AI 作弊检测。你只需查看报告，约见最优候选人。",
     BLUE_700),
]

step_rows = []
for i in range(0, len(steps), 2):
    row = []
    for j in range(2):
        if i + j < len(steps):
            num, title, subtitle, text, color = steps[i + j]
            cell = [
                ColorBar(col_w - 20, 3, color),
                Spacer(1, 6),
                Paragraph(f"<font color='#e2e8f0'>{num}</font>", s_step_num),
                ColorDot(14, color, num),
                Spacer(1, 3),
                Paragraph(f"<b>{title}</b>", s_step_title),
                Paragraph(subtitle, s_step_sub),
                Paragraph(text, s_step_body),
            ]
        else:
            cell = [Paragraph("", s_body)]
        row.append(cell)
    step_rows.append(row)

step_table = Table(step_rows, colWidths=[col_w, col_w])
step_table.setStyle(TableStyle([
    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING",    (0, 0), (-1, -1), 10),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ("LEFTPADDING",   (0, 0), (-1, -1), 10),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ("BOX",           (0, 0), (0, 0), 0.5, SLATE_200),
    ("BOX",           (1, 0), (1, 0), 0.5, SLATE_200),
    ("BOX",           (0, 1), (0, 1), 0.5, SLATE_200),
    ("BOX",           (1, 1), (1, 1), 0.5, SLATE_200),
    ("BOX",           (0, 2), (0, 2), 0.5, SLATE_200),
    ("BOX",           (1, 2), (1, 2), 0.5, SLATE_200),
    ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
]))
story.append(step_table)

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════
# PAGE 3 — SCENARIO + COMPARISON TABLE
# ═══════════════════════════════════════════════════════════════════

# ── Scenario section (dark box) ──
scenario_content = [
    Paragraph("真实场景", S("ScBadge", fontSize=8, leading=12, textColor=HexColor("#93c5fd"), alignment=TA_CENTER)),
    Spacer(1, 4),
    Paragraph("从 150 人到 4 人，3 天完成", S("ScTitle", fontSize=18, leading=26, textColor=WHITE, alignment=TA_CENTER)),
    Spacer(1, 12),
    Paragraph(
        '<font color="#60a5fa"><b>周一上午</b></font>，你告诉 AI 招聘顾问\u201c我们需要招一个高级产品经理\u201d。'
        'AI 通过几轮对话帮你梳理清楚岗位要求，自动生成 JD 并发布。你上传了 150 份简历，午饭前 AI 已完成全部筛选，给出 Top 15 的匹配排名。',
        S("ScBody", fontSize=9.5, leading=16, textColor=HexColor("#cbd5e1")),
    ),
    Spacer(1, 6),
    Paragraph(
        '<font color="#22d3ee"><b>周一下午</b></font>，AI 自动向 15 位候选人发送面试邀请，每人收到专属面试链接和二维码。',
        S("ScBody2", fontSize=9.5, leading=16, textColor=HexColor("#cbd5e1")),
    ),
    Spacer(1, 6),
    Paragraph(
        '<font color="#34d399"><b>周三</b></font>，12 人完成了 AI 视频面试，每人都有一份包含技能评估、经验分析、优劣势和录用建议的完整报告。'
        '你只需花半天时间，约见最终 3-4 位候选人做终面。',
        S("ScBody3", fontSize=9.5, leading=16, textColor=HexColor("#cbd5e1")),
    ),
    Spacer(1, 14),
]

# Time comparison bar
time_data = [
    [
        Paragraph("传统方式", S("TBefore", fontSize=9, leading=14, textColor=SLATE_400)),
        Paragraph("→", S("TArrow", fontSize=14, leading=18, textColor=SLATE_500, alignment=TA_CENTER)),
        Paragraph("使用 RoboHire", S("TAfter", fontSize=9, leading=14, textColor=HexColor("#93c5fd"), alignment=TA_RIGHT)),
    ],
    [
        Paragraph("<strike>3 周</strike>", S("TVBefore", fontSize=18, leading=24, textColor=SLATE_500)),
        Paragraph("", s_body),
        Paragraph("<b>3 天</b>", S("TVAfter", fontSize=18, leading=24, textColor=WHITE, alignment=TA_RIGHT)),
    ],
]
time_table = Table(time_data, colWidths=[W * 0.35 - 20, W * 0.3 - 20, W * 0.35 - 20])
time_table.setStyle(TableStyle([
    ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING",    (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING",   (0, 0), (-1, -1), 12),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
    ("BACKGROUND",    (0, 0), (-1, -1), HexColor("#1e3a5f")),
    ("ROUNDEDCORNERS", [6, 6, 6, 6]),
]))
scenario_content.append(time_table)

story.append(DarkBackground(scenario_content, W, bg=SLATE_900, padding=24))
story.append(Spacer(1, 20))

# ── Comparison table ──
story.append(Paragraph("为什么选择 RoboHire？", s_h1c))
story.append(Paragraph("全流程对比，差距一目了然。", s_body_c))
story.append(Spacer(1, 10))

compare_rows_data = [
    ("环节", "传统招聘", "RoboHire"),
    ("需求梳理", "多轮会议，邮件往返", "AI 对话式澄清，10 分钟"),
    ("写 JD", "HR 手写，反复修改", "AI 自动生成，确认即发布"),
    ("筛选 200 份简历", "3–5 天，逐一阅读", "几分钟，自动匹配排序"),
    ("面试邀约", "逐个联系，协调排期", "AI 自动发送，候选人自助"),
    ("初轮面试", "2 周排期，面试官逐个面", "48 小时内，AI 完成全部"),
    ("评估一致性", "不同面试官标准不同", "统一 AI 标准，维度相同"),
    ("覆盖时区", "仅限工作时间", "7×24 小时，全球随时面试"),
    ("语言能力", "受限于面试官语言", "支持 7 种语言"),
    ("综合成本", "高人力 + 猎头费用", "从 \u00a5199/月 起"),
]

table_data = []
for i, (feat, old, robo) in enumerate(compare_rows_data):
    if i == 0:
        table_data.append([
            Paragraph(f"<b>{feat}</b>", S("THF", fontSize=8.5, leading=12, textColor=SLATE_500)),
            Paragraph(f"<b>{old}</b>", S("THO", fontSize=8.5, leading=12, textColor=SLATE_500)),
            Paragraph(f"<b>{robo}</b>", s_table_h),
        ])
    else:
        table_data.append([
            Paragraph(feat, S("TBF", fontSize=8.5, leading=13, textColor=SLATE_900)),
            Paragraph(f"✗  {old}", s_table_b),
            Paragraph(f"✓  {robo}", s_table_b_b),
        ])

cw1, cw2, cw3 = W * 0.22, W * 0.38, W * 0.40
comp_table = Table(table_data, colWidths=[cw1, cw2, cw3])
comp_style = [
    ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING",    (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING",   (0, 0), (-1, -1), 8),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    # Header row
    ("BACKGROUND",  (0, 0), (1, 0), SLATE_50),
    ("BACKGROUND",  (2, 0), (2, 0), BLUE_600),
    # RoboHire column highlight
    ("BACKGROUND",  (2, 1), (2, -1), BLUE_50),
    # Grid
    ("LINEBELOW",   (0, 0), (-1, -1), 0.5, SLATE_200),
    ("LINEAFTER",   (0, 0), (0, -1), 0.5, SLATE_200),
    ("LINEAFTER",   (1, 0), (1, -1), 0.5, SLATE_200),
    ("BOX",         (0, 0), (-1, -1), 0.5, SLATE_200),
    ("ROUNDEDCORNERS", [4, 4, 4, 4]),
]
comp_table.setStyle(TableStyle(comp_style))
story.append(comp_table)

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════
# PAGE 4 — DIFFERENTIATORS + AUDIENCE + PRICING + CTA
# ═══════════════════════════════════════════════════════════════════

story.append(Paragraph("四个关键差异", s_h1c))
story.append(Spacer(1, 6))

diffs = [
    (BLUE_600, "01", "不是工具，是 AI 招聘团队",
     "传统软件只帮你管信息。RoboHire 的 AI Agents 真正替你\u201c干活\u201d：从需求梳理到面试评估，全流程自动驱动。你不是在用一个软件，而是拥有了一支不知疲倦的 AI 招聘团队。"),
    (EMERALD_600, "02", "深度理解，不是表面匹配",
     "普通工具做\u201c关键词匹配\u201d。RoboHire 的 AI 真正理解语义：它能识别\u201c3 年机器学习项目经验\u201d和\u201c精通 TensorFlow\u201d之间的关联，面试中根据回答做实时追问。"),
    (VIOLET_600, "03", "公平、一致、可追溯",
     "每位候选人接受相同标准的评估。没有\u201c面试官心情不好\u201d的变量，没有无意识偏见。所有评估数据可追溯，满足合规审计要求。"),
    (ROSE_600, "04", "大大降低专业招聘门槛",
     "不需要专职 HR，不需要专业面试官，不需要猎头预算。初创团队和小微企业以极低成本拥有完整的 AI 招聘能力。过去只有大公司才负担得起的专业招聘流程，现在人人都能用。"),
]

diff_data = []
for row_start in range(0, len(diffs), 2):
    diff_row = []
    for j in range(2):
        idx = row_start + j
        if idx < len(diffs):
            color, num, title, text = diffs[idx]
            diff_row.append([
                ColorDot(16, color, num),
                Spacer(1, 4),
                Paragraph(f"<b>{title}</b>", s_diff_title),
                Paragraph(text, s_diff_body),
            ])
        else:
            diff_row.append([Paragraph("", s_body)])
    diff_data.append(diff_row)

diff_cw = W / 2 - 3
diff_table = Table(diff_data, colWidths=[diff_cw, diff_cw])
diff_style_cmds = [
    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING",    (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING",   (0, 0), (-1, -1), 10),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
]
for r in range(len(diff_data)):
    for c in range(2):
        idx = r * 2 + c
        if idx < len(diffs):
            diff_style_cmds.append(("BOX", (c, r), (c, r), 0.5, SLATE_200))
diff_table.setStyle(TableStyle(diff_style_cmds))
story.append(diff_table)

story.append(Spacer(1, 14))
story.append(hr())

# ── Audience ──
story.append(Paragraph("谁在用 RoboHire？", s_h1c))
story.append(Spacer(1, 6))

audiences = [
    (ROSE_600,    "初创公司与创业团队", "无专职HR，极低成本拥有AI招聘能力"),
    (BLUE_600,    "快速成长的科技公司", "同时开 10+ 岗位，需要规模化筛选"),
    (CYAN_600,    "跨国企业",          "多语言面试，统一评估标准"),
    (AMBER_600,   "猎头与 RPO",        "大量初筛，提高人效比"),
    (EMERALD_600, "中小企业",          "低成本专业招聘方案"),
]

def _aud_cell(i, color, title, text):
    return [
        ColorDot(16, color, f"0{i+1}"),
        Spacer(1, 4),
        Paragraph(f"<b>{title}</b>", S(f"ATitle{i}", fontSize=9.5, leading=14, textColor=SLATE_900, alignment=TA_CENTER)),
        Paragraph(text, S(f"AText{i}", fontSize=8, leading=12, textColor=SLATE_600, alignment=TA_CENTER)),
    ]

empty_cell = [Paragraph("", s_body)]
aud_rows = []
for row_start in range(0, len(audiences), 3):
    row = []
    for j in range(3):
        idx = row_start + j
        if idx < len(audiences):
            color, title, text = audiences[idx]
            row.append(_aud_cell(idx, color, title, text))
        else:
            row.append(empty_cell)
    aud_rows.append(row)

aud_cw = W / 3 - 2
aud_table = Table(aud_rows, colWidths=[aud_cw] * 3)
aud_style_cmds = [
    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
    ("TOPPADDING",    (0, 0), (-1, -1), 10),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
]
for r in range(len(aud_rows)):
    for c in range(3):
        idx = r * 3 + c
        if idx < len(audiences):
            aud_style_cmds.append(("BOX", (c, r), (c, r), 0.5, SLATE_200))
aud_table.setStyle(TableStyle(aud_style_cmds))
story.append(aud_table)

story.append(Spacer(1, 14))
story.append(hr())

# ── Pricing ──
story.append(Paragraph("灵活定价，按需选择", s_h1c))
story.append(Spacer(1, 6))

pricing_header = [
    Paragraph("<b>方案</b>", s_table_h),
    Paragraph("<b>价格</b>", s_table_h),
    Paragraph("<b>适合</b>", s_table_h),
    Paragraph("<b>核心权益</b>", s_table_h),
]

pricing_data = [
    pricing_header,
    [
        Paragraph("Starter", s_table_b),
        Paragraph("<b>\u00a5199</b>/月", s_table_b_b),
        Paragraph("小团队起步", s_table_b),
        Paragraph("1 席位，15 场面试/月，30 次简历匹配", s_table_b),
    ],
    [
        Paragraph("Growth", s_table_b),
        Paragraph("<b>\u00a51,399</b>/月", s_table_b_b),
        Paragraph("成长期团队", s_table_b),
        Paragraph("不限席位，120 场面试/月，6 语言面试", s_table_b),
    ],
    [
        Paragraph("<b>Business</b>", s_table_b_b),
        Paragraph("<b>\u00a52,799</b>/月", s_table_b_b),
        Paragraph("规模化招聘", s_table_b),
        Paragraph("不限席位，280 场面试/月，高级分析，作弊检测", s_table_b),
    ],
    [
        Paragraph("Enterprise", s_table_b),
        Paragraph("<b>定制</b>", s_table_b_b),
        Paragraph("大型企业", s_table_b),
        Paragraph("无限量，定制流程，专属客户经理", s_table_b),
    ],
]

pcw = [W * 0.15, W * 0.15, W * 0.18, W * 0.52]
pricing_table = Table(pricing_data, colWidths=pcw)
pricing_table.setStyle(TableStyle([
    ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING",    (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("LEFTPADDING",   (0, 0), (-1, -1), 8),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ("BACKGROUND",    (0, 0), (-1, 0), BLUE_600),
    ("LINEBELOW",     (0, 0), (-1, -1), 0.5, SLATE_200),
    ("BOX",           (0, 0), (-1, -1), 0.5, SLATE_200),
    # Highlight Business row
    ("BACKGROUND",    (0, 3), (-1, 3), BLUE_50),
]))
story.append(pricing_table)

story.append(Spacer(1, 6))
story.append(Paragraph(
    "也支持按量付费：简历匹配 \u00a53/次，AI 面试 \u00a515/场  |  <b>14 天免费试用，无需信用卡</b>",
    s_small_c,
))

story.append(Spacer(1, 24))

# ── Bottom CTA (dark) ──
cta_content = [
    Spacer(1, 4),
    Paragraph("让 AI 处理 80% 的重复工作", s_white_title),
    Paragraph("你的团队专注于最有价值的 20% — 识别文化契合、做最终的录用决策。", s_white_sub),
    Spacer(1, 8),
    Paragraph("robohire.io  |  免费开始使用  |  预约产品演示", S("CtaLinks", fontSize=10, leading=16, textColor=HexColor("#93c5fd"), alignment=TA_CENTER)),
    Spacer(1, 10),
    Paragraph(
        "14 天免费试用  ·  无需信用卡  ·  即刻开始",
        S("CtaPills", fontSize=8, leading=12, textColor=SLATE_500, alignment=TA_CENTER),
    ),
    Spacer(1, 8),
    Paragraph(
        "RoboHire — AI Screens. AI Interviews. You Hire the Best.",
        S("CtaTag", fontSize=8, leading=12, textColor=SLATE_500, alignment=TA_CENTER),
    ),
]

story.append(DarkBackground(cta_content, W, bg=SLATE_900, padding=28))

# ═══════════════════════════════════════════════════════════════════
# Build PDF
# ═══════════════════════════════════════════════════════════════════
doc.build(story, onFirstPage=cover_bg, onLaterPages=page_footer)
print(f"✓ PDF generated: {PDF_PATH}")


# ═══════════════════════════════════════════════════════════════════
# Generate social card JPEG (1200×630)
# ═══════════════════════════════════════════════════════════════════
CARD_PDF = os.path.join(OUT_DIR, "_social_card_tmp.pdf")
CARD_W, CARD_H = 1200, 630  # pixels at 72 DPI → points

from reportlab.lib.pagesizes import landscape
from reportlab.pdfgen import canvas as pdf_canvas

c = pdf_canvas.Canvas(CARD_PDF, pagesize=(CARD_W, CARD_H))

# ── Background ──
# Dark gradient base
c.setFillColor(SLATE_900)
c.rect(0, 0, CARD_W, CARD_H, fill=1, stroke=0)

# Subtle blue glow top-right
c.saveState()
c.setFillColor(HexColor("#1e3a5f"))
c.circle(CARD_W * 0.8, CARD_H * 0.7, 280, fill=1, stroke=0)
c.restoreState()

# Subtle cyan glow bottom-left
c.saveState()
c.setFillColor(HexColor("#0c2d48"))
c.circle(CARD_W * 0.15, CARD_H * 0.2, 220, fill=1, stroke=0)
c.restoreState()

# Blue accent bar at top
c.setFillColor(BLUE_600)
c.rect(0, CARD_H - 6, CARD_W, 6, fill=1, stroke=0)

# ── Logo / brand ──
c.setFont(FONT, 14)
c.setFillColor(WHITE)
c.drawString(60, CARD_H - 50, "RoboHire")
c.setFont(FONT, 9)
c.setFillColor(SLATE_400)
c.drawString(160, CARD_H - 50, "AI Recruiting Agents")

# ── Main headline ──
c.setFont(FONT, 38)
c.setFillColor(WHITE)
c.drawString(60, CARD_H - 140, "从需求到录用")

# Gradient-like effect for second line (use blue)
c.setFillColor(HexColor("#60a5fa"))
c.drawString(60, CARD_H - 190, "全流程 AI 自动化")

# ── Subtitle ──
c.setFont(FONT, 14)
c.setFillColor(HexColor("#94a3b8"))
c.drawString(60, CARD_H - 240, "AI 筛选简历  ·  AI 视频面试  ·  自动评估报告  ·  7×24 全天候")

# ── 6 step pills ──
pill_y = CARD_H - 310
pill_x = 60
pill_labels = ["需求澄清", "创建岗位", "简历筛选", "自动邀约", "AI 面试", "评估决策"]
pill_colors = [VIOLET_600, BLUE_600, EMERALD_600, AMBER_600, ROSE_600, BLUE_700]

for i, (label, color) in enumerate(zip(pill_labels, pill_colors)):
    pw = 120
    ph = 32
    # pill background
    c.setFillColor(color)
    c.roundRect(pill_x, pill_y, pw, ph, 8, fill=1, stroke=0)
    # step number
    c.setFont(FONT, 8)
    c.setFillColor(HexColor("#ffffffcc"))
    c.drawString(pill_x + 10, pill_y + 12, f"0{i + 1}")
    # label
    c.setFont(FONT, 11)
    c.setFillColor(WHITE)
    c.drawString(pill_x + 30, pill_y + 10, label)
    pill_x += pw + 12

# ── Stats row ──
stat_y = CARD_H - 410
stats = [("90%", "时间节省"), ("10x", "筛选效率"), ("7\u00d724", "全天候"), ("7 种", "语言支持"), ("\u00a5199", "起/月")]
stat_x = 60
for val, lbl in stats:
    c.setFont(FONT, 26)
    c.setFillColor(HexColor("#60a5fa"))
    c.drawString(stat_x, stat_y, val)
    c.setFont(FONT, 9)
    c.setFillColor(SLATE_400)
    c.drawString(stat_x, stat_y - 18, lbl)
    stat_x += 155

# ── Bottom tagline ──
c.setFont(FONT, 10)
c.setFillColor(SLATE_500)
c.drawString(60, 40, "AI Screens. AI Interviews. You Hire the Best.")
c.setFillColor(HexColor("#60a5fa"))
c.drawString(60, 22, "robohire.io  |  14 天免费试用")

# ── Right-side visual: connecting flow arrows ──
rx = CARD_W - 180
ry = CARD_H - 100
c.setStrokeColor(HexColor("#334155"))
c.setLineWidth(1)
for i in range(5):
    y1 = ry - i * 55
    y2 = y1 - 40
    # dot
    c.setFillColor(pill_colors[i] if i < len(pill_colors) else BLUE_600)
    c.circle(rx, y1, 5, fill=1, stroke=0)
    # line down
    if i < 4:
        c.setStrokeColor(HexColor("#334155"))
        c.line(rx, y1 - 6, rx, y2 + 6)
# last dot
c.setFillColor(BLUE_700)
c.circle(rx, ry - 5 * 55, 5, fill=1, stroke=0)

# ── QR code placeholder (right corner) ──
qr_x, qr_y, qr_s = CARD_W - 120, 20, 80
c.setFillColor(WHITE)
c.roundRect(qr_x, qr_y, qr_s, qr_s, 6, fill=1, stroke=0)
c.setFont(FONT, 8)
c.setFillColor(SLATE_500)
c.drawCentredString(qr_x + qr_s / 2, qr_y + qr_s / 2 + 4, "扫码")
c.drawCentredString(qr_x + qr_s / 2, qr_y + qr_s / 2 - 10, "了解更多")

c.save()

# ── Convert to JPEG via PyMuPDF ──
JPG_PATH = os.path.join(OUT_DIR, "RoboHire-产品介绍.jpg")

pdf_doc = fitz.open(CARD_PDF)
page = pdf_doc[0]
# Render at 2x for high quality (2400×1260 pixels)
mat = fitz.Matrix(2.0, 2.0)
pix = page.get_pixmap(matrix=mat)
pix.save(JPG_PATH)
pdf_doc.close()

# Clean up temp file
os.remove(CARD_PDF)
print(f"✓ JPEG generated: {JPG_PATH}")
print(f"\nDone! Files are in {OUT_DIR}/")
