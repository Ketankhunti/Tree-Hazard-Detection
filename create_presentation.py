import sys
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

# 16:9 Widescreen dimensions
SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

# Tree & Earth Color Palette
COLOR_BG_PARCHMENT = RGBColor(0xFA, 0xF8, 0xF5)     # #FAF8F5 Soft warm linen
COLOR_DARK_FOREST  = RGBColor(0x13, 0x2A, 0x13)     # #132A13 Deep pine/forest
COLOR_MOSS_GREEN   = RGBColor(0x31, 0x57, 0x2C)     # #31572C Leaf/moss green
COLOR_SAGE_ACCENT  = RGBColor(0x4F, 0x77, 0x2D)     # #4F772D Vibrant sage
COLOR_TERRACOTTA   = RGBColor(0xBC, 0x6C, 0x25)     # #BC6C25 Warm terracotta/clay
COLOR_EARTH_BARK   = RGBColor(0x7F, 0x55, 0x39)     # #7F5539 Earth bark brown
COLOR_CARD_BG      = RGBColor(0xFF, 0xFF, 0xFF)     # Pure white card
COLOR_CARD_BORDER  = RGBColor(0xDD, 0xD8, 0xD0)     # Subtle warm stone
COLOR_TEXT_DARK    = RGBColor(0x1B, 0x24, 0x1E)     # Deep obsidian bark
COLOR_TEXT_MUTED   = RGBColor(0x5A, 0x65, 0x5E)     # Forest slate
COLOR_ACCENT_LIGHT = RGBColor(0xEC, 0xF3, 0xEB)     # Soft leaf tint

prs = Presentation()
prs.slide_width = SLIDE_WIDTH
prs.slide_height = SLIDE_HEIGHT
blank_layout = prs.slide_layouts[6] # blank layout

def add_background(slide, bg_color):
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), SLIDE_WIDTH, SLIDE_HEIGHT)
    bg.fill.solid()
    bg.fill.fore_color.rgb = bg_color
    bg.line.fill.background() # no border
    return bg

def add_header(slide, category, title):
    # Category tag
    cat_box = slide.shapes.add_textbox(Inches(0.9), Inches(0.6), Inches(11.5), Inches(0.35))
    tf_c = cat_box.text_frame
    tf_c.word_wrap = True
    tf_c.margin_left = tf_c.margin_top = tf_c.margin_right = tf_c.margin_bottom = 0
    p_c = tf_c.paragraphs[0]
    p_c.text = category.upper()
    p_c.font.size = Pt(11)
    p_c.font.bold = True
    p_c.font.color.rgb = COLOR_TERRACOTTA
    p_c.font.name = "Calibri"

    # Slide Title
    title_box = slide.shapes.add_textbox(Inches(0.9), Inches(0.95), Inches(11.5), Inches(0.65))
    tf_t = title_box.text_frame
    tf_t.word_wrap = True
    tf_t.margin_left = tf_t.margin_top = tf_t.margin_right = tf_t.margin_bottom = 0
    p_t = tf_t.paragraphs[0]
    p_t.text = title
    p_t.font.size = Pt(28)
    p_t.font.bold = True
    p_t.font.color.rgb = COLOR_DARK_FOREST
    p_t.font.name = "Calibri"

    # Subtle accent line under header
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.9), Inches(1.65), Inches(1.8), Inches(0.04))
    line.fill.solid()
    line.fill.fore_color.rgb = COLOR_SAGE_ACCENT
    line.line.fill.background()

def create_card(slide, left, top, width, height, title, items, border_color=COLOR_CARD_BORDER, bg_color=COLOR_CARD_BG, title_color=COLOR_DARK_FOREST):
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = bg_color
    card.line.color.rgb = border_color
    card.line.width = Pt(1.5)

    pad = Inches(0.35)
    tb = slide.shapes.add_textbox(left + pad, top + pad, width - (pad * 2), height - (pad * 2))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

    p_title = tf.paragraphs[0]
    p_title.text = title
    p_title.font.size = Pt(17)
    p_title.font.bold = True
    p_title.font.color.rgb = title_color
    p_title.font.name = "Calibri"
    p_title.space_after = Pt(14)

    for item in items:
        p = tf.add_paragraph()
        p.text = f"•  {item}"
        p.font.size = Pt(13)
        p.font.color.rgb = COLOR_TEXT_DARK
        p.font.name = "Calibri"
        p.space_after = Pt(9)
        p.level = 0

