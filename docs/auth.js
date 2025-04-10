// auth.js - 認証チェック & トークン管理用ユーティリティ

// ✅ JWTデコード用CDN読み込みが前提（HTMLで読み込み必要）
// <script src="https://cdn.jsdelivr.net/npm/jwt-decode/build/jwt-decode.min.js"></script>

function checkAuthAndShowUser(targetElementId = 'user-info') {
  const token = localStorage.getItem('jwtToken');
  if (!token) {
    window.location.href = '/docs/login.html';
    return;
  }

  try {
    const decoded = jwt_decode(token);
    const target = document.getElementById(targetElementId);
    if (target) {
      target.innerHTML = `
        <div>
          <strong>${decoded.email}</strong> でログイン中
          <button class="btn btn-sm btn-outline-secondary" onclick="logout()">ログアウト</button>
        </div>
      `;
    }
    return token;
  } catch (e) {
    logout();
  }
}

function logout() {
  localStorage.removeItem('jwtToken');
  window.location.href = '/docs/login.html';
}

function authFetch(url, options = {}) {
  const token = localStorage.getItem('jwtToken');
  if (!token) return Promise.reject('未認証');

  options.headers = {
    ...(options.headers || {}),
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  return fetch(url, options).then(res => {
    if (res.status === 401 || res.status === 403) {
      logout();
    }
    return res;
  });
}