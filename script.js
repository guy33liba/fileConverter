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
  previewFrame: document.getElementById('pdf-preview-frame'),
  message: document.getElementById('message')
};

let selectedFile = null;
let selectedFileUrl = '';
let animationTimer = null;

setupEvents();

function setupEvents() {
  elements.uploadButton.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('click', openFilePicker);
  elements.dropZone.addEventListener('keydown', handleKeyboardUpload);
  elements.fileInput.addEventListener('change', handleInputChange);
  elements.downloadButton.addEventListener('click', downloadSelectedFile);
  elements.removeButton.addEventListener('click', resetUpload);

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
  selectedFileUrl = URL.createObjectURL(file);
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatFileSize(file.size);
  elements.filePanel.classList.remove('hidden');
  elements.uploadStatus.classList.remove('hidden');
  showPreview(file);
  animateUploadSuccess();
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

  const link = document.createElement('a');
  link.href = selectedFileUrl;
  link.download = selectedFile.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function showPreview(file) {
  elements.previewTitle.textContent = file.name;
  elements.previewFrame.src = selectedFileUrl;
  elements.previewPanel.classList.remove('hidden');
}

function resetPreview() {
  if (selectedFileUrl) {
    URL.revokeObjectURL(selectedFileUrl);
    selectedFileUrl = '';
  }

  elements.previewFrame.removeAttribute('src');
  elements.previewTitle.textContent = 'PDF preview';
  elements.previewPanel.classList.add('hidden');
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
