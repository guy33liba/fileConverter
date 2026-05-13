import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const imageExtensions = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
const imageOutputOptions = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPG' },
  { value: 'image/webp', label: 'WebP' }
];
const mimeExtensions = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'text/plain': 'txt'
};
const pdfOutput = 'application/pdf';
const pdfTextOutput = 'pdf-to-text';
const pdfSummaryOutput = 'pdf-summary';
const maxBatchFiles = 100;
const summaryStopWords = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'between', 'could', 'every', 'from',
  'have', 'into', 'more', 'most', 'other', 'over', 'such', 'than', 'that', 'their', 'there',
  'these', 'they', 'this', 'those', 'through', 'under', 'very', 'were', 'what', 'when', 'where',
  'which', 'while', 'with', 'would', 'your'
]);

const elements = {
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  uploadButton: document.getElementById('upload-button'),
  filePanel: document.getElementById('file-panel'),
  fileName: document.getElementById('file-name'),
  fileSize: document.getElementById('file-size'),
  fileList: document.getElementById('file-list'),
  downloadOriginalButton: document.getElementById('download-original-button'),
  removeButton: document.getElementById('remove-button'),
  converterPanel: document.getElementById('converter-panel'),
  outputTypeSelect: document.getElementById('output-type-select'),
  pdfPageSelect: document.getElementById('pdf-page-select'),
  pdfPageLabel: document.getElementById('pdf-page-label'),
  qualityInput: document.getElementById('quality-input'),
  qualityValue: document.getElementById('quality-value'),
  qualityLabel: document.getElementById('quality-label'),
  convertButton: document.getElementById('convert-button'),
  downloadConvertedButton: document.getElementById('download-converted-button'),
  uploadStatus: document.getElementById('upload-status'),
  statusTitle: document.getElementById('status-title'),
  statusPercent: document.getElementById('status-percent'),
  statusText: document.getElementById('status-text'),
  progressFill: document.getElementById('progress-fill'),
  previewPanel: document.getElementById('preview-panel'),
  previewTitle: document.getElementById('preview-title'),
  sourcePreviewContainer: document.getElementById('source-preview-container'),
  convertedPreviewBox: document.getElementById('converted-preview-box'),
  convertedPreviewContainer: document.getElementById('converted-preview-container'),
  message: document.getElementById('message')
};

let batchItems = [];
let activeItemId = '';
let itemIdCounter = 0;
let isConverting = false;

setupEvents();

function setupEvents() {
  elements.uploadButton.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('keydown', handleKeyboardUpload);
  elements.fileInput.addEventListener('change', handleInputChange);
  elements.downloadOriginalButton.addEventListener('click', downloadOriginalFiles);
  elements.removeButton.addEventListener('click', resetConverter);
  elements.convertButton.addEventListener('click', convertSelectedFiles);
  elements.downloadConvertedButton.addEventListener('click', downloadConvertedFiles);
  elements.qualityInput.addEventListener('input', updateQualityLabel);
  elements.outputTypeSelect.addEventListener('change', handleOutputTypeChange);
  elements.pdfPageSelect.addEventListener('change', handlePdfPageChange);

  elements.dropZone.addEventListener('dragenter', handleDragEnter);
  elements.dropZone.addEventListener('dragover', handleDragOver);
  elements.dropZone.addEventListener('dragleave', handleDragLeave);
  elements.dropZone.addEventListener('drop', handleDrop);

  document.addEventListener('dragover', preventBrowserFileOpen);
  document.addEventListener('drop', preventBrowserFileOpen);
}

function openFilePicker(event) {
  event?.stopPropagation();
  if (isConverting) {
    return;
  }
  elements.fileInput.value = '';
  elements.fileInput.click();
}

function handleKeyboardUpload(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openFilePicker(event);
  }
}

function handleInputChange(event) {
  if (isConverting) {
    return;
  }

  const files = Array.from(event.target.files || []);
  if (files.length) {
    handleSelectedFiles(files);
  }
}

function preventBrowserFileOpen(event) {
  event.preventDefault();
}

function handleDragEnter(event) {
  event.preventDefault();
  elements.dropZone.classList.add('drag-over');
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  elements.dropZone.classList.add('drag-over');
}

function handleDragLeave(event) {
  event.preventDefault();
  if (!elements.dropZone.contains(event.relatedTarget)) {
    elements.dropZone.classList.remove('drag-over');
  }
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  elements.dropZone.classList.remove('drag-over');

  if (isConverting) {
    showError('Wait for the current conversion to finish before adding more files.');
    return;
  }

  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) {
    showError('No files were dropped. Please drop one or more files.');
    return;
  }

  handleSelectedFiles(files);
}

