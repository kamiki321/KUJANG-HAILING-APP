// Pemakaian: node scripts/hash-password.js "PasswordBaru"
// Menghasilkan hash (format sama dengan aplikasi) untuk INSERT manual ke tabel users.
const crypto = require('crypto');
const pw = process.argv[2];
if (!pw) { console.error('Pemakaian: node scripts/hash-password.js "password"'); process.exit(1); }
const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(pw, salt, 64);
console.log('scrypt$' + salt.toString('base64') + '$' + key.toString('base64'));
