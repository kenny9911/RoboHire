const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");

// ─── Brand Colors ───────────────────────────────────────────────────────────
const C = {
  blue: "2563EB",
  blueDark: "1E40AF",
  blueLight: "DBEAFE",
  purple: "7C3AED",
  purpleLight: "EDE9FE",
  dark: "0F172A",
  darkSoft: "1E293B",
  muted: "64748B",
  mutedLight: "94A3B8",
  slate100: "F1F5F9",
  slate50: "F8FAFC",
  white: "FFFFFF",
  green: "059669",
  greenLight: "D1FAE5",
  amber: "D97706",
  amberLight: "FEF3C7",
  red: "DC2626",
  redLight: "FEE2E2",
};

const FONT = "Calibri";
const FONT_BOLD = "Calibri";

// ─── Icon rendering ─────────────────────────────────────────────────────────
const {
  FaRocket, FaBrain, FaUsers, FaGlobeAmericas, FaFileAlt, FaVideo,
  FaEnvelope, FaChartBar, FaCheckCircle, FaClock, FaLanguage,
  FaDollarSign, FaStar, FaShieldAlt, FaArrowRight, FaLightbulb,
  FaBalanceScale, FaBolt, FaSearch, FaComments,
} = require("react-icons/fa");

function renderIconSvg(IconComponent, color, size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const makeShadow = () => ({
  type: "outer", blur: 8, offset: 2, angle: 135, color: "000000", opacity: 0.1,
});

const makeCardShadow = () => ({
  type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.08,
});

// ─── Main ───────────────────────────────────────────────────────────────────
async function generateDeck() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "RoboHire";
  pres.title = "RoboHire — AI-Powered Recruiting for Modern Teams";

  // Pre-render all icons
  const icons = {};
  const iconDefs = [
    ["rocket", FaRocket, C.blue],
    ["brain", FaBrain, C.purple],
    ["users", FaUsers, C.blue],
    ["globe", FaGlobeAmericas, C.blue],
    ["file", FaFileAlt, C.blue],
    ["video", FaVideo, C.purple],
    ["envelope", FaEnvelope, C.blue],
    ["chart", FaChartBar, C.blue],
    ["check", FaCheckCircle, C.green],
    ["clock", FaClock, C.amber],
    ["language", FaLanguage, C.purple],
    ["dollar", FaDollarSign, C.green],
    ["star", FaStar, C.amber],
    ["shield", FaShieldAlt, C.blue],
    ["arrow", FaArrowRight, C.white],
    ["lightbulb", FaLightbulb, C.amber],
    ["balance", FaBalanceScale, C.blue],
    ["bolt", FaBolt, C.purple],
    ["search", FaSearch, C.blue],
    ["comments", FaComments, C.purple],
    ["checkWhite", FaCheckCircle, C.white],
    ["rocketWhite", FaRocket, C.white],
    ["brainWhite", FaBrain, C.white],
    ["usersWhite", FaUsers, C.white],
    ["starWhite", FaStar, C.white],
    ["globeWhite", FaGlobeAmericas, C.white],
  ];
  for (const [key, Comp, color] of iconDefs) {
    icons[key] = await iconToBase64Png(Comp, "#" + color);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 1: Title
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.dark };
    // Accent bar top
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.blue } });
    // Logo area
    s.addImage({ data: icons.rocketWhite, x: 0.7, y: 1.2, w: 0.55, h: 0.55 });
    s.addText("RoboHire", {
      x: 1.35, y: 1.2, w: 4, h: 0.55, fontSize: 28, fontFace: FONT_BOLD,
      color: C.white, bold: true, valign: "middle", margin: 0,
    });
    // Main title
    s.addText("AI-Powered Recruiting\nfor Modern Teams", {
      x: 0.7, y: 2.2, w: 8.5, h: 1.5, fontSize: 40, fontFace: FONT_BOLD,
      color: C.white, bold: true, lineSpacingMultiple: 1.1, margin: 0,
    });
    // Subtitle
    s.addText("From role brief to final shortlist, hiring moves on autopilot.", {
      x: 0.7, y: 3.85, w: 7, h: 0.5, fontSize: 18, fontFace: FONT,
      color: C.mutedLight, margin: 0,
    });
    // Partner badge
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: 4.6, w: 2.2, h: 0.35,
      fill: { color: C.blue }, rectRadius: 0.05,
    });
    s.addText("PARTNER SALES KIT", {
      x: 0.7, y: 4.6, w: 2.2, h: 0.35, fontSize: 10, fontFace: FONT_BOLD,
      color: C.white, bold: true, align: "center", valign: "middle", charSpacing: 3,
    });
    // Stats row
    const stats = [
      { num: "90%", label: "Time Saved" },
      { num: "3 Days", label: "Avg. Time-to-Hire" },
      { num: "7", label: "Languages" },
      { num: "24/7", label: "Availability" },
    ];
    stats.forEach((st, i) => {
      const sx = 0.7 + i * 2.3;
      s.addText(st.num, {
        x: sx, y: 5.0, w: 2, h: 0.35, fontSize: 20, fontFace: FONT_BOLD,
        color: C.blue, bold: true, margin: 0,
      });
      s.addText(st.label, {
        x: sx, y: 5.3, w: 2, h: 0.25, fontSize: 10, fontFace: FONT,
        color: C.mutedLight, margin: 0,
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 2: The Problem
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addText("The Hiring Problem", {
      x: 0.7, y: 0.4, w: 8, h: 0.6, fontSize: 32, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });
    s.addText("Startups are competing for talent with 10x the disadvantage", {
      x: 0.7, y: 1.0, w: 8, h: 0.4, fontSize: 14, fontFace: FONT,
      color: C.muted, margin: 0,
    });

    const problems = [
      { icon: icons.clock, title: "42 Days Average", desc: "Time-to-hire while competitors close in 2 weeks", bg: C.amberLight },
      { icon: icons.dollar, title: "$15-25K Per Hire", desc: "Agency fees that drain startup runway", bg: C.redLight },
      { icon: icons.users, title: "No Dedicated Recruiter", desc: "Founders screening resumes at midnight", bg: C.blueLight },
      { icon: icons.balance, title: "Inconsistent Interviews", desc: "Engineers pulled off product work to interview", bg: C.purpleLight },
    ];

    problems.forEach((p, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = 0.7 + col * 4.5;
      const cy = 1.7 + row * 1.7;

      s.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: cy, w: 4.1, h: 1.4,
        fill: { color: p.bg },
      });
      s.addImage({ data: p.icon, x: cx + 0.3, y: cy + 0.35, w: 0.4, h: 0.4 });
      s.addText(p.title, {
        x: cx + 0.9, y: cy + 0.2, w: 2.9, h: 0.35, fontSize: 15, fontFace: FONT_BOLD,
        color: C.dark, bold: true, margin: 0,
      });
      s.addText(p.desc, {
        x: cx + 0.9, y: cy + 0.6, w: 2.9, h: 0.55, fontSize: 12, fontFace: FONT,
        color: C.muted, margin: 0,
      });
    });

    // Bottom stat
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: 5.1, w: 8.6, h: 0.06, fill: { color: C.blue },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 3: Solution Overview
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.slate50 };
    s.addText("What is RoboHire?", {
      x: 0.7, y: 0.4, w: 8, h: 0.6, fontSize: 32, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });

    // Key message card
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: 1.2, w: 8.6, h: 1.3,
      fill: { color: C.dark }, shadow: makeShadow(),
    });
    s.addImage({ data: icons.brainWhite, x: 1.1, y: 1.5, w: 0.5, h: 0.5 });
    s.addText("An AI recruiting platform that runs the first 80% of hiring autonomously", {
      x: 1.8, y: 1.3, w: 7.1, h: 0.5, fontSize: 18, fontFace: FONT_BOLD,
      color: C.white, bold: true, margin: 0,
    });
    s.addText("From role definition to candidate shortlist \u2014 your team only focuses on the final decision.", {
      x: 1.8, y: 1.85, w: 7.1, h: 0.45, fontSize: 13, fontFace: FONT,
      color: C.mutedLight, margin: 0,
    });

    // Comparison
    const compRows = [
      ["Hiring Stage", "Traditional", "RoboHire"],
      ["Screen 200 Resumes", "3\u20135 days", "Minutes"],
      ["Interview Scheduling", "2 weeks", "48 hours"],
      ["Evaluation Consistency", "Varies by interviewer", "Unified AI standard"],
      ["Availability", "Business hours", "24/7, 7 languages"],
      ["Cost per Hire (Agency)", "$15,000\u201325,000", "From $29/month"],
    ];

    const tableRows = compRows.map((row, ri) => {
      const isHeader = ri === 0;
      return row.map((cell, ci) => ({
        text: cell,
        options: {
          fontSize: isHeader ? 11 : 12,
          fontFace: FONT,
          bold: isHeader || ci === 2,
          color: isHeader ? C.white : (ci === 2 ? C.blue : C.dark),
          fill: { color: isHeader ? C.dark : (ri % 2 === 0 ? C.slate100 : C.white) },
          valign: "middle",
          align: ci === 0 ? "left" : "center",
        },
      }));
    });

    s.addTable(tableRows, {
      x: 0.7, y: 2.8, w: 8.6,
      colW: [3.2, 2.7, 2.7],
      border: { pt: 0.5, color: "E2E8F0" },
      rowH: [0.35, 0.35, 0.35, 0.35, 0.35, 0.35],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 4-5: 6-Step Workflow (split across 2 slides)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // Steps 1-3
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addText("How It Works", {
      x: 0.7, y: 0.35, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });
    s.addText("6 steps to your next great hire", {
      x: 0.7, y: 0.9, w: 8, h: 0.35, fontSize: 14, fontFace: FONT,
      color: C.muted, margin: 0,
    });

    const steps1 = [
      { num: "01", title: "Clarify the Role", desc: "AI asks the right questions and produces a structured hiring brief in ~10 minutes.", icon: icons.comments, color: C.blue },
      { num: "02", title: "Generate Job Description", desc: "Auto-drafts polished JD with responsibilities, requirements, and benefits.", icon: icons.file, color: C.purple },
      { num: "03", title: "Screen Resumes", desc: "Semantic matching ranks all candidates with scores, grades, and clear reasoning.", icon: icons.search, color: C.green },
    ];

    steps1.forEach((step, i) => {
      const cy = 1.5 + i * 1.3;
      // Number circle
      s.addShape(pres.shapes.OVAL, {
        x: 0.7, y: cy + 0.1, w: 0.6, h: 0.6,
        fill: { color: step.color },
      });
      s.addText(step.num, {
        x: 0.7, y: cy + 0.1, w: 0.6, h: 0.6, fontSize: 14, fontFace: FONT_BOLD,
        color: C.white, bold: true, align: "center", valign: "middle",
      });
      // Content
      s.addText(step.title, {
        x: 1.5, y: cy, w: 4, h: 0.35, fontSize: 16, fontFace: FONT_BOLD,
        color: C.dark, bold: true, margin: 0,
      });
      s.addText(step.desc, {
        x: 1.5, y: cy + 0.4, w: 4.5, h: 0.5, fontSize: 12, fontFace: FONT,
        color: C.muted, margin: 0,
      });
      // Icon
      s.addImage({ data: step.icon, x: 8.7, y: cy + 0.15, w: 0.45, h: 0.45 });
    });

    // Right side accent
    s.addShape(pres.shapes.RECTANGLE, {
      x: 6.5, y: 1.5, w: 0.04, h: 3.6,
      fill: { color: C.blueLight },
    });
    s.addText("STEPS 1\u20133", {
      x: 6.7, y: 2.8, w: 1.5, h: 0.3, fontSize: 10, fontFace: FONT_BOLD,
      color: C.mutedLight, charSpacing: 3, margin: 0,
    });
  }
  {
    // Steps 4-6
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addText("How It Works", {
      x: 0.7, y: 0.35, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });
    s.addText("6 steps to your next great hire", {
      x: 0.7, y: 0.9, w: 8, h: 0.35, fontSize: 14, fontFace: FONT,
      color: C.muted, margin: 0,
    });

    const steps2 = [
      { num: "04", title: "Invite Candidates", desc: "Auto-send interview invitations with private links. Candidates self-serve scheduling.", icon: icons.envelope, color: C.blue },
      { num: "05", title: "AI Video Interviews", desc: "24/7 structured conversations with intelligent follow-ups. 7 languages supported.", icon: icons.video, color: C.purple },
      { num: "06", title: "Review & Decide", desc: "Structured scorecards with skill fit, experience depth, risk signals, and recommendations.", icon: icons.chart, color: C.green },
    ];

    steps2.forEach((step, i) => {
      const cy = 1.5 + i * 1.3;
      s.addShape(pres.shapes.OVAL, {
        x: 0.7, y: cy + 0.1, w: 0.6, h: 0.6,
        fill: { color: step.color },
      });
      s.addText(step.num, {
        x: 0.7, y: cy + 0.1, w: 0.6, h: 0.6, fontSize: 14, fontFace: FONT_BOLD,
        color: C.white, bold: true, align: "center", valign: "middle",
      });
      s.addText(step.title, {
        x: 1.5, y: cy, w: 4, h: 0.35, fontSize: 16, fontFace: FONT_BOLD,
        color: C.dark, bold: true, margin: 0,
      });
      s.addText(step.desc, {
        x: 1.5, y: cy + 0.4, w: 4.5, h: 0.5, fontSize: 12, fontFace: FONT,
        color: C.muted, margin: 0,
      });
      s.addImage({ data: step.icon, x: 8.7, y: cy + 0.15, w: 0.45, h: 0.45 });
    });

    s.addShape(pres.shapes.RECTANGLE, {
      x: 6.5, y: 1.5, w: 0.04, h: 3.6,
      fill: { color: C.purpleLight },
    });
    s.addText("STEPS 4\u20136", {
      x: 6.7, y: 2.8, w: 1.5, h: 0.3, fontSize: 10, fontFace: FONT_BOLD,
      color: C.mutedLight, charSpacing: 3, margin: 0,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 6: Why Startups Choose RoboHire (4 Differentiators)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.dark };
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.purple } });

    s.addText("Why Startups Choose RoboHire", {
      x: 0.7, y: 0.35, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.white, bold: true, margin: 0,
    });

    const diffs = [
      {
        icon: icons.rocketWhite, title: "AI Recruiting Team",
        desc: "Not another dashboard. RoboHire executes work \u2014 role definition, screening, interviews, evaluations move forward autonomously.",
      },
      {
        icon: icons.brainWhite, title: "Semantic Intelligence",
        desc: "Reads context, not keywords. Connects 3 years of ML projects with TensorFlow expertise. Intelligent follow-ups during interviews.",
      },
      {
        icon: icons.checkWhite, title: "Consistent & Defensible",
        desc: "Same questions. Same rubric. Same scoring. No interviewer bias, no mood-dependent variation. Clear audit trail.",
      },
      {
        icon: icons.starWhite, title: "Enterprise Quality, Startup Price",
        desc: "No recruiter salary. No agency fees. Professional hiring operations starting at $29/month. Scale without adding HR headcount.",
      },
    ];

    diffs.forEach((d, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = 0.7 + col * 4.5;
      const cy = 1.3 + row * 2.0;

      s.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: cy, w: 4.1, h: 1.7,
        fill: { color: C.darkSoft },
      });
      // Left accent
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: cy, w: 0.06, h: 1.7,
        fill: { color: C.purple },
      });
      s.addImage({ data: d.icon, x: cx + 0.35, y: cy + 0.25, w: 0.4, h: 0.4 });
      s.addText(d.title, {
        x: cx + 0.95, y: cy + 0.2, w: 2.8, h: 0.35, fontSize: 15, fontFace: FONT_BOLD,
        color: C.white, bold: true, margin: 0,
      });
      s.addText(d.desc, {
        x: cx + 0.35, y: cy + 0.75, w: 3.4, h: 0.8, fontSize: 11, fontFace: FONT,
        color: C.mutedLight, margin: 0,
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 7: Real-World Scenario
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addText("Real-World: Campus Recruiting", {
      x: 0.7, y: 0.35, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });
    s.addText("150 applicants \u2192 4 finalists in 3 days", {
      x: 0.7, y: 0.9, w: 8, h: 0.35, fontSize: 15, fontFace: FONT,
      color: C.blue, bold: true, margin: 0,
    });

    const timeline = [
      { time: "Day 1 AM", action: "Brief the role to AI. Upload 150 resumes. Receive ranked top 15 with reasoning.", color: C.blue },
      { time: "Day 1 PM", action: "All 15 candidates invited to AI interview. Self-serve scheduling \u2014 zero coordination.", color: C.purple },
      { time: "Day 2\u20133", action: "12 candidates complete interviews on their own schedule (evenings, weekends).", color: C.green },
      { time: "Day 3 PM", action: "4 finalists with structured scorecards. Ready for founder final interviews.", color: C.amber },
    ];

    timeline.forEach((t, i) => {
      const cy = 1.55 + i * 0.85;
      // Timeline dot
      s.addShape(pres.shapes.OVAL, {
        x: 1.2, y: cy + 0.12, w: 0.22, h: 0.22,
        fill: { color: t.color },
      });
      // Connector line
      if (i < timeline.length - 1) {
        s.addShape(pres.shapes.RECTANGLE, {
          x: 1.29, y: cy + 0.34, w: 0.04, h: 0.63,
          fill: { color: "E2E8F0" },
        });
      }
      s.addText(t.time, {
        x: 1.7, y: cy, w: 1.5, h: 0.35, fontSize: 12, fontFace: FONT_BOLD,
        color: t.color, bold: true, margin: 0,
      });
      s.addText(t.action, {
        x: 3.2, y: cy, w: 5.5, h: 0.5, fontSize: 12, fontFace: FONT,
        color: C.muted, margin: 0,
      });
    });

    // Testimonial
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: 4.3, w: 8.6, h: 1.1,
      fill: { color: C.slate100 },
    });
    s.addText("\u201CDuring campus hiring, volume is brutal. With RoboHire, every candidate gets the same core questions, scoring is consistent, and our team gets a much clearer read on intent and soft skills.\u201D", {
      x: 1.0, y: 4.4, w: 7.5, h: 0.65, fontSize: 11, fontFace: FONT,
      color: C.muted, italic: true, margin: 0,
    });
    s.addText("\u2014 Head of HR, Consumer Internet Company", {
      x: 1.0, y: 5.05, w: 7, h: 0.25, fontSize: 10, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 8: Global Capabilities
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.slate50 };
    s.addText("Built for Global Teams", {
      x: 0.7, y: 0.35, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });

    // Three pillars
    const pillars = [
      {
        icon: icons.language, title: "7 Languages",
        desc: "Chinese, English, Japanese,\nSpanish, French, Portuguese,\nGerman",
        accent: C.purple,
      },
      {
        icon: icons.clock, title: "24/7 Availability",
        desc: "Candidates interview on their\nschedule \u2014 across every\ntime zone.",
        accent: C.blue,
      },
      {
        icon: icons.balance, title: "Unified Standards",
        desc: "Same rubric whether hiring in\nTokyo, Berlin, or San Francisco.\nFair cross-region comparison.",
        accent: C.green,
      },
    ];

    pillars.forEach((p, i) => {
      const cx = 0.7 + i * 3.1;
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: 1.2, w: 2.8, h: 3.2,
        fill: { color: C.white }, shadow: makeCardShadow(),
      });
      // Top accent
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: 1.2, w: 2.8, h: 0.06,
        fill: { color: p.accent },
      });
      // Icon circle
      s.addShape(pres.shapes.OVAL, {
        x: cx + 0.95, y: 1.6, w: 0.9, h: 0.9,
        fill: { color: p.accent, transparency: 90 },
      });
      s.addImage({ data: p.icon, x: cx + 1.1, y: 1.75, w: 0.6, h: 0.6 });
      s.addText(p.title, {
        x: cx + 0.2, y: 2.7, w: 2.4, h: 0.4, fontSize: 16, fontFace: FONT_BOLD,
        color: C.dark, bold: true, align: "center", margin: 0,
      });
      s.addText(p.desc, {
        x: cx + 0.2, y: 3.15, w: 2.4, h: 1.0, fontSize: 12, fontFace: FONT,
        color: C.muted, align: "center", margin: 0,
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 9: Feature Highlights
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addText("Platform Features", {
      x: 0.7, y: 0.35, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });

    const features = [
      { icon: icons.brain, title: "Agent Alex", desc: "AI recruiting consultant with text chat & live voice" },
      { icon: icons.search, title: "Smart Matching", desc: "Semantic resume scoring across multiple dimensions" },
      { icon: icons.video, title: "AI Interviews", desc: "24/7 structured video conversations in 7 languages" },
      { icon: icons.users, title: "Talent Hub", desc: "Centralized candidate database with smart tagging" },
      { icon: icons.chart, title: "Analytics", desc: "Pipeline metrics, conversion rates, score distributions" },
      { icon: icons.shield, title: "ATS Integration", desc: "Webhook support and API access for custom workflows" },
    ];

    features.forEach((f, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const cx = 0.7 + col * 3.1;
      const cy = 1.2 + row * 2.0;

      s.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: cy, w: 2.8, h: 1.7,
        fill: { color: C.slate50 },
      });
      s.addImage({ data: f.icon, x: cx + 0.3, y: cy + 0.3, w: 0.4, h: 0.4 });
      s.addText(f.title, {
        x: cx + 0.3, y: cy + 0.8, w: 2.2, h: 0.3, fontSize: 14, fontFace: FONT_BOLD,
        color: C.dark, bold: true, margin: 0,
      });
      s.addText(f.desc, {
        x: cx + 0.3, y: cy + 1.1, w: 2.2, h: 0.45, fontSize: 11, fontFace: FONT,
        color: C.muted, margin: 0,
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 10: Pricing
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.slate50 };
    s.addText("Simple, Transparent Pricing", {
      x: 0.7, y: 0.3, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });
    s.addText("14-day free trial \u2022 No credit card required", {
      x: 0.7, y: 0.85, w: 8, h: 0.3, fontSize: 13, fontFace: FONT,
      color: C.muted, margin: 0,
    });

    const plans = [
      { name: "Starter", price: "\u00A5179", period: "/month", desc: "1 seat, 3 jobs\n15 interviews, 30 matches", highlight: false },
      { name: "Growth", price: "\u00A51,232", period: "/month", desc: "Unlimited seats\n120 interviews, 240 matches", highlight: false },
      { name: "Business", price: "\u00A52,474", period: "/month", desc: "Unlimited seats\n300 interviews, 1000 matches", highlight: true },
      { name: "Enterprise", price: "Custom", period: "", desc: "Everything unlimited\n45+ ATS integrations", highlight: false },
    ];

    plans.forEach((p, i) => {
      const cx = 0.55 + i * 2.35;
      const isHL = p.highlight;
      const cardY = isHL ? 1.35 : 1.5;
      const cardH = isHL ? 3.7 : 3.4;

      s.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: cardY, w: 2.15, h: cardH,
        fill: { color: isHL ? C.dark : C.white },
        shadow: makeCardShadow(),
      });

      if (isHL) {
        s.addShape(pres.shapes.RECTANGLE, {
          x: cx, y: cardY, w: 2.15, h: 0.06,
          fill: { color: C.blue },
        });
        s.addText("MOST POPULAR", {
          x: cx, y: cardY + 0.15, w: 2.15, h: 0.25, fontSize: 8, fontFace: FONT_BOLD,
          color: C.blue, bold: true, align: "center", charSpacing: 3, margin: 0,
        });
      }

      const textTop = isHL ? cardY + 0.5 : cardY + 0.35;
      s.addText(p.name, {
        x: cx, y: textTop, w: 2.15, h: 0.35, fontSize: 16, fontFace: FONT_BOLD,
        color: isHL ? C.white : C.dark, bold: true, align: "center", margin: 0,
      });
      s.addText([
        { text: p.price, options: { fontSize: 28, bold: true, fontFace: FONT_BOLD } },
        { text: p.period, options: { fontSize: 12, color: isHL ? C.mutedLight : C.muted } },
      ], {
        x: cx, y: textTop + 0.45, w: 2.15, h: 0.5,
        color: isHL ? C.white : C.dark, align: "center", margin: 0,
      });
      s.addText(p.desc, {
        x: cx + 0.15, y: textTop + 1.1, w: 1.85, h: 0.6, fontSize: 11, fontFace: FONT,
        color: isHL ? C.mutedLight : C.muted, align: "center", margin: 0,
      });
    });

    // Included features
    s.addText("All plans: 14-day free trial \u2022 AI screening \u2022 AI interviews \u2022 Evaluation reports \u2022 Multi-language \u2022 Talent pool", {
      x: 0.7, y: 5.1, w: 8.6, h: 0.3, fontSize: 11, fontFace: FONT,
      color: C.muted, align: "center", margin: 0,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 11: ROI
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addText("ROI: The Numbers Speak", {
      x: 0.7, y: 0.35, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });
    s.addText("For a 20-person startup hiring 10 people/year", {
      x: 0.7, y: 0.9, w: 8, h: 0.3, fontSize: 14, fontFace: FONT,
      color: C.muted, margin: 0,
    });

    const roiRows = [
      ["Cost Category", "Without RoboHire", "With RoboHire"],
      ["Recruiter salary (part-time)", "$30,000/yr", "$0"],
      ["Agency fees (3 hires)", "$45,000/yr", "$0"],
      ["Founder time (200 hrs)", "$50,000", "$5,000 (20 hrs)"],
      ["RoboHire subscription", "\u2014", "$2,388/yr"],
      ["Total", "$125,000+", "$7,388"],
    ];

    const roiTable = roiRows.map((row, ri) => {
      const isHeader = ri === 0;
      const isTotal = ri === roiRows.length - 1;
      return row.map((cell, ci) => ({
        text: cell,
        options: {
          fontSize: isTotal ? 13 : 12,
          fontFace: FONT,
          bold: isHeader || isTotal || ci === 2,
          color: isHeader ? C.white : (ci === 2 ? C.green : (isTotal ? C.dark : C.dark)),
          fill: { color: isHeader ? C.dark : (isTotal ? C.greenLight : (ri % 2 === 0 ? C.slate100 : C.white)) },
          valign: "middle",
          align: ci === 0 ? "left" : "center",
        },
      }));
    });

    s.addTable(roiTable, {
      x: 0.7, y: 1.4, w: 8.6,
      colW: [3.4, 2.6, 2.6],
      border: { pt: 0.5, color: "E2E8F0" },
      rowH: [0.38, 0.38, 0.38, 0.38, 0.38, 0.42],
    });

    // Savings callout
    s.addShape(pres.shapes.RECTANGLE, {
      x: 2.5, y: 4.2, w: 5, h: 1.1,
      fill: { color: C.dark },
    });
    s.addText([
      { text: "$117,000+", options: { fontSize: 32, bold: true, color: C.green, fontFace: FONT_BOLD } },
      { text: "  annual savings", options: { fontSize: 16, color: C.white } },
    ], {
      x: 2.5, y: 4.25, w: 5, h: 0.65, align: "center", valign: "middle", margin: 0,
    });
    s.addText("Growth plan at $199/month \u2022 Founder time at $250/hr", {
      x: 2.5, y: 4.9, w: 5, h: 0.3, fontSize: 10, fontFace: FONT,
      color: C.mutedLight, align: "center", margin: 0,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 12: Security
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    s.addText("Security & Compliance", {
      x: 0.7, y: 0.35, w: 8, h: 0.55, fontSize: 30, fontFace: FONT_BOLD,
      color: C.dark, bold: true, margin: 0,
    });

    const secItems = [
      "Data encryption at rest and in transit (AES-256, TLS 1.3)",
      "GDPR-ready data handling and candidate consent workflows",
      "SOC 2 aligned security practices",
      "Data residency options for enterprise customers",
      "Automatic data retention policies with candidate purging",
      "No candidate data used for AI training \u2014 your data stays yours",
    ];

    secItems.forEach((item, i) => {
      const cy = 1.3 + i * 0.6;
      s.addImage({ data: icons.check, x: 1.0, y: cy + 0.05, w: 0.3, h: 0.3 });
      s.addText(item, {
        x: 1.5, y: cy, w: 7, h: 0.4, fontSize: 14, fontFace: FONT,
        color: C.dark, margin: 0, valign: "middle",
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDE 13: Getting Started CTA
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: C.dark };
    s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.565, w: 10, h: 0.06, fill: { color: C.blue } });

    s.addImage({ data: icons.rocketWhite, x: 4.5, y: 0.8, w: 1, h: 1 });
    s.addText("Start Hiring Smarter Today", {
      x: 1, y: 2.0, w: 8, h: 0.6, fontSize: 36, fontFace: FONT_BOLD,
      color: C.white, bold: true, align: "center", margin: 0,
    });
    s.addText("Let AI handle the repetitive 80%.\nKeep your team focused on what humans do best.", {
      x: 1.5, y: 2.7, w: 7, h: 0.7, fontSize: 16, fontFace: FONT,
      color: C.mutedLight, align: "center", margin: 0,
    });

    // CTA button
    s.addShape(pres.shapes.RECTANGLE, {
      x: 1.5, y: 3.7, w: 3.4, h: 0.65,
      fill: { color: C.blue },
    });
    s.addText("14-Day Free Trial \u2192 robohire.io", {
      x: 1.5, y: 3.7, w: 3.4, h: 0.65, fontSize: 16, fontFace: FONT_BOLD,
      color: C.white, bold: true, align: "center", valign: "middle",
      hyperlink: { url: "https://robohire.io" },
    });

    // QR Code
    s.addImage({ path: "/Users/kenny/code/RoboHire/docs/robohire-qr.png", x: 6.5, y: 3.2, w: 1.8, h: 1.8 });
    s.addText("Scan to visit", {
      x: 6.5, y: 5.0, w: 1.8, h: 0.25, fontSize: 9, fontFace: FONT,
      color: C.mutedLight, align: "center", margin: 0,
    });

    // Contact info
    s.addText("support@robohire.io", {
      x: 1, y: 4.7, w: 4.5, h: 0.35, fontSize: 14, fontFace: FONT,
      color: C.mutedLight, align: "center", margin: 0,
    });

    // Bottom tagline
    s.addText("RoboHire \u2014 AI-Powered Recruiting for Modern Teams", {
      x: 1, y: 5.1, w: 8, h: 0.3, fontSize: 11, fontFace: FONT,
      color: C.muted, align: "center", margin: 0,
    });
  }

  // ── Write file ──
  await pres.writeFile({ fileName: "/Users/kenny/code/RoboHire/docs/RoboHire-Sales-Kit.pptx" });
  console.log("PPTX created successfully!");
}

generateDeck().catch(console.error);