async function handleSelectedFiles(files) {
  resetConverter();
  clearError();

  const limitedFiles = files.slice(0, maxBatchFiles);
  const overLimitCount = Math.max(files.length - maxBatchFiles, 0);
  const validFiles = limitedFiles.filter(isSupportedFile);
  const invalidCount = limitedFiles.length - validFiles.length;

  if (!validFiles.length) {
    showError('Unsupported file type. Please upload PDFs or images (PNG, JPG, WebP, AVIF).');
    return;
  }

  batchItems = validFiles.map(createBatchItem);
  activeItemId = batchItems[0].id;

  updateBatchUi();
  updateOutputOptions();
  updatePdfPageOptions();
  renderFileList();

  elements.filePanel.classList.remove('hidden');
  elements.converterPanel.classList.remove('hidden');
  elements.uploadStatus.classList.remove('hidden');
  elements.previewPanel.classList.remove('hidden');
  elements.dropZone.classList.add('has-file');

  if (invalidCount > 0 || overLimitCount > 0) {
    const messages = [];
    if (invalidCount > 0) {
      messages.push(`${invalidCount} unsupported file${invalidCount > 1 ? 's were' : ' was'} skipped`);
    }
    if (overLimitCount > 0) {
      messages.push(`${overLimitCount} file${overLimitCount > 1 ? 's were' : ' was'} over the 100-file batch limit`);
    }
    showError(`${messages.join('. ')}.`);
  }

  await loadPdfDocuments();
  updatePdfPageOptions();
  renderFileList();
  await showActivePreview();

  const failedPdfCount = batchItems.filter((item) => item.isPdf && !item.pdfDoc).length;
  const readyCount = batchItems.length - failedPdfCount;
  setStatus(
    failedPdfCount ? 80 : 100,
    failedPdfCount ? 'Ready with warnings' : 'Ready to convert',
    `${readyCount} of ${batchItems.length} file${batchItems.length > 1 ? 's are' : ' is'} ready.`
  );
}

function createBatchItem(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  return {
    id: `file-${Date.now()}-${itemIdCounter++}`,
    file,
    isPdf,
    sourceUrl: URL.createObjectURL(file),
    pdfDoc: null,
    pdfError: '',
    convertedFiles: [],
    status: isPdf ? 'Waiting to load' : 'Ready',
    statusKind: 'ready'
  };
}

async function loadPdfDocuments() {
  const pdfItems = batchItems.filter((item) => item.isPdf);
  if (!pdfItems.length) {
    return;
  }

  for (let index = 0; index < pdfItems.length; index++) {
    const item = pdfItems[index];
    setStatus(
      Math.max(5, Math.round((index / pdfItems.length) * 55)),
      'Loading PDFs',
      `Reading ${item.file.name}...`
    );

    try {
      const arrayBuffer = await item.file.arrayBuffer();
      item.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      item.status = `${item.pdfDoc.numPages} page${item.pdfDoc.numPages > 1 ? 's' : ''}`;
      item.statusKind = 'ready';
    } catch (error) {
      item.pdfError = 'Could not load PDF';
      item.status = 'PDF load failed';
      item.statusKind = 'error';
    }

    renderFileList();
  }
}

function updateBatchUi() {
  const count = batchItems.length;
  const totalSize = batchItems.reduce((sum, item) => sum + item.file.size, 0);

  elements.fileName.textContent = count === 1 ? batchItems[0].file.name : `${count} files selected`;
  elements.fileSize.textContent = formatFileSize(totalSize);
  elements.downloadOriginalButton.textContent = count === 1 ? 'Download Original' : 'Download Originals';
  updateConvertButtonText();
}

