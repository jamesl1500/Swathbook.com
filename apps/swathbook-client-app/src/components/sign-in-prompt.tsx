import { LogIn, type LucideIcon } from 'lucide-react-native';

import { Button, EmptyState } from '@/design-system';

/** Shown where a screen needs an account: says why, and offers sign-in. */
export function SignInPrompt({ icon = LogIn, title, children }: { icon?: LucideIcon; title: string; children: string }) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      action={
        <Button href="/sign-in" icon={LogIn}>
          Sign in or create an account
        </Button>
      }
    >
      {children}
    </EmptyState>
  );
}
