import 'dotenv/config';
import prisma from '../lib/prisma.js';

// Old CSS-based border keys that no longer exist in the catalog
const OLD_BORDER_KEYS = [
	'border_static_pulse',
	'border_iron_ring',
	'border_carbon_weave',
	'border_signal_green',
	'border_plasma_arc',
	'border_void_fracture',
	'border_ember_coil',
	'border_recon_grid',
	'border_cryo_shard',
	'border_biomass_bloom',
	'border_alloy_lattice',
	'border_ore_vein',
	'border_phasic_ripple',
	'border_arc_disruption',
	'border_phantom_veil',
	'border_siege_plating',
	'border_vex_protocol',
	'border_null_emperor',
	'border_eternal_circuit',
	'border_commander',
];

const deleted = await prisma.shopPurchase.deleteMany({
	where: { itemKey: { in: OLD_BORDER_KEYS } },
});

// Also clear avatarBorder if any user has one of the old keys equipped
const cleared = await prisma.user.updateMany({
	where: { avatarBorder: { in: OLD_BORDER_KEYS } },
	data: { avatarBorder: null },
});

console.log(`✓ Deleted ${deleted.count} old border purchase records`);
console.log(`✓ Cleared avatarBorder on ${cleared.count} user(s)`);

await prisma.$disconnect();
