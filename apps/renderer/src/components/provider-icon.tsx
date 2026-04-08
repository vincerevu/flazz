"use client"

import sprite from "@/components/provider-icons/sprite.svg"

interface ProviderIconProps extends React.SVGProps<SVGSVGElement> {
  id: string
}

export function ProviderIcon({ id, ...props }: ProviderIconProps) {
  const resolved = id.trim() || "synthetic"

  return (
    <svg data-component="provider-icon" {...props}>
      <use href={`${sprite}#${resolved}`} />
    </svg>
  )
}
