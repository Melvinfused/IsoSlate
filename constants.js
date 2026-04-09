const CONSTANTS = {
  VIDEO_EXTS: ['.mp4', '.mkv', '.webm', '.mov', '.avi'],
  SUB_EXTS: ['.vtt', '.srt'],
  DEBOUNCE_MS: 5000,
  COMPLETION_THRESHOLD: 0.9,
  OVERLAY_TIMEOUT_MS: 2500,
  ASCII_UPDATE_INTERVAL_MS: 150,
  SKIP_SECONDS: 30,
  SKIP_SECONDS_MODIFIER: 10,
  PROGRESS_FILE_NAME: 'progress.json'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONSTANTS;
} else if (typeof window !== 'undefined') {
  window.APP_CONSTANTS = CONSTANTS;
}