function updateOutputOptions() {
  const previousValue = elements.outputTypeSelect.value;
  const hasPdf = batchItems.some((item) => item.isPdf);
  const hasImages = batchItems.some((item) => !item.isPdf);
  const select = elements.outputTypeSelect;

  select.innerHTML = '';

  const imageGroup = document.createElement('optgroup');
  imageGroup.label = hasPdf && hasImages ? 'Images and PDF pages' : hasPdf ? 'PDF pages to image' : 'Image formats';

  imageOutputOptions.forEach((option) => {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = hasPdf && !hasImages ? `PDF to ${option.label}` : option.label;
    imageGroup.appendChild(item);
  });

  if (hasImages) {
    const option = document.createElement('option');
    option.value = pdfOutput;
    option.textContent = hasPdf ? 'PDF (skip PDF files)' : 'PDF';
    imageGroup.appendChild(option);
  }

  select.appendChild(imageGroup);

  if (hasPdf) {
    const pdfGroup = document.createElement('optgroup');
    pdfGroup.label = 'From PDF';
    const textOption = document.createElement('option');
    textOption.value = pdfTextOutput;
    textOption.textContent = hasImages ? 'Extract PDF text (skip images)' : 'PDF to Text (TXT)';
    pdfGroup.appendChild(textOption);

    const summaryOption = document.createElement('option');
    summaryOption.value = pdfSummaryOutput;
    summaryOption.textContent = hasImages ? 'PDF Summary (skip images)' : 'PDF Summary (Smart)';
    pdfGroup.appendChild(summaryOption);
    select.appendChild(pdfGroup);
  }

  const hasPrevious = Array.from(select.options).some((option) => option.value === previousValue);
  select.value = hasPrevious ? previousValue : 'image/png';
  handleOutputTypeChange({ resetConverted: false });
}

function updatePdfPageOptions() {
  const hasPdf = batchItems.some((item) => item.isPdf);
  const outputType = elements.outputTypeSelect.value;

  if (!hasPdf || [pdfTextOutput, pdfSummaryOutput, pdfOutput].includes(outputType)) {
    elements.pdfPageLabel.style.display = 'none';
    elements.pdfPageSelect.innerHTML = '';
    return;
  }

  const previousValue = elements.pdfPageSelect.value;
  const loadedPdfs = batchItems.filter((item) => item.isPdf && item.pdfDoc);
  elements.pdfPageLabel.style.display = '';
  elements.pdfPageSelect.innerHTML = '';

  if (loadedPdfs.length === 1) {
    const item = loadedPdfs[0];
    for (let page = 1; page <= item.pdfDoc.numPages; page++) {
      addPdfPageOption(String(page), `Page ${page} of ${item.pdfDoc.numPages}`);
    }
    if (item.pdfDoc.numPages > 1) {
      addPdfPageOption('all', 'All pages');
    }
  } else {
    addPdfPageOption('first', 'First page of each PDF');
    addPdfPageOption('all', 'All pages from each PDF');
  }

  const hasPrevious = Array.from(elements.pdfPageSelect.options).some((option) => option.value === previousValue);
  elements.pdfPageSelect.value = hasPrevious ? previousValue : elements.pdfPageSelect.options[0]?.value || 'first';
}

function addPdfPageOption(value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  elements.pdfPageSelect.appendChild(option);
}

function handleOutputTypeChange(options = {}) {
  if (options.resetConverted !== false) {
    resetConvertedFiles();
  }

  const outputType = elements.outputTypeSelect.value;
  elements.qualityLabel.style.display = [pdfTextOutput, pdfSummaryOutput].includes(outputType) ? 'none' : '';
  updateConvertButtonText();
  updatePdfPageOptions();
  renderConvertedPreview();
}

function updateConvertButtonText() {
  const count = batchItems.length;
  const pdfCount = batchItems.filter((item) => item.isPdf).length;
  const outputType = elements.outputTypeSelect.value;

  if (outputType === pdfSummaryOutput) {
    elements.convertButton.textContent = pdfCount > 1 ? `Summarize ${pdfCount} PDFs` : 'Summarize PDF';
    return;
  }

  if (outputType === pdfTextOutput) {
    elements.convertButton.textContent = pdfCount > 1 ? `Extract Text from ${pdfCount} PDFs` : 'Extract PDF Text';
    return;
  }

  elements.convertButton.textContent = count === 1 ? 'Convert File' : `Convert ${count} Files`;
}

async function handlePdfPageChange() {
  resetConvertedFiles();
  await showActivePreview();
}

function renderFileList() {
  elements.fileList.innerHTML = '';

  batchItems.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `file-list-item${item.id === activeItemId ? ' active' : ''}`;
    button.dataset.fileId = item.id;

    const name = document.createElement('strong');
    name.textContent = item.file.name;

    const meta = document.createElement('span');
    meta.textContent = `${item.isPdf ? 'PDF' : getFormatName(item.file.type)} - ${formatFileSize(item.file.size)}`;

    const status = document.createElement('span');
    status.className = `file-status ${item.statusKind}`;
    status.textContent = item.status;

    button.append(name, meta, status);
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      activeItemId = item.id;
      renderFileList();
      await showActivePreview();
      renderConvertedPreview();
    });

    elements.fileList.appendChild(button);
  });
}

