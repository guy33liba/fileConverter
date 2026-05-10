import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const imageExtensions = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
const mimeExtensions = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif'
};
const pdfImageOutputTypes = {
  'pdf-to-png': 'image/png',
  'pdf-to-jpg': 'image/jpeg',
  'pdf-to-webp': 'image/webp'
};

const elements = { 
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  uploadButton: document.getElementById('upload-button'),
  filePanel: document.getElementById('file-panel'),
  fileName: document.getElementById('file-name'),
  fileSize: document.getElementById('file-size'),
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

let selectedFile = null;
let sourceFileUrl = '';
let convertedFileUrl = '';
let convertedFileName = '';
let animationTimer = null;
let isPdf = false;
let pdfDoc = null;
let selectedPdfPages = [];

setupEvents();

function setupEvents() {
  elements.uploadButton.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('keydown', handleKeyboardUpload);
  elements.fileInput.addEventListener('change', handleInputChange);
  elements.downloadOriginalButton.addEventListener('click', downloadOriginalFile);
  elements.removeButton.addEventListener('click', resetConverter);
  elements.convertButton.addEventListener('click', convertSelectedFile);
  elements.downloadConvertedButton.addEventListener('click', downloadConvertedFile);
  elements.qualityInput.addEventListener('input', updateQualityLabel);
  elements.outputTypeSelect.addEventListener('change', handleOutputTypeChange);

  elements.dropZone.addEventListener('dragenter', handleDragEnter);
  elements.dropZone.addEventListener('dragover', handleDragOver);
  elements.dropZone.addEventListener('dragleave', handleDragLeave);
  elements.dropZone.addEventListener('drop', handleDrop);

  document.addEventListener('dragover', preventBrowserFileOpen);
  document.addEventListener('drop', preventBrowserFileOpen);
}

function openFilePicker(event) {
  event?.stopPropagation();
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
  const file = event.target.files?.[0];
  if (file) {
    handleSelectedFile(file);
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

  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    showError('No file was dropped. Please drop a file.');
    return;
  }
  handleSelectedFile(file);
}

async function handleSelectedFile(file) {
  clearError();
  stopAnimation();
  resetSourceFile();
  resetConvertedFile();
  pdfDoc = null;
  selectedPdfPages = [];

  isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  
  if (!isPdf && !isSupportedImage(file)) {
    selectedFile = null;
    elements.fileInput.value = '';
    showError('Unsupported file type. Please upload a PDF or image (PNG, JPG, WebP, AVIF).');
    return;
  }

  selectedFile = file;
  sourceFileUrl = URL.createObjectURL(file);
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatFileSize(file.size);

  updateOutputOptions();
  
  if (isPdf) {
    setStatus(10, 'Loading PDF', 'Reading PDF file...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      populatePdfPages(pdfDoc.numPages);
      setStatus(50, 'Ready', `${pdfDoc.numPages} page${pdfDoc.numPages > 1 ? 's' : ''} loaded. Select output format.`);
      await showPdfPreview();
    } catch (err) {
      showError('Failed to read PDF file.');
      setStatus(0, 'Error', 'Could not load PDF.');
      return;
    }
  } else {
    animateReadyState();
    await showImagePreview(file);
  }

  elements.filePanel.classList.remove('hidden');
  elements.converterPanel.classList.remove('hidden');
  elements.uploadStatus.classList.remove('hidden');
  elements.previewPanel.classList.remove('hidden');
  elements.dropZone.classList.add('has-file');
}

function updateOutputOptions() {
  const select = elements.outputTypeSelect;
  select.innerHTML = '';
  
  if (isPdf) {
    const optGroupPdf = document.createElement('optgroup');
    optGroupPdf.label = 'From PDF';
    [
      { value: 'pdf-to-png', label: 'PDF to PNG' },
      { value: 'pdf-to-jpg', label: 'PDF to JPG' },
      { value: 'pdf-to-webp', label: 'PDF to WebP' },
      { value: 'pdf-to-text', label: 'PDF to Text (TXT)' }
    ].forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      optGroupPdf.appendChild(option);
    });
    select.appendChild(optGroupPdf);
    elements.qualityLabel.style.display = '';
    elements.pdfPageLabel.style.display = '';
  } else {
    const optGroupImg = document.createElement('optgroup');
    optGroupImg.label = 'Image formats';
    [
      { value: 'image/png', label: 'PNG' },
      { value: 'image/jpeg', label: 'JPG' },
      { value: 'image/webp', label: 'WebP' }
    ].forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      optGroupImg.appendChild(option);
    });
    select.appendChild(optGroupImg);
    elements.qualityLabel.style.display = '';
    elements.pdfPageLabel.style.display = 'none';
  }
}

