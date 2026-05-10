const mimeExtensions = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

const elements = {
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  uploadButton: document.getElementById('upload-button'),
  filePanel: document.getElementById('file-panel'),
  fileName: document.getElementById('file-name'),
  fileSize: document.getElementById('file-size'),
  removeButton: document.getElementById('remove-button'),
  converterPanel: document.getElementById('converter-panel'),
  formatSelect: document.getElementById('format-select'),
  qualityInput: document.getElementById('quality-input'),
  qualityValue: document.getElementById('quality-value'),
  convertButton: document.getElementById('convert-button'),
  downloadButton: document.getElementById('download-button'),
  uploadStatus: document.getElementById('upload-status'),
  statusTitle: document.getElementById('status-title'),
  statusPercent: document.getElementById('status-percent'),
  statusText: document.getElementById('status-text'),
  progressFill: document.getElementById('progress-fill'),
  previewPanel: document.getElementById('preview-panel'),
  previewTitle: document.getElementById('preview-title'),
  sourcePreview: document.getElementById('source-preview'),
  convertedPreviewBox: document.getElementById('converted-preview-box'),
  convertedPreview: document.getElementById('converted-preview'),
  message: document.getElementById('message')
};

let selectedFile = null;
let sourceFileUrl = '';
let convertedFileUrl = '';
let convertedFileName = '';
let animationTimer = null;

setupEvents();

function setupEvents() {
  elements.uploadButton.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('keydown', handleKeyboardUpload);
  elements.fileInput.addEventListener('change', handleInputChange);
  elements.removeButton.addEventListener('click', resetConverter);
  elements.convertButton.addEventListener('click', convertSelectedFile);
  elements.downloadButton.addEventListener('click', downloadConvertedFile);
  elements.qualityInput.addEventListener('input', updateQualityLabel);

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
    showError('No file was dropped. Please drop an image file.');
    return;
  }

  handleSelectedFile(file);
}

function handleSelectedFile(file) {
  clearError();
  stopAnimation();
  resetSourceFile();
  resetConvertedFile();

  if (!isSupportedImage(file)) {
    selectedFile = null;
    elements.fileInput.value = '';
    elements.filePanel.classList.add('hidden');
    elements.converterPanel.classList.add('hidden');
    elements.previewPanel.classList.add('hidden');
    showError('Only PNG, JPG, and WebP images are supported.');
    setStatus(0, 'File rejected', 'Choose a PNG, JPG, or WebP image.');
    elements.uploadStatus.classList.remove('hidden');
    return;
  }

  selectedFile = file;
  sourceFileUrl = URL.createObjectURL(file);
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = `${formatFileSize(file.size)} - ${getFormatName(file.type)}`;
  elements.sourcePreview.src = sourceFileUrl;
  elements.previewTitle.textContent = file.name;
  elements.filePanel.classList.remove('hidden');
  elements.converterPanel.classList.remove('hidden');
  elements.uploadStatus.classList.remove('hidden');
  elements.previewPanel.classList.remove('hidden');
  elements.dropZone.classList.add('has-file');
  animateReadyState();
}

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
    showError('Choose an image before converting.');
    return;
  }

  clearError();
  resetConvertedFile();
  setConversionBusy(true);
  setStatus(35, 'Converting', 'Drawing image to canvas...');

  try {
    const image = await loadImage(sourceFileUrl);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const outputType = elements.formatSelect.value;

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

    elements.convertedPreview.src = convertedFileUrl;
    elements.convertedPreviewBox.classList.remove('hidden');
    elements.downloadButton.classList.remove('hidden');
    setStatus(100, 'Converted', `${convertedFileName} is ready to download.`);
  } catch (error) {
    showError('Could not convert this image. Try another PNG, JPG, or WebP file.');
    setStatus(0, 'Conversion failed', 'The selected image could not be converted.');
  } finally {
    setConversionBusy(false);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Canvas conversion failed'));
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
  elements.fileInput.value = '';
  elements.fileName.textContent = 'No file selected';
  elements.fileSize.textContent = '';
  elements.filePanel.classList.add('hidden');
  elements.converterPanel.classList.add('hidden');
  elements.uploadStatus.classList.add('hidden');
  elements.previewPanel.classList.add('hidden');
  elements.dropZone.classList.remove('has-file');
  setStatus(0, 'Ready', 'Choose an image to start.');
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

  elements.sourcePreview.removeAttribute('src');
  elements.previewTitle.textContent = 'Original image';
}

function resetConvertedFile() {
  if (convertedFileUrl) {
    URL.revokeObjectURL(convertedFileUrl);
    convertedFileUrl = '';
  }

  convertedFileName = '';
  elements.convertedPreview.removeAttribute('src');
  elements.convertedPreviewBox.classList.add('hidden');
  elements.downloadButton.classList.add('hidden');
}

function setStatus(percent, title, text) {
  elements.statusTitle.textContent = title;
  elements.statusPercent.textContent = `${percent}%`;
  elements.statusText.textContent = text;
  elements.progressFill.style.width = `${percent}%`;
}

function setConversionBusy(isBusy) {
  elements.convertButton.disabled = isBusy;
  elements.formatSelect.disabled = isBusy;
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
  return Boolean(mimeExtensions[file.type]) || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function getFormatName(type) {
  return mimeExtensions[type]?.toUpperCase().replace('JPG', 'JPG') || 'IMAGE';
}

function buildConvertedFileName(fileName, type) {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'converted-image';
  return `${baseName}.${mimeExtensions[type]}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, index);
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