async function showActivePreview() {
  const item = getActiveItem();
  elements.sourcePreviewContainer.innerHTML = '';
  elements.previewTitle.textContent = item?.file.name || 'Original file';

  if (!item) {
    return;
  }

  if (item.isPdf) {
    await showPdfPreview(item);
    return;
  }

  await showImagePreview(item);
}

async function showImagePreview(item) {
  return new Promise((resolve) => {
    const img = document.createElement('img');
    img.alt = 'Original image preview';
    img.src = item.sourceUrl;
    img.onload = () => {
      elements.sourcePreviewContainer.innerHTML = '';
      elements.sourcePreviewContainer.appendChild(img);
      resolve();
    };
    img.onerror = () => {
      elements.sourcePreviewContainer.innerHTML = '<p>Preview not available</p>';
      resolve();
    };
  });
}

async function showPdfPreview(item) {
  const container = document.createElement('div');
  container.className = 'pdf-preview';

  if (!item.pdfDoc) {
    container.innerHTML = `<p>${item.pdfError || 'PDF is still loading.'}</p>`;
    elements.sourcePreviewContainer.appendChild(container);
    return;
  }

  const pageNum = getPreviewPdfPage(item);

  try {
    const page = await item.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.8 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;

    const pageInfo = document.createElement('p');
    pageInfo.textContent = `PDF - Page ${pageNum} of ${item.pdfDoc.numPages}`;

    container.append(canvas, pageInfo);
    elements.sourcePreviewContainer.appendChild(container);
  } catch (error) {
    container.innerHTML = '<p>Preview not available</p>';
    elements.sourcePreviewContainer.appendChild(container);
  }
}

function getPreviewPdfPage(item) {
  const value = elements.pdfPageSelect.value;
  if (value && value !== 'all' && value !== 'first') {
    return clampPage(Number(value), item.pdfDoc.numPages);
  }
  return 1;
}

async function convertSelectedFiles(event) {
  event?.stopPropagation();

  if (!batchItems.length) {
    showError('Choose one or more files before converting.');
    return;
  }

  clearError();
  resetConvertedFiles();
  setConversionBusy(true);

  const outputType = elements.outputTypeSelect.value;
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  try {
    for (let index = 0; index < batchItems.length; index++) {
      const item = batchItems[index];
      const basePercent = Math.round((index / batchItems.length) * 88);
      setStatus(basePercent, 'Converting', `Processing ${item.file.name}...`);

      try {
        const result = await convertBatchItem(item, outputType);
        if (result === 'skipped') {
          skippedCount++;
        } else {
          successCount++;
        }
      } catch (error) {
        item.status = 'Conversion failed';
        item.statusKind = 'error';
        failureCount++;
      }

      renderFileList();
      renderConvertedPreview();
    }

    const outputCount = getAllConvertedFiles().length;
    if (!outputCount) {
      showError('No files were converted. Check the selected output format and file types.');
      setStatus(0, 'Conversion failed', 'No converted files were created.');
      return;
    }

    const warningText = failureCount || skippedCount ? ` ${failureCount} failed, ${skippedCount} skipped.` : '';
    setStatus(100, 'Converted', `${outputCount} converted file${outputCount > 1 ? 's are' : ' is'} ready.${warningText}`);
  } finally {
    setConversionBusy(false);
  }
}

async function convertBatchItem(item, outputType) {
  item.convertedFiles = [];

  if (outputType === pdfOutput && item.isPdf) {
    item.status = 'Skipped';
    item.statusKind = 'ready';
    return 'skipped';
  }

  if (outputType === pdfTextOutput) {
    if (!item.isPdf) {
      item.status = 'Skipped';
      item.statusKind = 'ready';
      return 'skipped';
    }
    await extractPdfText(item);
    return 'converted';
  }

  if (outputType === pdfSummaryOutput) {
    if (!item.isPdf) {
      item.status = 'Skipped';
      item.statusKind = 'ready';
      return 'skipped';
    }
    await summarizePdf(item);
    return 'converted';
  }

  if (item.isPdf) {
    await convertPdfToImages(item, outputType);
    return 'converted';
  }

  await convertImage(item, outputType);
  return 'converted';
}

