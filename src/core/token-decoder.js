/**
 * Token decoding and metadata extraction utilities.
 * Pure zero-dependency Node.js implementation.
 */

function decodeJwtPayload(jwtString) {
  if (typeof jwtString !== 'string' || !jwtString.includes('.')) return null;
  try {
    const parts = jwtString.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (_) {
    return null;
  }
}

function extractEmail(tokenData) {
  if (!tokenData || typeof tokenData !== 'object') return null;

  // 1. Direct explicit property
  if (typeof tokenData.id_token_email === 'string' && tokenData.id_token_email.trim()) {
    return tokenData.id_token_email.trim();
  }
  if (typeof tokenData.email === 'string' && tokenData.email.trim()) {
    return tokenData.email.trim();
  }
  if (typeof tokenData.token?.email === 'string' && tokenData.token.email.trim()) {
    return tokenData.token.email.trim();
  }

  // 2. Decode from id_token JWT
  if (tokenData.token?.id_token) {
    const payload = decodeJwtPayload(tokenData.token.id_token);
    if (payload?.email) return payload.email;
  }

  // 3. Decode from access_token JWT if applicable
  if (tokenData.token?.access_token) {
    const payload = decodeJwtPayload(tokenData.token.access_token);
    if (payload?.email) return payload.email;
  }

  return null;
}

function extractExpiry(tokenData) {
  if (!tokenData || typeof tokenData !== 'object') return null;

  const rawExpiry = tokenData.token?.expiry || tokenData.expiry;
  if (rawExpiry) {
    const d = new Date(rawExpiry);
    if (!isNaN(d.getTime())) return d;
  }

  // Check JWT exp claim
  if (tokenData.token?.id_token) {
    const payload = decodeJwtPayload(tokenData.token.id_token);
    if (typeof payload?.exp === 'number') {
      const d = new Date(payload.exp * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

function hasRefreshToken(tokenData) {
  if (!tokenData || typeof tokenData !== 'object') return false;
  return Boolean(tokenData.token?.refresh_token || tokenData.refresh_token);
}

function formatExpiry(expiryDate) {
  if (!expiryDate || !(expiryDate instanceof Date) || isNaN(expiryDate.getTime())) {
    return 'Unknown';
  }
  const diffMs = expiryDate.getTime() - Date.now();
  if (diffMs > 0) {
    const mins = Math.round(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    const timeStr = expiryDate.toLocaleTimeString();
    if (hours > 0) {
      return `${timeStr} (${hours}h ${remMins}m remaining)`;
    }
    return `${timeStr} (${mins}m remaining)`;
  }
  return 'Needs Refresh (Auto-renews on launch)';
}

module.exports = {
  decodeJwtPayload,
  extractEmail,
  extractExpiry,
  hasRefreshToken,
  formatExpiry,
};
