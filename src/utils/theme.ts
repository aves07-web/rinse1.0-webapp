import { AppearanceTheme, LogoSizePreset, OrderStage } from '../types/erp';

export const THEME_OPTIONS: Array<{
  id: AppearanceTheme;
  label: string;
  description: string;
  swatches: string[];
}> = [
  {
    id: 'classic-blue',
    label: 'Classic Blue',
    description: 'Clean white and signature Apple blue with subtle slate accents.',
    swatches: ['#0071E3', '#1E40AF', '#475569'],
  },
  {
    id: 'colorful',
    label: 'Colorful',
    description: 'Controlled semantic colors across dashboard cards, badges, sidebar icons, and tables.',
    swatches: ['#0071E3', '#16A34A', '#D97706', '#7C3AED', '#0D9488'],
  },
  {
    id: 'calm',
    label: 'Calm',
    description: 'Softer low-saturation tints for long shifts with gentle contrast.',
    swatches: ['#3B82F6', '#4B7F6E', '#8B7BA8'],
  },
];

export function getLogoMaxHeightMm(size?: LogoSizePreset): number {
  if (size === 'Small') return 18;
  if (size === 'Large') return 32;
  return 24;
}

export function getLogoMaxHeightPx(size?: LogoSizePreset): number {
  if (size === 'Small') return 54;
  if (size === 'Large') return 94;
  return 72;
}

export function getOrderStageBadgeClass(stage: OrderStage, theme: AppearanceTheme = 'colorful'): string {
  if (theme === 'classic-blue') {
    switch (stage) {
      case 'New order':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'Not yet received':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Received':
        return 'bg-blue-50 text-[#0071E3] border-blue-200';
      case 'Processing':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'Ready to deliver':
        return 'bg-cyan-50 text-cyan-800 border-cyan-200';
      case 'Delivered':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  }
  if (theme === 'calm') {
    switch (stage) {
      case 'New order':
        return 'bg-slate-100/80 text-slate-700 border-slate-200';
      case 'Not yet received':
        return 'bg-amber-50/70 text-amber-800 border-amber-200/80';
      case 'Received':
        return 'bg-blue-50/70 text-blue-800 border-blue-200/80';
      case 'Processing':
        return 'bg-purple-50/70 text-purple-800 border-purple-200/80';
      case 'Ready to deliver':
        return 'bg-teal-50/70 text-teal-800 border-teal-200/80';
      case 'Delivered':
        return 'bg-emerald-50/70 text-emerald-800 border-emerald-200/80';
    }
  }
  // 'colorful' default
  switch (stage) {
    case 'New order':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'Not yet received':
      return 'bg-amber-50 text-amber-800 border-amber-300';
    case 'Received':
      return 'bg-blue-50 text-blue-700 border-blue-300';
    case 'Processing':
      return 'bg-purple-50 text-purple-700 border-purple-300';
    case 'Ready to deliver':
      return 'bg-teal-50 text-teal-800 border-teal-300';
    case 'Delivered':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300';
  }
}

export function getOrderStageBadgeStyle(stage: OrderStage, theme: AppearanceTheme = 'colorful'): string {
  return `inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md border whitespace-nowrap ${getOrderStageBadgeClass(
    stage,
    theme
  )}`;
}
