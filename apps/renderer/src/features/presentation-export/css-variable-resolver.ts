export function resolveCssVariable(varName: string, element: Element): string {
  const cleanName = varName.startsWith('--') ? varName : `--${varName}`;
  return getComputedStyle(element).getPropertyValue(cleanName).trim();
}

export function resolveCssValue(value: string, element: Element): string {
  if (!value) return '';
  const varMatch = value.match(/var\(--([^,)]+)(?:,\s*([^)]+))?\)/);
  if (!varMatch) return value;

  const resolved = resolveCssVariable(`--${varMatch[1]}`, element);
  return resolved || varMatch[2]?.trim() || '';
}

export function colorToHex(color: string): string | undefined {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
    return undefined;
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.slice(1).toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `${toHex(data[0] ?? 0)}${toHex(data[1] ?? 0)}${toHex(data[2] ?? 0)}`.toUpperCase();
}

export function extractBackgroundImageUrl(element: Element): string | undefined {
  const backgroundImage = getComputedStyle(element).backgroundImage;
  if (!backgroundImage || backgroundImage === 'none') return undefined;

  const match = backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
  return match?.[1];
}

