import { useMemo } from 'react'
import type { ComponentProps } from 'react'

import { AppHeaderContent } from '@/features/app/components/app-header-content'

type HeaderProps = ComponentProps<typeof AppHeaderContent>

export function useAppHeaderProps(props: HeaderProps): HeaderProps {
  return useMemo(() => props, [props])
}
