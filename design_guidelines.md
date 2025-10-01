# Design Guidelines: AI Middleware & Analysis Tool

## Design Approach

**Selected Framework:** Design System Approach - Material Design + Linear-inspired aesthetics

**Rationale:** This is a utility-focused, data-dense developer tool requiring efficiency, clarity, and real-time information display. The design prioritizes function, readability, and professional polish over marketing aesthetics.

**Key Principles:**
1. Information hierarchy through typography and spacing
2. Real-time feedback with subtle status indicators
3. Scannable data displays with clear labels
4. Professional developer tool aesthetic
5. Minimal distractions, maximum clarity

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary):**
- Background: 220 15% 12% (deep slate)
- Surface: 220 15% 16% (elevated panels)
- Surface Elevated: 220 15% 20% (cards, dashboard)
- Border: 220 15% 25% (subtle divisions)
- Text Primary: 220 10% 95%
- Text Secondary: 220 10% 70%
- Text Muted: 220 10% 50%

**Accent Colors:**
- Primary Blue: 210 100% 55% (actions, links)
- Success Green: 142 70% 50% (validation passed, low security risk)
- Warning Orange: 30 90% 60% (medium security risk)
- Danger Red: 0 75% 60% (high security risk, validation failed)
- Info Purple: 260 70% 65% (model selection, process states)

**Light Mode:**
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Border: 220 15% 85%
- Text Primary: 220 15% 15%
- Text Secondary: 220 10% 40%

### B. Typography

**Font Stack:**
- Primary: 'Inter' (Google Fonts) for UI text
- Monospace: 'JetBrains Mono' (Google Fonts) for code, prompts, logs

**Scale:**
- Display: text-3xl font-semibold (dashboard headers)
- Heading: text-xl font-semibold (section titles)
- Subheading: text-base font-medium (field labels)
- Body: text-sm (general content)
- Caption: text-xs (timestamps, meta info)
- Code: text-sm font-mono (prompts, parameters)

### C. Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section spacing: gap-4 to gap-8
- Generous whitespace: py-8 to py-12 for major sections

**Grid Structure:**
- Desktop: 2-column split (60% chat / 40% dashboard) using `grid grid-cols-5`
- Chat area: `col-span-3`
- Dashboard: `col-span-2` with sticky positioning
- Tablet/Mobile: Stack vertically, dashboard becomes collapsible drawer

---

## Component Library

### Navigation
- Top app bar with fixed positioning
- Logo/title on left
- User menu and settings icon on right
- Height: h-14, background matches surface elevated
- Subtle bottom border

### Chat Interface
**Message Container:**
- User messages: Right-aligned, primary blue background with 20% opacity
- AI responses: Left-aligned, surface elevated background
- Padding: p-4
- Border radius: rounded-lg
- Max width: max-w-3xl for readability
- Spacing between messages: space-y-4

**Input Area:**
- Fixed bottom position with backdrop blur
- Multi-line textarea with auto-expand (max 6 lines)
- Send button with primary blue background
- Placeholder text in muted color
- Border: border-t with subtle color
- Height: min-h-16

### Real-Time Analysis Dashboard

**Panel Container:**
- Sticky top-16 positioning
- Surface elevated background
- Rounded-lg border
- Padding: p-6
- Organized into collapsible sections

**Data Fields:**
- Label: text-xs uppercase tracking-wide text-secondary
- Value: text-sm font-medium mt-1
- Each field in a card: p-4 bg-surface rounded border
- Vertical spacing: space-y-4

**Security Score Indicator:**
- Horizontal progress bar visualization
- Color-coded: 0-3 (green), 4-6 (orange), 7-10 (red)
- Large numeric display: text-2xl font-bold
- Score out of 10 shown below

**Selected Model Badge:**
- Pill-shaped: rounded-full px-3 py-1
- Info purple background with 20% opacity
- Icon prefix (model provider logo)
- Font: text-sm font-medium

**Optimized Prompt Display:**
- Monospace font in scrollable container
- Max height: max-h-48 overflow-y-auto
- Background: slightly darker than surface
- Padding: p-3
- Syntax highlighting style using muted colors

**Parameters Display:**
- Key-value pairs in grid: grid-cols-2 gap-2
- Each param: text-xs, key in secondary color, value in primary

### Process Log

**Log Container:**
- Bottom section of dashboard
- Max height: max-h-64 overflow-y-auto
- Auto-scroll to latest entry
- Background: surface with subtle border

**Log Entries:**
- Each entry: flex items-center gap-3 p-2
- Timestamp: text-xs text-muted font-mono
- Message: text-sm
- Status icon: animated spinner for in-progress, checkmark for complete
- Color-coded by type: info (blue), success (green), warning (orange), error (red)
- Subtle hover background on recent entries

### Buttons & Controls
- Primary: bg-primary blue, text-white, rounded-md px-4 py-2
- Secondary: border variant with outline, transparent background
- Icon buttons: p-2 rounded-full hover:bg-surface
- Disabled state: opacity-50 cursor-not-allowed

### Modals & Overlays
**Deep Research Confirmation:**
- Centered modal with backdrop blur
- Surface elevated background
- Width: max-w-md
- Content: Icon, title, estimated time, description
- Actions: Two buttons (Proceed / Choose Faster Alternative)
- Shadow: shadow-2xl

---

## Animations & Interactions

**Real-Time Updates:**
- Subtle fade-in for new log entries: opacity transition 200ms
- Pulse animation on active processing indicator
- Smooth scroll in process log

**Data Changes:**
- Field values fade transition when updating: 150ms
- Security score progress bar animated fill
- No distracting hover effects on data displays

**Loading States:**
- Skeleton screens for dashboard fields during initial load
- Spinner for AI response generation
- Subtle shimmer on loading text

---

## Accessibility & Responsive

**Dark Mode:**
- Default to dark mode
- All form inputs maintain dark backgrounds
- Sufficient contrast ratios (WCAG AA minimum)

**Responsive Breakpoints:**
- Mobile (<768px): Single column, collapsible dashboard
- Tablet (768-1024px): Adjusted split (50/50)
- Desktop (>1024px): Optimal 60/40 split

**Focus States:**
- Clear focus rings on interactive elements
- Keyboard navigation support throughout
- Screen reader labels for all icons and status indicators

---

## Special Considerations

**Real-Time Feedback:**
- Use WebSocket connections for live updates
- Optimistic UI updates where appropriate
- Clear loading and error states at each pipeline stage

**Data Density:**
- Collapsible sections in dashboard to manage information overload
- Progressive disclosure: show summary, expand for details
- Tooltips for technical parameters

**Professional Polish:**
- Consistent 8px spacing grid throughout
- Subtle elevation through shadows (not excessive)
- Monospace fonts for all technical content
- Clean, organized visual hierarchy with generous whitespace