# ==================== SLIDE 1: TITLE SLIDE ====================
slide1 = prs.slides.add_slide(blank_layout)
add_background(slide1, COLOR_DARK_FOREST)

deco = slide1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(1.5), Inches(3.2), Inches(0.42))
deco.fill.solid()
deco.fill.fore_color.rgb = COLOR_SAGE_ACCENT
deco.line.fill.background()
tf_d = deco.text_frame
p_d = tf_d.paragraphs[0]
p_d.text = "HALIFAX URBAN FORESTRY"
p_d.alignment = PP_ALIGN.CENTER
p_d.font.size = Pt(11)
p_d.font.bold = True
p_d.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
p_d.font.name = "Calibri"

tb_t1 = slide1.shapes.add_textbox(Inches(0.9), Inches(2.2), Inches(11.5), Inches(2.2))
tf1 = tb_t1.text_frame
tf1.word_wrap = True
p1_1 = tf1.paragraphs[0]
p1_1.text = "Which Tree Falls First?"
p1_1.font.size = Pt(46)
p1_1.font.bold = True
p1_1.font.color.rgb = RGBColor(0xFA, 0xF8, 0xF5)
p1_1.font.name = "Calibri"
p1_1.space_after = Pt(10)

p1_2 = tf1.add_paragraph()
p1_2.text = "Automated Tree Hazard Detection & Priority Triage Platform"
p1_2.font.size = Pt(22)
p1_2.font.color.rgb = RGBColor(0xC2, 0xDC, 0xB8)
p1_2.font.name = "Calibri"

h_card1 = slide1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(5.0), Inches(3.6), Inches(1.5))
h_card1.fill.solid()
h_card1.fill.fore_color.rgb = RGBColor(0x1F, 0x3E, 0x22)
h_card1.line.color.rgb = COLOR_SAGE_ACCENT
tf_h1 = h_card1.text_frame
tf_h1.word_wrap = True
p_h1a = tf_h1.paragraphs[0]
p_h1a.text = "🌳 80,000+ HRM Trees"
p_h1a.font.bold = True
p_h1a.font.size = Pt(15)
p_h1a.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
p_h1b = tf_h1.add_paragraph()
p_h1b.text = "Real municipal inventory data synchronized live from ArcGIS"
p_h1b.font.size = Pt(11)
p_h1b.font.color.rgb = RGBColor(0xD0, 0xE2, 0xCB)

h_card2 = slide1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(4.8), Inches(5.0), Inches(3.6), Inches(1.5))
h_card2.fill.solid()
h_card2.fill.fore_color.rgb = RGBColor(0x1F, 0x3E, 0x22)
h_card2.line.color.rgb = COLOR_SAGE_ACCENT
tf_h2 = h_card2.text_frame
tf_h2.word_wrap = True
p_h2a = tf_h2.paragraphs[0]
p_h2a.text = "⚡ Real-Time Triage"
p_h2a.font.bold = True
p_h2a.font.size = Pt(15)
p_h2a.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
p_h2b = tf_h2.add_paragraph()
p_h2b.text = "Multi-factor algorithm ranks pending complaints by real danger"
p_h2b.font.size = Pt(11)
p_h2b.font.color.rgb = RGBColor(0xD0, 0xE2, 0xCB)

h_card3 = slide1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.7), Inches(5.0), Inches(3.7), Inches(1.5))
h_card3.fill.solid()
h_card3.fill.fore_color.rgb = RGBColor(0x1F, 0x3E, 0x22)
h_card3.line.color.rgb = COLOR_TERRACOTTA
tf_h3 = h_card3.text_frame
tf_h3.word_wrap = True
p_h3a = tf_h3.paragraphs[0]
p_h3a.text = "👁 Anti-Gaming AI"
p_h3a.font.bold = True
p_h3a.font.size = Pt(15)
p_h3a.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
p_h3b = tf_h3.add_paragraph()
p_h3b.text = "Photo-first verification prevents queue jumping and false alarms"
p_h3b.font.size = Pt(11)
p_h3b.font.color.rgb = RGBColor(0xF1, 0xD4, 0xBC)


# ==================== SLIDE 2: THE PROBLEM ====================
slide2 = prs.slides.add_slide(blank_layout)
add_background(slide2, COLOR_BG_PARCHMENT)
add_header(slide2, "Current Municipal Crisis", "The Problem: Backlog & Blind Prioritization")

