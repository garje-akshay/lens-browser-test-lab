// Trigger a PNG download (or new-tab fallback on cross-origin fetch errors).
export function downloadPng(url, filename) {
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    })
    .catch(() => window.open(url, '_blank'));
}
