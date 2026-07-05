// 打印沙箱：把要打印的 sheet 克隆进 #print-root，@media print 只显示它。
// 与旧系统同一思路（Safari 同页打印，不开新窗口）。
const ROOT_ID = 'print-root';

export function printHTML(html, title = '') {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
  }
  if (!html || !html.trim()) {
    alert('没有可打印的内容');
    return;
  }
  root.innerHTML = html;
  document.body.classList.add('print-active');
  const prevTitle = document.title;
  if (title) document.title = title;

  const cleanup = () => {
    document.body.classList.remove('print-active');
    document.title = prevTitle;
    root.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // 给浏览器一点时间完成排版（分数排版需要）。不用 rAF：后台标签页会被节流。
  setTimeout(() => window.print(), 60);
}
