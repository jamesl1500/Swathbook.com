/**
 * Swathbook design system for the client app.
 *
 * The website's look (apps/swathbook-web) rebuilt as React Native components.
 * Import everything from '@/design-system'; screens should not need raw
 * colors, font names or magic numbers.
 */

export * from './tokens';
export * from './typography';
export { brandTextColor } from './color';
export { useBrandFonts } from './fonts';
export { navigationTheme, stackScreenOptions } from './navigation';

export { Avatar, initials } from './components/avatar';
export { Badge, Chip, type BadgeTone, type ChipProps } from './components/badge';
export { BrandPin, Logo, LogoMark, MapGrid, type MapGridProps } from './components/brand';
export { Button, IconButton, type ButtonProps, type ButtonSize, type ButtonVariant, type IconButtonProps } from './components/button';
export { EmptyState, FormMessage } from './components/feedback';
export { SearchField, TextField, type TextFieldProps } from './components/field';
export { Eyebrow, PageHeader, SectionHeader } from './components/headers';
export { ListGroup, ListRow, type ListRowProps } from './components/list';
export { OptionCard } from './components/option';
export { PageDots, StepProgress } from './components/progress';
export { Rise } from './components/rise';
export { Screen, ScreenFooter, type ScreenProps } from './components/screen';
export { Card, CardTitle, Divider, PressableCard, Stat, type CardProps, type PressableCardProps } from './components/surfaces';
export { TabBar, type TabBarProps } from './components/tab-bar';
export { SegmentedTabs, type SegmentItem } from './components/tabs';
export { Text, textTones, type TextProps, type TextTone } from './components/text';
