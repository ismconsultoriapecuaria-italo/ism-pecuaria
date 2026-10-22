// Ponte entre as telas (feitas no protótipo) e o app: banco local/nuvem e downloads.
(function () {
  'use strict';
  function baixar({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data], {
      type: /\.pdf$/i.test(filename) ? 'application/pdf' : /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8'
        : /\.xlsx$/i.test(filename) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream'
    });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return Promise.resolve();
  }
  window.claude = {
    use: async k => {
      if (k === 'db') return window.Sinc.db;
      if (k === 'downloads') return { save: baixar };
      if (k === 'user') return { can: async () => true };
      return null;
    }
  };
})();
