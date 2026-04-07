#!/usr/bin/env python3
"""Generate RoboHire Sales Kit PDF."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, inch
from reportlab.lib.colors import HexColor, white, Color
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Flowable,
)
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ─── Brand Colors ────────────────────────────────────────────────────────────
BLUE = HexColor("#2563EB")
BLUE_DARK = HexColor("#1E40AF")
BLUE_LIGHT = HexColor("#DBEAFE")
PURPLE = HexColor("#7C3AED")
PURPLE_LIGHT = HexColor("#EDE9FE")
DARK = HexColor("#0F172A")
DARK_SOFT = HexColor("#1E293B")
MUTED = HexColor("#64748B")
SLATE100 = HexColor("#F1F5F9")
SLATE50 = HexColor("#F8FAFC")
GREEN = HexColor("#059669")
GREEN_LIGHT = HexColor("#D1FAE5")
AMBER = HexColor("#D97706")
RED = HexColor("#DC2626")
RED_LIGHT = HexColor("#FEE2E2")
WHITE = white

W, H = A4  # 595.27 x 841.89 points

MARGIN_L = 50
MARGIN_R = 50
MARGIN_T = 50
MARGIN_B = 60
CONTENT_W = W - MARGIN_L - MARGIN_R

# ─── Custom Flowables ────────────────────────────────────────────────────────

class ColorBar(Flowable):
    """A colored horizontal bar."""
    def __init__(self, width, height, color):
        super().__init__()
        self.width = width
        self.height = height
        self.color = color

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)

class SectionHeader(Flowable):
    """Section header with colored left accent bar."""
    def __init__(self, text, color=BLUE, width=CONTENT_W):
        super().__init__()
        self.text = text
        self.color = color
        self.w = width
        self.height = 32

    def draw(self):
        c = self.canv
        # Accent bar
        c.setFillColor(self.color)
        c.rect(0, 0, 4, self.height, fill=1, stroke=0)
        # Text
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(14, 8, self.text)

class StatCard(Flowable):
    """Big number stat with label."""
    def __init__(self, number, label, color=BLUE, card_width=120):
        super().__init__()
        self.number = number
        self.label = label
        self.color = color
        self.width = card_width
        self.height = 60

    def draw(self):
        c = self.canv
        # Background
        c.setFillColor(SLATE100)
        c.roundRect(0, 0, self.width, self.height, 6, fill=1, stroke=0)
        # Number
        c.setFillColor(self.color)
        c.setFont("Helvetica-Bold", 22)
        c.drawCentredString(self.width / 2, 28, self.number)
        # Label
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawCentredString(self.width / 2, 12, self.label)

class DarkCallout(Flowable):
    """Dark background callout box with text."""
    def __init__(self, text, width=CONTENT_W, subtext=None):
        super().__init__()
        self.text = text
        self.subtext = subtext
        self.w = width
        self.height = 70 if subtext else 50

    def draw(self):
        c = self.canv
        c.setFillColor(DARK)
        c.roundRect(0, 0, self.w, self.height, 6, fill=1, stroke=0)
        # Accent
        c.setFillColor(PURPLE)
        c.rect(0, 0, 4, self.height, fill=1, stroke=0)
        # Text
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 13)
        y = 35 if self.subtext else 20
        c.drawString(18, y, self.text)
        if self.subtext:
            c.setFillColor(HexColor("#94A3B8"))
            c.setFont("Helvetica", 10)
            c.drawString(18, 16, self.subtext)

class StepItem(Flowable):
    """Numbered step with title and description."""
    def __init__(self, num, title, desc, color=BLUE, width=CONTENT_W):
        super().__init__()
        self.num = num
        self.title = title
        self.desc = desc
        self.color = color
        self.w = width
        self.height = 52

    def draw(self):
        c = self.canv
        # Number circle
        c.setFillColor(self.color)
        c.circle(16, self.height - 18, 14, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(16, self.height - 23, self.num)
        # Title
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(40, self.height - 18, self.title)
        # Description
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 10)
        c.drawString(40, self.height - 36, self.desc)

class DiffCard(Flowable):
    """Differentiator card with accent bar."""
    def __init__(self, title, desc, color=PURPLE, width=CONTENT_W):
        super().__init__()
        self.title = title
        self.desc = desc
        self.color = color
        self.w = width
        self.height = 65

    def draw(self):
        c = self.canv
        # Background
        c.setFillColor(SLATE50)
        c.roundRect(0, 0, self.w, self.height, 4, fill=1, stroke=0)
        # Left accent
        c.setFillColor(self.color)
        c.rect(0, 0, 4, self.height, fill=1, stroke=0)
        # Title
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(16, self.height - 20, self.title)
        # Description - wrap manually
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9.5)
        words = self.desc.split()
        lines = []
        current = ""
        for w in words:
            test = current + " " + w if current else w
            if c.stringWidth(test, "Helvetica", 9.5) < self.w - 30:
                current = test
            else:
                lines.append(current)
                current = w
        if current:
            lines.append(current)
        for i, line in enumerate(lines[:2]):
            c.drawString(16, self.height - 36 - i * 14, line)

class CheckItem(Flowable):
    """Checkmark item for security section."""
    def __init__(self, text, width=CONTENT_W):
        super().__init__()
        self.text = text
        self.w = width
        self.height = 22

    def draw(self):
        c = self.canv
        # Checkmark circle
        c.setFillColor(GREEN_LIGHT)
        c.circle(10, 8, 8, fill=1, stroke=0)
        c.setFillColor(GREEN)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(10, 4, "\u2713")
        # Text
        c.setFillColor(DARK)
        c.setFont("Helvetica", 10.5)
        c.drawString(26, 4, self.text)

# ─── Page templates ──────────────────────────────────────────────────────────

def page_footer(canvas_obj, doc):
    """Add footer to every page."""
    canvas_obj.saveState()
    canvas_obj.setFillColor(MUTED)
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.drawString(MARGIN_L, 30, "RoboHire \u2014 AI-Powered Recruiting for Modern Teams")
    canvas_obj.drawRightString(W - MARGIN_R, 30, f"robohire.io  |  Page {doc.page}")
    # Top accent line
    canvas_obj.setStrokeColor(BLUE)
    canvas_obj.setLineWidth(2)
    canvas_obj.line(0, H, W, H)
    canvas_obj.restoreState()

def title_page(canvas_obj, doc):
    """Custom title page."""
    c = canvas_obj
    c.saveState()

    # Dark background
    c.setFillColor(DARK)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Top blue accent
    c.setFillColor(BLUE)
    c.rect(0, H - 4, W, 4, fill=1, stroke=0)

    # Logo text
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 28)
    c.drawString(MARGIN_L, H - 140, "RoboHire")

    # Main title
    c.setFont("Helvetica-Bold", 40)
    c.drawString(MARGIN_L, H - 240, "AI-Powered Recruiting")
    c.drawString(MARGIN_L, H - 290, "for Modern Teams")

    # Subtitle
    c.setFillColor(HexColor("#94A3B8"))
    c.setFont("Helvetica", 16)
    c.drawString(MARGIN_L, H - 340, "From role brief to final shortlist, hiring moves on autopilot.")

    # Partner badge
    c.setFillColor(BLUE)
    c.roundRect(MARGIN_L, H - 400, 170, 28, 4, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(MARGIN_L + 85, H - 393, "PARTNER SALES KIT")

    # Stats row
    stats = [
        ("90%", "Time Saved"),
        ("3 Days", "Avg. Time-to-Hire"),
        ("7", "Languages"),
        ("24/7", "Availability"),
    ]
    sx = MARGIN_L
    for num, label in stats:
        c.setFillColor(BLUE)
        c.setFont("Helvetica-Bold", 22)
        c.drawString(sx, 140, num)
        c.setFillColor(HexColor("#94A3B8"))
        c.setFont("Helvetica", 9)
        c.drawString(sx, 120, label)
        sx += 125

    # Bottom accent
    c.setFillColor(BLUE)
    c.rect(0, 0, W, 4, fill=1, stroke=0)

    c.restoreState()

# ─── Build PDF ───────────────────────────────────────────────────────────────

def build_pdf():
    output_path = "/Users/kenny/code/RoboHire/docs/RoboHire-Sales-Kit.pdf"

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B,
    )

    # Styles
    s_heading = ParagraphStyle(
        "Heading", fontName="Helvetica-Bold", fontSize=20,
        textColor=DARK, spaceAfter=6, leading=26,
    )
    s_subhead = ParagraphStyle(
        "Subhead", fontName="Helvetica", fontSize=12,
        textColor=MUTED, spaceAfter=14, leading=16,
    )
    s_body = ParagraphStyle(
        "Body", fontName="Helvetica", fontSize=10.5,
        textColor=DARK, leading=16, spaceAfter=8,
    )
    s_body_muted = ParagraphStyle(
        "BodyMuted", fontName="Helvetica", fontSize=10,
        textColor=MUTED, leading=15, spaceAfter=6,
    )
    s_quote = ParagraphStyle(
        "Quote", fontName="Helvetica-Oblique", fontSize=10.5,
        textColor=MUTED, leading=16, leftIndent=20, rightIndent=20,
        spaceAfter=4, spaceBefore=8,
    )
    s_quote_attr = ParagraphStyle(
        "QuoteAttr", fontName="Helvetica-Bold", fontSize=9.5,
        textColor=DARK, leftIndent=20, spaceAfter=12,
    )
    s_small = ParagraphStyle(
        "Small", fontName="Helvetica", fontSize=9,
        textColor=MUTED, leading=13, spaceAfter=4,
    )
    s_label = ParagraphStyle(
        "Label", fontName="Helvetica-Bold", fontSize=9,
        textColor=MUTED, spaceAfter=10, leading=12,
        textTransform="uppercase",
    )

    story = []

    # ── Title Page (handled by template) ──
    story.append(Spacer(1, H - MARGIN_T - MARGIN_B - 20))  # Push past title page
    story.append(PageBreak())

    # ── Page 2: The Problem ──
    story.append(SectionHeader("The Hiring Problem"))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Startups are competing for talent against companies with 10x their recruiting budget. "
        "The result? Great candidates slip away, bad hires cost months of runway, and founders "
        "spend 30% of their time on hiring instead of building.",
        s_body
    ))
    story.append(Spacer(1, 14))

    # Stat cards as a table
    stat_data = [
        [StatCard("42 Days", "Average Time-to-Hire", AMBER),
         StatCard("$15\u201325K", "Agency Fee Per Hire", RED),
         StatCard("30%", "Founder Time on Hiring", BLUE),
         StatCard("3\u20136 Months", "Cost of a Bad Hire", PURPLE)],
    ]
    stat_table = Table(stat_data, colWidths=[CONTENT_W/4]*4, rowHeights=[70])
    stat_table.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(stat_table)
    story.append(Spacer(1, 20))

    problems = [
        ("\u2022  No dedicated recruiter", "Founders are screening resumes at midnight"),
        ("\u2022  No trained interview panel", "Engineers pulled off product work to interview candidates"),
        ("\u2022  No agency budget", "$15\u201325K per hire through recruiters drains startup runway"),
        ("\u2022  No time to wait", "42 days average while competitors close in 2 weeks"),
    ]
    for title, desc in problems:
        story.append(Paragraph(f"<b>{title}</b> \u2014 {desc}", s_body))

    story.append(PageBreak())

    # ── Page 3: Solution Overview ──
    story.append(SectionHeader("What is RoboHire?"))
    story.append(Spacer(1, 12))
    story.append(DarkCallout(
        "An AI recruiting platform that runs the first 80% of hiring autonomously.",
        subtext="From role definition to candidate shortlist \u2014 your team only focuses on the final decision.",
    ))
    story.append(Spacer(1, 16))
    story.append(Paragraph(
        "This is not another ATS dashboard. RoboHire doesn\u2019t just store data \u2014 it moves the work forward.",
        s_body
    ))
    story.append(Spacer(1, 14))

    # Comparison table
    comp_header = [
        Paragraph("<b>Hiring Stage</b>", ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9.5, textColor=WHITE)),
        Paragraph("<b>Traditional</b>", ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9.5, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph("<b>RoboHire</b>", ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9.5, textColor=WHITE, alignment=TA_CENTER)),
    ]
    comp_rows = [
        ["Screen 200 Resumes", "3\u20135 days", "Minutes"],
        ["Interview Scheduling", "2 weeks of back-and-forth", "48 hours, self-serve"],
        ["Evaluation Consistency", "Varies by interviewer", "Unified AI standard"],
        ["Availability", "Business hours only", "24/7, 7 languages"],
        ["Cost per Hire (Agency)", "$15,000\u201325,000", "From $29/month"],
    ]

    s_cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=9.5, textColor=DARK, leading=13)
    s_cell_c = ParagraphStyle("cellc", fontName="Helvetica", fontSize=9.5, textColor=DARK, leading=13, alignment=TA_CENTER)
    s_cell_b = ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=9.5, textColor=BLUE, leading=13, alignment=TA_CENTER)

    table_data = [comp_header]
    for row in comp_rows:
        table_data.append([
            Paragraph(row[0], s_cell),
            Paragraph(row[1], s_cell_c),
            Paragraph(row[2], s_cell_b),
        ])

    comp_table = Table(table_data, colWidths=[CONTENT_W*0.36, CONTENT_W*0.32, CONTENT_W*0.32])
    comp_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), DARK),
        ("BACKGROUND", (0,1), (-1,1), SLATE100),
        ("BACKGROUND", (0,2), (-1,2), WHITE),
        ("BACKGROUND", (0,3), (-1,3), SLATE100),
        ("BACKGROUND", (0,4), (-1,4), WHITE),
        ("BACKGROUND", (0,5), (-1,5), SLATE100),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("GRID", (0,0), (-1,-1), 0.5, HexColor("#E2E8F0")),
    ]))
    story.append(comp_table)

    story.append(PageBreak())

    # ── Page 4: 6-Step Workflow ──
    story.append(SectionHeader("How It Works", PURPLE))
    story.append(Spacer(1, 4))
    story.append(Paragraph("6 steps to your next great hire", s_subhead))
    story.append(Spacer(1, 8))

    steps = [
        ("01", "Clarify the Role", "AI asks the right questions and produces a structured hiring brief in ~10 minutes.", BLUE),
        ("02", "Generate Job Description", "Auto-drafts polished JD with responsibilities, requirements, and benefits.", PURPLE),
        ("03", "Screen Resumes", "Semantic matching ranks all candidates with scores, grades, and clear reasoning.", GREEN),
        ("04", "Invite Candidates", "Auto-send invitations with private links. Candidates self-serve scheduling.", BLUE),
        ("05", "AI Video Interviews", "24/7 structured conversations with intelligent follow-ups. 7 languages.", PURPLE),
        ("06", "Review & Decide", "Structured scorecards with skill fit, experience, risk signals, and recommendations.", GREEN),
    ]
    for num, title, desc, color in steps:
        story.append(StepItem(num, title, desc, color))
        story.append(Spacer(1, 6))

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<i>Your team only handles the final round: culture fit, team dynamics, "
        "and the human judgment that matters most.</i>",
        s_body_muted
    ))

    story.append(PageBreak())

    # ── Page 5: Why Startups Choose RoboHire ──
    story.append(SectionHeader("Why Startups Choose RoboHire", PURPLE))
    story.append(Spacer(1, 14))

    diffs = [
        ("AI Recruiting Team, Not Another Tool",
         "Most software stores information. RoboHire executes work \u2014 role definition, screening, interviews, evaluations move forward autonomously. You\u2019re adding recruiting capacity, not a dashboard.",
         BLUE),
        ("Semantic Intelligence, Not Keywords",
         "Reads context and connects \u201c3 years of ML projects\u201d with \u201cTensorFlow expertise.\u201d Identifies adjacent experience and true depth. Interviews include intelligent real-time follow-ups.",
         PURPLE),
        ("Consistent & Defensible",
         "Every candidate gets the same questions, same rubric, same scoring. No interviewer bias, no mood-dependent variation. Clear audit trail when stakeholders ask \u201cwhy this person?\u201d",
         GREEN),
        ("Enterprise Quality, Startup Price",
         "No recruiter salary. No agency fees. No trained interview panel required. Professional hiring operations starting at $29/month. Scale without adding HR headcount.",
         AMBER),
    ]
    for title, desc, color in diffs:
        story.append(DiffCard(title, desc, color))
        story.append(Spacer(1, 8))

    story.append(PageBreak())

    # ── Page 6: Case Study ──
    story.append(SectionHeader("Real-World: Campus Recruiting", GREEN))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "<b><font color='#2563EB'>150 applicants \u2192 4 finalists in 3 days</font></b>",
        ParagraphStyle("hl", fontName="Helvetica-Bold", fontSize=14, textColor=BLUE, spaceAfter=14)
    ))

    timeline = [
        ("Day 1 Morning", "Brief the role to AI. Upload 150 resumes. Receive ranked top 15 with detailed reasoning.", BLUE),
        ("Day 1 Afternoon", "All 15 candidates invited to AI interview. Self-serve scheduling \u2014 zero coordination needed.", PURPLE),
        ("Day 2\u20133", "12 candidates complete interviews on their own schedule (evenings, weekends \u2014 AI is always available).", GREEN),
        ("Day 3 Evening", "4 finalists identified with structured scorecards. Ready for founder final interviews.", AMBER),
    ]
    for time_label, action, color in timeline:
        story.append(Paragraph(
            f"<font color='{color.hexval()}'><b>{time_label}</b></font> \u2014 {action}",
            s_body
        ))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<b>Result:</b> 3 days instead of 3 weeks. Zero recruiter hours. Consistent evaluation for every candidate.",
        s_body
    ))

    story.append(Spacer(1, 16))
    # Testimonial
    story.append(ColorBar(CONTENT_W, 1, SLATE100))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "\u201CDuring campus hiring, volume is brutal and interviewer quality can vary a lot. "
        "With RoboHire, every candidate gets the same core questions, the scoring is consistent, "
        "and our team gets a much clearer read on intent and soft skills.\u201D",
        s_quote
    ))
    story.append(Paragraph("\u2014 Head of HR, Consumer Internet Company", s_quote_attr))

    story.append(PageBreak())

    # ── Page 7: Global + Features ──
    story.append(SectionHeader("Built for Global Teams"))
    story.append(Spacer(1, 14))

    global_items = [
        ("\u2022  7 Languages Supported", "Chinese, English, Japanese, Spanish, French, Portuguese, German"),
        ("\u2022  24/7 Availability", "Candidates interview on their schedule \u2014 across every time zone"),
        ("\u2022  Unified Standards", "Same rubric whether hiring in Tokyo, Berlin, or San Francisco"),
    ]
    for title, desc in global_items:
        story.append(Paragraph(f"<b>{title}</b> \u2014 {desc}", s_body))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 20))
    story.append(SectionHeader("Platform Features", PURPLE))
    story.append(Spacer(1, 14))

    features = [
        ("Agent Alex", "AI recruiting consultant with text chat and live voice conversation"),
        ("Smart Matching", "Semantic resume scoring across skill fit, experience, and potential"),
        ("AI Video Interviews", "24/7 structured conversations with intelligent follow-ups in 7 languages"),
        ("Talent Hub", "Centralized candidate database with smart tagging and AI-powered insights"),
        ("Analytics Dashboard", "Pipeline metrics, conversion rates, score distributions, and cost tracking"),
        ("ATS Integration", "Webhook support and REST API access for custom workflows"),
    ]
    for title, desc in features:
        story.append(Paragraph(f"<b>{title}</b> \u2014 {desc}", s_body))
        story.append(Spacer(1, 2))

    story.append(PageBreak())

    # ── Page 8: Pricing ──
    story.append(SectionHeader("Simple, Transparent Pricing", BLUE))
    story.append(Spacer(1, 4))
    story.append(Paragraph("14-day free trial \u2022 No credit card required", s_subhead))
    story.append(Spacer(1, 10))

    price_header = [
        Paragraph("<b>Plan</b>", ParagraphStyle("ph", fontName="Helvetica-Bold", fontSize=10, textColor=WHITE)),
        Paragraph("<b>Price</b>", ParagraphStyle("ph", fontName="Helvetica-Bold", fontSize=10, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph("<b>Best For</b>", ParagraphStyle("ph", fontName="Helvetica-Bold", fontSize=10, textColor=WHITE)),
    ]
    price_rows = [
        ["Starter", "\u00a5179/month", "1 seat, 3 jobs, 15 interviews, 30 matches"],
        ["Growth", "\u00a51,232/month", "Unlimited seats, 120 interviews, 240 matches"],
        ["Business", "\u00a52,474/month", "Unlimited seats, 300 interviews, 1000 matches"],
        ["Enterprise", "Custom", "Everything unlimited, 45+ ATS, dedicated support"],
    ]

    s_pc = ParagraphStyle("pc", fontName="Helvetica", fontSize=10, textColor=DARK, leading=14)
    s_pcc = ParagraphStyle("pcc", fontName="Helvetica-Bold", fontSize=10, textColor=BLUE, leading=14, alignment=TA_CENTER)

    price_data = [price_header]
    for i, row in enumerate(price_rows):
        is_popular = i == 2
        name = f"<b>{row[0]}</b>" + (" <font color='#2563EB' size='8'>MOST POPULAR</font>" if is_popular else "")
        price_data.append([
            Paragraph(name, s_pc),
            Paragraph(f"<b>{row[1]}</b>", s_pcc),
            Paragraph(row[2], s_pc),
        ])

    price_table = Table(price_data, colWidths=[CONTENT_W*0.22, CONTENT_W*0.22, CONTENT_W*0.56])
    price_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), DARK),
        ("BACKGROUND", (0,1), (-1,1), WHITE),
        ("BACKGROUND", (0,2), (-1,2), SLATE100),
        ("BACKGROUND", (0,3), (-1,3), BLUE_LIGHT),
        ("BACKGROUND", (0,4), (-1,4), SLATE100),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("GRID", (0,0), (-1,-1), 0.5, HexColor("#E2E8F0")),
    ]))
    story.append(price_table)

    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "<b>All plans include:</b> AI screening \u2022 AI interviews \u2022 Evaluation reports \u2022 "
        "Multi-language support \u2022 Talent pool management",
        s_body_muted
    ))

    story.append(Spacer(1, 20))

    # ── ROI Section ──
    story.append(SectionHeader("ROI: The Numbers Speak", GREEN))
    story.append(Spacer(1, 4))
    story.append(Paragraph("For a 20-person startup hiring 10 people/year", s_subhead))
    story.append(Spacer(1, 10))

    roi_header = [
        Paragraph("<b>Cost Category</b>", ParagraphStyle("rh", fontName="Helvetica-Bold", fontSize=9.5, textColor=WHITE)),
        Paragraph("<b>Without RoboHire</b>", ParagraphStyle("rh", fontName="Helvetica-Bold", fontSize=9.5, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph("<b>With RoboHire</b>", ParagraphStyle("rh", fontName="Helvetica-Bold", fontSize=9.5, textColor=WHITE, alignment=TA_CENTER)),
    ]
    roi_rows = [
        ["Recruiter salary (part-time)", "$30,000/yr", "$0"],
        ["Agency fees (3 hires)", "$45,000/yr", "$0"],
        ["Founder time (200 hrs)", "$50,000", "$5,000 (20 hrs)"],
        ["RoboHire subscription", "\u2014", "$2,388/yr"],
        ["Total", "$125,000+", "$7,388"],
    ]

    s_rc = ParagraphStyle("rc", fontName="Helvetica", fontSize=9.5, textColor=DARK, leading=13)
    s_rcc = ParagraphStyle("rcc", fontName="Helvetica", fontSize=9.5, textColor=DARK, leading=13, alignment=TA_CENTER)
    s_rcg = ParagraphStyle("rcg", fontName="Helvetica-Bold", fontSize=9.5, textColor=GREEN, leading=13, alignment=TA_CENTER)

    roi_data = [roi_header]
    for i, row in enumerate(roi_rows):
        is_total = i == len(roi_rows) - 1
        roi_data.append([
            Paragraph(f"<b>{row[0]}</b>" if is_total else row[0], s_rc),
            Paragraph(f"<b>{row[1]}</b>" if is_total else row[1], s_rcc),
            Paragraph(row[2], s_rcg if not is_total else ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=11, textColor=GREEN, leading=14, alignment=TA_CENTER)),
        ])

    roi_table = Table(roi_data, colWidths=[CONTENT_W*0.40, CONTENT_W*0.30, CONTENT_W*0.30])
    roi_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), DARK),
        ("BACKGROUND", (0,1), (-1,1), SLATE100),
        ("BACKGROUND", (0,2), (-1,2), WHITE),
        ("BACKGROUND", (0,3), (-1,3), SLATE100),
        ("BACKGROUND", (0,4), (-1,4), WHITE),
        ("BACKGROUND", (0,5), (-1,5), GREEN_LIGHT),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("GRID", (0,0), (-1,-1), 0.5, HexColor("#E2E8F0")),
    ]))
    story.append(roi_table)

    story.append(Spacer(1, 12))
    story.append(DarkCallout(
        "$117,000+ annual savings",
        subtext="Growth plan at $199/month  \u2022  Founder time valued at $250/hr",
    ))

    story.append(PageBreak())

    # ── Page 9: Security + CTA ──
    story.append(SectionHeader("Security & Compliance", BLUE))
    story.append(Spacer(1, 14))

    sec_items = [
        "Data encryption at rest and in transit (AES-256, TLS 1.3)",
        "GDPR-ready data handling and candidate consent workflows",
        "SOC 2 aligned security practices",
        "Data residency options for enterprise customers",
        "Automatic data retention policies with candidate purging",
        "No candidate data used for AI training \u2014 your data stays yours",
    ]
    for item in sec_items:
        story.append(CheckItem(item))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 30))

    # CTA Section
    story.append(SectionHeader("Get Started Today", PURPLE))
    story.append(Spacer(1, 14))

    story.append(DarkCallout(
        "Start your 14-day free trial at robohire.io",
        subtext="No credit card required  \u2022  Set up in under 3 minutes",
    ))
    story.append(Spacer(1, 16))

    cta_steps = [
        ("1.", "Sign up at robohire.io \u2014 free 14-day trial"),
        ("2.", "Brief the role \u2014 talk to Agent Alex or create a job manually"),
        ("3.", "Upload resumes \u2014 drag and drop, bulk upload supported"),
        ("4.", "Review AI matches \u2014 scores and rankings delivered instantly"),
        ("5.", "Send invitations \u2014 one click to invite top candidates"),
        ("6.", "Review scorecards \u2014 structured evaluations ready for your team"),
    ]
    for num, text in cta_steps:
        story.append(Paragraph(f"<b>{num}</b> {text}", s_body))

    story.append(Spacer(1, 20))
    story.append(Paragraph(
        "<i>Let AI handle the repetitive 80%. Keep your team focused on what humans do best: "
        "reading nuance, testing fit, and making the final call.</i>",
        s_body_muted
    ))
    story.append(Spacer(1, 14))
    story.append(ColorBar(CONTENT_W, 1, BLUE))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<b>Website:</b> robohire.io  \u2022  <b>Email:</b> support@robohire.io",
        s_body
    ))

    # QR Code
    from reportlab.platypus import Image as RLImage
    qr_path = "/Users/kenny/code/RoboHire/docs/robohire-qr.png"
    if os.path.exists(qr_path):
        story.append(Spacer(1, 10))
        story.append(RLImage(qr_path, width=1.2*inch, height=1.2*inch))
        story.append(Paragraph("Scan to visit robohire.io", s_small))

    # Build
    doc.build(story, onFirstPage=title_page, onLaterPages=page_footer)
    print(f"PDF created: {output_path}")

if __name__ == "__main__":
    build_pdf()
