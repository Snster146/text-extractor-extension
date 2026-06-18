const extractBtn = document.getElementById('extractBtn');
const btnContent = document.getElementById('btnContent');
const btnLoading = document.getElementById('btnLoading');
const statusCard = document.getElementById('statusCard');
const statusText = document.getElementById('statusText');
const metaRow = document.getElementById('metaRow');
const wordCountVal = document.getElementById('wordCountVal');
const charCountVal = document.getElementById('charCountVal');
const lineCountVal = document.getElementById('lineCountVal');
const iconIdle = document.getElementById('iconIdle');
const iconSuccess = document.getElementById('iconSuccess');
const iconError = document.getElementById('iconError');

function setIcon(state) {
  iconIdle.classList.add('hidden');
  iconSuccess.classList.add('hidden');
  iconError.classList.add('hidden');
  if (state === 'idle') iconIdle.classList.remove('hidden');
  if (state === 'success') iconSuccess.classList.remove('hidden');
  if (state === 'error') iconError.classList.remove('hidden');
}

function setLoading(loading) {
  extractBtn.disabled = loading;
  if (loading) {
    btnContent.classList.add('hidden');
    btnLoading.classList.remove('hidden');
  } else {
    btnContent.classList.remove('hidden');
    btnLoading.classList.add('hidden');
  }
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

function showMeta(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const lines = text.split('\n').filter(l => l.trim()).length;

  wordCountVal.textContent = formatNumber(words);
  charCountVal.textContent = formatNumber(chars);
  lineCountVal.textContent = formatNumber(lines);
  metaRow.classList.remove('hidden');
}

function triggerDownload(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(title) {
  return title
    .replace(/[^a-z0-9\-_\s]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'extracted_text';
}

extractBtn.addEventListener('click', async () => {
  setLoading(true);
  statusCard.className = 'status-card';
  setIcon('idle');
  statusText.textContent = 'Scanning page content…';
  metaRow.classList.add('hidden');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) throw new Error('No active tab found.');

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Collect visible text, skipping scripts/styles/hidden elements
        const SKIP_TAGS = new Set([
          'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE',
          'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED'
        ]);
        
        function isVisible(el) {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0';
        }

        function extractNode(node, lines) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) lines.push(text);
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (SKIP_TAGS.has(node.tagName)) return;
          if (!isVisible(node)) return;

          // Add line breaks for block elements
          const BLOCK = new Set([
            'H1','H2','H3','H4','H5','H6','P','DIV','SECTION',
            'ARTICLE','ASIDE','HEADER','FOOTER','MAIN','NAV',
            'UL','OL','LI','BLOCKQUOTE','PRE','BR','HR',
            'TABLE','TR','TD','TH','FIGURE','FIGCAPTION','DETAILS','SUMMARY'
          ]);

          const isBlock = BLOCK.has(node.tagName);

          if (isBlock && lines.length && lines[lines.length - 1] !== '') {
            lines.push('');
          }

          for (const child of node.childNodes) {
            extractNode(child, lines);
          }

          if (isBlock && lines.length && lines[lines.length - 1] !== '') {
            lines.push('');
          }
        }

        const lines = [];
        extractNode(document.body, lines);

        // Clean up: collapse multiple blank lines
        const cleaned = lines
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        return {
          text: cleaned,
          title: document.title || 'page',
          url: window.location.href
        };
      }
    });

    const { text, title, url } = results[0].result;

    if (!text || text.length < 5) {
      throw new Error('No readable text found on this page.');
    }

    // Build the file content with a small header
    const timestamp = new Date().toLocaleString();
    const header = [
      `Source: ${url}`,
      `Extracted: ${timestamp}`,
      '─'.repeat(60),
      ''
    ].join('\n');

    const fileContent = header + text;
    const filename = sanitizeFilename(title) + '.txt';

    triggerDownload(filename, fileContent);

    showMeta(text);
    setIcon('success');
    statusCard.classList.add('state-success');
    statusText.textContent = `Done! "${filename}" saved to your downloads.`;

  } catch (err) {
    setIcon('error');
    statusCard.classList.add('state-error');
    statusText.textContent = err.message || 'Something went wrong. Try reloading the page.';
  } finally {
    setLoading(false);
  }
});
