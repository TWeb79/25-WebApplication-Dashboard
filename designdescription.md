# Design Description - Local WebApp Monitor

This document describes the visual design system of the Local WebApp Monitor application. Use this as a reference when creating new applications in the same visual style.

---

## 1. Color Palette

### Primary Colors
| Name | Hex Code | Usage |
|------|----------|-------|
| Primary | `#5046e5` | Main brand color, buttons, active states |
| Primary Light | `#818cf8` | Hover states, accents |
| Primary Dark | `#3730a3` | Active/pressed states |

### Accent Colors
| Name | Hex Code | Usage |
|------|----------|-------|
| Accent | `#0ea5e9` | Links, secondary highlights |
| Success | `#10b981` | Online status, success messages |
| Warning | `#f59e0b` | Warnings, pending states |
| Danger | `#ef4444` | Errors, offline status, delete actions |
| Info | `#3b82f6` | Information, neutral highlights |

### Background Colors (Light Theme)
| Name | Hex Code | Usage |
|------|----------|-------|
| Main | `#f8fafc` | Page background |
| Secondary | `#ffffff` | Sidebar, header |
| Tertiary | `#f1f5f9` | Card hover, input backgrounds |
| Card | `#ffffff` | Card surfaces |
| Hover | `#f1f5f9` | Interactive hover states |

### Background Colors (Dark Theme)
| Name | Hex Code | Usage |
|------|----------|-------|
| Main | `#0f172a` | Page background |
| Secondary | `#1e293b` | Sidebar, header |
| Tertiary | `#334155` | Card hover, input backgrounds |
| Card | `#1e293b` | Card surfaces |
| Hover | `#28354a` | Interactive hover states |

### Text Colors
| Name | Hex Code | Usage |
|------|----------|-------|
| Primary | `#1e293b` | Main text (light theme) / `#f8fafc` (dark) |
| Secondary | `#64748b` | Secondary text / `#94a3b8` (dark) |
| Muted | `#94a3b8` | Placeholder text / `#64748b` (dark) |
| Inverse | `#ffffff` | Text on dark backgrounds |

### Border & Shadow Colors
| Name | Hex Code | Usage |
|------|----------|-------|
| Border | `#e2e8f0` | Default borders / `#334155` (dark) |
| Border Light | `#cbd5e1` | Hover borders / `#475569` (dark) |
| Border Focus | `#5046e5` | Focus ring color |

---

## 2. Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

### Font Weights
| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text |
| Medium | 500 | Navigation, secondary text |
| Semi-bold | 600 | Section titles, badges |
| Bold | 700 | Page titles, card values |

### Font Sizes
| Element | Size | Line Height |
|---------|------|-------------|
| Page Title | 24px | 1.2 |
| Section Title | 18-20px | 1.3 |
| Card Title | 16px | 1.4 |
| Body Text | 14px | 1.6 |
| Small Text | 12-13px | 1.5 |
| Badge Text | 11px | 1.2 |

---

## 3. Spacing System

### Base Unit
All spacing uses multiples of 4px:

| Name | Value | Usage |
|------|-------|-------|
| xs | 4px | Tight spacing, badge padding |
| sm | 8px | Between related elements |
| md | 16px | Default component padding |
| lg | 24px | Section spacing |
| xl | 32px | Large section gaps |

---

## 4. Layout Structure

### Sidebar (Fixed)
- Width: 260px
- Position: Fixed left
- Background: `var(--bg-secondary)`
- Border: 1px right border (`var(--border-color)`)
- Sections: Header, Navigation, Footer

### Main Content Area
- Margin-left: 260px (sidebar width)
- Min-height: 100vh
- Background: `var(--bg-main)`

### Header (Sticky)
- Background: `var(--bg-secondary)`
- Border-bottom: 1px solid `var(--border-color)`
- Padding: 24px 32px
- Position: sticky top
- Z-index: 50
- Contains: Page title, search box, action buttons

### Content Area
- Padding: 32px

### Grid Layout
- Stats cards: 4 columns (responsive)
- App cards: Grid with gap: 24px

---

## 5. Component Specifications

### 5.1 Stat Cards

```html
<div class="stat-card">
    <div class="stat-icon-wrapper [primary|success|warning|danger]">
        <i class="fas fa-icon"></i>
    </div>
    <div class="stat-content">
        <div class="stat-value">0</div>
        <div class="stat-label">Label</div>
    </div>
</div>
```

- Border radius: 12px
- Padding: 24px
- Border: 1px solid `var(--border-color)`
- Hover: translateY(-2px), box-shadow, border-color change
- Icon wrapper: 48x48px, border-radius: 8px

### 5.2 App Cards

```html
<div class="app-card">
    <div class="app-card-header">
        <img class="app-screenshot" src="..." />
        <div class="app-status-badge">
            <span class="status-dot [online|offline]"></span>
            Status
        </div>
        <span class="category-badge">Category</span>
    </div>
    <div class="app-card-body">
        <div class="app-card-title">App Name</div>
        <div class="app-url">URL</div>
        <div class="app-meta-row">...</div>
    </div>
</div>
```

- Border radius: 12px
- Screenshot: 100% width, 140px height, object-fit cover
- Status badge: Absolute position top-right
- Category badge: Absolute position top-left

### 5.3 Navigation Items

```html
<li class="nav-item [active]">
    <span class="nav-icon"><i class="fas fa-icon"></i></span>
    Label
    <span class="nav-badge">Count</span>
</li>
```

- Padding: 8px 16px
- Border radius: 8px
- Active state: Primary background, white text
- Active indicator: 3px left accent bar

### 5.4 Buttons

#### Primary Button
```css
background: var(--primary);
color: white;
border: 1px solid var(--primary);
```
- Hover: `var(--primary-dark)`