create_card(
    slide2, Inches(0.9), Inches(2.0), Inches(3.6), Inches(4.7),
    "Overwhelmed Queues",
    [
        "290+ pending citizen complaints with zero automated triage",
        "Months of backlog waiting for manual arborist visits",
        "Routine pruning requests mixed directly with high-risk deadfall",
        "Field crews dispatched with no advance hazard intelligence"
    ]
)

create_card(
    slide2, Inches(4.8), Inches(2.0), Inches(3.6), Inches(4.7),
    "Flawed First-Come FIFO",
    [
        "Complaints inspected strictly by arrival date, not threat level",
        "A rotting tree over a school waits behind cosmetic branch trims",
        "Atlantic storm events rapidly turn overlooked trees into emergencies",
        "Property damage and power outages occur while crews inspect minor calls"
    ]
)

create_card(
    slide2, Inches(8.7), Inches(2.0), Inches(3.7), Inches(4.7),
    "Subjective Reporting",
    [
        "Citizens exaggerate minor issues using dramatic buzzwords",
        "True critical hazards described calmly get deprioritized",
        "Staff spend hours manually verifying false alarms",
        "No objective verification mechanism between report text and reality"
    ]
)


# ==================== SLIDE 3: THE SCORING ENGINE ====================
slide3 = prs.slides.add_slide(blank_layout)
add_background(slide3, COLOR_BG_PARCHMENT)
add_header(slide3, "Core Decision Engine", "Transparent Multi-Factor Risk Formula (0–100)")

create_card(
    slide3, Inches(0.9), Inches(2.0), Inches(5.5), Inches(2.2),
    "50% — Hazard & Physical Danger",
    [
        "Physical defects: deadwood, root rot, trunk split, severe lean",
        "Direct targets: electrical lines, roadway clearance, structures",
        "Evidence synthesis: photo proof takes precedence over keywords"
    ]
)

create_card(
    slide3, Inches(6.8), Inches(2.0), Inches(5.6), Inches(2.2),
    "25% — Wait Time Escalation",
    [
        "Linear escalation curve: 0 to 180 days (capped at 100 pts)",
        "Guarantees aging complaints will not be permanently starved",
        "Balanced so low-risk calls never leapfrog immediate emergencies"
    ]
)

create_card(
    slide3, Inches(0.9), Inches(4.5), Inches(5.5), Inches(2.2),
    "15% — Location & Public Impact",
    [
        "High-traffic arterials (Spring Garden, Robie) scored 75–100 pts",
        "Residential side streets scored 40–50 pts; parks 20–30 pts",
        "Evaluates density of pedestrian, transit, and vehicular traffic"
    ]
)

create_card(
    slide3, Inches(6.8), Inches(4.5), Inches(5.6), Inches(2.2),
    "10% — Data Review & Confidence",
    [
        "Vague descriptions with missing photos receive 100 pt review penalty",
        "High confidence verified photos receive 0 pt penalty",
        "Forces inspection verification when evidence is incomplete"
    ]
)


# ==================== SLIDE 4: ANTI-GAMING & VISUAL AI ====================
slide4 = prs.slides.add_slide(blank_layout)
add_background(slide4, COLOR_BG_PARCHMENT)
add_header(slide4, "AI & Trust Verification", "Anti-Gaming: Photo-First Evidence Engine")

create_card(
    slide4, Inches(0.9), Inches(2.0), Inches(3.6), Inches(4.7),
    "Photo-First Weighting",
    [
        "Visual proof weighted 65%–80% over textual descriptions",
        "LlamaParse + Vision LLM extracts arborist defect taxonomy",
        "Detects actual structural issues: fungal conks, canopy dieback, wire contact",
        "Keyword stuffing no longer inflates complaint position"
    ]
)

create_card(
    slide4, Inches(4.8), Inches(2.0), Inches(3.6), Inches(4.7),
    "Conflict Detection",
    [
        "Cross-examines citizen text against uploaded field photography",
        "Identifies 'Critical Emergency' claims paired with healthy saplings",
        "Leans heavily into objective image evidence when text conflicts",
        "Penalizes deceptive claims while expediting genuine hazards"
    ]
)

create_card(
    slide4, Inches(8.7), Inches(2.0), Inches(3.7), Inches(4.7),
    "Hallucination Guardrails",
    [
        "Ambiguous images automatically classified as 'Unsure'",
        "Uncertain cases flagged for mandatory arborist human review",
        "Explainable AI reasoning string generated for every score",
        "Zero black-box decisions — every point is auditable"
    ]
)


