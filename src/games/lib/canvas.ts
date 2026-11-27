export type Ctx = CanvasRenderingContext2D;

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fillRound(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawBackdrop(ctx: Ctx, w: number, h: number, glow = 'rgba(76, 29, 149, 0.32)', base = '#06070d') {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, base);
  grad.addColorStop(1, '#0a0c18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const radial = ctx.createRadialGradient(w * 0.5, -h * 0.15, 20, w * 0.5, -h * 0.15, h * 1.2);
  radial.addColorStop(0, glow);
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, w, h);
}

export function drawGrid(ctx: Ctx, w: number, h: number, size: number, color = 'rgba(255,255,255,0.045)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += size) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += size) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();
}

export function glowCircle(ctx: Ctx, x: number, y: number, r: number, color: string, blur = 18) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size = 16,
  color = '#eceefb',
  align: CanvasTextAlign = 'left',
  weight = '700',
) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px "Inter", system-ui, sans-serif`;
  ctx.fillText(text, x, y);
}

export function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function hitRect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
