# ShieldMe Design System v3

## Theme
- **Light-first** — clean white UI inspired by Mota, MetaMask
- Dark mode via `prefers-color-scheme: dark` (automatic)

## Color Palette

### Light Theme (Default)
- Background:     `#F7F8FC` (light blue-gray), `#F0F2F7` (subtle), `#FFFFFF` (elevated)
- Surface:        `#FFFFFF` (cards), `#F5F6FA` (hover)
- Border:         `rgba(0,0,0,0.06)` (subtle), `rgba(0,0,0,0.10)` (strong)
- Text:           `#1A1B2E` (primary), `#6B7280` (muted), `#9CA3AF` (subtle)

### Brand
- Primary:        `#6366F1` (indigo-500)
- Hover:          `#4F46E5` (indigo-600)
- Soft:           `rgba(99,102,241,0.07)`
- Gradient:       `linear-gradient(135deg, #6366F1, #818CF8)`

### Semantic Colors
- Success:        `#10B981` (emerald)
- Warning:        `#F59E0B` (amber)
- Danger:         `#EF4444` (red)
- Info:           `#3B82F6` (blue)
- Pro:            `#F59E0B` → `#F97316` (amber → orange gradient)

### Score Tiers
- Excellent (0-20):   `#10B981` (green)
- Good (21-40):       `#10B981` (green)
- Moderate (41-60):   `#F59E0B` (amber)
- Poor (61-80):       `#F97316` (orange)
- Critical (81-100):  `#EF4444` (red)

## Typography
- Family: Inter, -apple-system, Segoe UI Variable, system-ui, sans-serif
- Mono:   JetBrains Mono, SF Mono, ui-monospace
- Scale:  10 / 11 / 13 / 14 / 16 / 18 / 22 / 28px
- Body:   14px (up from 13px for better readability)

## Icons
- Library: Lucide (inline SVG, 20x20, stroke-width 1.75)
- Nav: Home, ScanSearch, FolderOpen, Radar, Diamond (Pro), Settings
- Logo: Custom SVG shield with gradient fill + checkmark

## Shape
- Radius: 8 / 12 / 16 / 20 / 999px
- Cards: 16px radius, 1px solid border, subtle shadow
- Shadows: soft (0 1px 3px rgba(0,0,0,0.04))

## Layout
- Side panel mode: full width, 100vh height
- Bottom navigation (mobile-app pattern)
- Top bar: logo + title + version badge

## Motion
- Duration: 150ms (fast), 200ms (default), 350ms (emphasis)
- Easing: cubic-bezier(0.2, 0.8, 0.2, 1)
- Score gauge: animate on mount with 1.2s ease-out
- Cards: translateY(-2px) on hover
- Page transitions: opacity fade 200ms

## Navigation
- 6 tabs: Dashboard, Scan, Audit, Radar, Pro, Settings
- Bottom-fixed nav bar
- Active state: brand-soft background + brand text color
