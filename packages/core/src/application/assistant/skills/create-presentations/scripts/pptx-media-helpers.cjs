const { addBulletList } = require('./pptx-bullet-helpers.cjs');

function normalizeMediaPanel(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Mixed-media panel needs a data object.');
  }

  const imagePath = typeof data.imagePath === 'string' ? data.imagePath.trim() : '';
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const caption = typeof data.caption === 'string' ? data.caption.trim() : '';
  const bullets = Array.isArray(data.bullets)
    ? data.bullets.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];

  if (!imagePath) {
    throw new Error('Mixed-media panel needs an imagePath.');
  }
  if (!title && bullets.length === 0 && !caption) {
    throw new Error('Mixed-media panel needs text content besides the image.');
  }

  return { imagePath, title, bullets, caption };
}

function addMixedMediaPanel(slide, data, layout, theme, options = {}) {
  const media = normalizeMediaPanel(data);
  const {
    x,
    y,
    w,
    h,
    imageSide = 'right',
    imageRatio = 0.48,
    gap = 0.36,
    titleFontFace,
    bodyFontFace,
    captionFontFace,
  } = layout;

  const imageW = w * imageRatio;
  const textW = w - imageW - gap;
  const imageX = imageSide === 'left' ? x : x + textW + gap;
  const textX = imageSide === 'left' ? x + imageW + gap : x;

  slide.addImage({
    path: media.imagePath,
    x: imageX,
    y,
    w: imageW,
    h: h - (media.caption ? 0.28 : 0),
  });

  if (media.title) {
    slide.addText(media.title, {
      x: textX,
      y,
      w: textW,
      h: 0.48,
      fontSize: options.titleFontSize || 22,
      fontFace: titleFontFace,
      bold: true,
      color: options.titleColor || theme.primary,
      margin: 0,
      fit: 'shrink',
    });
  }

  if (media.bullets.length > 0) {
    addBulletList(
      slide,
      media.bullets,
      {
        x: textX,
        y: y + (media.title ? 0.72 : 0),
        w: textW,
        h: h - (media.title ? 0.9 : 0.2),
      },
      {
        fontSize: options.bulletFontSize || 15,
        fontFace: bodyFontFace,
        color: options.bodyColor || theme.secondary,
        paraSpaceAfterPt: options.paraSpaceAfterPt || 8,
      },
    );
  }

  if (media.caption) {
    slide.addText(media.caption, {
      x: imageX,
      y: y + h - 0.22,
      w: imageW,
      h: 0.18,
      fontSize: options.captionFontSize || 9,
      fontFace: captionFontFace || bodyFontFace,
      color: options.captionColor || theme.secondary,
      italic: true,
      margin: 0,
      fit: 'shrink',
    });
  }
}

module.exports = {
  normalizeMediaPanel,
  addMixedMediaPanel,
};
