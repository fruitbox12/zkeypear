const test = require('brittle')
const b4a = require('b4a')
const sodium = require('sodium-native')
const Keychain = require('../')

function generateValidR() {
  let r, R
  do {
    r = b4a.alloc(sodium.crypto_scalarmult_SCALARBYTES)
    sodium.randombytes_buf(r)
    console.log('🎲 Generated Random Nonce (r):', r.toString('hex'))
    
    R = b4a.alloc(sodium.crypto_scalarmult_BYTES)
    sodium.crypto_scalarmult_base(R, r)
    console.log('📍 Computed R (R = r * G):', R.toString('hex'))
    
    if (!sodium.crypto_core_ed25519_is_valid_point(R)) {
      console.error('Generated R is not a valid Ed25519 point, retrying...')
    }
  } while (!sodium.crypto_core_ed25519_is_valid_point(R))

  return { r, R }
}

// Function to generate a ZK proof using the Schnorr protocol
function generateZKSchnorrProof(scalar, publicKey) {
  console.log('\n===== Starting ZK Schnorr Proof Generation =====\n')
  console.time('Proof Generation Time')

  // Step 1: Generate a valid random nonce (r) and corresponding R
  const { r, R } = generateValidR()

  // Step 2: Compute challenge c = H(R || publicKey)
  const cHash = b4a.alloc(sodium.crypto_core_ed25519_NONREDUCEDSCALARBYTES)
  const hashInput = b4a.concat([R, publicKey])
  sodium.crypto_generichash(cHash, hashInput)
  const c = b4a.alloc(sodium.crypto_core_ed25519_SCALARBYTES)
  sodium.crypto_core_ed25519_scalar_reduce(c, cHash)
  console.log('🔑 Computed Challenge (c = H(R || publicKey)):', c.toString('hex'))

  // Step 3: Compute s = (r + c * scalar) mod L, where L is the curve order
  const cs = b4a.alloc(sodium.crypto_scalarmult_SCALARBYTES)
  sodium.crypto_scalarmult(cs, c, publicKey)
  const s = b4a.alloc(sodium.crypto_scalarmult_SCALARBYTES)
  sodium.crypto_core_ed25519_scalar_add(s, r, cs)
  console.log('🔐 Computed Response (s = r + c * scalar):', s.toString('hex'))

  console.timeEnd('Proof Generation Time')
  console.log('\n===== ZK Schnorr Proof Generation Completed =====\n')

  return { R, s, publicKey }
}

// Function to verify the ZK proof using the Schnorr protocol
function verifyZKSchnorrProof(proof) {
  console.log('\n===== Starting ZK Schnorr Proof Verification =====\n')

  console.time('Proof Verification Time')

  const { R, s, publicKey } = proof

  // Step 1: Recompute the challenge c = H(R || publicKey)
  const cHash = b4a.alloc(sodium.crypto_core_ed25519_NONREDUCEDSCALARBYTES)
  const hashInput = b4a.concat([R, publicKey])
  sodium.crypto_generichash(cHash, hashInput)
  const c = b4a.alloc(sodium.crypto_core_ed25519_SCALARBYTES)
  sodium.crypto_core_ed25519_scalar_reduce(c, cHash)
  console.log('🔄 Recomputed Challenge (c = H(R || publicKey)):', c.toString('hex'))

  // Step 2: Verify that s * G = R + c * publicKey
  const sG = b4a.alloc(sodium.crypto_scalarmult_BYTES)
  sodium.crypto_scalarmult_base(sG, s)
  console.log('s * G:', sG.toString('hex'))

  const cPK = b4a.alloc(sodium.crypto_scalarmult_BYTES)
  sodium.crypto_scalarmult(cPK, c, publicKey)
  console.log('c * publicKey:', cPK.toString('hex'))

  // Revalidate points
  if (!sodium.crypto_core_ed25519_is_valid_point(R)) {
    console.error('R is not a valid Ed25519 point:', R.toString('hex'))
    throw new Error('Invalid point R')
  } else {
    console.log('R is a valid Ed25519 point.')
  }

  if (!sodium.crypto_core_ed25519_is_valid_point(cPK)) {
    console.error('c * publicKey is not a valid Ed25519 point:', cPK.toString('hex'))
    throw new Error('Invalid point c * publicKey')
  } else {
    console.log('c * publicKey is a valid Ed25519 point.')
  }

  try {
    const RPlusCPK = b4a.alloc(sodium.crypto_scalarmult_BYTES)
    sodium.crypto_core_ed25519_add(RPlusCPK, R, cPK)
    console.log('R + c * publicKey:', RPlusCPK.toString('hex'))

    const isValid = b4a.equals(sG, RPlusCPK)
    console.log(isValid ? '✅ Proof is Valid' : '❌ Proof is Invalid')

    return isValid
  } catch (error) {
    console.error('Error during point addition:', error.message)
    console.error('R:', R.toString('hex'))
    console.error('c * publicKey:', cPK.toString('hex'))
    throw error
  } finally {
    console.timeEnd('Proof Verification Time')
    console.log('\n===== ZK Schnorr Proof Verification Completed =====\n')
  }
}

test('ZK Schnorr proof generation and verification', function (t) {
  console.log('\n🌟🌟🌟 Test: ZK Schnorr Proof Generation and Verification 🌟🌟🌟\n')

  const keys = new Keychain()
  const signer = keys.get()

  // Use the getProofComponents method to retrieve the public key and scalar
  const { publicKey, scalar } = signer.getProofComponents()
  console.log('🔑 Public Key:', publicKey.toString('hex'))
  console.log('🔐 Scalar (Private Key Component):', scalar.toString('hex'))

  // Generate the ZK proof using the Schnorr protocol
  const zkProof = generateZKSchnorrProof(scalar, publicKey)

  t.ok(zkProof, 'ZK Schnorr proof should be generated')

  // Verify the ZK proof
  const isValid = verifyZKSchnorrProof(zkProof)
  t.ok(isValid, 'ZK Schnorr proof should be valid')

  console.log('\n🎉 Test Completed 🎉\n')
})