async function convertImage(item, outputType) {
  if (outputType === pdfOutput) {
    await convertImageToPdf(item);
    return;
  }

  const image = await loadImage(item.sourceUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  if (outputType === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0);

  const blob = await canvasToBlob(canvas, outputType, Number(elements.qualityInput.value) / 100);
  addConvertedFile(item, blob, buildConvertedFileName(item.file.name, outputType));
  item.status = 'Converted';
  item.statusKind = 'converted';
}

async function convertImageToPdf(item) {
  const image = await loadImage(item.sourceUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  const quality = Number(elements.qualityInput.value) / 100;
  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
  const pdfBlob = await createImagePdfBlob(jpegBlob, image.naturalWidth, image.naturalHeight, item.file.name);

  addConvertedFile(item, pdfBlob, buildConvertedFileName(item.file.name, pdfOutput));
  item.status = 'Converted to PDF';
  item.statusKind = 'converted';
}

async function createImagePdfBlob(jpegBlob, imageWidth, imageHeight, title) {
  const imageBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const imageRatio = imageWidth / imageHeight;
  const portrait = imageRatio <= 1;
  const pageWidth = portrait ? 612 : 792;
  const pageHeight = portrait ? 792 : 612;
  const margin = 36;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const content = `q\n${formatPdfNumber(drawWidth)} 0 0 ${formatPdfNumber(drawHeight)} ${formatPdfNumber(drawX)} ${formatPdfNumber(drawY)} cm\n/Im0 Do\nQ\n`;
  const escapedTitle = escapePdfString(title.replace(/\.[^.]+$/, '') || 'Converted image');

  return createPdfBlob([
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    [
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.byteLength} >>\nstream\n`,
      imageBytes,
      '\nendstream'
    ],
    `<< /Length ${getAsciiByteLength(content)} >>\nstream\n${content}endstream`,
    `<< /Title (${escapedTitle}) /Creator (Browser File Converter) >>`
  ], '6 0 R');
}

function createPdfBlob(objects, infoRef = '') {
  const parts = ['%PDF-1.4\n'];
  const offsets = [0];
  let offset = getPartsByteLength(parts);

  objects.forEach((object, index) => {
    offsets[index + 1] = offset;
    const objectParts = [`${index + 1} 0 obj\n`, ...[].concat(object), '\nendobj\n'];
    parts.push(...objectParts);
    offset += getPartsByteLength(objectParts);
  });

  const xrefOffset = offset;
  const xrefRows = offsets
    .map((value, index) => (index === 0 ? '0000000000 65535 f ' : `${String(value).padStart(10, '0')} 00000 n `))
    .join('\n');
  const trailer = `xref\n0 ${objects.length + 1}\n${xrefRows}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R${infoRef ? ` /Info ${infoRef}` : ''} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  parts.push(trailer);
  return new Blob(parts, { type: 'application/pdf' });
}

function getPartsByteLength(parts) {
  return parts.reduce((total, part) => total + (typeof part === 'string' ? getAsciiByteLength(part) : part.byteLength), 0);
}

function getAsciiByteLength(text) {
  return new TextEncoder().encode(text).byteLength;
}

function formatPdfNumber(value) {
  return Number(value.toFixed(3)).toString();
}

function escapePdfString(value) {
  return value.replace(/[\\()]/g, '\\$&').replace(/[\r\n]/g, ' ');
}

async function convertPdfToImages(item, outputType) {
  if (!item.pdfDoc) {
    throw new Error('PDF is not loaded');
  }

  const pages = getPdfPagesToConvert(item);
  const quality = Number(elements.qualityInput.value) / 100;
  const ext = mimeExtensions[outputType] || 'png';
  const baseName = item.file.name.replace(/\.pdf$/i, '') || 'converted';

  for (let index = 0; index < pages.length; index++) {
    const pageNum = pages[index];
    setStatus(
      20 + Math.round((index / pages.length) * 60),
      'Rendering PDF',
      `${item.file.name}: page ${pageNum} of ${item.pdfDoc.numPages}...`
    );

    const page = await item.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    if (outputType === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await canvasToBlob(canvas, outputType, quality);
    addConvertedFile(item, blob, `${baseName}-page${pageNum}.${ext}`);
  }

  item.status = `Converted ${pages.length} page${pages.length > 1 ? 's' : ''}`;
  item.statusKind = 'converted';
}

async function extractPdfText(item) {
  if (!item.pdfDoc) {
    throw new Error('PDF is not loaded');
  }

  const fullText = await extractPdfTextContent(item, 'Extracting text');

  const blob = new Blob([fullText], { type: 'text/plain' });
  const baseName = item.file.name.replace(/\.pdf$/i, '') || 'converted';
  addConvertedFile(item, blob, `${baseName}.txt`, fullText);
  item.status = 'Text extracted';
  item.statusKind = 'converted';
}

async function summarizePdf(item) {
  if (!item.pdfDoc) {
    throw new Error('PDF is not loaded');
  }

  const fullText = await extractPdfTextContent(item, 'Summarizing PDF');
  const summary = buildPdfSummary(fullText, item.file.name);
  const blob = new Blob([summary], { type: 'text/plain' });
  const baseName = item.file.name.replace(/\.pdf$/i, '') || 'summary';

  addConvertedFile(item, blob, `${baseName}-summary.txt`, summary);
  item.status = 'Summary ready';
  item.statusKind = 'converted';
}

async function extractPdfTextContent(item, statusTitle) {
  let fullText = '';

  for (let pageNum = 1; pageNum <= item.pdfDoc.numPages; pageNum++) {
    setStatus(
      20 + Math.round((pageNum / item.pdfDoc.numPages) * 70),
      statusTitle,
      `${item.file.name}: page ${pageNum} of ${item.pdfDoc.numPages}...`
    );

    const page = await item.pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((textItem) => textItem.str).join(' ');
    fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
  }

  return fullText;
}

function buildPdfSummary(text, fileName) {
  const normalizedText = text
    .replace(/--- Page \d+ ---/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const title = fileName.replace(/\.pdf$/i, '') || 'PDF';

  if (!normalizedText) {
    return `Summary: ${title}\n\nNo selectable text was found in this PDF. It may be scanned or image-based.`;
  }

  const sentences = splitIntoSentences(normalizedText);
  const selectedSentences = chooseSummarySentences(sentences);

  if (!selectedSentences.length) {
    return `Summary: ${title}\n\n${normalizedText.slice(0, 1200)}`;
  }

  return [
    `Summary: ${title}`,
    '',
    'Key points:',
    ...selectedSentences.map((sentence) => `- ${sentence}`)
  ].join('\n');
}

function splitIntoSentences(text) {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return matches
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 6)
    .slice(0, 160);
}

function chooseSummarySentences(sentences) {
  const wordCounts = new Map();

  sentences.forEach((sentence) => {
    getSummaryWords(sentence).forEach((word) => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
  });

  return sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: getSummaryWords(sentence).reduce((sum, word) => sum + (wordCounts.get(word) || 0), 0)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 6)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);
}

function getSummaryWords(sentence) {
  return sentence
    .toLowerCase()
    .match(/[a-z0-9]{4,}/g)
    ?.filter((word) => !summaryStopWords.has(word)) || [];
}

function getPdfPagesToConvert(item) {
  const value = elements.pdfPageSelect.value;
  if (value === 'all') {
    return Array.from({ length: item.pdfDoc.numPages }, (_, index) => index + 1);
  }
  if (value === 'first' || !value) {
    return [1];
  }
  return [clampPage(Number(value), item.pdfDoc.numPages)];
}

function addConvertedFile(item, blob, name, previewText = '') {
  item.convertedFiles.push({
    blob,
    url: URL.createObjectURL(blob),
    name,
    type: blob.type || 'application/octet-stream',
    sourceName: item.file.name,
    previewText
  });
}

function renderConvertedPreview() {
  const outputs = getAllConvertedFiles();

  if (!outputs.length) {
    elements.convertedPreviewContainer.innerHTML = '';
    elements.convertedPreviewBox.classList.add('hidden');
    elements.downloadConvertedButton.classList.add('hidden');
    return;
  }

  elements.convertedPreviewContainer.innerHTML = '';
  renderActiveConvertedPreview();

  const list = document.createElement('div');
  list.className = 'converted-list';

  outputs.forEach((output) => {
    const row = document.createElement('div');
    row.className = 'converted-item';

    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = output.name;
    const source = document.createElement('span');
    source.textContent = `From ${output.sourceName}`;
    details.append(name, source);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-small';
    button.textContent = 'Download';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      triggerDownload(output.url, output.name);
    });

    row.append(details, button);
    list.appendChild(row);
  });

  elements.convertedPreviewContainer.appendChild(list);
  elements.convertedPreviewBox.classList.remove('hidden');
  elements.downloadConvertedButton.classList.remove('hidden');
  elements.downloadConvertedButton.textContent = outputs.length === 1 ? 'Download Converted' : `Download ${outputs.length} Converted Files`;
}

function renderActiveConvertedPreview() {
  const activeItem = getActiveItem();
  const activeOutput = activeItem?.convertedFiles[0];
  if (!activeOutput) {
    return;
  }

  if (activeOutput.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.alt = 'Converted file preview';
    img.src = activeOutput.url;
    elements.convertedPreviewContainer.appendChild(img);
    return;
  }

  if (activeOutput.type === 'text/plain') {
    const pre = document.createElement('pre');
    const text = activeOutput.previewText || '';
    pre.textContent = text.length > 2000 ? `${text.substring(0, 2000)}\n\n... (truncated)` : text;
    elements.convertedPreviewContainer.appendChild(pre);
    return;
  }

  if (activeOutput.type === 'application/pdf') {
    const frame = document.createElement('iframe');
    frame.title = 'Converted PDF preview';
    frame.src = activeOutput.url;
    elements.convertedPreviewContainer.appendChild(frame);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob && (type === 'image/png' || !blob.type || blob.type === type)) {
        resolve(blob);
        return;
      }
      reject(new Error(`Canvas conversion failed for ${type}`));
    }, type, quality);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function downloadOriginalFiles(event) {
  event?.stopPropagation();

  if (!batchItems.length) {
    showError('Choose one or more files before downloading.');
    return;
  }

  clearError();
  await downloadFileCollection(
    batchItems.map((item) => ({ blob: item.file, name: item.file.name })),
    'original-files.zip'
  );
}

async function downloadConvertedFiles(event) {
  event?.stopPropagation();

  const outputs = getAllConvertedFiles();
  if (!outputs.length) {
    showError('Convert the files before downloading.');
    return;
  }

  clearError();
  await downloadFileCollection(outputs, 'converted-files.zip');
}

async function downloadFileCollection(files, zipName) {
  if (files.length === 1) {
    if (files[0].url) {
      triggerDownload(files[0].url, files[0].name);
      return;
    }

    const singleUrl = URL.createObjectURL(files[0].blob);
    triggerDownload(singleUrl, files[0].name);
    window.setTimeout(() => URL.revokeObjectURL(singleUrl), 1000);
    return;
  }

  setStatus(100, 'Preparing download', `Packing ${files.length} files into a ZIP...`);
  const zipBlob = await createZipBlob(files);
  const zipUrl = URL.createObjectURL(zipBlob);
  triggerDownload(zipUrl, zipName);
  window.setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
  setStatus(100, 'Download ready', `${zipName} contains ${files.length} files.`);
}

async function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const usedNames = new Map();
  let offset = 0;

  for (const file of files) {
    const safeName = getUniqueZipName(file.name, usedNames);
    const nameBytes = encoder.encode(safeName);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const { date, time } = getZipDateTime();

    const localHeader = createZipHeader(30, 0x04034b50);
    localHeader.setUint16(4, 20, true);
    localHeader.setUint16(6, 0, true);
    localHeader.setUint16(8, 0, true);
    localHeader.setUint16(10, time, true);
    localHeader.setUint16(12, date, true);
    localHeader.setUint32(14, crc, true);
    localHeader.setUint32(18, data.byteLength, true);
    localHeader.setUint32(22, data.byteLength, true);
    localHeader.setUint16(26, nameBytes.byteLength, true);
    localHeader.setUint16(28, 0, true);

    localParts.push(localHeader.buffer, nameBytes, data);

    const centralHeader = createZipHeader(46, 0x02014b50);
    centralHeader.setUint16(4, 20, true);
    centralHeader.setUint16(6, 20, true);
    centralHeader.setUint16(8, 0, true);
    centralHeader.setUint16(10, 0, true);
    centralHeader.setUint16(12, time, true);
    centralHeader.setUint16(14, date, true);
    centralHeader.setUint32(16, crc, true);
    centralHeader.setUint32(20, data.byteLength, true);
    centralHeader.setUint32(24, data.byteLength, true);
    centralHeader.setUint16(28, nameBytes.byteLength, true);
    centralHeader.setUint16(30, 0, true);
    centralHeader.setUint16(32, 0, true);
    centralHeader.setUint16(34, 0, true);
    centralHeader.setUint16(36, 0, true);
    centralHeader.setUint32(38, 0, true);
    centralHeader.setUint32(42, offset, true);
    centralParts.push(centralHeader.buffer, nameBytes);

    offset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;
  }

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endHeader = createZipHeader(22, 0x06054b50);
  endHeader.setUint16(4, 0, true);
  endHeader.setUint16(6, 0, true);
  endHeader.setUint16(8, files.length, true);
  endHeader.setUint16(10, files.length, true);
  endHeader.setUint32(12, centralDirectorySize, true);
  endHeader.setUint32(16, offset, true);
  endHeader.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endHeader.buffer], { type: 'application/zip' });
}

