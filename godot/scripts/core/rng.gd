class_name GodCivRng
extends RefCounted

# Seeded randomness, ported bit-for-bit from the PWA (src/sim/core.js
# mulberry32, src/sim/terrain.js hash01). GDScript ints are 64-bit, so
# every operation masks to unsigned 32-bit. Only the low 32 bits of a
# product matter (JS Math.imul), computed via 16-bit halves so the
# multiply can never overflow int64.


const UINT32_MASK: int = 0xFFFFFFFF
const UINT32_MAX_FLOAT: float = 4294967296.0


## Low 32 bits of a * b, exactly like JS Math.imul.
static func imul32(a: int, b: int) -> int:
	a &= UINT32_MASK
	b &= UINT32_MASK
	var a_lo: int = a & 0xFFFF
	var a_hi: int = (a >> 16) & 0xFFFF
	var b_lo: int = b & 0xFFFF
	var b_hi: int = (b >> 16) & 0xFFFF
	var lo: int = a_lo * b_lo
	var mid: int = a_lo * b_hi + a_hi * b_lo
	# The a_hi * b_hi term only contributes above bit 32, so it is dropped.
	return (lo + ((mid & 0xFFFF) << 16)) & UINT32_MASK


## Pure integer hash -> [0, 1). Same inputs, same output, every load.
## Port of hash01(seed, a, b, salt) from src/sim/terrain.js.
static func hash01(seed: int, a: int, b: int, salt: int = 0) -> float:
	var h: int = (seed & UINT32_MASK) ^ 0x9E3779B9
	h = imul32(h ^ imul32(a & UINT32_MASK, 0x85EBCA6B), 0xC2B2AE35)
	h = imul32(h ^ imul32(b & UINT32_MASK, 0x27D4EB2F), 0x165667B1)
	h = imul32(h ^ imul32(salt & UINT32_MASK, 0x9E3779B1), 0x85EBCA6B)
	h = (h ^ (h >> 15)) & UINT32_MASK
	h = imul32(h, 0x2C1B3C6D)
	h = (h ^ (h >> 12)) & UINT32_MASK
	return float(h) / UINT32_MAX_FLOAT


var _a: int = 0


func _init(seed: int) -> void:
	_a = seed & UINT32_MASK


## Next value in the mulberry32 stream, [0, 1).
## Port of mulberry32(seed) from src/sim/core.js.
func next_float() -> float:
	_a = (_a + 0x6D2B79F5) & UINT32_MASK
	var t: int = imul32(_a ^ (_a >> 15), 1 | _a)
	t = (t + imul32(t ^ (t >> 7), 61 | t)) ^ t
	t &= UINT32_MASK
	return float((t ^ (t >> 14)) & UINT32_MASK) / UINT32_MAX_FLOAT
