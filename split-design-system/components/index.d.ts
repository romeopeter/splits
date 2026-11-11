/* Split component types (documentation). Tokens: tokens.json. Import via window.Split. */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
export interface IconProps { name: string; size?: number; title?: string; strokeWidth?: number; className?: string }
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; icon?: string; iconEnd?: string }
export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> { icon: string; label: string; size?: Size; active?: boolean; iconSize?: number }
export interface ToolRailProps { label?: string; children?: React.ReactNode }
export interface FieldProps { label?: string; caption?: string; value?: string | number; unit?: string; type?: 'text' | 'number'; stepper?: boolean; multiline?: boolean; rows?: number; placeholder?: string; disabled?: boolean; onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> }
export interface SelectProps { label: string; value?: string; options: Array<string | { value: string; label: string }>; onChange?: React.ChangeEventHandler<HTMLSelectElement>; disabled?: boolean }
export interface SegmentedControlProps { label: string; options: Array<{ value: string; icon?: string; text?: string; label?: string }>; value?: string; defaultValue?: string; onChange?: (value: string) => void }
export interface ColorFieldProps { label?: string; value: string; opacity?: number }
export interface SliderProps { label: string; min?: number; max?: number; step?: number; value?: number; defaultValue?: number; valueText?: string; disabled?: boolean; onChange?: (value: number) => void }
export interface AvatarProps { name: string; src?: string; color?: 'collab-1' | 'collab-2' | 'collab-3' | 'collab-4'; size?: number }
export interface AvatarStackProps { people: AvatarProps[]; size?: number; label?: string }
export interface CursorLabelProps { name: string; color?: AvatarProps['color']; style?: React.CSSProperties }
export interface PanelProps { title: string; onCollapse?: () => void; children?: React.ReactNode }
export interface PanelRowProps { label: string; inline?: boolean; children?: React.ReactNode }
export interface TransportBarProps { playing?: boolean; current?: string; total?: string; speed?: string; volume?: string; zoom?: number; onPlayPause?: () => void; onSplit?: () => void; onPrev?: () => void; onNext?: () => void }
export interface TrackHeaderProps { name?: string; locked?: boolean; hidden?: boolean; onToggleLock?: () => void; onToggleHidden?: () => void }
export interface TrackLaneProps { width?: number; label?: string; children?: React.ReactNode }
export interface ClipProps { kind: 'shape' | 'text' | 'caption' | 'video' | 'audio'; label: string; left?: number; width?: number; selected?: boolean; thumbnails?: string[]; seed?: number }
export interface TimelineRulerProps { seconds?: number; pxPerSecond?: number; labelEvery?: number; time?: number; onSeek?: (seconds: number) => void }
export interface PlayheadProps { x: number }
export interface SelectionBoxProps { x: number; y: number; width: number; height: number; children?: React.ReactNode }
export interface CaptionOverlayProps { children?: React.ReactNode; style?: React.CSSProperties }
export interface LogoProps { variant?: 'wordmark' | 'mark' | 'app-icon'; height?: number }