function createZipHeader(size, signature) {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint32(0, signature, true);
  return view;
}

function getUniqueZipName(name, usedNames) {
  const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_') || 'file';
  const count = usedNames.get(safeName) || 0;
  usedNames.set(safeName, count + 1);

  if (count === 0) {
    return safeName;
  }

  const dotIndex = safeName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return `${safeName}-${count + 1}`;
  }

  return `${safeName.slice(0, dotIndex)}-${count + 1}${safeName.slice(dotIndex)}`;
}

function getZipDateTime() {
  const now = new Date();
  const year = Math.max(now.getFullYear(), 1980);
  const date = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  return { date, time };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  const table = getCrc32Table();

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getCrc32Table() {
  if (getCrc32Table.table) {
    return getCrc32Table.table;
  }

  getCrc32Table.table = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });

  return getCrc32Table.table;
}

function triggerDownload(url, name) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function resetConverter(event) {
  event?.stopPropagation();
  resetConvertedFiles();
  resetSourceFiles();

  batchItems = [];
  activeItemId = '';
  isConverting = false;
  elements.fileInput.value = '';
  elements.fileName.textContent = 'No files selected';
  elements.fileSize.textContent = '';
  elements.fileList.innerHTML = '';
  elements.filePanel.classList.add('hidden');
  elements.converterPanel.classList.add('hidden');
  elements.uploadStatus.classList.add('hidden');
  elements.previewPanel.classList.add('hidden');
  elements.dropZone.classList.remove('has-file');
  elements.pdfPageLabel.style.display = 'none';
  setConversionBusy(false);
  setStatus(0, 'Ready', 'Choose files to start.');
  clearError();
}