#### Secondary/Outline Button
```css
background: transparent;
border: 1px solid var(--border-color);
color: var(--text-primary);
```
- Hover: `var(--bg-hover)`, border-color `var(--border-light)`

#### Danger Button
```css
background: var(--danger);
color: white;
border: 1px solid var(--danger);
```

- Border radius: 8px
- Padding: 8px 16px
- Transition: 150ms ease

### 5.5 Form Inputs

```css
background: var(--bg-main);
border: 1px solid var(--border-color);
border-radius: 8px;
padding: 8px 16px;
font-size: 14px;
color: var(--text-primary);
```
- Focus: border-color `var(--primary)`, box-shadow 0 0 0 3px rgba(80, 70, 229, 0.1)
- Placeholder: `var(--text-muted)`

### 5.6 Modals

```html
<div class="modal-overlay">
    <div class="modal">
        <div class="modal-header">
            <h3 class="modal-title">Title</h3>
            <button class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">Content</div>
        <div class="modal-footer">Actions</div>
    </div>
</div>
```

- Overlay: rgba(0, 0, 0, 0.5), fixed full screen
- Modal: max-width 560px, background white, border-radius 12px
- Header/Footer: padding 16px-24px, border-bottom/top

### 5.7 Toast Notifications

```html
<div class="toast-container">
    <div class="toast [success|error|info|warning]">
        <i class="fas fa-icon"></i>
        <span>Message</span>
    </div>
</div>
```

- Position: Top-right, fixed
- Background: White with colored left border
- Border-radius: 8px
- Shadow: `var(--shadow-lg)`
- Auto-dismiss: 3-5 seconds

### 5.8 Filter/Segmented Controls

```html
<div class="filter-btn-group">
    <button class="filter-btn active" data-filter="all">All</button>
    <button class="filter-btn" data-filter="online">Online</button>
    <button class="filter-btn" data-filter="offline">Offline</button>
</div>
```

- Border-radius: 8px (group), 6px (buttons)
- Active: Primary background, white text
- Inactive: Transparent with border

---

## 6. Visual Effects

### Shadows
```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
```

### Border Radius
```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
```

### Transitions
```css
--transition-fast: 150ms ease;
--transition-base: 200ms ease;
--transition-slow: 300ms ease;
```

---

## 7. Responsive Breakpoints

| Breakpoint | Width | Adjustments |
|------------|-------|-------------|
| Desktop | ≥1200px | Full layout, 4 stat columns |
| Tablet | 768-1199px | 2 stat columns, adjusted sidebar |
| Mobile | <768px | Single column, hamburger menu |

---

## 8. Iconography

- Primary icon library: Font Awesome 6.4.0
- Icon sizes: 14-24px typically
- Icon colors: Inherit from parent or use semantic colors

---

## 9. Dark Theme Implementation

The application supports dark theme via CSS custom properties. Key changes:

1. Swap background colors from light to dark palette
2. Invert text colors
3. Adjust border colors
4. Maintain same component structure

```css
[data-theme="dark"] {
    --bg-main: #0f172a;
    --bg-secondary: #1e293b;
    --bg-tertiary: #334155;
    --bg-card: #1e293b;
    --bg-hover: #28354a;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --border-color: #334155;
    --border-light: #475569;
}
```

---

## 10. Animation Guidelines

### Loading States
- Spinner: Rotating circle animation
- Progress bar: Smooth width transition

### Micro-interactions
- Button hover: Scale 1.02, shadow increase
- Card hover: TranslateY(-2px), shadow
- Modal: Fade in overlay, scale up modal

### Page Transitions
- Smooth scroll behavior
- View switching: Fade transitions

---

## 11. Example HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>App Title</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="app-container">
        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <div class="logo">
                    <div class="logo-icon">
                        <i class="fas fa-radar"></i>
                    </div>
                    <div class="logo-text">
                        App Name
                        <div class="logo-subtitle">Subtitle</div>
                    </div>
                </div>
            </div>
            <nav class="sidebar-nav">
                <!-- Navigation items -->
            </nav>
        </aside>
        
        <!-- Main Content -->
        <main class="main-content">
            <header class="page-header">
                <div class="header-left">
                    <h1 class="page-title">Page Title</h1>
                    <span class="page-subtitle">Subtitle</span>
                </div>
                <div class="header-actions">
                    <!-- Search, buttons -->
                </div>
            </header>
            
            <div class="content-area">
                <!-- Stats, Grid, etc. -->
            </div>
        </main>
    </div>
    
    <!-- Modals -->
    <div class="modal-overlay" id="modal">
        <div class="modal">
            <!-- Content -->
        </div>
    </div>
    
    <script src="app.js"></script>
</body>
</html>
```

---

## 12. Quick Reference CSS Variables

```css
:root {
    /* Colors */
    --primary: #5046e5;
    --primary-light: #818cf8;
    --primary-dark: #3730a3;
    --accent: #0ea5e9;
    --success: #10b981;
    --warning: #f59e0b;
    --danger: #ef4444;
    --info: #3b82f6;
    
    /* Backgrounds */
    --bg-main: #f8fafc;
    --bg-secondary: #ffffff;
    --bg-tertiary: #f1f5f9;
    --bg-card: #ffffff;
    --bg-hover: #f1f5f9;
    
    /* Text */
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --text-muted: #94a3b8;
    --text-inverse: #ffffff;
    
    /* Borders */
    --border-color: #e2e8f0;
    --border-light: #cbd5e1;
    --border-focus: #5046e5;
    
    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    
    /* Spacing */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;
    
    /* Border Radius */
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    
    /* Transitions */
    --transition-fast: 150ms ease;
    --transition-base: 200ms ease;
    --transition-slow: 300ms ease;
}
```