# ==================== SLIDE 5: HRM OPEN DATA & MAPS ====================
slide5 = prs.slides.add_slide(blank_layout)
add_background(slide5, COLOR_BG_PARCHMENT)
add_header(slide5, "Geospatial Intelligence", "Real Halifax Data & Google Maps Integration")

create_card(
    slide5, Inches(0.9), Inches(2.0), Inches(5.5), Inches(2.2),
    "80,000+ HRM Tree Inventory",
    [
        "Live sync with Halifax Regional Municipality ArcGIS REST API",
        "Matches complaints to exact asset ID, species, and trunk diameter (DBH)",
        "Identifies historical planting date, health status, and wire presence"
    ]
)

create_card(
    slide5, Inches(6.8), Inches(2.0), Inches(5.6), Inches(2.2),
    "Live 311 Service Call Feed",
    [
        "Direct integration with municipal 311 call queues and wrapups",
        "Correlates citizen hotline calls with field incident reports",
        "Tracks call duration, talk time, and dispatch status"
    ]
)

create_card(
    slide5, Inches(0.9), Inches(4.5), Inches(5.5), Inches(2.2),
    "Google Maps Geocoding",
    [
        "Dual-layer geocoding: backend proxy with client-side fallback",
        "Resolves informal Halifax street addresses to high-precision lat/long",
        "Normalized to Halifax regional bounding box"
    ]
)

create_card(
    slide5, Inches(6.8), Inches(4.5), Inches(5.6), Inches(2.2),
    "Google Static Maps Inspection",
    [
        "Instant visual street context directly inside complaint dossier",
        "Shows powerline corridors, sidewalks, and cross-streets",
        "Zero-latency lightweight image generation without heavy map SDK"
    ]
)


# ==================== SLIDE 6: CLOUD & TECH ARCHITECTURE ====================
slide6 = prs.slides.add_slide(blank_layout)
add_background(slide6, COLOR_BG_PARCHMENT)
add_header(slide6, "System Architecture", "Cloud Infrastructure & Full-Stack Tech Stack")

create_card(
    slide6, Inches(0.9), Inches(2.0), Inches(3.6), Inches(4.7),
    "Google Cloud Platform",
    [
        "Bucket: tree-hazard-images-503718 (US-Central1)",
        "Automated upload & public URL streaming for citizen field photos",
        "Google Maps Geocoding & Static Maps APIs",
        "Service account key auth with secure environment isolation"
    ]
)

create_card(
    slide6, Inches(4.8), Inches(2.0), Inches(3.6), Inches(4.7),
    "Backend & Intelligence",
    [
        "Node.js 18+ streaming server with zero external framework dependencies",
        "Multi-step AI pipeline: LlamaParse photo parser + Vision LLM",
        "Supabase PostgreSQL schema for persistent complaints & audit trails",
        "In-memory caching for sub-10ms dashboard loads"
    ]
)

create_card(
    slide6, Inches(8.7), Inches(2.0), Inches(3.7), Inches(4.7),
    "Frontend & Testing",
    [
        "React 19 + TypeScript + Vite modern reactive interface",
        "Tailwind CSS v4 with tree/earth arborist styling",
        "Lucide icons + printable arborist dispatch posters",
        "Vitest test suite with automated GitHub Actions CI pipeline"
    ]
)


# ==================== SLIDE 7: OPERATIONAL DISPATCH ====================
slide7 = prs.slides.add_slide(blank_layout)
add_background(slide7, COLOR_BG_PARCHMENT)
add_header(slide7, "Field Operations", "Arborist Field Dispatch & Incident Operations")

create_card(
    slide7, Inches(0.9), Inches(2.0), Inches(5.5), Inches(2.2),
    "Automated Printable Incident Posters",
    [
        "One-click printable arborist field dossier formatted for trucks",
        "Prominent QR code, GPS coordinates, defect tags, and photo",
        "Clean printer-friendly CSS stylesheet hides navigation bars"
    ]
)

create_card(
    slide7, Inches(6.8), Inches(2.0), Inches(5.6), Inches(2.2),
    "Real-Time Priority Dashboard",
    [
        "Live triage sorting: Critical (80+), High (60+), Medium, Low",
        "Visual hazard tags: Hanging Limb, Wires, Rot, Split, Cavity",
        "Instant filtering by priority status, neighborhood, and search"
    ]
)

create_card(
    slide7, Inches(0.9), Inches(4.5), Inches(5.5), Inches(2.2),
    "Citizen Submission Portal",
    [
        "Simple, accessible mobile web form for Halifax residents",
        "Instant camera photo upload with automatic address geocoding",
        "Immediate tracking ID and transparent status updates"
    ]
)

