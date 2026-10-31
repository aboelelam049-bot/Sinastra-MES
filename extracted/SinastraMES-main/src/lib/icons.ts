import * as Icons from 'lucide-react';
import type { ElementType } from 'react';

export type IconType = ElementType;

export function getIcon(name: string): IconType {
  const icons = Icons as unknown as Record<string, IconType>;
  return icons[name] ?? Icons.Circle;
}
