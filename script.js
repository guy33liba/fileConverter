import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const elements = {
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  uploadButton: document.getElementById('upload-button'),
  filePanel: document.getElementById('file-panel'),
  fileName: document.getElementById('file-name'),
  fileSize: document.getElementById('file-size'),
  downloadButton: document.getElementById('download-button'),
  removeButton: document.getElementById('remove-button'),
  uploadStatus: document.getElementById('upload-status'),
  statusTitle: document.getElementById('status-title'),
  statusPercent: document.getElementById('status-percent'),
  statusText: document.getElementById('status-text'),
  progressFill: document.getElementById('progress-fill'),
  previewPanel: document.getElementById('preview-panel'),
  previewTitle: document.getElementById('preview-title'),
  pageCount: document.getElementById('page-count'),
  prevPageButton: document.getElementById('prev-page-button'),
  nextPageButton: document.getElementById('next-page-button'),
  previewCanvas: document.getElementById('pdf-preview-canvas'),
  message: document.getElementById('message')
};

let selectedFile = null;
let animationTimer = null;
let previewPdf = null;
let currentPage = 1;
let previewToken = 0;
let activeRenderTask = null;

setupEvents();

function setupEvents() {
  elements.uploadButton.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('keydown', handleKeyboardUpload);
  elements.fileInput.addEventListener('change', handleInputChange);
  elements.downloadButton.addEventListener('click', downloadSelectedFile);
  elements.removeButton.addEventListener('click', resetUpload);
  elements.prevPageButton.addEventListener('click', () => changePreviewPage(-1));
  elements.nextPageButton.addEventListener('click', () => changePreviewPage(1));

  elements.dropZone.addEventListener('dragover', handleDragOver);
  elements.dropZone.addEventListener('dragleave', handleDragLeave);
  elements.dropZone.addEventListener('drop', handleDrop);
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

function handleDragOver(event) {
  event.preventDefault();
  elements.dropZone.classList.add('drag-over');
}

function handleDragLeave(event) {
  event.preventDefault();
  elements.dropZone.classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  elements.dropZone.classList.remove('drag-over');

  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    showError('No file was dropped. Please drop a PDF file.');
    return;
  }

  handleSelectedFile(file);
}

function handleSelectedFile(file) {
  clearError();
  stopAnimation();
  resetPreview();

  if (!isPdf(file)) {
    selectedFile = null;
    elements.fileInput.value = '';
    elements.filePanel.classList.add('hidden');
    showError('Only PDF files are allowed. Please choose a file ending in .pdf.');
    setStatus(0, 'Upload failed', 'Invalid file type.');
    elements.uploadStatus.classList.remove('hidden');
    return;
  }

  selectedFile = file;
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatFileSize(file.size);
  elements.filePanel.classList.remove('hidden');
  elements.uploadStatus.classList.remove('hidden');
  animateUploadSuccess();
  renderPreview(file);
}

function animateUploadSuccess() {
  let progress = 0;
  setStatus(0, 'Uploading', 'Checking your PDF...');

  animationTimer = window.setInterval(() => {
    progress += progress < 72 ? 14 : 7;
    if (progress >= 100) {
      progress = 100;
      stopAnimation();
      setStatus(100, 'Ready', 'PDF selected successfully.');
      elements.dropZone.classList.add('has-file');
      return;
    }
    setStatus(progress, 'Uploading', 'Validating file...');
  }, 90);
}

function setStatus(percent, title, text) {
  elements.statusTitle.textContent = title;
  elements.statusPercent.textContent = `${percent}%`;
  elements.statusText.textContent = text;
  elements.progressFill.style.width = `${percent}%`;
}

function resetUpload(event) {
  event?.stopPropagation();
  selectedFile = null;
  elements.fileInput.value = '';
  elements.fileName.textContent = 'No file selected';
  elements.fileSize.textContent = '';
  elements.filePanel.classList.add('hidden');
  elements.uploadStatus.classList.add('hidden');
  elements.dropZone.classList.remove('has-file');
  setStatus(0, 'Uploading', 'Checking your PDF...');
  clearError();
  stopAnimation();
  resetPreview();
}

function downloadSelectedFile(event) {
  event?.stopPropagation();

  if (!selectedFile) {
    showError('Choose a PDF file before downloading.');
    return;
  }

  const downloadUrl = URL.createObjectURL(selectedFile);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = selectedFile.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}

async function renderPreview(file) {
  const token = ++previewToken;
  elements.previewPanel.classList.remove('hidden');
  elements.previewTitle.textContent = 'Loading preview...';
  elements.pageCount.textContent = '';
  setPreviewControlsDisabled(true);

  try {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    if (token !== previewToken) return;

    previewPdf = pdf;
    currentPage = 1;
    await renderPreviewPage(token);
  } catch (error) {
    if (token !== previewToken) return;

    resetPreviewCanvas();
    elements.previewTitle.textContent = 'Preview unavailable';
    elements.pageCount.textContent = '';
    setPreviewControlsDisabled(true);
    showError('The PDF was selected, but the preview could not be loaded.');
  }
}

async function renderPreviewPage(token = previewToken) {
  if (!previewPdf) return;

  setPreviewControlsDisabled(true);

  if (activeRenderTask) {
    activeRenderTask.cancel();
    activeRenderTask = null;
  }

  try {
    const page = await previewPdf.getPage(currentPage);
    const maxWidth = Math.min(elements.previewPanel.clientWidth - 44, 760);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(0.8, Math.min(1.55, maxWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });
    const context = elements.previewCanvas.getContext('2d');

    elements.previewCanvas.width = Math.floor(viewport.width);
    elements.previewCanvas.height = Math.floor(viewport.height);
    elements.previewCanvas.style.width = `${Math.floor(viewport.width)}px`;
    elements.previewCanvas.style.height = `${Math.floor(viewport.height)}px`;

    activeRenderTask = page.render({ canvasContext: context, viewport });
    await activeRenderTask.promise;

    if (token !== previewToken) return;

    activeRenderTask = null;
    elements.previewTitle.textContent = `Page ${currentPage}`;
    elements.pageCount.textContent = `${currentPage} / ${previewPdf.numPages}`;
    setPreviewControlsDisabled(false);
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') return;

    elements.previewTitle.textContent = 'Preview unavailable';
    setPreviewControlsDisabled(true);
  }
}

function changePreviewPage(delta) {
  if (!previewPdf) return;

  currentPage = Math.min(Math.max(currentPage + delta, 1), previewPdf.numPages);
  renderPreviewPage();
}

function resetPreview() {
  previewToken += 1;

  if (activeRenderTask) {
    activeRenderTask.cancel();
    activeRenderTask = null;
  }

  previewPdf = null;
  currentPage = 1;
  elements.previewPanel.classList.add('hidden');
  elements.previewTitle.textContent = 'Page 1';
  elements.pageCount.textContent = '1 / 1';
  setPreviewControlsDisabled(true);
  resetPreviewCanvas();
}

function resetPreviewCanvas() {
  const context = elements.previewCanvas.getContext('2d');
  context.clearRect(0, 0, elements.previewCanvas.width, elements.previewCanvas.height);
  elements.previewCanvas.width = 0;
  elements.previewCanvas.height = 0;
}

function setPreviewControlsDisabled(disabled) {
  const isSinglePage = !previewPdf || previewPdf.numPages <= 1;
  elements.prevPageButton.disabled = disabled || isSinglePage || currentPage <= 1;
  elements.nextPageButton.disabled = disabled || isSinglePage || currentPage >= previewPdf.numPages;
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

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, index);
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