create_card(
    slide7, Inches(6.8), Inches(4.5), Inches(5.6), Inches(2.2),
    "Proximity & Shift Route Planning",
    [
        "Clusters neighboring high-priority complaints for efficient truck routes",
        "Eliminates wasteful zig-zag driving across HRM regional boundaries",
        "Cuts crew fuel consumption and speeds up emergency response"
    ]
)


# ==================== SLIDE 8: IMPACT & MEASURABLE OUTCOMES ====================
slide8 = prs.slides.add_slide(blank_layout)
add_background(slide8, COLOR_BG_PARCHMENT)
add_header(slide8, "Value & Community Impact", "Measurable Impact & Municipal ROI")

create_card(
    slide8, Inches(0.9), Inches(2.0), Inches(3.6), Inches(4.7),
    "Operational Speed",
    [
        "85% reduction in initial triage turnaround (hours down to seconds)",
        "Immediate identification of lethal hazards upon report submission",
        "Eliminates arborist commute time spent investigating fake reports",
        "Automated batch processing scores entire queue in seconds"
    ]
)

create_card(
    slide8, Inches(4.8), Inches(2.0), Inches(3.6), Inches(4.7),
    "Public Safety & Storms",
    [
        "Catastrophic deadfalls caught before Atlantic wind and ice storms",
        "High-risk trees cleared near schools, hospitals, and powerlines first",
        "Fewer prolonged power grid blackouts caused by falling limbs",
        "Substantial reduction in municipal property liability claims"
    ]
)

create_card(
    slide8, Inches(8.7), Inches(2.0), Inches(3.7), Inches(4.7),
    "Equity & Trust",
    [
        "Every neighborhood evaluated by the same objective mathematical formula",
        "Loudest or most persistent callers cannot leapfrog dangerous trees",
        "Aging complaints automatically escalate so no community is forgotten",
        "100% auditable arborist decision trail for municipal governance"
    ]
)


# ==================== SLIDE 9: CONCLUSION & THANK YOU ====================
slide9 = prs.slides.add_slide(blank_layout)
add_background(slide9, COLOR_DARK_FOREST)

tb_c1 = slide9.shapes.add_textbox(Inches(0.9), Inches(1.8), Inches(11.5), Inches(1.8))
tf_c1 = tb_c1.text_frame
tf_c1.word_wrap = True
p_c1a = tf_c1.paragraphs[0]
p_c1a.text = "Protecting Halifax's Urban Canopy."
p_c1a.font.size = Pt(44)
p_c1a.font.bold = True
p_c1a.font.color.rgb = RGBColor(0xFA, 0xF8, 0xF5)
p_c1a.font.name = "Calibri"

p_c1b = tf_c1.add_paragraph()
p_c1b.text = "Objective • Transparent • Cloud-Native • Life-Saving"
p_c1b.font.size = Pt(20)
p_c1b.font.color.rgb = RGBColor(0xC2, 0xDC, 0xB8)
p_c1b.font.name = "Calibri"

summary_card = slide9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.9), Inches(3.8), Inches(11.5), Inches(2.7))
summary_card.fill.solid()
summary_card.fill.fore_color.rgb = RGBColor(0x1F, 0x3E, 0x22)
summary_card.line.color.rgb = COLOR_SAGE_ACCENT
tf_sc = summary_card.text_frame
tf_sc.word_wrap = True

p_sct = tf_sc.paragraphs[0]
p_sct.text = "Key Takeaways:"
p_sct.font.bold = True
p_sct.font.size = Pt(18)
p_sct.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
p_sct.space_after = Pt(12)

points = [
    "Replaced flawed first-come FIFO queue with a dynamic 0–100 risk scoring formula",
    "Anti-gaming AI ensures photos verify citizen claims before arborist truck rollouts",
    "Unified cloud infrastructure: GCP Storage, Google Maps Geocoding, Supabase, Node & React 19",
    "Ready for live deployment across Halifax Regional Municipality Urban Forestry"
]

for pt in points:
    p = tf_sc.add_paragraph()
    p.text = f"✔  {pt}"
    p.font.size = Pt(14)
    p.font.color.rgb = RGBColor(0xE0, 0xEF, 0xDC)
    p.space_after = Pt(8)

output_path = os.path.join(os.getcwd(), "Tree_Hazard_Detection_Pitch.pptx")
prs.save(output_path)
print(f"Successfully generated: {output_path}")
