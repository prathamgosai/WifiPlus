---
name: stitch
description: UI design, visual prototyping, and frontend interface generation using Stitch AI & StitchMCP. Use when creating UI/UX designs, generating polished interface screens, designing modern app layouts, building design systems, or enhancing web and mobile user experiences.
---

# Stitch UI & StitchMCP Skill

**Stitch UI** is an AI-powered interface design workflow that turns ideas into polished, production-ready app screens and frontend designs faster. 

This skill provides comprehensive instructions for interacting with the **StitchMCP** toolset, generating UI designs, establishing design systems, and converting Stitch visual concepts into high-quality HTML, CSS, and JavaScript.

---

## 1. Core Concepts & Capabilities

- **Prompt-Guided Screen Building**: Describe app screens, feature requirements, visual direction, and layout structures to generate full UI designs (`generate_screen_from_text`).
- **Design Systems (`create_design_system`, `create_design_system_from_design_md`)**: Establish cohesive typography, color tokens, elevation rules, spacing scales, and component guidelines for app projects.
- **Screen Editing & Variants (`edit_screens`, `generate_variants`)**: Refine generated screens, tweak layouts, alter themes, or produce multiple design options for user testing.
- **Frontend Code Integration**: Translate Stitch design tokens, glassmorphism patterns, typography hierarchies, and layout structures into responsive HTML5, CSS3, and JavaScript code.

---

## 2. StitchMCP Toolset Reference

| Tool Name | Primary Purpose | Key Parameters |
| :--- | :--- | :--- |
| `create_project` | Container for UI designs & screens | `title` |
| `generate_screen_from_text` | Generate full UI screen from prompt | `projectId`, `prompt`, `deviceType` (`DESKTOP`/`MOBILE`), `designSystem` |
| `create_design_system` | Define custom design tokens & guidelines | `displayName`, `styleGuidelines`, `theme` |
| `create_design_system_from_design_md` | Build design system from Design MD spec | `projectId`, `designMd` |
| `generate_variants` | Generate variations of an existing screen | `screenId`, `prompt` |
| `edit_screens` | Edit specific components or layout of screen | `screenId`, `prompt` |
| `get_screen` | Fetch screen details, HTML code, & preview URL | `screenId` |
| `list_screens` / `list_projects` | Query active screens or projects | `projectId` |

---

## 3. Stitch Design Principles & Best Practices

### A. High-Tech Glassmorphism & Cyber-Glass Aesthetics
- **Spatial Depth**: Use multi-layered dark backgrounds (`#06090f`, `#0b0e14`, `#10131a`) paired with semi-transparent panels (`rgba(255, 255, 255, 0.03)` to `rgba(255, 255, 255, 0.08)`).
- **Backdrop Blur**: Apply `backdrop-filter: blur(16px)` to `blur(24px)` for glassmorphic elements.
- **Machined Edges**: Highlight borders with thin 1px lines using low-opacity light borders (`rgba(255, 255, 255, 0.12)`) and inset light reflections.
- **Luminance & Neon Accents**: Use high-contrast electric colors (Neon Cyan `#00f2ff`, Electric Violet `#7000ff`, Emerald `#00e676`) with glowing drop-shadows (`box-shadow: 0 0 20px rgba(0, 242, 255, 0.4)`).

### B. Typography & Grid Precision
- **Dual-Type Scale**: Combine clean humanist sans-serif fonts (e.g., **Inter**, **Outfit**) for structural headlines with technical monospaced fonts (e.g., **JetBrains Mono**) for data metrics, labels, and telemetry.
- **Subtle Blueprint Grid**: Apply an ambient background grid overlay (`32px` squares at `4%` to `6%` line opacity) to reinforce structural precision.
- **Fluid Layout**: Enforce 8px grid alignment for spacing, containers, and padding.

### C. Component Patterns
- **Gauges & Dials**: Concentric SVG rings with animated stroke offsets, glowing head-points, and central telemetry readings.
- **HUD Metric Cards**: Compact glass cards featuring top accent indicators, monospaced value counters, unit labels, and interactive hover glows.
- **Status Chips & Badges**: Pill containers with low-opacity colored fills and active 4px solid pulsing indicators.
- **AI Diagnostics Panels**: Floating dark glass containers with glowing status borders, recommendation pills, and interactive insights cards.

---

## 4. Redesign Workflow

1. **Understand Project Scope**: Identify core user flows (Dashboard, Speed Gauge, Diagnostics, Leaderboards, History).
2. **Establish Design System**: Define color tokens, typography scales, glass levels, and component styles.
3. **Generate Screens via StitchMCP**: Call `generate_screen_from_text` with targeted prompts to generate interface designs.
4. **Implement Clean Code**: Translate Stitch visual guidelines into semantic HTML, CSS custom variables, and JS logic without breaking existing application APIs or state handlers.
5. **Verify & Refine**: Test responsive layouts across mobile and desktop viewports, ensure WCAG AA contrast compliance, and verify smooth 60fps animations.