function resetSourceFiles() {
  batchItems.forEach((item) => {
    if (item.sourceUrl) {
      URL.revokeObjectURL(item.sourceUrl);
    }
  });
  elements.sourcePreviewContainer.innerHTML = '';
  elements.previewTitle.textContent = 'Original file';
}

function resetConvertedFiles() {
  batchItems.forEach((item) => {
    item.convertedFiles.forEach((output) => URL.revokeObjectURL(output.url));
    item.convertedFiles = [];
    if (item.statusKind === 'converted') {
      item.status = item.isPdf && item.pdfDoc ? `${item.pdfDoc.numPages} page${item.pdfDoc.numPages > 1 ? 's' : ''}` : 'Ready';
      item.statusKind = 'ready';
    }
  });
  renderFileList();
  renderConvertedPreview();
}

function setStatus(percent, title, text) {
  elements.statusTitle.textContent = title;
  elements.statusPercent.textContent = `${percent}%`;
  elements.statusText.textContent = text;
  elements.progressFill.style.width = `${percent}%`;
}

function setConversionBusy(isBusy) {
  isConverting = isBusy;
  elements.convertButton.disabled = isBusy;
  elements.outputTypeSelect.disabled = isBusy;
  elements.pdfPageSelect.disabled = isBusy;
  elements.qualityInput.disabled = isBusy;
  elements.uploadButton.disabled = isBusy;
  elements.downloadOriginalButton.disabled = isBusy;
  elements.removeButton.disabled = isBusy;
}

