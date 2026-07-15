import JSZip from 'jszip';

export interface SlideImage {
  buffer: Buffer;
  jpeg: boolean;
}

const EMU_PER_INCH = 914_400;
const PPTX_SLIDE_WIDTH_IN = 13.333;
const PPTX_SLIDE_WIDTH_EMU = Math.round(PPTX_SLIDE_WIDTH_IN * EMU_PER_INCH);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slideSize(aspect?: number): { cx: number; cy: number; type: string } {
  const ratio = aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const cx = PPTX_SLIDE_WIDTH_EMU;
  const cy = Math.round(cx / ratio);
  return {
    cx,
    cy,
    type: Math.abs(ratio - 16 / 9) < 0.01 ? 'screen16x9' : 'custom',
  };
}

function contentTypesXml(images: SlideImage[]): string {
  const slideOverrides = images
    .map(
      (_img, index) =>
        `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join('');
  const hasPng = images.some((img) => !img.jpeg);
  const hasJpeg = images.some((img) => img.jpeg);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ''}
  ${hasJpeg ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : ''}
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slideOverrides}
</Types>`;
}

function packageRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function presentationXml(count: number, size: { cx: number; cy: number; type: string }): string {
  const slideIds = Array.from({ length: count }, (_value, index) => {
    const id = 256 + index;
    return `<p:sldId id="${id}" r:id="rId${index + 1}"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="${size.cx}" cy="${size.cy}" type="${size.type}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function presentationRelsXml(count: number): string {
  const rels = Array.from({ length: count }, (_value, index) => {
    return `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function slideXml(index: number, size: { cx: number; cy: number }): string {
  const name = `Slide ${index + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="${escapeXml(name)}"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId1"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="${size.cx}" cy="${size.cy}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function slideRelsXml(index: number, image: SlideImage): string {
  const extension = image.jpeg ? 'jpg' : 'png';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${index + 1}.${extension}"/>
</Relationships>`;
}

function appXml(slideCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Teamver Design</Application>
  <PresentationFormat>On-screen Show</PresentationFormat>
  <Slides>${slideCount}</Slides>
</Properties>`;
}

function coreXml(title?: string): string {
  const now = new Date().toISOString();
  const safeTitle = title ? escapeXml(title) : 'Teamver Design export';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${safeTitle}</dc:title>
  <dc:creator>Teamver Design</dc:creator>
  <cp:lastModifiedBy>Teamver Design</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

export async function buildScreenshotPptx(
  images: SlideImage[],
  opts: { title?: string; aspect?: number } = {},
): Promise<Buffer> {
  if (images.length === 0) throw new Error('no slides to export');

  const size = slideSize(opts.aspect);
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml(images));
  zip.file('_rels/.rels', packageRelsXml());
  zip.file('docProps/app.xml', appXml(images.length));
  zip.file('docProps/core.xml', coreXml(opts.title));
  zip.file('ppt/presentation.xml', presentationXml(images.length, size));
  zip.file('ppt/_rels/presentation.xml.rels', presentationRelsXml(images.length));

  images.forEach((image, index) => {
    const extension = image.jpeg ? 'jpg' : 'png';
    zip.file(`ppt/slides/slide${index + 1}.xml`, slideXml(index, size));
    zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, slideRelsXml(index, image));
    zip.file(`ppt/media/image${index + 1}.${extension}`, image.buffer);
  });

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
