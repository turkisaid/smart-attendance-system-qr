/* =============================================
   UTAS–Sohar Attendance System — qr.js
   QR code generation & token verification
   Exposed as window.QRAttendance
   ============================================= */

(function () {
  'use strict';

  const QR_DURATION = 5; // seconds

  let _cfg      = null;
  let _interval = null;
  let _timeLeft = 0;

  /* --------------------------------------------------
     PUBLIC: initQR({ studentId, courseId,
                       qrContainerId, timerId,
                       statusId, btnId })
     Generates a QR immediately and starts countdown.
     Safe to call again (regenerate) — stops old timer.
  -------------------------------------------------- */
  function initQR(cfg) {
    if (_interval) { clearInterval(_interval); _interval = null; }
    _cfg = cfg;

    var parts  = _buildTokenParts(cfg.studentId, cfg.courseId);
    var token  = parts.token;
    var qrData = 'UTAS-ATTEND|' + cfg.studentId + '|' + cfg.courseId + '|' + token;

    var statusEl = document.getElementById(cfg.statusId);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/attendance-system/backend/save_qr.php', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var ok = false;
      try { ok = JSON.parse(xhr.responseText).success === true; } catch(e) {}
      if (!ok) {
        if (statusEl) {
          statusEl.textContent = 'Error saving QR — try again';
          statusEl.className   = 'qr-token-label qr-status-expired';
        }
        return;
      }

      var container = document.getElementById(cfg.qrContainerId);
      if (container) {
        var wrap = container.parentNode;
        var oldOverlay = wrap && wrap.querySelector('.qr-expired-overlay');
        if (oldOverlay) oldOverlay.remove();
        container.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
          new QRCode(container, {
            text: qrData, width: 210, height: 210,
            colorDark: '#0d2b5e', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M,
          });
        }
      }

      if (statusEl) {
        statusEl.textContent = 'Token: ' + token;
        statusEl.className   = 'qr-token-label qr-status-active';
      }

      var btn = document.getElementById(cfg.btnId);
      if (btn) {
        btn.className   = 'btn btn-secondary';
        btn.style.width = '100%';
        btn.innerHTML   = '<i class="fa-solid fa-rotate-right"></i> Regenerate QR Code';
      }

      var noteEl = document.getElementById('qrTimerNote');
      if (noteEl) noteEl.textContent = 'Scan before time runs out';

      _timeLeft = QR_DURATION;
      _tick();
      _interval = setInterval(function () {
        _timeLeft--;
        _tick();
        if (_timeLeft <= 0) { clearInterval(_interval); _interval = null; _expire(); }
      }, 1000);
    };
    xhr.onerror = function () {
      if (statusEl) {
        statusEl.textContent = 'Error saving QR — try again';
        statusEl.className   = 'qr-token-label qr-status-expired';
      }
    };
    xhr.send(JSON.stringify({
      student_id: cfg.studentId,
      course_id:  cfg.courseId,
      token:      token,
      nonce:      parts.nonce,
      expiry:     parts.expiresAt
    }));
  }

  /* --------------------------------------------------
     PUBLIC: verifyToken(tokenString)
     Returns { valid: true, studentId, courseId,
               issuedAt, expiresAt }
          or { valid: false, reason }
  -------------------------------------------------- */
  function verifyToken(tokenString) {
    if (typeof tokenString !== 'string') {
      return { valid: false, reason: 'invalid input' };
    }

    var parts = tokenString.split('.');
    if (parts.length !== 6) {
      return { valid: false, reason: 'malformed token' };
    }

    var studentId  = parts[0];
    var courseId   = parts[1];
    var issuedAt   = parseInt(parts[2], 10);
    var expiresAt  = parseInt(parts[3], 10);
    var nonce      = parts[4];
    var sig        = parts[5];

    if (isNaN(issuedAt) || isNaN(expiresAt)) {
      return { valid: false, reason: 'invalid timestamps' };
    }

    var raw = [studentId, courseId, issuedAt, expiresAt, nonce].join('.');
    if (_sign(raw) !== sig) {
      return { valid: false, reason: 'signature mismatch' };
    }

    var now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) return { valid: false, reason: 'token expired' };
    if (now < issuedAt)  return { valid: false, reason: 'token not yet valid' };

    return { valid: true, studentId: studentId, courseId: courseId,
             issuedAt: issuedAt, expiresAt: expiresAt };
  }

  /* --------------------------------------------------
     PRIVATE helpers
  -------------------------------------------------- */

  /* Update timer display each second */
  function _tick() {
    if (!_cfg) return;

    var mins     = String(Math.floor(_timeLeft / 60)).padStart(2, '0');
    var secs     = String(_timeLeft % 60).padStart(2, '0');
    var timerEl  = document.getElementById(_cfg.timerId);
    var fillEl   = document.getElementById(_cfg.timerId + '-fill');

    if (timerEl) timerEl.textContent = mins + ':' + secs;

    if (fillEl) {
      var pct = (_timeLeft / QR_DURATION) * 100;
      fillEl.style.width = pct + '%';
      if      (_timeLeft <= 20) fillEl.style.background = 'var(--danger)';
      else if (_timeLeft <= 60) fillEl.style.background = 'var(--warning)';
      else                      fillEl.style.background = 'var(--accent)';
    }
  }

  /* Render expired state over the QR code */
  function _expire() {
    if (!_cfg) return;

    /* Inject overlay as sibling of #qr-container inside .qr-code-wrap */
    var container = document.getElementById(_cfg.qrContainerId);
    if (container) {
      var wrap = container.parentNode;
      if (wrap && !wrap.querySelector('.qr-expired-overlay')) {
        var overlay       = document.createElement('div');
        overlay.className = 'qr-expired-overlay';
        overlay.innerHTML = '<i class="fa-solid fa-lock"></i><p>QR Code Expired</p>';
        wrap.appendChild(overlay);
      }
    }

    /* Timer → zero */
    var timerEl = document.getElementById(_cfg.timerId);
    if (timerEl) timerEl.textContent = '00:00';

    var fillEl = document.getElementById(_cfg.timerId + '-fill');
    if (fillEl) { fillEl.style.width = '0%'; fillEl.style.background = ''; }

    /* Status label */
    var statusEl = document.getElementById(_cfg.statusId);
    if (statusEl) {
      statusEl.textContent = 'QR code expired — generate a new one';
      statusEl.className   = 'qr-token-label qr-status-expired';
    }

    /* Timer note */
    var noteEl = document.getElementById('qrTimerNote');
    if (noteEl) noteEl.textContent = 'This QR code has expired';

    /* Button → back to primary "Generate New" */
    var btn = document.getElementById(_cfg.btnId);
    if (btn) {
      btn.className   = 'btn btn-primary';
      btn.style.width = '100%';
      btn.innerHTML   = '<i class="fa-solid fa-qrcode"></i> Generate New QR Code';
    }
  }

  /* Build 6-part token and return its parts for saving to the server */
  function _buildTokenParts(studentId, courseId) {
    var issuedAt  = Math.floor(Date.now() / 1000);
    var expiresAt = issuedAt + QR_DURATION;
    var nonce     = _randomHex(8);
    var raw       = [studentId, courseId, issuedAt, expiresAt, nonce].join('.');
    var token     = raw + '.' + _sign(raw);
    return { token: token, nonce: nonce, expiresAt: expiresAt };
  }

  /* djb2 hash → 8-char hex string */
  function _sign(data) {
    var hash = 5381;
    for (var i = 0; i < data.length; i++) {
      hash = ((hash << 5) + hash) ^ data.charCodeAt(i);
      hash = hash >>> 0; // unsigned 32-bit
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  /* Cryptographically random hex string of given length */
  function _randomHex(len) {
    var arr = new Uint8Array(Math.ceil(len / 2));
    crypto.getRandomValues(arr);
    return Array.from(arr, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('').slice(0, len);
  }

  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* Export */
  window.QRAttendance = { initQR: initQR, verifyToken: verifyToken };

})();
