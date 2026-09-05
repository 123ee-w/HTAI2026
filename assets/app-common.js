(function () {
  const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const UART_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const UART_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  let device = null;
  let writeCharacteristic = null;
  let latestStatus = '未连接 HTAI-JJ';

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function getThemeCode(fallback = 'A') {
    const params = new URLSearchParams(location.search);
    const code = (params.get('theme') || localStorage.getItem('htai-theme') || fallback).toUpperCase();
    return window.AppData.themes[code] ? code : fallback;
  }

  function setThemeCode(code) {
    if (window.AppData.themes[code]) localStorage.setItem('htai-theme', code);
  }

  function isBluetoothConnected() {
    return Boolean(writeCharacteristic);
  }

  function setStatus(text, connected) {
    latestStatus = text;
    $all('#btStatus,[data-bt-status]').forEach((node) => {
      node.textContent = text;
      node.classList.toggle('ok', Boolean(connected));
    });
  }

  function showToast(text) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 2400);
  }

  function normalizeSignal(text) {
    let clean = String(text || '').trim().toUpperCase();
    if (!clean) return '';
    clean = clean.replace(/^B['"]/, '').replace(/['"]$/, '').trim();
    if (/^(OK|STAR|MUSIC|WARN|CHECK|QOK1|QOK2|QOK3|QBAD|ACH[0-3])(:|$)/.test(clean)) return '';
    if (/^ANSWER_[A-D]$/.test(clean)) return clean;
    if (/^THEME_[1-7]$/.test(clean)) return clean;
    if (clean === 'ALL') return 'ALL';
    if (clean === 'QR') return 'QR';
    return ['A', 'B', 'P', 'Y', 'T', 'O', 'N', 'H'].includes(clean) ? clean : '';
  }

  function handleSignal(raw) {
    const signal = normalizeSignal(raw);
    if (!signal) return;

    if (signal.startsWith('ANSWER_')) {
      emit('htai:answer', { letter: signal.slice(-1) });
      return;
    }

    if (signal.startsWith('THEME_')) {
      emit('htai:theme', { index: Number(signal.slice(-1)) });
      return;
    }

    if (signal === 'H') {
      location.href = 'quiz.html?v=tech7&mode=dati';
      return;
    }

    if (window.AppData.themes[signal]) {
      setThemeCode(signal);
      if (document.body.dataset.page === 'science' && window.AppScience) {
        window.AppScience.activate(signal, true);
      } else {
        location.href = `science.html?v=tech7&theme=${encodeURIComponent(signal)}`;
      }
    }
  }

  async function connectBluetooth() {
    if (!navigator.bluetooth) {
      setStatus('当前浏览器不支持 Web Bluetooth');
      showToast('请用安卓 Chrome 或 Edge 打开 HTTPS 网页');
      emit('htai:connection', { connected: false });
      return;
    }

    try {
      setStatus('正在选择 HTAI-JJ...');
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'HTAI-JJ' }],
        optionalServices: [UART_SERVICE]
      });
      device.addEventListener('gattserverdisconnected', () => {
        writeCharacteristic = null;
        setStatus('连接已断开');
        showToast('蓝牙连接已断开，请重新连接');
        emit('htai:connection', { connected: false });
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(UART_SERVICE);
      writeCharacteristic = await service.getCharacteristic(UART_RX);
      const notify = await service.getCharacteristic(UART_TX);
      await notify.startNotifications();
      notify.addEventListener('characteristicvaluechanged', (event) => {
        const value = decoder.decode(event.target.value);
        value.split(/[\r\n]+/).forEach(handleSignal);
      });
      setStatus(`已连接 ${device.name || 'HTAI-JJ'}`, true);
      showToast('蓝牙连接成功');
      emit('htai:connection', { connected: true });
    } catch (error) {
      setStatus('未连接 HTAI-JJ');
      showToast(`连接失败：${error.message || error}`);
      emit('htai:connection', { connected: false });
    }
  }

  function disconnectBluetooth() {
    if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    writeCharacteristic = null;
    setStatus('已主动断开');
    emit('htai:connection', { connected: false });
  }

  async function sendCommand(command, options = {}) {
    const quiet = Boolean(options.quiet);
    if (!writeCharacteristic) {
      if (!quiet) showToast('请先连接 HTAI-JJ');
      return false;
    }
    try {
      await writeCharacteristic.writeValue(encoder.encode(command));
      if (!quiet) showToast(`已发送：${command}`);
      return true;
    } catch (error) {
      if (!quiet) showToast(`发送失败：${error.message || error}`);
      return false;
    }
  }

  function initCommon() {
    setStatus(latestStatus);
    $('#btConnect')?.addEventListener('click', connectBluetooth);
    $('#btDisconnect')?.addEventListener('click', disconnectBluetooth);
    $all('[data-send-command]').forEach((button) => {
      button.addEventListener('click', () => sendCommand(button.dataset.sendCommand));
    });
    $all('[data-theme-link]').forEach((link) => {
      link.addEventListener('click', () => setThemeCode(link.dataset.themeLink));
    });
  }

  window.App = {
    getThemeCode,
    setThemeCode,
    handleSignal,
    connectBluetooth,
    disconnectBluetooth,
    isBluetoothConnected,
    sendCommand,
    showToast,
    $,
    $all
  };

  document.addEventListener('DOMContentLoaded', initCommon);
})();
