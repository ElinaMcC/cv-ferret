// Heroicons (https://heroicons.com) - MIT licensed
// Standard icon library for CV Builder
// Usage: <Icon.Edit className="icon" /> or <Icon.Edit /> for inline use

import {
  PencilIcon,
  PlusIcon,
  TrashIcon,
  StarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Bars3Icon,
  ArrowLeftIcon,
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

export const Icon = {
  Edit: PencilIcon,
  Add: PlusIcon,
  Delete: TrashIcon,
  SetDefault: StarIcon,
  ChevronDown: ChevronDownIcon,
  ChevronRight: ChevronRightIcon,
  DragHandle: Bars3Icon,
  Back: ArrowLeftIcon,
  Close: XMarkIcon,
  Check: CheckIcon,
  Warning: ExclamationTriangleIcon,
  Info: InformationCircleIcon,
  Sparkles: SparklesIcon,
};

// Icon sizing presets (use with className="icon icon-sm" etc.)
export const ICON_SIZES = {
  sm: '16px',      // Small inline icons
  md: '20px',      // Default action icons
  lg: '24px',      // Large buttons
  xl: '32px',      // Hero/large sections
};