function populatePdfPages(numPages) {
  const select = elements.pdfPageSelect;
  select.innerHTML = '';
  selectedPdfPages = [];
  
  for (let i = 1; i <= numPages; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Page ${i} of ${numPages}`;
    select.appendChild(option);
  }
  select.selectedIndex = 0;
}

function handleOutputTypeChange() {
  resetConvertedFile();
  const outputType = elements.outputTypeSelect.value;
  if (outputType === 'pdf-to-text') {
    elements.qualityLabel.style.display = 'none';
  } else {
    elements.qualityLabel.style.display = '';
  }
}

async function showImagePreview(file) {
  return new Promise((resolve) => {
    elements.sourcePreviewContainer.innerHTML = '';
    const img = document.createElement('img');
    img.alt = 'Original image preview';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '300px';
    img.style.borderRadius = '8px';
    img.src = sourceFileUrl;
    img.onload = () => {
      elements.sourcePreviewContainer.appendChild(img);
      elements.previewTitle.textContent = file.name;
      resolve();
    };
    img.onerror = () => {
      elements.sourcePreviewContainer.innerHTML = '<p>Preview not available</p>';
      resolve();
    };
  });
}

async function showPdfPreview() {
  elements.sourcePreviewContainer.innerHTML = '';
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';
  
  const pageNum = parseInt(elements.pdfPageSelect.value) || 1;
  
  try {
    const page = await pdfDoc.getPage(pageNum);
    const scale = 0.8;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.maxWidth = '100%';
    canvas.style.borderRadius = '8px';
    
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    container.appendChild(canvas);
    
    const pageInfo = document.createElement('p');
    pageInfo.textContent = `PDF - Page ${pageNum} of ${pdfDoc.numPages}`;
    pageInfo.style.cssText = 'font-size: 12px; color: #666; margin: 0;';
    container.appendChild(pageInfo);
    
    elements.sourcePreviewContainer.appendChild(container);
    elements.previewTitle.textContent = selectedFile.name;
  } catch (err) {
    container.innerHTML = '<p>Preview not available</p>';
    elements.sourcePreviewContainer.appendChild(container);
  }
}

elements.pdfPageSelect?.addEventListener('change', async () => {
  if (isPdf && pdfDoc) {
    await showPdfPreview();
    resetConvertedFile();
  }
});

function animateReadyState() {
  let progress = 0;
  setStatus(0, 'Loading', 'Reading your image...');

  animationTimer = window.setInterval(() => {
    progress += progress < 72 ? 18 : 7;
    if (progress >= 100) {
      progress = 100;
      stopAnimation();
      setStatus(100, 'Ready to convert', 'Choose an output format and convert.');
      return;
    }
    setStatus(progress, 'Loading', 'Preparing preview...');
  }, 70);
}

async function convertSelectedFile(event) {
  event?.stopPropagation();

  if (!selectedFile) {
    showError('Choose a file before converting.');
    return;
  }

  clearError();
  resetConvertedFile();
  setConversionBusy(true);
  
  const outputType = elements.outputTypeSelect.value;

  if (isPdf) {
    await convertPdf(outputType);
  } else {
    await convertImage(outputType);
  }

  setConversionBusy(false);
}

async function convertImage(outputType) {
  setStatus(35, 'Converting', 'Drawing image to canvas...');

  try {
    const image = await loadImage(sourceFileUrl);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    if (outputType === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(image, 0, 0);
    setStatus(70, 'Converting', `Creating ${getFormatName(outputType)} file...`);

    const blob = await canvasToBlob(canvas, outputType, Number(elements.qualityInput.value) / 100);
    convertedFileUrl = URL.createObjectURL(blob);
    convertedFileName = buildConvertedFileName(selectedFile.name, outputType);

    showConvertedImagePreview(blob);
    setStatus(100, 'Converted', `${convertedFileName} is ready to download.`);
  } catch (error) {
    showError('Could not convert this image. Try another file.');
    setStatus(0, 'Conversion failed', 'The selected image could not be converted.');
  }
}

async function convertPdf(outputType) {
  if (outputType === 'pdf-to-text') {
    await extractPdfText();
  } else {
    await convertPdfToImages(outputType);
  }
}

async function extractPdfText() {
  setStatus(30, 'Extracting text', 'Reading PDF content...');
  
  try {
    let fullText = '';
    const totalPages = pdfDoc.numPages;
    
    for (let i = 1; i <= totalPages; i++) {
      setStatus(30 + Math.floor((i / totalPages) * 50), 'Extracting', `Processing page ${i} of ${totalPages}...`);
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    
    const blob = new Blob([fullText], { type: 'text/plain' });
    convertedFileUrl = URL.createObjectURL(blob);
    const baseName = selectedFile.name.replace(/\.pdf$/i, '') || 'converted';
    convertedFileName = `${baseName}.txt`;
    
    showTextPreview(fullText);
    setStatus(100, 'Extracted', 'Text extracted successfully.');
  } catch (err) {
    showError('Could not extract text from PDF.');
    setStatus(0, 'Extraction failed', 'Could not read PDF text.');
  }
}

async function convertPdfToImages(outputType) {
  setStatus(20, 'Preparing', 'Rendering PDF pages...');
  
  try {
    const pageNum = parseInt(elements.pdfPageSelect.value) || 1;
    const page = await pdfDoc.getPage(pageNum);
    
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    
    if (outputType === 'pdf-to-jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    setStatus(50, 'Rendering', 'Drawing page to canvas...');
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    setStatus(80, 'Converting', `Creating ${outputType.replace('pdf-to-', '').toUpperCase()} file...`);
    
    const mimeType = pdfImageOutputTypes[outputType];
    if (!mimeType) {
      throw new Error(`Unsupported PDF output type: ${outputType}`);
    }
    const quality = Number(elements.qualityInput.value) / 100;
    const blob = await canvasToBlob(canvas, mimeType, quality);
    
    convertedFileUrl = URL.createObjectURL(blob);
    const baseName = selectedFile.name.replace(/\.pdf$/i, '') || 'converted';
    const ext = mimeExtensions[mimeType] || 'png';
    convertedFileName = `${baseName}-page${pageNum}.${ext}`;
    
    showConvertedImagePreview(blob);
    setStatus(100, 'Converted', `${convertedFileName} is ready to download.`);
  } catch (err) {
    showError('Could not convert PDF page.');
    setStatus(0, 'Conversion failed', 'PDF page could not be rendered.');
  }
}

function showConvertedImagePreview(blob) {
  elements.convertedPreviewContainer.innerHTML = '';
  const img = document.createElement('img');
  img.alt = 'Converted file preview';
  img.style.maxWidth = '100%';
  img.style.maxHeight = '300px';
  img.style.borderRadius = '8px';
  img.src = convertedFileUrl;
  img.onload = () => {
    elements.convertedPreviewContainer.appendChild(img);
  };
  img.onerror = () => {
    elements.convertedPreviewContainer.innerHTML = '<p>Preview not available</p>';
  };
  elements.convertedPreviewBox.classList.remove('hidden');
  elements.downloadConvertedButton.classList.remove('hidden');
}

function showTextPreview(text) {
  elements.convertedPreviewContainer.innerHTML = '';
  const pre = document.createElement('pre');
  pre.textContent = text.length > 2000 ? text.substring(0, 2000) + '\n\n... (truncated)' : text;
  pre.style.cssText = 'max-height: 300px; overflow-y: auto; font-size: 12px; background: #f5f5f5; padding: 12px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; max-width: 100%;';
  
  const label = document.createElement('p');
  label.style.cssText = 'font-size: 12px; color: #666; margin: 8px 0 0;';
  label.textContent = `${text.length} characters extracted`;
  
  elements.convertedPreviewContainer.appendChild(pre);
  elements.convertedPreviewContainer.appendChild(label);
  elements.convertedPreviewBox.classList.remove('hidden');
  elements.downloadConvertedButton.classList.remove('hidden');
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

function downloadOriginalFile(event) {
  event?.stopPropagation();

  if (!sourceFileUrl || !selectedFile) {
    showError('Choose a file before downloading.');
    return;
  }

  const link = document.createElement('a');
  link.href = sourceFileUrl;
  link.download = selectedFile.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadConvertedFile(event) {
  event?.stopPropagation();

  if (!convertedFileUrl) {
    showError('Convert the file before downloading.');
    return;
  }

  const link = document.createElement('a');
  link.href = convertedFileUrl;
  link.download = convertedFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function resetConverter(event) {
  event?.stopPropagation();
  selectedFile = null;
  isPdf = false;
  pdfDoc = null;
  elements.fileInput.value = '';
  elements.fileName.textContent = 'No file selected';
  elements.fileSize.textContent = '';
  elements.filePanel.classList.add('hidden');
  elements.converterPanel.classList.add('hidden');
  elements.uploadStatus.classList.add('hidden');
  elements.previewPanel.classList.add('hidden');
  elements.dropZone.classList.remove('has-file');
  elements.pdfPageLabel.style.display = 'none';
  setStatus(0, 'Ready', 'Choose a file to start.');
  clearError();
  stopAnimation();
  resetSourceFile();
  resetConvertedFile();
}

function resetSourceFile() {
  if (sourceFileUrl) {
    URL.revokeObjectURL(sourceFileUrl);
    sourceFileUrl = '';
  }
  elements.sourcePreviewContainer.innerHTML = '';
  elements.previewTitle.textContent = 'Original file';
}

function resetConvertedFile() {
  if (convertedFileUrl) {
    URL.revokeObjectURL(convertedFileUrl);
    convertedFileUrl = '';
  }
  convertedFileName = '';
  elements.convertedPreviewContainer.innerHTML = '';
  elements.convertedPreviewBox.classList.add('hidden');
  elements.downloadConvertedButton.classList.add('hidden');
}

function setStatus(percent, title, text) {
  elements.statusTitle.textContent = title;
  elements.statusPercent.textContent = `${percent}%`;
  elements.statusText.textContent = text;
  elements.progressFill.style.width = `${percent}%`;
}

function setConversionBusy(isBusy) {
  elements.convertButton.disabled = isBusy;
  elements.outputTypeSelect.disabled = isBusy;
  elements.qualityInput.disabled = isBusy;
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

function stopAnimation() {
  if (animationTimer) {
    window.clearInterval(animationTimer);
    animationTimer = null;
  }
}

function isSupportedImage(file) {
  return imageExtensions.includes(file.type) || /\.(png|jpe?g|webp|avif)$/i.test(file.name);
}

function getFormatName(type) {
  const ext = type.split('/')[1]?.toUpperCase() || 'IMAGE';
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
