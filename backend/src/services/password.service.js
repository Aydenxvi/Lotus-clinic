const argon2 = require("argon2");

// Argon2id per spec (the memory-hardened, side-channel-resistant variant —
// the current OWASP-recommended default, unlike the older bcrypt mentioned in
// the original rbac-backend-blueprint.md draft).
const OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, OWASP's current minimum recommendation
  timeCost: 2,
  parallelism: 1
};

function hashPassword(plain) {
  return argon2.hash(plain, OPTS);
}

function verifyPassword(hash, plain) {
  return argon2.verify(hash, plain);
}

module.exports = { hashPassword, verifyPassword };
