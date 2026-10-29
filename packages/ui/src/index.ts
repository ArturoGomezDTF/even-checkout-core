// Primitivas de UI compartidas por las apps de Even. El tema de Tailwind vive en "@even/ui/theme.css".
export const PACKAGE_NAME = "@even/ui";

export { cn } from "./lib/cn";
export { lockScroll, unlockScroll } from "./lib/scroll-lock";
export { useScrollLock } from "./lib/use-scroll-lock";

export { Badge, type BadgeProps } from "./components/badge";
export { Button, buttonClasses, type ButtonProps, type ButtonSize, type ButtonVariant } from "./components/button";
export { Card, type CardProps } from "./components/card";
export { Checkbox, Radio, type CheckboxProps, type RadioProps } from "./components/choice";
export { EvenAsterisk, type EvenAsteriskProps } from "./components/even-asterisk";
export { Input, Textarea, type InputProps, type TextareaProps } from "./components/field";
export { IconButton, type IconButtonProps } from "./components/icon-button";
export {
  Container,
  Screen,
  Stack,
  type ContainerProps,
  type ScreenProps,
  type StackProps,
} from "./components/layout";
export { FullScreenLoader, type FullScreenLoaderProps } from "./components/loader";
export { Modal, type ModalProps } from "./components/modal";
export { Spinner, type SpinnerProps } from "./components/spinner";