function updateQualityLabel() {
  elements.qualityValue.textContent = `${elements.qualityInput.value}%`;
}

function showError(text) {
  elements.message.textContent = text;
  elements.message.className = 'message error';
  elements.message.classList.remove('hidden');
}

function clearError() {
  elements.message.textContent = '';
  elements.message.className = 'message hidden';
}

function getActiveItem() {
  return batchItems.find((item) => item.id === activeItemId) || batchItems[0] || null;
}

function getAllConvertedFiles() {
  return batchItems.flatMap((item) => item.convertedFiles);
}

function isSupportedFile(file) {
  return isPdfFile(file) || isSupportedImage(file);
}

function isPdfFile(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function isSupportedImage(file) {
  return imageExtensions.includes(file.type) || /\.(png|jpe?g|webp|avif)$/i.test(file.name);
}

function clampPage(page, totalPages) {
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(Math.round(page), 1), totalPages);
}

function getFormatName(type) {
  if (!type) {
    return 'Image';
  }
  const ext = type.split('/')[1]?.toUpperCase() || 'Image';
  return ext === 'JPEG' ? 'JPG' : ext;
}

function buildConvertedFileName(fileName, type) {
  const ext = mimeExtensions[type] || type.split('/')[1];
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'converted-image';
  return `${baseName}.${ext}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, index);
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
