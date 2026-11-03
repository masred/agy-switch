const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeJwtPayload,
  extractEmail,
  extractExpiry,
  hasRefreshToken,
  formatExpiry,
} = require('../src/core/token-decoder');

test('decodeJwtPayload decodes standard base64 and base64url JWTs', () => {
  const payload = { sub: '12345', email: 'test@example.com', exp: 1700000000 };
  const base64url = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const dummyJwt = `header.${base64url}.signature`;

  const decoded = decodeJwtPayload(dummyJwt);
  assert.deepEqual(decoded, payload);
});

test('decodeJwtPayload returns null on invalid or malformed strings', () => {
  assert.equal(decodeJwtPayload(''), null);
  assert.equal(decodeJwtPayload('invalid-jwt'), null);
  assert.equal(decodeJwtPayload(null), null);
});

test('extractEmail extracts from direct id_token_email property', () => {
  const data = { id_token_email: 'user@gmail.com' };
  assert.equal(extractEmail(data), 'user@gmail.com');
});

test('extractEmail extracts from email property', () => {
  const data = { email: 'developer@example.com' };
  assert.equal(extractEmail(data), 'developer@example.com');
});

test('extractEmail extracts from JWT in token.id_token', () => {
  const payload = { email: 'jwt-extracted@example.com' };
  const base64url = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = {
    token: {
      id_token: `header.${base64url}.signature`,
    },
  };
  assert.equal(extractEmail(data), 'jwt-extracted@example.com');
});

test('extractEmail returns null when no email is present', () => {
  assert.equal(extractEmail({}), null);
  assert.equal(extractEmail(null), null);
  assert.equal(extractEmail({ token: {} }), null);
});

test('extractExpiry parses ISO date string and JWT exp claim', () => {
  const iso = '2026-11-03T12:00:00.000Z';
  const dataIso = { token: { expiry: iso } };
  const expDate = extractExpiry(dataIso);
  assert.ok(expDate instanceof Date);
  assert.equal(expDate.toISOString(), iso);

  const expSec = 1790000000;
  const payload = { exp: expSec };
  const base64url = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const dataJwt = { token: { id_token: `header.${base64url}.sig` } };
  const jwtDate = extractExpiry(dataJwt);
  assert.ok(jwtDate instanceof Date);
  assert.equal(jwtDate.getTime(), expSec * 1000);
});

test('hasRefreshToken correctly identifies refresh token existence', () => {
  assert.equal(hasRefreshToken({ token: { refresh_token: '1//abc' } }), true);
  assert.equal(hasRefreshToken({ refresh_token: '1//abc' }), true);
  assert.equal(hasRefreshToken({ token: {} }), false);
  assert.equal(hasRefreshToken(null), false);
});

test('formatExpiry handles future and past dates', () => {
  const future = new Date(Date.now() + 30 * 60 * 1000); // +30m
  const formattedFuture = formatExpiry(future);
  assert.match(formattedFuture, /remaining/);

  const past = new Date(Date.now() - 10000); // past
  const formattedPast = formatExpiry(past);
  assert.match(formattedPast, /Needs Refresh/);

  assert.equal(formatExpiry(null), 'Unknown');
});
